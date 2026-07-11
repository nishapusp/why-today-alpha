#!/usr/bin/env node
/**
 * scripts/generate-edition.js
 *
 * Daily edition generation via the Gemini API — INCREMENTAL version.
 *
 * What changed vs. the previous version:
 *  1. Stories are generated in small batches (3 at a time) and PUBLISHED
 *     AFTER EVERY BATCH — edition.json is written, committed, and pushed
 *     as soon as each batch succeeds. The first 3 stories go live within
 *     minutes; a failure in batch 4 no longer throws away batches 1-3.
 *  2. RESUME support — on startup, if data/edition.json is already dated
 *     today, its stories are kept and only the REMAINING stories are
 *     generated. Re-running after a failure never re-burns tokens on
 *     stories that already exist.
 *  3. Shorter read tiers to cut Gemini output load roughly in half:
 *       quickRead        ≈ 1 minute  (100-150 words)
 *       full read        ≈ 3 minutes (whatHappened/whyToday/whyCare
 *                                     120-160w each, whatNext 80-120w)
 *       deep dive        ≈ 8 minutes total (deepDiveRead 500-800 words)
 *  4. Resilient retries — up to 3 retries per batch (was 1). 429s wait on
 *     Gemini's own retry-after; 500/503 (overload) get our own exponential
 *     backoff since Gemini gives no retry-after for those. Every retryable
 *     failure also ALTERNATES between GEMINI_MODEL and GEMINI_FALLBACK_MODEL
 *     (default gemini-3.1-flash-lite) — a different model draws from a
 *     separate capacity/quota pool, so it's often unstuck when the primary
 *     model is either overloaded or quota-exhausted for the day.
 *
 * NOTE: keep lib/prompts.ts's DAILY_EDITION_SYSTEM_PROMPT in sync with the
 * new length floors below, and regenerate-story.js if it has its own copy.
 *
 * Usage:
 *   GEMINI_API_KEY="..." node scripts/generate-edition.js
 *
 * Locally you confirm ONCE up front; after that every clean batch is
 * pushed automatically. In CI (CI=true) it publishes automatically.
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
// Used when the primary model comes back 429/500/503. A different model
// name draws from a SEPARATE capacity/quota pool on Google's side, so
// switching is often more effective than waiting and re-hitting the same
// overloaded or quota-exhausted model.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite";
const API_KEY = process.env.GEMINI_API_KEY;
const EDITION_PATH = path.join(__dirname, "..", "data", "edition.json");

// 9 stories total for now (was 15) — keeps each day comfortably inside the
// Gemini free-tier daily quota. Bump back up later via STORY_TARGET env var
// once billing is enabled, without needing a code change.
const TOTAL_STORIES = parseInt(process.env.STORY_TARGET || "9", 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "3", 10);

const REQUIRED_STORY_FIELDS = [
  "headline", "slug", "category", "summary", "quickRead", "whatHappened",
  "whyToday", "whyCare", "whatNext", "deepDiveRead", "keyNumbers",
  "knowledgeChain", "ifYoureWondering", "officialSources", "readMinutes", "sentiment",
];
const REQUIRED_EDITION_FIELDS = ["date", "themeTitle", "numberValue", "stories"];

// Reduced floors — quick ≈ 1 min, full read ≈ 3 min, deep dive ≈ 8 min total.
const WORD_FLOORS = {
  quickRead: 90, whatHappened: 110, whyToday: 110, whyCare: 110, whatNext: 70,
};
const DEEP_DIVE_FLOOR = 400; // target range is 500-800; hard-fail only below 400

// Keep this in sync with lib/prompts.ts's DAILY_EDITION_SYSTEM_PROMPT.
function buildSystemPrompt(storyCount) {
  return `You produce part of a daily "edition" as JSON for readers who follow India's economy, markets, banking, and business — professionals, investors, and curious general readers. Coverage spans banking and policy, corporate news and quarterly results of major listed companies (including banks), market-moving developments, and technology events that affect the economic landscape. Goal: explain WHY, in plain language, not just headlines. Be CONCISE — every sentence must earn its place. No padding, no restating the same fact in different words.

## Voice — this is the difference between useful and boring
Write like a sharp friend explaining why something matters over chai, not like a press release or a policy memo. Open every field with the single most surprising or relevant fact — never a throat-clearing lead-in. Every keyNumbers value must be an actual figure (₹ amount, %, date, count) — never a vague phrase. Omit a keyNumbers entry entirely rather than inventing one without a real figure.

## Headlines — the Curiosity Engine (act as Chief Editor)
Your job is not to write headlines. Your job is to create irresistible curiosity while remaining completely truthful.
Rules for "headline": maximum 11 words; language a Class 8 student understands; must make the reader think "Wait… why?"; create surprise, curiosity, or a direct personal stake; NEVER clickbait — the story must fully deliver what the headline promises; no newspaper/bulletin language, no jargon (banned patterns: "X Continues Y", "Government Relaxes Z", "X Maintains Y Pace", "X Signals Y"). Before finalizing, score your headline on curiosity out of 10 — if it scores below 9, rewrite it until it does.
Also include per story:
- "whatsappHeadline": the version someone forwards to a group — max 9 words, punchier, may include exactly one emoji, still 100% truthful.
- "notificationHeadline": max 7 words, hook first — reads like a push notification you would actually tap.

## Sourcing
Use Google Search to check 3-5 real, current sources per story, drawn from DIFFERENT categories: national financial press (Economic Times, Business Standard, Mint, Moneycontrol, Financial Express, Hindu BusinessLine, CNBC-TV18), official/regulatory (RBI, SEBI, NSE, BSE, PIB), and international (Reuters, Bloomberg) when relevant. Rotate outlets across stories. Cross-check figures against 2+ sources.

## Recency is mandatory, not a preference
Every one of the ${storyCount} stories must be about something that was reported or happened within the last 24-48 hours specifically — not a general/recurring topic dressed up as news. When searching, use date-qualified queries: include words like "today," "this week," the actual current date, or "latest" in your search terms rather than generic topic searches, which tend to surface older, more established articles instead of breaking ones.
Reject any story candidate that is really an evergreen or recurring theme (e.g. "RBI's ongoing approach to liquidity management" without a specific new trigger event) — if you can't find a genuinely fresh news hook for a topic, search again with different terms or pick a different story entirely. It is better to search harder than to include a stale story.
If it's very early in the day and today's news cycle hasn't produced ${storyCount} fresh stories yet, prioritize the most recent 24 hours available (including late the previous evening) rather than reaching back multiple days.

## Output rules (strict)
No citation markers, footnote numbers, brackets, or "(Source)" text inline anywhere — sources go ONLY in officialSources. No story position/number inside any text field. Every field = complete sentences. Explain every technical term in plain words the first time it's used. Write for someone with zero finance background.

## Length rules (both floors AND ceilings — do not exceed the ceilings)
summary: 2 sentences (30-40 words). quickRead: 100-150 words — a complete 1-minute read on its own. whatHappened, whyToday, whyCare: 120-160 words each, each including at least one concrete comparison. whatNext: 80-120 words with a timeframe if known. deepDiveRead: 500-800 words total across 5 headers: ## What Changed (80-140w), ## The Backstory (100-160w), ## Why It Matters (120-180w), ## Broader Connections (80-140w), ## Alternative View (80-120w). Staying UNDER the ceiling matters as much as staying over the floor — tight and specific beats long and padded.

## Deep Dive must feel immersive, not a wall of paragraphs
Open with a "Fast Facts" bullet list (3-4 lines starting with "- ", each a concrete number). In "## The Backstory" specifically, the LAST paragraph of that section must start with the exact words "Then vs. now:" or "Compared to [X]:" — a required, specifically-placed paragraph, not an optional flourish anywhere in the piece. Use **bold** around the single most important number per section. Vary sentence rhythm — mix short punchy sentences with longer ones. In Alternative View, frame it as a real disagreement ("Not everyone reads this the same way.").

## knowledgeChain
3-6 word labels, each explained in "Broader Connections".

## Before returning output, verify — do not skip this step
Re-read every prose field and confirm: no stray numbers/citations inline; no story-position numbers in text; every jargon term explained on first use; every headline is 11 words or fewer AND would score 9/10 on curiosity; every story has all six timeMachine keys, each specific to that story's thread; every chart (if present) has real sourced values in matching label/value counts — delete any chart you are not certain about; whatHappened/whyToday/whyCare are each 120-160 words (a one-sentence field is an automatic failure, and so is a 250-word one); readMinutes matches the actual word count; EVERY story is genuinely from the last 24-48 hours, not an evergreen/recurring topic — if any story fails this recency check, replace it with a fresher one before finalizing. For deepDiveRead specifically, verify all of these are literally present in the text, not just planned: 500-800 words total; all 5 "## " headers; a "- " bullet list (3-4 lines) placed right after the first header; at least one "**...**" bold marker in at least 3 sections; the LAST paragraph of "## The Backstory" starting with "Then vs. now:" or "Compared to". If any single one of these is missing, add it before finalizing — this is not optional formatting. A field that says only one vague sentence (e.g. "Updated data highlighted the scale of the increase.") is not acceptable output under any circumstance — it must be rewritten with real, specific figures.

## timeMachine (per story, required) — the signature feature
"timeMachine" places today's news in time so a reader sees the full arc, not just today's blip. Six keys, each 1-2 plain sentences (15-35 words), with a REAL fact or figure wherever possible — use Google Search for the historical steps, not memory alone:
- "yesterday": the immediate setup — what the situation was in the days just before this news broke.
- "lastMonth": where this issue/number stood roughly a month ago.
- "lastYear": where it stood about a year ago — a real figure or a named event.
- "tenYearsAgo": the long view — what this landscape looked like roughly a decade ago (an approximate era is fine, e.g. "Back in 2016, ...").
- "today": what changed today, in one crisp line.
- "future": the single most likely next development, with a timeframe if known.
Each step must be specific to THIS story's thread, so reading top to bottom feels like time travel toward today.
HISTORICAL STEPS MUST BE RESEARCHED, NOT RECALLED: for "lastMonth", "lastYear" and "tenYearsAgo", run dedicated date-qualified searches for the actual historical data (e.g. "repo rate June 2026", "forex reserves July 2025", "repo rate 2016"). Each of these three steps must carry at least one concrete dated figure or a named event with its year — "the rate was 6.5% in July 2025" is a Time Machine step; "rates were higher back then" is not. This researched specificity is the entire value of the feature. If a genuine fact for a step cannot be verified even after searching, write the honest general context for that era — never invent precise figures.

## chart (per story, OPTIONAL — include only when genuinely numeric)
If and only if the story centers on a measurable series (repo rate, inflation, forex reserves, deposits, profits, prices), include "chart": {"title", "unit" (e.g. "%", "₹ lakh crore" — optional), "labels" (3-6 short strings like "FY22" or "Jan"), "values" (same count of plain numbers, no commas/symbols), "takeaway" (one sentence: what the chart proves)}. Values must be real figures from your sources, in consistent units, in chronological order. If you do not have 3+ real comparable numbers, OMIT "chart" entirely — a story without a chart is fine; a fabricated chart is a failure.

## Quiz (per story)
Each story must include "quiz": exactly 3 multiple-choice questions testing whether a reader UNDERSTOOD the story (not trivia recall). Each has "question" (one sentence), "options" (exactly 4 short strings, one correct + three plausible-but-wrong distractors that reflect common misconceptions), "answerIndex" (integer 0-3, position of the correct option — vary it across questions, don't always use 0), and "explanation" (1-2 sentences on why the answer is right, reinforcing the concept). Question 1 should test the core fact, question 2 the "why it matters" reasoning, question 3 a concept/term the story relies on.

## Vocabulary (edition level)
Include a top-level "vocabulary" array of exactly 5 items: the 5 most useful banking/finance/policy terms appearing in this batch's stories, each as {"term","definition"} with the definition in 20-40 words of plain language a general reader new to finance would actually benefit from. Prefer terms a general reader wouldn't know (e.g. "MPBF", "repo corridor") over everyday words.

## Schema (exact field names, always exactly ${storyCount} stories in this response)
Return ONLY valid JSON matching this shape:
{
 "date","themeTitle","themeDescription","numberValue","numberLabel","numberTrend",
 "vocabulary":[{"term","definition"}],
 "stories":[{
   "headline","whatsappHeadline","notificationHeadline",
   "slug","category" (Banking|Economy|Technology|World|Policy|Corporate),
   "summary","quickRead","whatHappened","whyToday","whyCare","whatNext","deepDiveRead",
   "timeMachine":{"yesterday","lastMonth","lastYear","tenYearsAgo","today","future"},
   "chart":{"title","unit?","labels":["..."],"values":[numbers],"takeaway"} (OPTIONAL — omit if not genuinely numeric),
   "keyNumbers":[{"label","value","previousValue?","previousLabel?","trendNote?"}],
   "knowledgeChain":["..."],
   "ifYoureWondering":[{"q","a"}],
   "officialSources":[{"label","url"}],
   "quiz":[{"question","options","answerIndex","explanation"}],
   "readMinutes" (integer = word_count/200, rounded up),
   "sentiment" (positive|caution|critical|neutral)
 }]
}`;
}

function getTodayISO() {
  // IST, matching how editions are dated throughout the site
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function buildUserPrompt(storyCount, excludeHeadlines) {
  const exclusionNote = excludeHeadlines?.length
    ? ` Do NOT repeat or overlap with these already-covered stories from the same edition: ${excludeHeadlines.map((h) => `"${h}"`).join(", ")}. Find ${storyCount} completely different fresh stories.`
    : "";
  return `Today's actual date is ${getTodayISO()}. Generate ${storyCount} stories for today's Why Today edition dated ${getTodayISO()}, covering important Indian financial, banking, corporate, markets, policy, and economy-relevant technology NEWS FROM TODAY AND YESTERDAY SPECIFICALLY — including results and major announcements of large listed companies (banks included) and technology developments affecting the economic landscape (${getTodayISO()} and the day before) — not general background topics. Search using date-qualified terms (include "${getTodayISO()}", "today", "latest") rather than generic topic searches, which tend to surface older established articles. Every story must have a genuine fresh news trigger from the last 24-48 hours — reject anything that's really an evergreen/recurring theme.${exclusionNote} Follow every rule in your instructions exactly, especially the length floors AND ceilings, the recency requirement, the "Before returning output, verify" checklist, and the Deep Dive formatting. Also include the top-level edition fields (date, themeTitle, themeDescription, numberValue, numberLabel, numberTrend) summarizing the overall theme across these stories.`;
}

// ---------------------------------------------------------------------------
// RSS fallback grounding.
// When Google Search grounding is quota-blocked (the 3.x free tier gates it,
// unlike 2.5), we fetch real fresh headlines ourselves from Google News RSS
// and hand them to the model as context — same recency guarantee, zero
// grounding quota. Mode is controlled by GROUNDING_MODE=auto|search|rss.
// ---------------------------------------------------------------------------

const RSS_QUERIES = [
  'RBI OR "monetary policy" when:2d',
  "India banking news when:2d",
  "India economy inflation OR GDP when:2d",
  'India "quarterly results" OR earnings when:2d',
  "India stock market Sensex OR Nifty when:2d",
  "India fintech OR technology business when:2d",
];

function decodeXml(s) {
  return (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim();
}

function pickTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeXml(m[1]) : "";
}

let rssCache = null;
async function fetchRssHeadlines() {
  if (rssCache) return rssCache;
  const items = [];
  const seen = new Set();
  const cutoff = Date.now() - 48 * 3600 * 1000;
  for (const q of RSS_QUERIES) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      let count = 0;
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        if (count >= 8) break;
        const block = m[1];
        const title = pickTag(block, "title");
        if (!title) continue;
        const key = title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
        if (seen.has(key)) continue;
        const pub = Date.parse(pickTag(block, "pubDate") || "");
        if (!Number.isNaN(pub) && pub < cutoff) continue;
        seen.add(key);
        count++;
        items.push({
          title,
          link: pickTag(block, "link"),
          source: pickTag(block, "source"),
          pubDate: pickTag(block, "pubDate"),
          snippet: pickTag(block, "description").slice(0, 220),
        });
      }
    } catch (e) {
      console.warn(`RSS feed failed for query "${q}": ${e.message} — continuing with other feeds.`);
    }
  }
  if (items.length < 6) {
    throw new Error(`RSS fallback could only fetch ${items.length} fresh headlines — not enough to ground an edition safely.`);
  }
  console.log(`RSS fallback: fetched ${items.length} fresh headlines from Google News.`);
  rssCache = items;
  return items;
}

function buildRssAddendum(items) {
  const list = items
    .map((it, i) => `${i + 1}. [${it.source || "News"} | ${it.pubDate || "recent"}] ${it.title}${it.snippet ? ` — ${it.snippet}` : ""}${it.link ? ` (link: ${it.link})` : ""}`)
    .join("\n");
  return `\n\nIMPORTANT OVERRIDE — NO LIVE SEARCH THIS RUN: You do NOT have a web search tool in this run, so ignore every instruction above about searching. Instead, the REAL fresh headlines below were fetched minutes ago from Google News RSS (last 48 hours). Pick your stories ONLY from developments covered in this list, choosing the most significant ones not already excluded. Combine each headline with your background knowledge to explain WHY it matters. Do NOT invent precise figures that appear in neither the headline/snippet nor well-established public knowledge — describe qualitatively instead. For each story's sources array, use the matching link(s) from the list.\n\nFRESH HEADLINES:\n${list}`;
}

function asText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function wordCount(str) {
  return asText(str).trim().split(/\s+/).filter(Boolean).length;
}

function extractJson(text) {
  let cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  return cleaned;
}

const CATEGORY_SEARCH_TERMS = {
  Banking: "bank building finance india",
  Economy: "stock market trading india",
  Technology: "technology digital india startup",
  World: "world map global trade",
  Policy: "indian parliament government",
  Corporate: "business office india corporate",
};

// Turn a headline into a Pexels-friendly 2-3 keyword query, so different
// stories search for different photos instead of all sharing one fixed
// category query. Falls back to the category term when the headline yields
// nothing usable (Pexels has no photos of "MPBF" anyway).
const PEXELS_STOPWORDS = new Set([
  "the","a","an","of","in","on","at","to","for","with","and","or","as","by",
  "its","is","are","was","were","be","new","amid","amidst","after","before",
  "over","under","from","into","up","down","out","off","how","why","what",
  "rbi","sebi","nbfc","nbfcs","msme","msmes","mpc","gst","pmi","q1","q2","q3","q4",
  "crore","lakh","cent","per","says","unveils","announces","launches","boosts",
  "maintains","keeps","holds","surges","soars","fuels","eases","tightens",
]);

function headlineToQuery(story) {
  const words = String(story.headline || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !PEXELS_STOPWORDS.has(w));
  if (words.length < 2) return null;
  return words.slice(0, 3).join(" ");
}

// Rolling memory of recently used Pexels photo IDs so the same stock photos
// don't repeat day after day (Pexels returns results in a fixed popularity
// order, so without memory the top photo wins every time). Committed along
// with edition.json.
const PHOTO_HISTORY_PATH = path.join(__dirname, "..", "data", "photo-history.json");
const PHOTO_HISTORY_MAX = 400; // ~3-4 weeks at 15 stories/day

function loadPhotoHistory() {
  try {
    const ids = JSON.parse(fs.readFileSync(PHOTO_HISTORY_PATH, "utf8"));
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function savePhotoHistory(ids) {
  try {
    fs.writeFileSync(PHOTO_HISTORY_PATH, JSON.stringify(ids.slice(-PHOTO_HISTORY_MAX)));
  } catch {
    /* history is best-effort */
  }
}

let photoHistory = loadPhotoHistory();
const photoHistorySet = new Set(photoHistory);

async function searchPexels(query, apiKey) {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20&orientation=landscape`,
    { headers: { Authorization: apiKey } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.photos || [];
}

async function fetchPexelsImage(story, apiKey) {
  try {
    // 1. Story-specific search first, category fallback second.
    const queries = [headlineToQuery(story), CATEGORY_SEARCH_TERMS[story.category] || "business finance india"]
      .filter(Boolean);
    let candidates = [];
    for (const q of queries) {
      candidates = await searchPexels(q, apiKey);
      // A headline query with a decent pool is good enough — don't fall
      // through to the (repetitive) category query unless we have to.
      if (candidates.length >= 3) break;
    }
    if (candidates.length === 0) return null;

    // 2. Prefer a photo not used recently (this edition or past weeks);
    //    if literally everything has been used, take the least-recent one.
    let photo = candidates.find((p) => !photoHistorySet.has(p.id));
    if (!photo) {
      candidates.sort((a, b) => photoHistory.indexOf(a.id) - photoHistory.indexOf(b.id));
      photo = candidates[0];
    }

    // 3. Remember it.
    photoHistory = photoHistory.filter((id) => id !== photo.id);
    photoHistory.push(photo.id);
    photoHistorySet.add(photo.id);
    savePhotoHistory(photoHistory);

    return {
      url: photo.src.large,
      alt: photo.alt || story.headline,
      credit: photo.photographer,
      creditUrl: photo.photographer_url,
    };
  } catch {
    return null; // Non-fatal — a story with no image just renders without one.
  }
}

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pulls the server-suggested wait time out of a 429 error body, if present
// (Gemini returns retryDelay in seconds, e.g. "20s"). Falls back to a safe
// default so we never hammer the API immediately after a rate-limit hit.
function extractRetryDelayMs(errBody, fallbackMs) {
  const match = (errBody || "").match(/"retryDelay"\s*:\s*"(\d+)s"/);
  if (match) return (parseInt(match[1], 10) + 2) * 1000; // +2s buffer
  return fallbackMs;
}

// Digs the specific violated quota IDs out of a 429 body so the log tells
// us WHICH limit tripped (per-minute vs per-day vs the project-level Search
// grounding quota) instead of a bare "rate limit" that could mean anything.
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
  } catch {
    // Body wasn't JSON — fall through to regex scraping below.
  }
  if (ids.length === 0) {
    const rx = /"quotaId"\s*:\s*"([^"]+)"/g;
    let m;
    while ((m = rx.exec(errBody || "")) !== null) ids.push(m[1]);
  }
  const joined = ids.join(", ");
  return {
    ids,
    joined,
    // Daily/monthly quotas won't reset in 20s — retrying is pure waste.
    isLongWindow: /perday|daily|permonth|monthly/i.test(joined),
    // Grounding quota is PROJECT-level and shared across models, so model
    // alternation can't route around it.
    isGrounding: /grounding|websearch|web_search|searchtool/i.test(joined),
  };
}

async function generateBatch(storyCount, excludeHeadlines, mode = "search", maxRetries = 3) {
  let attempt = 0;
  let currentModel = MODEL;
  const deadModels = new Set(); // models Google has retired (404) this run

  let userPrompt = buildUserPrompt(storyCount, excludeHeadlines);
  if (mode === "rss") {
    userPrompt += buildRssAddendum(await fetchRssHeadlines());
  }

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(`${GEMINI_API_BASE}/${currentModel}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: buildSystemPrompt(storyCount) }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          // RSS mode drops the google_search tool entirely (that's the whole
          // point — the tool is what trips the grounding quota). With no
          // tool present, responseMimeType JSON is allowed again, which
          // makes output parsing far more reliable.
          ...(mode === "rss" ? {} : { tools: [{ google_search: {} }] }),
          generationConfig: {
            // NOTE: responseMimeType: "application/json" is deliberately NOT
            // set here — Gemini rejects that combined with the google_search
            // tool (400 INVALID_ARGUMENT: "Tool use with a response mime
            // type ... is unsupported"). We rely on the prompt's "Return
            // ONLY valid JSON" instruction plus extractJson()'s fence-
            // stripping fallback instead. Do not re-add responseMimeType
            // while google_search is in tools.
            // 20000 (was 16000): timeMachine + extra headlines + optional
            // chart add ~500 output tokens per story (~1500/batch of 3).
            maxOutputTokens: 20000,
            ...(mode === "rss" ? { responseMimeType: "application/json" } : {}),
          },
        }),
        signal: AbortSignal.timeout(240000), // 4 min — 3-story batches usually finish well under 2
      });

      if (!res.ok) {
        const bodyText = await res.text();
        const err = new Error(`Gemini API error (${res.status}) on ${currentModel}: ${bodyText}`);
        err.status = res.status;
        err.body = bodyText;
        throw err;
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];

      if (!candidate) {
        throw new Error(`No candidates returned: ${JSON.stringify(data)}`);
      }
      if (candidate.finishReason === "MAX_TOKENS") {
        throw new Error(
          `Response was cut off even at ${storyCount} stories — try BATCH_SIZE=2.`
        );
      }

      const text = candidate.content?.parts?.map((p) => p.text || "").join("") ?? "";

      return JSON.parse(extractJson(text));
    } catch (err) {
      // A 404 means Google has RETIRED this model entirely (they've been
      // pulling models ahead of documented shutdown dates — 2.5 Flash/Lite
      // started 404ing in July 2026, months before the Oct 16 date). Never
      // retry a dead model; switch to the other one immediately, and if
      // both are dead, fail with an actionable message instead of burning
      // the retry budget.
      if (err.status === 404) {
        deadModels.add(currentModel);
        const other = currentModel === MODEL ? FALLBACK_MODEL : MODEL;
        if (deadModels.has(other)) {
          throw new Error(
            `Both ${MODEL} and ${FALLBACK_MODEL} return 404 — Google has retired them. ` +
            `Set GEMINI_MODEL / GEMINI_FALLBACK_MODEL in the workflow to current model names ` +
            `(check https://ai.google.dev/gemini-api/docs/models).`
          );
        }
        console.warn(`\n${currentModel} has been retired by Google (404). Switching to ${other} for the rest of this run.`);
        currentModel = other;
        continue; // doesn't consume a retry — nothing was actually attempted against a live model
      }
      attempt++;
      if (attempt > maxRetries) {
        throw err; // preserves err.status so main() can detect quota exhaustion and stop the whole run
      }
      if (err.status === 429) {
        const quota = describeQuotaViolations(err.body);
        if (quota.joined) {
          console.warn(`\n429 quota violation detail: ${quota.joined}`);
        } else {
          // No structured details — dump the raw body once so we're never
          // blind about WHICH limit tripped again.
          console.warn(`\n429 raw body: ${(err.body || "").slice(0, 600)}`);
        }
        if (quota.isGrounding) {
          err.isGroundingQuota = true;
          throw err; // project-level + shared across models — retrying/alternating can't help
        }
        if (quota.isLongWindow) {
          throw err; // daily/monthly quota — won't reset in 20s, stop the run cleanly
        }
        // A 429 with NO violation details AND no retryDelay hint (like the
        // ones we saw on 3.x grounded calls) means Google isn't telling us
        // when to retry — it's an effectively-zero quota, not a momentary
        // per-minute limit. Waiting 20s three times is pure waste; throw now
        // so main() can fall back to RSS mode immediately.
        if (!quota.joined && !/"retryDelay"/.test(err.body || "")) {
          err.noQuotaDetail = true;
          throw err;
        }
        const waitMs = extractRetryDelayMs(err.body, 20000);
        console.warn(`\nBatch attempt ${attempt} hit a rate limit on ${currentModel}. Waiting ${Math.round(waitMs / 1000)}s before retrying (per Gemini's own retry-after)...`);
        await sleep(waitMs);
      } else if (err.status === 503 || err.status === 500) {
        // Gemini gives no retry-after for overload/server errors, so back
        // off ourselves: 5s, 15s, 45s (capped), plus jitter so a batch that
        // fires right after another job's retry doesn't collide with it.
        const waitMs = Math.min(5000 * 3 ** (attempt - 1), 45000) + Math.random() * 2000;
        console.warn(`\nBatch attempt ${attempt} hit a ${err.status} (server overload) on ${currentModel}. Waiting ${Math.round(waitMs / 1000)}s before retrying...`);
        await sleep(waitMs);
      } else {
        console.warn(`\nBatch attempt ${attempt} failed (${err.message}). Retrying...`);
      }
      // On any retryable server-side error, alternate models for the next
      // attempt — a fresh capacity/quota pool beats re-hitting the same
      // overloaded or exhausted one. Never alternate onto a model we've
      // already seen 404.
      if (err.status === 429 || err.status === 503 || err.status === 500) {
        const other = currentModel === MODEL ? FALLBACK_MODEL : MODEL;
        if (!deadModels.has(other)) currentModel = other;
      }
    }
  }
}

// Validates a list of stories (per-batch or whole edition). Returns
// { hard, soft } — hard issues block publishing that batch, soft issues
// are logged but don't stop the stories from going live.
function validateStories(stories, startIndex = 0) {
  const hard = [];
  const soft = [];
  stories.forEach((story, i) => {
    const n = startIndex + i + 1;
    if (story === null || typeof story !== "object" || Array.isArray(story)) {
      hard.push(`Story ${n}: is not an object (got ${Array.isArray(story) ? "array" : typeof story}).`);
      return;
    }
    const label = `Story ${n} ("${asText(story.headline) || "no headline"}")`;
    for (const field of REQUIRED_STORY_FIELDS) {
      if (!(field in story)) {
        hard.push(`${label}: missing field "${field}"`);
      } else if (["keyNumbers", "knowledgeChain", "ifYoureWondering", "officialSources"].includes(field)) {
        if (!Array.isArray(story[field])) hard.push(`${label}: field "${field}" should be an array`);
      } else if (field === "readMinutes") {
        // number expected — tolerate numeric strings
      } else if (story[field] !== null && story[field] !== undefined && typeof story[field] !== "string" && typeof story[field] !== "number") {
        hard.push(`${label}: field "${field}" is ${typeof story[field]}, expected string (value: ${asText(story[field]).slice(0, 80)})`);
      }
    }
    for (const [field, floor] of Object.entries(WORD_FLOORS)) {
      if (story[field] && wordCount(story[field]) < floor) {
        soft.push(`${label}: "${field}" is ${wordCount(story[field])} words, below the ${floor}-word floor`);
      }
    }
    const deepDive = asText(story.deepDiveRead);
    if (deepDive) {
      const dd = wordCount(deepDive);
      if (dd < DEEP_DIVE_FLOOR) soft.push(`${label}: deepDiveRead is only ${dd} words (target is 500-800)`);
      const headers = ["What Changed", "The Backstory", "Why It Matters", "Broader Connections", "Alternative View"];
      for (const h of headers) {
        if (!deepDive.includes(h)) soft.push(`${label}: deepDiveRead is missing the "${h}" section`);
      }
      if (!deepDive.includes("- ")) soft.push(`${label}: deepDiveRead has no Fast Facts bullet list`);
      if (!deepDive.includes("**")) soft.push(`${label}: deepDiveRead has no bold (**) emphasis markers`);
      if (!/Then vs\.? now:|Compared to/i.test(deepDive)) soft.push(`${label}: deepDiveRead has no "Then vs. now:" comparison paragraph`);
    }
    if (/[a-z]\.\d+\s/.test(asText(story.whatHappened)) || /[a-z]\.\d+\s/.test(deepDive)) {
      soft.push(`${label}: possible leaked citation marker detected.`);
    }
    if (/\bstory\s*\d+\b/i.test(asText(story.headline))) {
      soft.push(`${label}: headline appears to contain a story number.`);
    }

    // Curiosity-engine + Time Machine + chart checks — ALL soft-only, so a
    // model hiccup on a new field never blocks the batch from going live.
    if (story.headline && wordCount(story.headline) > 11) {
      soft.push(`${label}: headline is ${wordCount(story.headline)} words (curiosity-engine max is 11).`);
    }
    if (!story.whatsappHeadline) soft.push(`${label}: missing whatsappHeadline (share cards will fall back to headline).`);
    if (!story.notificationHeadline) soft.push(`${label}: missing notificationHeadline.`);

    const TM_KEYS = ["yesterday", "lastMonth", "lastYear", "tenYearsAgo", "today", "future"];
    if (!story.timeMachine || typeof story.timeMachine !== "object" || Array.isArray(story.timeMachine)) {
      soft.push(`${label}: missing timeMachine (UI will hide the Time Machine block).`);
      delete story.timeMachine;
    } else {
      const missing = TM_KEYS.filter((k) => !asText(story.timeMachine[k]).trim());
      if (missing.length > 0) soft.push(`${label}: timeMachine missing/empty step(s): ${missing.join(", ")}.`);
      if (missing.length >= 4) {
        soft.push(`${label}: timeMachine too incomplete — dropping it for this story.`);
        delete story.timeMachine;
      }
    }

    // A malformed chart is worse than no chart — sanitize hard, drop on any doubt.
    if (story.chart !== undefined && story.chart !== null) {
      const c = story.chart;
      const ok =
        c && typeof c === "object" && !Array.isArray(c) &&
        typeof c.title === "string" && c.title.trim() &&
        Array.isArray(c.labels) && Array.isArray(c.values) &&
        c.labels.length >= 3 && c.labels.length <= 6 &&
        c.labels.length === c.values.length &&
        c.values.every((v) => typeof v === "number" && Number.isFinite(v));
      if (!ok) {
        soft.push(`${label}: chart present but malformed — dropped.`);
        delete story.chart;
      }
    } else {
      delete story.chart; // normalize explicit null away
    }

    // Quiz is soft-only: a story without a valid quiz still publishes (the
    // UI simply hides the quiz block), but we log it so quality is visible.
    if (!Array.isArray(story.quiz) || story.quiz.length < 3) {
      soft.push(`${label}: quiz missing or has fewer than 3 questions.`);
    } else {
      story.quiz = story.quiz.filter(
        (q) =>
          q && typeof q.question === "string" &&
          Array.isArray(q.options) && q.options.length === 4 &&
          Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex <= 3
      );
      if (story.quiz.length < 3) soft.push(`${label}: some quiz questions were malformed and dropped (${story.quiz.length} remain).`);
      if (story.quiz.length > 0 && story.quiz.every((q) => q.answerIndex === story.quiz[0].answerIndex)) {
        soft.push(`${label}: all quiz answers are in the same position (${story.quiz[0].answerIndex}).`);
      }
    }
  });
  return { hard, soft };
}

// Load today's existing edition if there is one, so a re-run RESUMES
// instead of regenerating stories it already has.
function loadExistingEdition() {
  try {
    if (!fs.existsSync(EDITION_PATH)) return null;
    const existing = JSON.parse(fs.readFileSync(EDITION_PATH, "utf8"));
    if (existing?.date === getTodayISO() && Array.isArray(existing.stories)) {
      return existing;
    }
  } catch {
    // Corrupt or unreadable file — treat as no edition and start fresh.
  }
  return null;
}

function writeAndPush(edition, batchLabel, isCI) {
  fs.writeFileSync(EDITION_PATH, JSON.stringify(edition, null, 2));
  console.log(`Written to ${EDITION_PATH} (${edition.stories.length}/${TOTAL_STORIES} stories).`);
  try {
    const cwd = path.join(__dirname, "..");
    execSync("git add data/edition.json data/photo-history.json data/glossary.json", { stdio: "inherit", cwd });
    execSync(`git commit -m "Daily edition ${edition.date}: ${batchLabel} (${edition.stories.length}/${TOTAL_STORIES} stories)"`, { stdio: "inherit", cwd });
    execSync("git push", { stdio: "inherit", cwd });
    console.log("Pushed — Netlify will redeploy with the stories so far.");
    return true;
  } catch (err) {
    console.error("Git commit/push failed — file is written locally; commit and push manually.");
    console.error(err.message);
    if (isCI) process.exit(1);
    return false;
  }
}

async function main() {
  if (!API_KEY) {
    console.error("Set GEMINI_API_KEY first:\n  GEMINI_API_KEY=\"...\" node scripts/generate-edition.js");
    process.exit(1);
  }

  const isCI = process.env.CI === "true";
  const today = getTodayISO();

  // --- Resume support -----------------------------------------------------
  let edition = loadExistingEdition();
  const seenHeadlines = [];

  // If the midnight date-roll script already bumped `date` to today while
  // carrying over yesterday's stories (edition.stale === true), those
  // stories don't count toward today's target — the FIRST successful batch
  // below replaces them outright rather than appending to them.
  let staleCarryover = !!(edition && edition.stale);

  if (edition && !staleCarryover) {
    edition.stories.forEach((s) => s.headline && seenHeadlines.push(s.headline));
    console.log(`Found existing edition for ${today} with ${edition.stories.length} stories — resuming.`);
  } else if (edition && staleCarryover) {
    console.log(`Edition for ${today} is carrying over ${edition.stories.length} stale stories from yesterday (date was rolled at midnight) — generating fresh ones now.`);
  } else {
    console.log(`Starting a fresh edition for ${today}.`);
  }

  // publishedCount tracks how many of TODAY's real stories exist — NOT
  // edition.stories.length, since that still holds yesterday's carried-over
  // count until the first fresh batch overwrites it.
  let publishedCount = staleCarryover ? 0 : (edition ? edition.stories.length : 0);
  const remaining = TOTAL_STORIES - publishedCount;
  if (remaining <= 0) {
    console.log(`Edition already has ${publishedCount}/${TOTAL_STORIES} stories — nothing to do.`);
    process.exit(0);
  }

  const numBatches = Math.ceil(remaining / BATCH_SIZE);
  console.log(`Generating ${remaining} more stories in ${numBatches} batch(es) of up to ${BATCH_SIZE}, publishing after EACH batch.`);

  // Confirm once up front (locally). Every clean batch after this pushes
  // automatically — no per-batch prompts.
  if (!isCI) {
    const proceed = await ask("\nEach successful batch will be committed and pushed immediately. Continue? (y/n): ");
    if (proceed.trim().toLowerCase() !== "y") {
      console.log("Aborted. Nothing changed.");
      process.exit(0);
    }
  }

  let publishedBatches = 0;
  let failedBatches = 0;
  const allSoftIssues = [];
  // GROUNDING_MODE: 'search' (google_search tool only), 'rss' (RSS headlines
  // only), or 'auto' (default): try search, fall back to RSS for the rest of
  // the run the first time a grounded call is quota-blocked.
  const GROUNDING_MODE = (process.env.GROUNDING_MODE || "auto").toLowerCase();
  let effectiveMode = GROUNDING_MODE === "rss" ? "rss" : "search";

  for (let b = 0; b < numBatches; b++) {
    const count = Math.min(BATCH_SIZE, TOTAL_STORIES - publishedCount);
    if (count <= 0) break;
    console.log(`\n=== Batch ${b + 1}/${numBatches}: requesting ${count} stories (${effectiveMode} mode) ===`);

    let batch;
    try {
      batch = await generateBatch(count, seenHeadlines, effectiveMode);
    } catch (err) {
      // First quota block on a grounded call in auto mode → switch this run
      // to RSS grounding and retry the SAME batch before giving up.
      if (
        effectiveMode === "search" &&
        GROUNDING_MODE === "auto" &&
        err.status === 429
      ) {
        console.warn("\nGrounded (google_search) request is quota-blocked. Falling back to RSS-grounded mode for the rest of this run — fresh headlines fetched directly from Google News, no grounding quota needed.");
        effectiveMode = "rss";
        try {
          batch = await generateBatch(count, seenHeadlines, "rss");
        } catch (err2) {
          failedBatches++;
          if (err2.status === 429) {
            console.error(`\nBatch ${b + 1} failed in BOTH modes: even ungrounded requests are quota-blocked.`);
            console.error("That means the API key's project has no usable free-tier quota at all right now — not just grounding.");
            console.error("Fixes: (1) create a fresh API key in a NEW Google AI Studio project (aistudio.google.com → Get API key) and update the GEMINI_API_KEY secret in the repo settings, or (2) enable billing on the current project.");
            break;
          }
          console.error(`Batch ${b + 1} failed in RSS mode too: ${err2.message}`);
          console.error("Moving on — stories published so far stay live. Re-run the script later to fill the rest.");
          continue;
        }
      } else {
        failedBatches++;
        if (err.status === 429 && /free_tier|RESOURCE_EXHAUSTED/i.test(err.body || err.message)) {
        console.error(`\nBatch ${b + 1} failed: Gemini's free-tier quota is exhausted for now.`);
        if (err.isGroundingQuota) {
          console.error("SPECIFICALLY: the Google Search GROUNDING quota tripped — this is a project-level quota shared across all models, which is why the model fallback couldn't route around it.");
          console.error("Options: (1) wait for the quota window to reset (daily quotas reset at midnight Pacific = 12:30 PM IST), or (2) enable billing on the project — Gemini 3.x grounding includes 5,000 free grounded prompts/month, ~30x this pipeline's usage.");
        }
        console.error("Stopping here instead of burning the rest of today's quota on batches that would also fail.");
        console.error("Stories published so far stay live. Wait for the quota to reset (per-minute limits reset within a minute; daily limits reset at midnight Pacific time), then re-run — it will resume from where it left off.");
        console.error("If this keeps happening, the free tier (15 req/min, 1,500 req/day for gemini-3.5-flash; 5,000 grounded prompts/month on Gemini 3.x) may be too low — consider enabling billing on the Gemini API project to move to a paid tier.");
        break; // stop the loop entirely — further batches will just fail the same way
        }
        console.error(`Batch ${b + 1} failed permanently: ${err.message}`);
        console.error("Moving on — stories published so far stay live. Re-run the script later to fill the rest.");
        continue;
      }
    }

    const batchStories = (Array.isArray(batch.stories) ? batch.stories : []).slice(0, count);
    if (batchStories.length === 0) {
      failedBatches++;
      console.error(`Batch ${b + 1} returned no stories — skipping.`);
      continue;
    }

    const { hard, soft } = validateStories(batchStories, publishedCount);
    soft.forEach((s) => allSoftIssues.push(s));
    if (hard.length > 0) {
      failedBatches++;
      console.error(`Batch ${b + 1} has ${hard.length} blocking issue(s) — NOT publishing this batch:`);
      hard.forEach((i) => console.error(`  - ${i}`));
      continue;
    }
    if (soft.length > 0) {
      console.warn(`Batch ${b + 1} has ${soft.length} minor issue(s) (publishing anyway):`);
      soft.forEach((i) => console.warn(`  - ${i}`));
    }

    // Stamp every fresh story with its generation time so the UI can show
    // publication dates and flag carryovers from a previous day. Carryover
    // stories keep their original stamp (this loop only touches new ones).
    const stampedAt = new Date().toISOString();
    batchStories.forEach((s) => {
      s.generatedAt = stampedAt;
    });

    // Fetch images for JUST this batch's stories.
    if (process.env.PEXELS_API_KEY) {
      for (const story of batchStories) {
        story.headlineImage = await fetchPexelsImage(story, process.env.PEXELS_API_KEY);
      }
    }

    batchStories.forEach((s) => s.headline && seenHeadlines.push(s.headline));

    if (!edition || staleCarryover) {
      // First fresh batch of the day — supplies top-level theme/number
      // fields and, if there was stale carryover, REPLACES it outright.
      edition = { ...batch, date: today, stories: batchStories };
      delete edition.stale;
      for (const f of REQUIRED_EDITION_FIELDS) {
        if (!(f in edition)) console.warn(`Warning: edition is missing top-level field "${f}".`);
      }
      staleCarryover = false;
    } else {
      edition.stories = [...edition.stories, ...batchStories];
    }
    publishedCount += batchStories.length;

    // Fold this batch's vocabulary into the cumulative glossary
    // (data/glossary.json) — the edition keeps today's 5 terms, the glossary
    // keeps everything ever taught, deduped case-insensitively by term.
    if (Array.isArray(batch.vocabulary) && batch.vocabulary.length) {
      const glossaryPath = path.join(__dirname, "..", "data", "glossary.json");
      let glossary = [];
      try { glossary = JSON.parse(fs.readFileSync(glossaryPath, "utf8")); } catch { /* first run */ }
      const known = new Set(glossary.map((g) => String(g.term).toLowerCase().trim()));
      let added = 0;
      for (const v of batch.vocabulary) {
        if (!v || !v.term || !v.definition) continue;
        const key = String(v.term).toLowerCase().trim();
        if (known.has(key)) continue;
        glossary.push({ term: String(v.term).trim(), definition: String(v.definition).trim(), dateAdded: today });
        known.add(key);
        added++;
      }
      if (added > 0) {
        fs.writeFileSync(glossaryPath, JSON.stringify(glossary, null, 1));
        console.log(`Glossary: +${added} new term(s), ${glossary.length} total.`);
      }
      // Keep the edition's own vocabulary field populated too (first batch wins).
      if (!Array.isArray(edition.vocabulary) || edition.vocabulary.length === 0) {
        edition.vocabulary = batch.vocabulary;
      }
    }

    console.log(`Batch ${b + 1} stories:`);
    batchStories.forEach((s) => console.log(`  - [${s.category || "?"}] ${s.headline || "(no headline)"}`));

    writeAndPush(edition, `batch ${b + 1}`, isCI);
    publishedBatches++;

    // Space out requests to stay under Gemini's free-tier per-minute cap
    // (5 requests/min) even when every batch succeeds on the first try.
    const isLastBatch = b === numBatches - 1 || publishedCount >= TOTAL_STORIES;
    if (!isLastBatch) {
      const spacingMs = parseInt(process.env.BATCH_SPACING_MS || "15000", 10);
      console.log(`Waiting ${Math.round(spacingMs / 1000)}s before the next batch (rate-limit spacing)...`);
      await sleep(spacingMs);
    }
  }

  // --- Summary -------------------------------------------------------------
  console.log("\n=== SUMMARY ===");
  console.log(`Stories live: ${publishedCount}/${TOTAL_STORIES}  |  batches published: ${publishedBatches}, failed: ${failedBatches}`);
  if (edition) {
    console.log(`Number of the day: ${edition.numberValue || "?"} — ${edition.themeTitle || "?"}`);
  }
  if (allSoftIssues.length > 0) {
    console.log(`${allSoftIssues.length} minor quality issue(s) were logged above — consider regenerate-story.js for specific stories.`);
  }
  if (publishedCount < TOTAL_STORIES) {
    console.log(`Edition is partial — re-run this script (or wait for the next scheduled run) to generate the remaining ${TOTAL_STORIES - publishedCount}; it will resume, not restart.`);
    // Only mark the CI run red when the day is BADLY short (<80% of target).
    // A 12/15 or 13/15 day is a healthy edition that the next scheduled run
    // will top up — flagging it as a failure was just alert noise. Everything
    // generated so far is ALREADY live either way.
    const healthyFloor = Math.ceil(TOTAL_STORIES * 0.8);
    if (isCI && publishedCount < healthyFloor) process.exit(1);
    if (isCI) {
      console.log(`(${publishedCount} >= ${healthyFloor} healthy floor — exiting green; next run tops up the rest.)`);
    }
  }
}

main().catch((err) => {
  console.error("\nScript failed:", err.message);
  if (err.cause) {
    console.error("Underlying cause:", err.cause.message || err.cause);
  }
  if (err.message === "fetch failed") {
    console.error("\nThis is a network-level failure — the request never reached Google's servers.");
    console.error("Try: (1) running again, (2) checking your internet connection,");
    console.error("(3) trying a different network if you're on a work/office connection,");
    console.error("(4) testing https://generativelanguage.googleapis.com directly in a browser.");
  }
  console.error("\nAny batches that already published are still live — re-running will resume from there.");
  process.exit(1);
});
