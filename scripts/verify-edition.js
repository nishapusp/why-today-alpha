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
 * Two verification modes:
 *   --mode source   (DEFAULT) Fetches each story's own source articles,
 *                   extracts their text, and asks Gemini — in a PLAIN,
 *                   UNGROUNDED call (zero grounding quota) — whether every
 *                   figure/date/event in the story is supported by that
 *                   text. Claims absent from sources are flagged. Stricter
 *                   than search: "plausible but unsourced" always surfaces.
 *   --mode grounded Original behavior: google_search grounding per story.
 *                   Uses grounding quota; catches things sources missed.
 *
 * Usage:
 *   node scripts/verify-edition.js                        # verifies data/edition.json
 *   node scripts/verify-edition.js --file data/archive/2026-07-10.json
 *   node scripts/verify-edition.js --slugs sbi-funds-ipo,dmart-q1-results
 *   node scripts/verify-edition.js --mode grounded
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

// ---------- source fetching (mode: source) ----------

// Google News RSS links (/rss/articles/CBMi...) base64-encode the real
// publisher URL in their path segment. Decode it so we can fetch the
// actual article instead of Google's redirect shell.
function decodeGoogleNewsUrl(url) {
  const m = /\/rss\/articles\/([^?/]+)/.exec(url || "");
  if (!m) return null;
  try {
    const pad = "=".repeat((4 - (m[1].length % 4)) % 4);
    const raw = Buffer.from(m[1].replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
    const um = /https?:\/\/[\x20-\x7e]+?(?=[\x00-\x1f]|$)/.exec(raw.toString("latin1"));
    return um ? um[0] : null;
  } catch { return null; }
}

// Crude but dependency-free article text extraction: drop scripts/styles/
// tags, decode common entities, collapse whitespace, cap length.
// Extract a publish date from raw HTML before it gets stripped to plain
// text — htmlToText() below discards all tags (including <meta>/<time>),
// so this must run on the raw response body. Tries, in order of
// reliability: OpenGraph/article meta tags, JSON-LD structured data, then
// a bare <time datetime> attribute. Returns a Date or null — a page using
// none of these formats yields null, which callers must treat as
// "unknown", not "old" (see checkSourceRecency's fail-open handling).
function extractPublishDate(html) {
  const metaPatterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,
    /<meta[^>]+name=["']publish-?date["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of metaPatterns) {
    const m = re.exec(html);
    if (m) {
      const d = new Date(m[1]);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  const jsonLd = /"datePublished"\s*:\s*"([^"]+)"/i.exec(html);
  if (jsonLd) {
    const d = new Date(jsonLd[1]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const timeTag = /<time[^>]+datetime=["']([^"']+)["']/i.exec(html);
  if (timeTag) {
    const d = new Date(timeTag[1]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function htmlToText(html, cap = 7000) {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;/g, "'").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, cap);
}

async function fetchUrlText(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WhyTodayVerifier/1.0)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!/html|text/i.test(ct)) return null;
    const html = await res.text();
    return { text: htmlToText(html), publishedAt: extractPublishDate(html) };
  } catch { return null; }
}

// Gather source texts for a story: decode Google News links where needed,
// fetch each, return [{url, text}]. Silently skips unfetchable sources.
async function fetchStorySources(story) {
  const out = [];
  const seen = new Set();
  for (const src of story.officialSources || []) {
    let url = src.url || "";
    if (/news\.google\.com\/rss\/articles\//.test(url)) {
      url = decodeGoogleNewsUrl(url) || url;
    }
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const fetched = await fetchUrlText(url);
    if (fetched && fetched.text && fetched.text.length > 300) {
      out.push({ url, label: src.label || "", text: fetched.text, publishedAt: fetched.publishedAt });
    }
    if (out.length >= 3) break; // 3 sources is plenty of context
  }
  return out;
}

// Code-level recency gate — the missing piece that let stories like a
// 3-month-old "Operation SAKSHM" or old News on AIR reposts pass into
// editions despite the prompt's recency instructions. Prompt instructions
// tell the model what to search for at write time, but nothing previously
// checked the actual publish date of what it wrote about — this does that,
// against the story's own cited sources, independent of the model.
//
// Fail-open by design when dates can't be extracted: many Indian publisher
// pages don't expose clean date metadata, and hard-rejecting every story
// whose sources lack it would silently gut the edition rather than catch
// staleness. Only a story where every source has a KNOWN, parseable date —
// and all of them are older than the threshold — gets hard-rejected here.
// Unknown-date stories are passed through but flagged (`unverifiable:
// true`) so they surface as a soft issue for manual visibility instead of
// disappearing either way.
const MAX_STORY_AGE_DAYS = Number(process.env.RECENCY_MAX_AGE_DAYS || 4);

function checkSourceRecency(sources, editionDate) {
  const reference = editionDate ? new Date(editionDate) : new Date();
  const maxAgeMs = MAX_STORY_AGE_DAYS * 24 * 3600 * 1000;
  const dated = (sources || []).filter((s) => s.publishedAt instanceof Date && !Number.isNaN(s.publishedAt.getTime()));

  if (dated.length === 0) {
    return { ok: true, unverifiable: true, reason: "no publish date could be extracted from any cited source" };
  }

  const newest = dated.reduce((a, b) => (a.publishedAt > b.publishedAt ? a : b));
  const ageMs = reference.getTime() - newest.publishedAt.getTime();

  if (ageMs > maxAgeMs) {
    const ageDays = (ageMs / (24 * 3600 * 1000)).toFixed(1);
    return {
      ok: false,
      unverifiable: false,
      reason: `newest dated source (${newest.url}) is ${ageDays} days old — exceeds the ${MAX_STORY_AGE_DAYS}-day recency threshold`,
      newestDate: newest.publishedAt.toISOString(),
    };
  }

  return { ok: true, unverifiable: false, newestDate: newest.publishedAt.toISOString() };
}

const VERIFY_SYSTEM_SOURCE = `You are a rigorous financial fact-checker for an Indian financial news publication read by bankers and finance professionals. Wrong figures destroy the publication's credibility.

You will receive one news story's claims, the date it was published, and the TEXT OF ITS OWN CITED SOURCE ARTICLES. Your job: check whether every specific factual claim in the story — numbers, amounts, percentages, dates, deadlines, rankings, named events, who-did-what statements — is supported by the source texts. You have NO other information; do not rely on your own memory of events. Editorial opinion and generic background do not need checking.

For each specific claim, classify it:
- VERIFIED: the source texts state it (allow small rounding and paraphrase).
- WRONG: the source texts state something that contradicts it. Provide the correct value per the sources.
- UNVERIFIABLE: the claim does not appear in the source texts at all. This includes plausible-sounding figures the sources never mention — those are exactly the dangerous ones.

Then give one overall verdict:
- "PASS": every specific claim VERIFIED.
- "WARN": no WRONG claims, but at least one UNVERIFIABLE.
- "FAIL": at least one WRONG claim.
- "FABRICATED": the story's central event itself is not described by any source text.

Respond in JSON with exactly this shape:
{
  "verdict": "PASS" | "WARN" | "FAIL" | "FABRICATED",
  "centralEventConfirmed": true | false,
  "issues": [
    {
      "claim": "the claim text as it appears",
      "status": "WRONG" | "UNVERIFIABLE",
      "detail": "what the sources actually say, or that they say nothing",
      "correction": "corrected wording/value per the sources, else null",
      "source": "which source supports the correction, else null"
    }
  ],
  "notes": "one or two sentences of overall assessment"
}
List ONLY problem claims in "issues". Be strict.`;

async function verifyStoryAgainstSources(story, editionDate, sources, maxRetries = 3) {
  let attempt = 0;
  let currentModel = MODEL;
  const deadModels = new Set();

  const srcBlock = sources
    .map((s, i) => `SOURCE ${i + 1} (${s.label} — ${s.url}):\n${s.text}`)
    .join("\n\n----\n\n");
  const userPrompt =
    `Publication date of this story: ${editionDate}\n\n` +
    `SOURCE TEXTS:\n\n${srcBlock}\n\n====\n\n` +
    `Story claims to verify:\n\n${buildClaimDigest(story)}`;

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(`${GEMINI_API_BASE}/${currentModel}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: VERIFY_SYSTEM_SOURCE }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          // NO tools — this is the whole point: zero grounding quota, and
          // JSON response mode is allowed again.
          generationConfig: {
            maxOutputTokens: 8000,
            responseMimeType: "application/json",
            temperature: 0,
          },
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        const bodyText = await res.text();
        const err = new Error(`Gemini API error (${res.status}) on ${currentModel}: ${bodyText.slice(0, 300)}`);
        err.status = res.status;
        err.body = bodyText;
        throw err;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
      const parsed = JSON.parse(extractJson(text));
      if (!parsed.verdict) throw new Error("Verifier returned JSON without a verdict field");
      parsed.issues = Array.isArray(parsed.issues) ? parsed.issues : [];
      return parsed;
    } catch (err) {
      if (err.status === 404) {
        deadModels.add(currentModel);
        const other = currentModel === MODEL ? FALLBACK_MODEL : MODEL;
        if (deadModels.has(other)) throw new Error(`Both ${MODEL} and ${FALLBACK_MODEL} return 404 — set GEMINI_MODEL to a current model.`);
        currentModel = other;
        continue;
      }
      attempt++;
      if (attempt > maxRetries) throw err;
      if (err.status === 429) {
        const quota = describeQuotaViolations(err.body);
        if (quota.isLongWindow) { err.isGroundingQuota = true; throw err; }
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
  const modeIdx = args.indexOf("--mode");
  const mode = modeIdx !== -1 ? args[modeIdx + 1] : "source";
  if (!["source", "grounded"].includes(mode)) {
    console.error(`Unknown --mode "${mode}" — use "source" or "grounded".`);
    process.exit(1);
  }

  const edition = JSON.parse(fs.readFileSync(editionFile, "utf8"));
  const editionDate = edition.date || path.basename(editionFile, ".json");
  let stories = edition.stories || [];
  if (onlySlugs) stories = stories.filter((s) => onlySlugs.has(s.slug));

  console.log(`Verifying ${stories.length} stories from ${editionFile} (edition ${editionDate}).`);
  console.log(`Mode: ${mode} — ${mode === "source"
    ? "fetching each story's own sources; plain Gemini calls, ZERO grounding quota"
    : "google_search grounding (uses grounding quota)"} via ${MODEL} (fallback ${FALLBACK_MODEL}), ${SPACING_MS / 1000}s between stories.\n`);

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
      let v;
      if (mode === "source") {
        const sources = await fetchStorySources(story);
        if (sources.length === 0) {
          results.push({ slug: story.slug, headline: story.headline, verdict: "WARN", issues: [{
            claim: "(entire story)", status: "UNVERIFIABLE",
            detail: "None of the story's cited source links could be fetched — nothing to verify against.",
            correction: null, source: null,
          }], notes: "No fetchable sources. Re-run with --mode grounded when quota allows, or check the links manually." });
          console.log(`${label} — WARN (no fetchable sources)`);
          if (i < stories.length - 1) await sleep(SPACING_MS);
          continue;
        }
        console.log(`  fetched ${sources.length} source(s)`);
        v = await verifyStoryAgainstSources(story, editionDate, sources);
      } else {
        v = await verifyStory(story, editionDate);
      }
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

// Only auto-run when invoked directly (`node scripts/verify-edition.js`).
// generate-edition.js requires fetchStorySources/verifyStoryAgainstSources
// as a pre-publish gate — requiring this file must NOT also kick off a full
// CLI verification run (and must NOT call process.exit on the parent).
if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal:", err.message);
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Enrichment: fill real figures into vague sentences, using ONLY the
// already-fetched source text — never the model's memory.
//
// Why this exists: RSS-fallback mode (no live search tool) is deliberately
// instructed to write around a number it can't verify rather than risk
// inventing one ("describe qualitatively instead" — see generate-edition.js's
// RSS-mode override). That's the right call at WRITE time, since the model
// genuinely has nothing but a short headline/snippet to go on then. But by
// the time verifyStoryAgainstSources() runs, the story's own cited source
// articles have already been fetched in full — and that source text often
// DOES contain the figure the snippet lacked. This pass gives the vague
// sentence a second chance using that now-available text, with the same
// "only what's in a fetched document, never invented" discipline that keeps
// verifyStoryAgainstSources() safe.
//
// Runs on already-VERIFIED stories only (call this after a PASS/WARN
// verdict) — enriching an unverified claim would be adding risk, not
// removing it.
const ENRICH_SYSTEM_PROMPT = `You improve financial news story text by replacing vague qualitative language with real, specific figures — but ONLY when that figure is explicitly present in the provided source article text. You are not searching or recalling from memory; the source texts are your only allowed evidence.

You will receive several text fields from one story, plus the full text of its cited source articles. For each field:
- If it contains a vague/qualitative statement about a number, amount, percentage, or comparison (e.g. "a significant increase", "a large sum", "sharply higher") AND the source texts state the actual figure, rewrite that specific phrase to include the real figure — change as little else as possible, keep the same length and tone.
- If a field has no such vague statement, or the real figure genuinely isn't in the source texts, leave that field UNCHANGED — do not paraphrase, tighten, or otherwise touch it. Return null for it in the output, not a copy.
- NEVER introduce a figure that isn't verbatim (or a simple unit conversion of) something stated in the source texts. Fabricating one here is worse than the vagueness this exists to fix.

Respond in JSON with exactly this shape:
{
  "summary": "<revised text or null>",
  "whatHappened": "<revised text or null>",
  "whyToday": "<revised text or null>",
  "whyCare": "<revised text or null>",
  "whatNext": "<revised text or null>",
  "deepDiveRead": "<revised text or null>"
}`;

async function enrichStoryWithSourceFigures(story, sources, maxRetries = 2) {
  if (!sources || sources.length === 0) return null;

  const srcBlock = sources
    .map((s, i) => `SOURCE ${i + 1} (${s.label} — ${s.url}):\n${s.text}`)
    .join("\n\n----\n\n");
  const fields = ["summary", "whatHappened", "whyToday", "whyCare", "whatNext", "deepDiveRead"];
  const fieldBlock = fields.map((f) => `${f}: ${story[f] || ""}`).join("\n\n");
  const userPrompt = `SOURCE TEXTS:\n\n${srcBlock}\n\n====\n\nSTORY FIELDS:\n\n${fieldBlock}`;

  let attempt = 0;
  let currentModel = MODEL;
  const deadModels = new Set();
  while (attempt <= maxRetries) {
    try {
      const res = await fetch(`${GEMINI_API_BASE}/${currentModel}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: ENRICH_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: 4000, responseMimeType: "application/json", temperature: 0 },
        }),
        signal: AbortSignal.timeout(90000),
      });
      if (!res.ok) {
        const bodyText = await res.text();
        const err = new Error(`Gemini API error (${res.status}) on ${currentModel}: ${bodyText.slice(0, 300)}`);
        err.status = res.status;
        err.body = bodyText;
        throw err;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
      const parsed = JSON.parse(extractJson(text));
      const changes = {};
      for (const f of fields) {
        if (typeof parsed[f] === "string" && parsed[f].trim() && parsed[f].trim() !== (story[f] || "").trim()) {
          changes[f] = parsed[f].trim();
        }
      }
      return changes;
    } catch (err) {
      if (err.status === 404) {
        deadModels.add(currentModel);
        const other = currentModel === MODEL ? FALLBACK_MODEL : MODEL;
        if (deadModels.has(other)) return null; // enrichment is a nice-to-have — never block publishing over it
        currentModel = other;
        continue;
      }
      attempt++;
      if (attempt > maxRetries) return null; // same reasoning — fail open, story publishes as-is
      if (err.status === 429) {
        const waitMs = extractRetryDelayMs(err.body, 15000);
        await sleep(waitMs);
      } else if (err.status === 503 || err.status === 500) {
        await sleep(5000);
      } else {
        return null;
      }
    }
  }
  return null;
}

module.exports = {
  fetchStorySources,
  verifyStoryAgainstSources,
  enrichStoryWithSourceFigures,
  decodeGoogleNewsUrl,
  buildClaimDigest,
  checkSourceRecency,
};
