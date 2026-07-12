#!/usr/bin/env node
/**
 * verify-edition.js — grounded fact-checker for Why Today editions.
 *
 * For every story in an edition file, sends the story's checkable claims to
 * Gemini WITH the google_search grounding tool and asks it to verify each
 * specific figure, date, and event claim against live sources. Produces:
 *   - data/verification/<date>-report.md   (human-readable, mobile-friendly)
 *   - data/verification/<date>-report.json (machine-readable, for pipeline use)
 *
 * Verdicts per story:
 *   PASS        every specific claim verified against a source
 *   WARN        no wrong claims, but some claims could not be verified
 *   FAIL        one or more claims contradict live sources
 *   FABRICATED  the story's central event itself cannot be confirmed
 *
 * Exit codes: 0 = all PASS/WARN, 1 = any FAIL/FABRICATED,
 *             2 = grounding quota exhausted mid-run (partial report written).
 *
 * IMPORTANT: this script never verifies ungrounded. If the grounding quota
 * is gone, it stops — an ungrounded model checking its own hallucinations
 * is worse than no check at all.
 *
 * Usage:
 *   node scripts/verify-edition.js                        # verifies data/edition.json
 *   node scripts/verify-edition.js --file data/archive/2026-07-10.json
 *   node scripts/verify-edition.js --slugs sbi-funds-ipo,dmart-q1-results
 *
 * Env: GEMINI_API_KEY (required), GEMINI_MODEL / GEMINI_FALLBACK_MODEL
 *      (same defaults as generate-edition.js), VERIFY_SPACING_MS (default
 *      15000 — pause between stories to be gentle on the grounding quota).
 */

const fs = require("fs");
const path = require("path");

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite";
const API_KEY = process.env.GEMINI_API_KEY;
const SPACING_MS = Number(process.env.VERIFY_SPACING_MS || 15000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- shared helpers (same behavior as generate-edition.js) ----------

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text.trim();
}

function extractRetryDelayMs(errBody, fallbackMs) {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(errBody || "");
  return m ? Math.ceil(Number(m[1]) * 1000) + 1000 : fallbackMs;
}

function describeQuotaViolations(errBody) {
  const ids = [];
  try {
    const parsed = JSON.parse(errBody || "{}");
    for (const d of parsed.error?.details || []) {
      for (const v of d.violations || []) {
        if (v.quotaId) ids.push(v.quotaId);
        else if (v.subject || v.description) ids.push(v.description || v.subject);
      }
    }
  } catch { /* not JSON — regex below */ }
  if (ids.length === 0) {
    const rx = /"quotaId"\s*:\s*"([^"]+)"/g;
    let m;
    while ((m = rx.exec(errBody || "")) !== null) ids.push(m[1]);
  }
  const joined = ids.join(", ");
  return {
    joined,
    isLongWindow: /perday|daily|permonth|monthly/i.test(joined),
    isGrounding: /grounding|websearch|web_search|searchtool/i.test(joined),
  };
}

// ---------- claim digest ----------

// Pull only the fields that carry verifiable claims, so the verifier's
// attention (and grounding searches) go to figures and events, not prose.
function buildClaimDigest(story) {
  const parts = [];
  const take = (label, v) => { if (v) parts.push(`${label}: ${v}`); };
  take("HEADLINE", story.headline);
  take("SUMMARY", story.summary);
  take("WHAT HAPPENED", story.whatHappened);
  take("WHY TODAY", story.whyToday);
  take("WHAT NEXT", story.whatNext);
  take("DEEP DIVE", story.deepDiveRead);
  if (Array.isArray(story.keyNumbers)) {
    for (const kn of story.keyNumbers) {
      parts.push(
        `KEY NUMBER CARD: ${kn.label} = ${kn.value}` +
        (kn.previousValue ? ` (previous: ${kn.previousValue} — ${kn.previousLabel || ""})` : "")
      );
    }
  }
  if (story.timeMachine && typeof story.timeMachine === "object") {
    for (const [k, v] of Object.entries(story.timeMachine)) {
      parts.push(`TIME MACHINE (${k}): ${v}`);
    }
  }
  if (Array.isArray(story.quiz)) {
    for (const q of story.quiz) {
      const ans = q.options?.[q.answerIndex];
      if (ans) parts.push(`QUIZ CLAIM: "${q.question}" — stated correct answer: "${ans}"`);
    }
  }
  return parts.join("\n\n");
}

const VERIFY_SYSTEM = `You are a rigorous financial fact-checker for an Indian financial news publication read by bankers and finance professionals. Wrong figures destroy the publication's credibility.

You will receive one news story's claims, plus the date it was published. Use Google Search to verify EVERY specific factual claim: numbers, amounts, percentages, dates, deadlines, rankings, named events, and who-did-what statements. Editorial opinion and generic background do not need checking.

For each specific claim, classify it:
- VERIFIED: a reliable source confirms it (allow small rounding).
- WRONG: reliable sources contradict it. Provide the correct value and the source.
- UNVERIFIABLE: you searched and found no source confirming or denying it.
- STALE: true in the past but materially outdated as of the publication date.

Then give one overall verdict:
- "PASS": every specific claim VERIFIED.
- "WARN": no WRONG claims, but at least one UNVERIFIABLE or STALE.
- "FAIL": at least one WRONG claim.
- "FABRICATED": the story's central event itself (e.g. a results announcement, a deal, a launch) cannot be confirmed to have happened at all.

Return ONLY valid JSON, no markdown fences, exactly this shape:
{
  "verdict": "PASS" | "WARN" | "FAIL" | "FABRICATED",
  "centralEventConfirmed": true | false,
  "issues": [
    {
      "claim": "the claim text as it appears",
      "status": "WRONG" | "UNVERIFIABLE" | "STALE",
      "detail": "what is actually true, or why it could not be verified",
      "correction": "corrected wording/value if status is WRONG or STALE, else null",
      "source": "publisher name or URL if known, else null"
    }
  ],
  "notes": "one or two sentences of overall assessment"
}
List ONLY problem claims in "issues" — verified claims are omitted. Be strict: a plausible-sounding round number with no source is UNVERIFIABLE, not VERIFIED.`;

// ---------- grounded verification call ----------

async function verifyStory(story, editionDate, maxRetries = 3) {
  let attempt = 0;
  let currentModel = MODEL;
  const deadModels = new Set();

  const userPrompt =
    `Publication date of this story: ${editionDate}\n\n` +
    `Story claims to verify:\n\n${buildClaimDigest(story)}`;

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(`${GEMINI_API_BASE}/${currentModel}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: VERIFY_SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            // responseMimeType JSON is NOT allowed with the google_search
            // tool (same constraint as generate-edition.js) — rely on the
            // prompt + extractJson().
            maxOutputTokens: 8000,
          },
        }),
        signal: AbortSignal.timeout(180000),
      });

      if (!res.ok) {
        const bodyText = await res.text();
        const err = new Error(`Gemini API error (${res.status}) on ${currentModel}: ${bodyText.slice(0, 300)}`);
        err.status = res.status;
        err.body = bodyText;
        throw err;
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      if (!candidate) throw new Error(`No candidates returned`);
      const text = candidate.content?.parts?.map((p) => p.text || "").join("") ?? "";
      const parsed = JSON.parse(extractJson(text));
      if (!parsed.verdict) throw new Error("Verifier returned JSON without a verdict field");
      parsed.issues = Array.isArray(parsed.issues) ? parsed.issues : [];
      return parsed;
    } catch (err) {
      if (err.status === 404) {
        deadModels.add(currentModel);
        const other = currentModel === MODEL ? FALLBACK_MODEL : MODEL;
        if (deadModels.has(other)) throw new Error(`Both ${MODEL} and ${FALLBACK_MODEL} return 404 — set GEMINI_MODEL to a current model.`);
        console.warn(`  ${currentModel} retired (404) — switching to ${other}.`);
        currentModel = other;
        continue;
      }
      attempt++;
      if (attempt > maxRetries) throw err;
      if (err.status === 429) {
        const quota = describeQuotaViolations(err.body);
        if (quota.isGrounding || quota.isLongWindow) {
          err.isGroundingQuota = true;
          throw err; // stop the whole run — never verify ungrounded
        }
        if (!quota.joined && !/"retryDelay"/.test(err.body || "")) {
          err.isGroundingQuota = true; // effectively-zero quota on grounded calls
          throw err;
        }
        const waitMs = extractRetryDelayMs(err.body, 20000);
        console.warn(`  rate-limited — waiting ${Math.round(waitMs / 1000)}s...`);
        await sleep(waitMs);
      } else if (err.status === 503 || err.status === 500) {
        const waitMs = Math.min(5000 * 3 ** (attempt - 1), 45000) + Math.random() * 2000;
        console.warn(`  ${err.status} server error — waiting ${Math.round(waitMs / 1000)}s...`);
        await sleep(waitMs);
      } else {
        console.warn(`  attempt ${attempt} failed (${err.message}) — retrying...`);
      }
      if (err.status === 429 || err.status === 503 || err.status === 500) {
        const other = currentModel === MODEL ? FALLBACK_MODEL : MODEL;
        if (!deadModels.has(other)) currentModel = other;
      }
    }
  }
}

// ---------- report writing ----------

const BADGE = { PASS: "✅ PASS", WARN: "⚠️ WARN", FAIL: "❌ FAIL", FABRICATED: "🚨 FABRICATED", ERROR: "❔ ERROR", SKIPPED: "⏭ SKIPPED" };

function writeReports(editionDate, results, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${editionDate}-report.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ date: editionDate, generatedAt: new Date().toISOString(), results }, null, 2));

  const counts = {};
  for (const r of results) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
  const lines = [
    `# Verification report — edition ${editionDate}`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `**Summary:** ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`,
    ``,
  ];
  for (const r of results) {
    lines.push(`## ${BADGE[r.verdict] || r.verdict} — ${r.headline}`);
    lines.push(`Slug: \`${r.slug}\``);
    if (r.notes) lines.push(`\n${r.notes}`);
    if (r.error) lines.push(`\nRun error: ${r.error}`);
    for (const issue of r.issues || []) {
      lines.push(`\n- **[${issue.status}]** ${issue.claim}`);
      if (issue.detail) lines.push(`  - ${issue.detail}`);
      if (issue.correction) lines.push(`  - Correction: ${issue.correction}`);
      if (issue.source) lines.push(`  - Source: ${issue.source}`);
    }
    lines.push(``);
  }
  const mdPath = path.join(outDir, `${editionDate}-report.md`);
  fs.writeFileSync(mdPath, lines.join("\n"));
  return { jsonPath, mdPath };
}

// ---------- main ----------

async function main() {
  if (!API_KEY) {
    console.error("GEMINI_API_KEY is not set.");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const editionFile = fileIdx !== -1 ? args[fileIdx + 1] : "data/edition.json";
  const slugsIdx = args.indexOf("--slugs");
  const onlySlugs = slugsIdx !== -1 ? new Set(args[slugsIdx + 1].split(",").map((s) => s.trim())) : null;

  const edition = JSON.parse(fs.readFileSync(editionFile, "utf8"));
  const editionDate = edition.date || path.basename(editionFile, ".json");
  let stories = edition.stories || [];
  if (onlySlugs) stories = stories.filter((s) => onlySlugs.has(s.slug));

  console.log(`Verifying ${stories.length} stories from ${editionFile} (edition ${editionDate}).`);
  console.log(`Grounded verification via ${MODEL} (fallback ${FALLBACK_MODEL}), ${SPACING_MS / 1000}s between stories.\n`);

  const results = [];
  let quotaExhausted = false;

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    const label = `[${i + 1}/${stories.length}] ${story.slug}`;
    if (quotaExhausted) {
      results.push({ slug: story.slug, headline: story.headline, verdict: "SKIPPED", issues: [], notes: "Grounding quota exhausted earlier in this run." });
      continue;
    }
    console.log(`${label} — verifying...`);
    try {
      const v = await verifyStory(story, editionDate);
      results.push({ slug: story.slug, headline: story.headline, verdict: v.verdict, centralEventConfirmed: v.centralEventConfirmed, issues: v.issues, notes: v.notes });
      console.log(`${label} — ${v.verdict}${v.issues.length ? ` (${v.issues.length} issue(s))` : ""}`);
    } catch (err) {
      if (err.isGroundingQuota) {
        console.error(`\nGrounding quota exhausted at story ${i + 1}. Stopping — this verifier never runs ungrounded.`);
        quotaExhausted = true;
        results.push({ slug: story.slug, headline: story.headline, verdict: "SKIPPED", issues: [], notes: "Grounding quota exhausted — story not verified." });
        continue;
      }
      console.error(`${label} — ERROR: ${err.message}`);
      results.push({ slug: story.slug, headline: story.headline, verdict: "ERROR", issues: [], error: err.message });
    }
    if (i < stories.length - 1 && !quotaExhausted) await sleep(SPACING_MS);
  }

  const { mdPath } = writeReports(editionDate, results, "data/verification");
  console.log(`\nReport written to ${mdPath}`);

  const bad = results.filter((r) => r.verdict === "FAIL" || r.verdict === "FABRICATED");
  const summary = {};
  for (const r of results) summary[r.verdict] = (summary[r.verdict] || 0) + 1;
  console.log(`Summary: ${Object.entries(summary).map(([k, v]) => `${v} ${k}`).join(", ")}`);
  if (bad.length) {
    console.error(`\n${bad.length} story(ies) FAILED verification:`);
    for (const r of bad) console.error(`  - ${r.slug}: ${r.verdict}`);
  }
  process.exit(quotaExhausted ? 2 : bad.length ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
