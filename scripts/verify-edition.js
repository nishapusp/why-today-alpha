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
// 2026-08-04: verifyStory()'s google_search grounded call needs a
// DIFFERENT model family than MODEL/FALLBACK_MODEL above — same finding
// that already drove regenerate-story.js's GROUNDED_MODEL: the real usage
// dashboard confirmed "Gemini 3" family (gemini-3.5-flash/
// gemini-3.1-flash-lite) has a hard 0/0 grounding quota on the free tier,
// while "Gemini 2.5" family has real headroom. This wasn't consequential
// on its own — a quota-exhausted grounded call used to just fall back to
// an honest "couldn't verify" placeholder — but became one the moment
// neverVerified started always auto-removing regardless of issue count:
// every story whose own cited links were unfetchable escalates to
// grounded verification, immediately hits this 0/0 cap on the Gemini 3
// family, and gets permanently removed — not because it's wrong, but
// because escalation could never have succeeded in the first place. A
// real run (2026-08-04) lost 9 of 15 stories to exactly this, only 2 to
// genuine fact errors.
const GROUNDED_MODEL = process.env.GEMINI_GROUNDED_MODEL || "gemini-2.5-flash";
const GROUNDED_FALLBACK_MODEL = process.env.GEMINI_GROUNDED_FALLBACK_MODEL || "gemini-2.5-pro";
const API_KEY = process.env.GEMINI_API_KEY;
const SPACING_MS = Number(process.env.VERIFY_SPACING_MS || 15000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- shared helpers (same behavior as generate-edition.js) ----------

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let cleaned = fenced ? fenced[1].trim() : text.trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return cleaned;
  // Balanced-brace scan — see generate-edition.js's extractJson for the
  // full rationale. Immune to a stray "}" in trailing content (e.g. a
  // leftover thought-summary part) fooling a naive lastIndexOf("}").
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  const end = cleaned.lastIndexOf("}");
  return end > start ? cleaned.slice(start, end + 1) : cleaned;
}

// 2026-08-03: same hand-maintained known-facts cache generate-edition.js
// reads (see data/known-facts.json) — a soft anchor so the verifier isn't
// solely trusting whatever a story's own sources (source mode) or a
// single search pass (grounded mode) turned up for a slow-moving figure.
// Duplicated here rather than required from generate-edition.js, matching
// this file's existing pattern of standalone shared-helper copies.
function loadKnownFacts() {
  try {
    const file = path.join(__dirname, "..", "data", "known-facts.json");
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed.facts) && parsed.facts.length ? parsed : null;
  } catch {
    return null;
  }
}

function buildKnownFactsBlock() {
  const known = loadKnownFacts();
  if (!known) return "";
  const lines = known.facts.map((f) => `${f.topic} = ${f.value}${f.note ? ` — ${f.note}` : ""}`).join("\n");
  return (
    `\n\nKNOWN REFERENCE FIGURES (independently confirmed as of ${known.asOf} — a source or search result that ` +
    `flatly contradicts one of these without clearly post-dating a real, confirmed event is suspect; ` +
    `double-check it rather than taking it at face value):\n${lines}`
  );
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

// 2026-07-17: AIR (newsonair.gov.in) specifically — per a real report of old
// AIR-sourced stories slipping into editions despite the existing soft
// "verify extra carefully" prompt guidance. The general fail-open policy
// above exists because most Indian publisher sites just have messy date
// metadata, not because their content is actually likely to be stale —
// but AIR is different: it's government-run wire content that gets
// republished/rebroadcast well after the original event, so "we
// couldn't find a date" on an AIR-sourced story is a much weaker signal
// of "probably fine" than on a normal news site. Real-world evidence
// (this exact complaint) says the soft nudge alone wasn't enough.
const GOVERNMENT_WIRE_ONLY_DOMAINS = [/newsonair\.gov\.in/i, /newsonair\.com/i];

function isGovernmentWireOnly(sources) {
  const withUrls = (sources || []).filter((s) => s.url);
  if (withUrls.length === 0) return false;
  return withUrls.every((s) => GOVERNMENT_WIRE_ONLY_DOMAINS.some((re) => re.test(s.url)));
}

function checkSourceRecency(sources, editionDate) {
  const reference = editionDate ? new Date(editionDate) : new Date();
  const maxAgeMs = MAX_STORY_AGE_DAYS * 24 * 3600 * 1000;
  const dated = (sources || []).filter((s) => s.publishedAt instanceof Date && !Number.isNaN(s.publishedAt.getTime()));

  if (dated.length === 0) {
    // The one deliberate exception to the general fail-open policy
    // documented above — AIR/government-wire-only sourcing with no
    // extractable date is treated as a fail, not a pass-with-flag,
    // specifically because this source type is a confirmed repeat
    // offender for silently republishing old content.
    if (isGovernmentWireOnly(sources)) {
      return {
        ok: false,
        unverifiable: false,
        reason: "every cited source is AIR/government-wire content with no extractable publish date — treated as likely stale rather than fail-open, per confirmed real-world reports of old AIR reposts slipping through",
      };
    }
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
- VERIFIED: the source texts state it (allow small rounding and paraphrase), AND the story correctly characterizes what the number actually measures.
- WRONG: the source texts state something that contradicts it. Provide the correct value per the sources.
- UNVERIFIABLE: the claim does not appear in the source texts at all. This includes plausible-sounding figures the sources never mention — those are exactly the dangerous ones.

2026-07-22: a real error got past this check before — a story cited a real number that genuinely appeared in its source, but presented it as an aggregate/system-wide figure when the source was actually reporting a figure for one specific segment (e.g., private-sector banks only, not all banks). The number wasn't fabricated, but what the story SAID it represented was wrong. So: a claim is WRONG (not VERIFIED), even if the number itself is literally present in the source text, if the story attributes that number to the wrong scope — the wrong segment, wrong entity, wrong time period, or wrong basis (e.g. consolidated vs. standalone) compared to what the source text actually says it measures. Read past the number itself to what the source says it's a number OF.

2026-07-29: check EVERY "CHART DATA POINT" claim individually — do not wave a chart through because it looks plausible overall. A real, confirmed error had two correct recent points (current period + prior-period comparator, both genuinely in the source) sitting alongside several invented older points that were wrong in both magnitude and direction (a fake decline masking a real, steady rise) — the correct points made the whole series look trustworthy on a casual read. A quarter/period whose value does not appear anywhere in the source texts is UNVERIFIABLE for that specific point, even if neighboring points in the same chart are genuinely sourced — do not let a chart pass as a whole just because most of it checks out.

2026-08-03: a real error slipped through where the story's headline and body stated a decision as already made ("RBI holds/maintains the repo rate") when the cited sources were actually about an UPCOMING, not-yet-happened scheduled event — a preview of an MPC meeting, analyst expectations, "expected to," "likely to," "scheduled to," "due to meet/decide" language. The event had not occurred yet. Watch specifically for this tense mismatch: a claim phrased as a completed action (announced, cut, hiked, held, approved, launched, signed, decided) where the source text is actually hedged/future-tense about something that hasn't happened. If the story reports an expected or scheduled future event as if it already happened, that is WRONG at minimum, and if it's the story's central premise, treat centralEventConfirmed as false and the verdict as FABRICATED even if the underlying numbers exist elsewhere and are individually accurate.

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
  // 2026-07-16: swapped from MODEL to FALLBACK_MODEL as the starting
  // point — checked the actual usage dashboard and found gemini-3.5-flash
  // (MODEL) has only 20 requests/day on the free tier, while
  // gemini-3.1-flash-lite (FALLBACK_MODEL) has 500/day. This function runs
  // once per story (~15x/day) — comparing claims against source text is a
  // structured verification task, not creative writing, so the lite model
  // is a good fit and this alone was likely consuming most of the scarce
  // 20 RPD budget before generation or regeneration ever got a turn. The
  // existing 404 dead-model toggle below already handles switching to the
  // other model bidirectionally, so this still falls back to the stronger
  // model if the lite one is ever retired/unavailable.
  let currentModel = FALLBACK_MODEL;
  const deadModels = new Set();

  const srcBlock = sources
    .map((s, i) => `SOURCE ${i + 1} (${s.label} — ${s.url}):\n${s.text}`)
    .join("\n\n----\n\n");
  const userPrompt =
    `Publication date of this story: ${editionDate}\n\n` +
    `SOURCE TEXTS:\n\n${srcBlock}\n\n====\n\n` +
    `Story claims to verify:\n\n${buildClaimDigest(story)}` +
    buildKnownFactsBlock();

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
      const text = data.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || "").join("") ?? "";
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
        if (quota.isLongWindow) {
          // Daily (RPD) quota exhausted on this specific model — retrying
          // the SAME model with a short backoff is pointless, a daily cap
          // doesn't clear in seconds. Try the other model instead, same
          // as the 404 "model retired" handling above, rather than giving
          // up outright — this is what was previously missing and made a
          // single model's daily exhaustion fail the whole verification
          // step even when the other model still had headroom.
          deadModels.add(currentModel);
          const other = currentModel === MODEL ? FALLBACK_MODEL : MODEL;
          if (deadModels.has(other)) { err.isGroundingQuota = true; throw err; }
          currentModel = other;
          continue;
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
  // 2026-07-29: chart was never included here at all — meaning it was
  // never checked by either verification mode, which is exactly how a
  // real fabricated-history chart (correct current-quarter point, invented
  // older quarters with the trend direction inverted) reached the live
  // site uncaught. Each label/value pair is its own claim, same as a
  // keyNumbers card, so the verifier can catch a single bad point inside
  // an otherwise-real series, not just an entirely-fabricated chart.
  if (story.chart && Array.isArray(story.chart.labels) && Array.isArray(story.chart.values)) {
    parts.push(`CHART: "${story.chart.title}"${story.chart.unit ? ` (${story.chart.unit})` : ""}`);
    story.chart.labels.forEach((label, i) => {
      parts.push(`CHART DATA POINT: ${label} = ${story.chart.values[i]}`);
    });
    if (story.chart.takeaway) parts.push(`CHART TAKEAWAY: ${story.chart.takeaway}`);
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
- VERIFIED: a reliable source confirms it (allow small rounding), AND the story correctly characterizes what the number actually measures.
- WRONG: reliable sources contradict it. Provide the correct value and the source.
- UNVERIFIABLE: you searched and found no source confirming or denying it.
- STALE: true in the past but materially outdated as of the publication date.

2026-07-22: a claim is WRONG (not VERIFIED), even if the number itself is real and appears in a real source, if the story attributes it to the wrong scope — the wrong segment, entity, time period, or basis (e.g. private-sector banks only vs. all banks; consolidated vs. standalone) compared to what that source actually says the number measures. A real error slipped through this exact way before: a genuine, sourced number, attached to the wrong "of what." Read past the number to what it's a number OF.

2026-07-29: check EVERY "CHART DATA POINT" claim individually via search — do not pass a chart as a whole just because it looks plausible or directionally reasonable. A real, confirmed error had two correct recent points (current period + prior-period comparator, easy to find via search) sitting alongside several invented older points, wrong in both magnitude and direction (a fake decline masking a real, steady rise) — the correct points made the whole series look trustworthy on a casual check. Search for each period's actual figure specifically; a point you cannot confirm is UNVERIFIABLE for that point even when its neighbors in the same chart are genuinely correct.

2026-08-03: a real error slipped through where the story stated a decision as already made ("RBI holds/maintains the repo rate") when a live search actually shows it was an UPCOMING, not-yet-happened scheduled event — an MPC meeting preview, analyst expectations, "expected to," "likely to," "scheduled to," "due to meet/decide" coverage. Search specifically for whether the event has actually occurred as of the publication date, not just whether the topic is being discussed. If the story reports an expected or scheduled future event as if it already happened, that is WRONG at minimum, and if it's the story's central premise, treat centralEventConfirmed as false and the verdict as FABRICATED even if the underlying numbers exist elsewhere and are individually accurate.

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
  let currentModel = GROUNDED_MODEL;
  const deadModels = new Set();

  const userPrompt =
    `Publication date of this story: ${editionDate}\n\n` +
    `Story claims to verify:\n\n${buildClaimDigest(story)}` +
    buildKnownFactsBlock();

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
      const text = candidate.content?.parts?.filter((p) => !p.thought).map((p) => p.text || "").join("") ?? "";
      const parsed = JSON.parse(extractJson(text));
      if (!parsed.verdict) throw new Error("Verifier returned JSON without a verdict field");
      parsed.issues = Array.isArray(parsed.issues) ? parsed.issues : [];
      return parsed;
    } catch (err) {
      if (err.status === 404) {
        deadModels.add(currentModel);
        const other = currentModel === GROUNDED_MODEL ? GROUNDED_FALLBACK_MODEL : GROUNDED_MODEL;
        if (deadModels.has(other)) throw new Error(`Both ${GROUNDED_MODEL} and ${GROUNDED_FALLBACK_MODEL} return 404 — set GEMINI_GROUNDED_MODEL to a current model.`);
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
        const other = currentModel === GROUNDED_MODEL ? GROUNDED_FALLBACK_MODEL : GROUNDED_MODEL;
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

// 2026-07-22: Broader Connections is the historical-precedent feature —
// the actual differentiator this publication is built around, not an
// incidental detail. Real evidence showed exactly why it needs separate,
// stricter treatment: a story's core regulatory fact was accurate, but
// it padded in an invented historical parallel (a US Savings & Loan
// crisis reference) there — and because the auto-remove threshold
// treats every unverified claim the same regardless of where it sits in
// the story, that fabricated precedent only got removed because it
// happened to coincide with 2 OTHER unrelated issues crossing the
// generic 3-issue bar. A single fabricated historical precedent should
// be enough on its own — this section is where a reader's trust in "this
// platform gets its history right" either holds or breaks, which is a
// different, higher stake than a padded incidental detail elsewhere in
// the same story.
//
// Lightweight overlap heuristic rather than exact substring matching,
// since a verification issue's claim text is the model's own paraphrase
// of the problem, not necessarily a verbatim quote from the story.
// 2026-08-03: chart/keyNumbers claims get the same "one bad point sinks
// the whole thing" treatment as Broader Connections, for the same reason —
// buildClaimDigest feeds these to the verifier as distinctly-prefixed
// lines ("CHART DATA POINT: ...", "KEY NUMBER CARD: ..."), and the prompt
// asks the model to return the claim "as it appears," so a flagged
// chart/keyNumber issue reliably carries its prefix straight through.
// These are exactly the figures readers screenshot and share — a single
// wrong one shouldn't need to wait for 2 unrelated issues elsewhere in the
// same story to cross the generic warnThreshold before the story is pulled.
const CHART_OR_KEYNUMBER_PREFIXES = ["chart data point:", "chart takeaway:", "chart:", "key number card:"];
function isChartOrKeyNumberIssue(issue) {
  const claim = (issue.claim || "").trim().toLowerCase();
  return CHART_OR_KEYNUMBER_PREFIXES.some((p) => claim.startsWith(p));
}

function tagBroaderConnectionsIssues(story, issues) {
  const match = (story.deepDiveRead || "").match(/## Broader Connections([\s\S]*?)(?=\n## |$)/i);
  const bcText = match ? match[1].toLowerCase() : "";
  return issues.map((issue) => {
    const claimWords = (issue.claim || "").toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const overlap = bcText ? claimWords.filter((w) => bcText.includes(w)).length : 0;
    const inBroaderConnections = bcText.length > 0 && claimWords.length > 0 && overlap / claimWords.length >= 0.5;
    return { ...issue, inBroaderConnections, isChartOrKeyNumber: isChartOrKeyNumberIssue(issue) };
  });
}

// ---------- per-day verification cache ----------
//
// 2026-08-05: every re-trigger of the daily pipeline (manual or scheduled
// top-up) used to re-verify EVERY story already in the edition from
// scratch — even ones a run earlier that same day already checked and
// kept. On a day with 5 pipeline runs (a real day this happened), an
// early story could get fully re-verified 3-4 times for an answer that
// couldn't have changed, since nothing about the story or its sources
// changed between checks minutes/hours apart. That's real, avoidable
// spend against the exact daily request quota that ran out and blocked
// generation entirely. A cache keyed on a hash of the verified content
// (not just the slug) means an edited/regenerated story is never served
// a stale verdict — only a byte-for-byte-unchanged story reuses its
// earlier-today result.
const crypto = require("crypto");

function digestHash(story) {
  return crypto.createHash("sha256").update(buildClaimDigest(story)).digest("hex").slice(0, 16);
}

function loadTodaysCache(editionDate, outDir) {
  const cache = new Map();
  try {
    const jsonPath = path.join(outDir, `${editionDate}-report.json`);
    const prior = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    for (const r of prior.results || []) {
      if (r.digestHash) cache.set(r.slug, r);
    }
  } catch {
    // No report yet today, or it's unreadable — fine, just means no cache hits.
  }
  return cache;
}

// ---------- core verification (no process.exit — safe to call from
// generate-edition.js in-process, not just from this file's own CLI) ----------

async function verifyEdition({
  editionFile,
  mode = "source",
  onlySlugs = null,
  useCache = true,
  outDir = "data/verification",
  autoRemove = false,
  warnThreshold = parseInt(process.env.VERIFY_WARN_ISSUE_THRESHOLD || "3", 10),
}) {
  const edition = JSON.parse(fs.readFileSync(editionFile, "utf8"));
  const editionDate = edition.date || path.basename(editionFile, ".json");
  let stories = edition.stories || [];
  if (onlySlugs) stories = stories.filter((s) => onlySlugs.has(s.slug));

  const cache = useCache ? loadTodaysCache(editionDate, outDir) : new Map();

  console.log(`Verifying ${stories.length} stories from ${editionFile} (edition ${editionDate}).`);
  console.log(`Mode: ${mode} — ${mode === "source"
    ? `fetching each story's own sources; plain Gemini calls, ZERO grounding quota, via ${MODEL} (fallback ${FALLBACK_MODEL}), escalating unfetchable stories to grounded verification via ${GROUNDED_MODEL} (fallback ${GROUNDED_FALLBACK_MODEL})`
    : `google_search grounding (uses grounding quota) via ${GROUNDED_MODEL} (fallback ${GROUNDED_FALLBACK_MODEL})`}, ${SPACING_MS / 1000}s between stories.${cache.size ? ` ${cache.size} cached verdict(s) available from earlier today.` : ""}\n`);

  const results = [];
  let quotaExhausted = false;

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    const label = `[${i + 1}/${stories.length}] ${story.slug}`;
    const hash = digestHash(story);
    const cached = cache.get(story.slug);
    if (cached && cached.digestHash === hash) {
      results.push({ ...cached });
      console.log(`${label} — using cached verdict from earlier today (${cached.verdict})`);
      continue;
    }
    if (quotaExhausted) {
      // No digestHash on quota-exhausted placeholders — this is a transient
      // infrastructure failure, not a real verdict, so it must never be
      // cached; the next run should always get a fresh real attempt.
      results.push({ slug: story.slug, headline: story.headline, verdict: "SKIPPED", neverVerified: true, issues: [], notes: "Grounding quota exhausted earlier in this run." });
      continue;
    }
    console.log(`${label} — verifying...`);
    try {
      let v;
      if (mode === "source") {
        const sources = await fetchStorySources(story);
        if (sources.length === 0) {
          // 2026-07-22: this used to just record "unverifiable, no
          // fetchable sources" and move on — a real report showed 11 of
          // 15 stories in one edition landed exactly here and stayed
          // live, genuinely unchecked, not because they were fine but
          // because verification simply couldn't reach their links. That
          // silently became "good enough to publish," which it never was
          // meant to be. Auto-escalating to grounded mode (live search,
          // doesn't depend on the story's own links working) turns
          // "couldn't verify" into an actual verification instead of an
          // assumption. Only escalates the stories that actually need
          // it — not a blanket re-run of the whole edition in the
          // costlier mode.
          console.log(`  no fetchable sources — escalating to grounded verification...`);
          try {
            const gv = await verifyStory(story, editionDate);
            const taggedIssues = tagBroaderConnectionsIssues(story, gv.issues);
            results.push({
              slug: story.slug, headline: story.headline, verdict: gv.verdict,
              centralEventConfirmed: gv.centralEventConfirmed, issues: taggedIssues,
              notes: `${gv.notes || ""} (escalated from source mode — original links were unfetchable)`.trim(),
              digestHash: hash,
            });
            console.log(`${label} — ${gv.verdict}${gv.issues.length ? ` (${gv.issues.length} issue(s))` : ""} [escalated]`);
          } catch (escErr) {
            if (escErr.isGroundingQuota) {
              // Grounding quota ran out during escalation specifically —
              // fall back to the honest "couldn't check" placeholder for
              // this story and stop attempting further escalations this
              // run, but keep processing remaining stories in source mode
              // (they don't need grounding quota at all).
              console.warn(`  grounding quota exhausted during escalation — falling back to unverifiable for this story.`);
              results.push({ slug: story.slug, headline: story.headline, verdict: "WARN", neverVerified: true, issues: [{
                claim: "(entire story)", status: "UNVERIFIABLE",
                detail: "Source links were unfetchable, and grounding-mode escalation also hit a quota limit.",
                correction: null, source: null,
              }], notes: "Re-run with --mode grounded once quota resets." }); // no digestHash — transient, always retry
            } else {
              console.error(`  escalation failed: ${escErr.message}`);
              results.push({ slug: story.slug, headline: story.headline, verdict: "ERROR", issues: [], error: `Escalation failed: ${escErr.message}` }); // no digestHash — transient
            }
          }
          if (i < stories.length - 1) await sleep(SPACING_MS);
          continue;
        }
        console.log(`  fetched ${sources.length} source(s)`);
        v = await verifyStoryAgainstSources(story, editionDate, sources);
      } else {
        v = await verifyStory(story, editionDate);
      }
      results.push({ slug: story.slug, headline: story.headline, verdict: v.verdict, centralEventConfirmed: v.centralEventConfirmed, issues: tagBroaderConnectionsIssues(story, v.issues), notes: v.notes, digestHash: hash });
      console.log(`${label} — ${v.verdict}${v.issues.length ? ` (${v.issues.length} issue(s))` : ""}`);
    } catch (err) {
      if (err.isGroundingQuota) {
        console.error(`\nGrounding quota exhausted at story ${i + 1}. Stopping — this verifier never runs ungrounded.`);
        quotaExhausted = true;
        results.push({ slug: story.slug, headline: story.headline, verdict: "SKIPPED", neverVerified: true, issues: [], notes: "Grounding quota exhausted — story not verified." }); // no digestHash — transient
        continue;
      }
      console.error(`${label} — ERROR: ${err.message}`);
      results.push({ slug: story.slug, headline: story.headline, verdict: "ERROR", neverVerified: true, issues: [], error: err.message }); // no digestHash — transient
    }
    if (i < stories.length - 1 && !quotaExhausted) await sleep(SPACING_MS);
  }

  const { mdPath } = writeReports(editionDate, results, outDir);
  console.log(`\nReport written to ${mdPath}`);

  const bad = results.filter((r) => r.verdict === "FAIL" || r.verdict === "FABRICATED");
  const summary = {};
  for (const r of results) summary[r.verdict] = (summary[r.verdict] || 0) + 1;
  console.log(`Summary: ${Object.entries(summary).map(([k, v]) => `${v} ${k}`).join(", ")}`);
  if (bad.length) {
    console.error(`\n${bad.length} story(ies) FAILED verification:`);
    for (const r of bad) console.error(`  - ${r.slug}: ${r.verdict}`);
  }

  let removed = [];
  // 2026-07-21: added after a real report showed the actual gap in this
  // whole system — verify-edition.js was sophisticated and genuinely
  // catching problems (a real run found 14/15 stories WARN, including a
  // story with an entirely fabricated Iran/Strait of Hormuz narrative —
  // invented airstrikes, tanker explosions, specific vessel counts, none
  // of it in any real source), but was ONLY ever manually triggered and
  // its exit code was explicitly ignored by the workflow ("Don't fail
  // the job on FAIL verdicts"). Fact-checking existed; nothing connected
  // it to what actually got published. This flag closes that gap.
  //
  // Threshold reasoning: FAIL/FABRICATED (a claim actively CONTRADICTS a
  // source) always removes a story — that's unambiguous fabrication.
  // WARN (claims are unconfirmed, not necessarily false) is murkier —
  // dropping every WARN story would gut the edition, since today's real
  // run shows WARN correctly firing on minor, low-stakes unconfirmed
  // details too (a Commerce Secretary's exact schedule), not just
  // serious fabrication. But the Hormuz story alone had 7 separate
  // unverifiable claims forming an entire invented narrative — volume of
  // unverifiable claims is a reasonable, mechanical proxy for "this
  // isn't one soft edge, this is substantially made up." Configurable
  // via env var rather than hardcoded, since the right number is a
  // judgment call worth revisiting as real data comes in.
  if (autoRemove) {
    // 2026-07-22: a single unverifiable claim inside Broader Connections
    // (the historical-precedent feature — this publication's actual
    // differentiator) now removes a story on its own, regardless of the
    // generic issue-count threshold — see tagBroaderConnectionsIssues for
    // the full reasoning. Getting this section wrong is a different kind
    // of failure than a padded incidental detail elsewhere in the story.
    //
    // 2026-08-03: a real, confirmed case slipped through this exact gap —
    // a story reporting an RBI rate decision that hadn't actually been
    // announced yet (the real announcement was 2 days out), with a
    // materially wrong rate figure. Verification never actually checked
    // it: its own source links were unfetchable AND the grounded
    // escalation hit a quota limit — but that produced exactly one
    // generic "(entire story)" UNVERIFIABLE issue, landing under the
    // warnThreshold and staying live. A story nobody managed to check at
    // all is a materially different (and riskier) situation than one
    // that WAS checked and came back with a minor loose end — treat
    // "never verified" (neverVerified, set on SKIPPED/ERROR results and
    // on the quota-exhausted-during-escalation WARN) as always crossing
    // the threshold, independent of issue count.
    //
    // 2026-08-03: a flagged chart point or key-number card gets the same
    // always-crosses-the-threshold treatment as Broader Connections (see
    // isChartOrKeyNumberIssue) — these are the exact figures readers
    // screenshot and share, so a single wrong one shouldn't need 2
    // unrelated issues elsewhere in the story to also cross warnThreshold.
    const toRemove = results.filter(
      (r) =>
        r.verdict === "FAIL" ||
        r.verdict === "FABRICATED" ||
        r.neverVerified ||
        (r.verdict === "WARN" &&
          (r.issues.length >= warnThreshold || r.issues.some((i) => i.inBroaderConnections || i.isChartOrKeyNumber)))
    );
    if (toRemove.length === 0) {
      console.log("\n--auto-remove: nothing crossed the removal threshold — edition unchanged.");
    } else {
      const removeSlugs = new Set(toRemove.map((r) => r.slug));
      const before = edition.stories.length;
      edition.stories = edition.stories.filter((s) => !removeSlugs.has(s.slug));
      fs.writeFileSync(editionFile, JSON.stringify(edition, null, 2));
      console.log(`\n--auto-remove: pulled ${toRemove.length} story(ies) from ${editionFile} (${before} -> ${edition.stories.length}):`);
      for (const r of toRemove) console.log(`  - ${r.slug} (${r.verdict}, ${r.issues.length} issue(s)): ${r.headline}`);
      removed = toRemove;
    }
  }

  return { edition, results, bad, removed, quotaExhausted, liveCount: edition.stories.length };
}

// ---------- thin CLI wrapper ----------

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
  // --no-cache: force a full re-verify, bypassing today's cached verdicts —
  // useful when debugging the verifier itself, or after a prompt change
  // where cached results from earlier today no longer reflect current logic.
  const useCache = !args.includes("--no-cache");

  const { bad, quotaExhausted } = await verifyEdition({
    editionFile, mode, onlySlugs, useCache, autoRemove: args.includes("--auto-remove"),
  });

  process.exit(quotaExhausted ? 2 : bad.length ? 1 : 0);
}

// Only auto-run when invoked directly (`node scripts/verify-edition.js`).
// generate-edition.js requires verifyEdition (and fetchStorySources/etc as
// a pre-publish recency gate) — requiring this file must NOT also kick off
// a full CLI verification run (and must NOT call process.exit on the parent).
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
      const text = data.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || "").join("") ?? "";
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
  verifyEdition,
};
