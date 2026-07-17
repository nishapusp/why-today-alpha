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
const { fetchStorySources, verifyStoryAgainstSources, enrichStoryWithSourceFigures, checkSourceRecency } = require("./verify-edition.js");

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
// Used when the primary model comes back 429/500/503. A different model
// name draws from a SEPARATE capacity/quota pool on Google's side, so
// switching is often more effective than waiting and re-hitting the same
// overloaded or quota-exhausted model.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite";
// 2026-07-17: SEPARATE model pair specifically for GROUNDED (google_search
// tool) calls — confirmed from the real usage dashboard that "Gemini 3"
// family (MODEL/FALLBACK_MODEL above) has a HARD 0/0 search-grounding
// quota on the free tier, not a temporary exhaustion. That's why the
// isGrounding check a bit further down in generateBatch was firing on
// essentially every run's first grounded call, falling back to RSS mode
// for the rest of the day, every day — RSS mode is deliberately thinner
// (no live verification, works from a headline+snippet alone), which is
// very likely why deep dives read as less detailed than expected. Same
// fix already proven working for regenerate-story.js: "Gemini 2.5" family
// has real, largely-unused grounding headroom (confirmed 37/1.5K used).
// Only the "search"-mode branch of generateBatch uses this pair — "rss"
// mode never touches the google_search tool at all, so it's unaffected
// by this and stays on the regular MODEL/FALLBACK_MODEL pair.
const GROUNDED_MODEL = process.env.GEMINI_GROUNDED_MODEL || "gemini-2.5-flash";
const GROUNDED_FALLBACK_MODEL = process.env.GEMINI_GROUNDED_FALLBACK_MODEL || "gemini-2.5-flash-lite";
const API_KEY = process.env.GEMINI_API_KEY;
const EDITION_PATH = path.join(__dirname, "..", "data", "edition.json");

// 9 stories total for now (was 15) — keeps each day comfortably inside the
// Gemini free-tier daily quota. Bump back up later via STORY_TARGET env var
// once billing is enabled, without needing a code change.
const TOTAL_STORIES = parseInt(process.env.STORY_TARGET || "9", 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "3", 10);
const DEDUP_LOOKBACK_DAYS = parseInt(process.env.DEDUP_LOOKBACK_DAYS || "3", 10);

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
  return `You produce part of a daily "edition" as JSON for readers who follow India's economy, markets, banking, and business — professionals, investors, and curious general readers. Coverage spans banking and policy, corporate news and quarterly results of major listed companies (including banks), market-moving developments, technology events that affect the economic landscape, IPOs and primary market listings, startup and fintech funding/developments, and AI and other emerging technology news with a business or economic angle. Goal: explain WHY, in plain language, not just headlines. Be CONCISE — every sentence must earn its place. No padding, no restating the same fact in different words.

## Voice — this is the difference between useful and boring
Write like a sharp friend explaining why something matters over chai, not like a press release or a policy memo. Open every field with the single most surprising or relevant fact — never a throat-clearing lead-in. Every keyNumbers value must be an actual figure (₹ amount, %, date, count) — never a vague phrase. Omit a keyNumbers entry entirely rather than inventing one without a real figure.

## Headlines — the Curiosity Engine (act as Chief Editor)
Your job is not to write headlines. Your job is to create irresistible curiosity while remaining completely truthful.
Rules for "headline": maximum 11 words; language a Class 8 student understands; must make the reader think "Wait… why?"; create surprise, curiosity, or a direct personal stake; NEVER clickbait — the story must fully deliver what the headline promises; no newspaper/bulletin language, no jargon (banned patterns: "X Continues Y", "Government Relaxes Z", "X Maintains Y Pace", "X Signals Y"). Before finalizing, score your headline on curiosity out of 10 — if it scores below 9, rewrite it until it does.
Also include per story:
- "whatsappHeadline": the version someone forwards to a group — max 9 words, punchier, may include exactly one emoji, still 100% truthful.
- "notificationHeadline": max 7 words, hook first — reads like a push notification you would actually tap.

## New category guidance
Use "IPO" only for primary-market news with a genuine fresh trigger (a new listing, subscription/GMP status, SEBI approval, DRHP filing) — not general market commentary. Use "Startups" for funding rounds, fintech product launches, or startup-specific policy/regulatory news — not large-cap corporate results (those stay "Corporate"). Use "AI" only when artificial intelligence or a comparable emerging technology (not routine IT/digital-policy news) is the actual subject with a business or economic angle — general technology-sector news that isn't AI-specific stays "Technology". These three are conditional, not mandatory, categories: include a story in one of them only when a real, fresh, well-sourced trigger exists — never force a weak story in just to fill the category. There is no "Markets" category — stock/index/trading-flow stories that don't fit IPO, Corporate, or Banking belong under "Economy". Use ONLY the exact category values listed in the schema above; any other value gets silently downgraded to "Economy" on the live site, which mislabels the story rather than erroring loudly.

QUARTERLY RESULTS STORIES — special handling (added 2026-07-16, per explicit editorial request — this readership includes bankers who read past the headline number):

When a story covers a bank's (or any listed company's) quarterly results, go beyond "profit rose X%":

1. Cover the full picture, not just profit: net interest income and margin, asset quality (gross/net NPA, provision coverage, credit cost, slippage), deposit and advances growth, CASA ratio, fee income, capital adequacy (CRAR/CET1), cost-to-income, ROA/ROE where available.
2. Name what was good and what was weak, explicitly and separately — never present a quarter as uniformly positive or negative. If a headline "non-interest income" or similar blended figure looks unremarkable, check whether it's actually blending a strong and a weak component (e.g. fee income up sharply while treasury income fell) — the blended number can hide the real, more useful story. Report the segment breakdown when you find one, not just the top-line blend.
3. Peer comparison — only when genuinely comparable, never forced: compare public-sector banks to OTHER public-sector banks, private to OTHER private banks, never across the two. Only compare figures for the SAME reporting period that the peer has ACTUALLY announced — a bank whose board hasn't approved this quarter's results yet has no comparable figure, full stop; do not substitute a prior quarter or an estimate. If no peer has announced full matching-period results yet, say so explicitly (e.g. "no other major PSU bank has reported full Q1 results yet; PNB reports July 18") rather than omitting the comparison silently — that absence is itself useful information. A comparison on one narrow metric (e.g. provisional advances/deposit growth, often released ahead of full results) is fine if clearly labeled as exactly that, not conflated with a full profit/asset-quality comparison.
4. Accuracy is non-negotiable for this story type specifically — every figure must trace to a source you can cite; if two sources give a different number for the same metric (common with prior-year comparison bases), do not silently pick one — flag the discrepancy or drop the specific figure rather than guess.
5. Structure: keyNumbers should include at minimum profit growth %, gross NPA, and one growth metric (advances or deposits) — what a banker-reader scans for first. When real, sourced peer comparison data exists (see point 3), use the optional "chart" field for a peer comparison (e.g. advances growth % across 3-4 banks) — omit chart entirely rather than force one with incomplete data. deepDiveRead should have a distinct "what was strong" and "what was weak" framing, and end with what to watch next quarter (a specific named metric or upcoming peer result, not a vague "investors will watch closely").

## Sourcing
Use Google Search to check 3-5 real, current sources per story, drawn from DIFFERENT categories: national financial press (Economic Times, Business Standard, Mint, Moneycontrol, Financial Express, Hindu BusinessLine, CNBC-TV18), official/regulatory (RBI, SEBI, NSE, BSE, PIB), and international (Reuters, Bloomberg) when relevant. Rotate outlets across stories. Cross-check figures against 2+ sources.

## Recency is mandatory, not a preference
Every one of the ${storyCount} stories must be about something that was reported or happened within the last 24-48 hours specifically — not a general/recurring topic dressed up as news. When searching, use date-qualified queries: include words like "today," "this week," the actual current date, or "latest" in your search terms rather than generic topic searches, which tend to surface older, more established articles instead of breaking ones.
Reject any story candidate that is really an evergreen or recurring theme (e.g. "RBI's ongoing approach to liquidity management" without a specific new trigger event) — if you can't find a genuinely fresh news hook for a topic, search again with different terms or pick a different story entirely. It is better to search harder than to include a stale story.
If it's very early in the day and today's news cycle hasn't produced ${storyCount} fresh stories yet, prioritize the most recent 24 hours available (including late the previous evening) rather than reaching back multiple days.

## Output rules (strict)
No citation markers, footnote numbers, brackets, or "(Source)" text inline anywhere — sources go ONLY in officialSources. No story position/number inside any text field. Every field = complete sentences. Explain every technical term in plain words the first time it's used. Write for someone with zero finance background. Watch for sentences where a transitive verb (supply, serve, cover, provide, reach, and similar) is missing its object — "Dams only supply a portion of agricultural land" reads as if dams themselves ARE the portion of land, not that they irrigate it; the fix is stating what's being supplied ("Dams only supply water to a portion of agricultural land") or rephrasing the verb entirely ("Dams only irrigate a portion of agricultural land"). Re-read every sentence you write and ask whether it could be misread this way before finalizing — this applies to ifYoureWondering answers as much as any other field, since they're often written faster and skipped in review.

## Length rules (both floors AND ceilings — do not exceed the ceilings)
summary: 2 sentences (30-40 words). quickRead: 100-150 words — a complete 1-minute read on its own. whatHappened, whyToday, whyCare: 120-160 words each, each including at least one concrete comparison. whatNext: 80-120 words with a timeframe if known. deepDiveRead: 500-800 words total across 5 headers: ## What Changed (80-140w), ## The Backstory (100-160w), ## Why It Matters (120-180w), ## Broader Connections (80-140w), ## Alternative View (80-120w). Staying UNDER the ceiling matters as much as staying over the floor — tight and specific beats long and padded.

## Deep Dive must feel immersive, not a wall of paragraphs
Open with a "Fast Facts" bullet list (3-4 lines starting with "- ", each a concrete number). In "## The Backstory" specifically, the LAST paragraph of that section must start with the exact words "Then vs. now:" or "Compared to [X]:" — a required, specifically-placed paragraph, not an optional flourish anywhere in the piece. Use **bold** around the single most important number per section. Vary sentence rhythm — mix short punchy sentences with longer ones. In Alternative View, frame it as a real disagreement ("Not everyone reads this the same way.").

2026-07-17: "## Broader Connections" specifically must include at least one NAMED historical precedent directly relevant to this story — a real past event, decision, or pattern with its year, what happened, and its outcome (e.g. "This echoes 2018's IL&FS crisis, when a shadow-lender default triggered a liquidity freeze across NBFCs — RBI's response then was X, and the read-through for today is Y"). Research this via Google Search the same way timeMachine steps are researched — never invent a precedent or its outcome. A story that's genuinely without a strong precedent can instead draw the connection to a broader ongoing pattern or trend (still specific, still dated), but exhaust the search for a real analogous event first. This is what separates a deep dive from a same-day summary — the reader should come away understanding not just what happened, but where it sits in a longer arc.

## knowledgeChain
3-6 word labels, each explained in "Broader Connections".

## Before returning output, verify — do not skip this step
Re-read every prose field and confirm: no stray numbers/citations inline; no story-position numbers in text; every jargon term explained on first use; no transitive verb (supply, serve, cover, provide, reach, and similar) left without its object — reread ifYoureWondering answers specifically for this, they're the most common place it slips through; every headline is 11 words or fewer AND would score 9/10 on curiosity; every story has today, future, and 3-6 real pastEvents in timeMachine, each with a genuine researched detail (not a padded/invented one just to hit a count); every chart (if present) has real sourced values in matching label/value counts — delete any chart you are not certain about; whatHappened/whyToday/whyCare are each 120-160 words (a one-sentence field is an automatic failure, and so is a 250-word one); readMinutes matches the actual word count; EVERY story is genuinely from the last 24-48 hours, not an evergreen/recurring topic — if any story fails this recency check, replace it with a fresher one before finalizing. Be especially wary of named government/defence operations, exercises, or routine institutional actions (e.g. a periodic RBI liquidity operation, a recurring named military exercise) — these get real news coverage every time they recur, which makes them LOOK fresh even when the underlying activity is routine; only include one if THIS specific occurrence has a genuinely new, non-routine angle. Avoid selecting a story whose only real source is News on AIR or a bare PIB release with no independent corroborating outlet — government wire content is frequently republished/rebroadcast well after the original event, so it reads as fresh when it may not be. If a genuinely major story only has AIR/PIB coverage so far, find independent confirmation (a wire pickup, a financial publisher's coverage) before including it, or skip it in favor of a story with clearer sourcing. For deepDiveRead specifically, verify all of these are literally present in the text, not just planned: 500-800 words total; all 5 "## " headers; a "- " bullet list (3-4 lines) placed right after the first header; at least one "**...**" bold marker in at least 3 sections; the LAST paragraph of "## The Backstory" starting with "Then vs. now:" or "Compared to"; "## Broader Connections" names a specific real historical precedent with its year and outcome, not just a general "this connects to X" statement. If any single one of these is missing, add it before finalizing — this is not optional formatting. A field that says only one vague sentence (e.g. "Updated data highlighted the scale of the increase.") is not acceptable output under any circumstance — it must be rewritten with real, specific figures.

## timeMachine (per story, required) — the signature feature
"timeMachine" places today's news in time so a reader sees the full arc, not just today's blip. Two anchor fields plus a flexible list of real past events:
- "today": what changed today, in one crisp line.
- "future": the single most likely next development, with a timeframe if known.
- "pastEvents": an array of 3-6 objects {"period", "headline", "detail"} — the events from roughly the last decade that ACTUALLY, MATERIALLY shaped this specific story's thread. "period" is a real date/year label ("2018", "March 2024", "Last week") — NOT a fixed slot like "1 month ago"/"1 year ago"/"10 years ago". Do not force one event per artificial interval — real history clusters where things actually happened: if the genuinely important events were 2019, 2021, and three weeks ago, use exactly those three: do not pad in a weak "1 year ago" event just to fill a slot nothing significant happened in. "headline" is a few words. "detail" is the researched substance — a real figure, a named event, an outcome, written as 1-3 sentences (not a one-liner) — this is where genuine depth belongs, more room than the old format had.
Order pastEvents chronologically, oldest first, so reading top to bottom feels like time travel toward today.
RESEARCHED, NOT RECALLED: run dedicated date-qualified searches for each event's real figures (e.g. "repo rate June 2026", "forex reserves July 2025", "[company] 2018"). Each event must carry at least one concrete dated figure or outcome — "the rate was 6.5% in July 2025" is a pastEvents entry; "rates were higher back then" is not. This researched specificity is the entire value of the feature. If you cannot verify enough genuinely significant events even after searching, 3 strong ones beat 6 padded ones — never invent a event or its figures to hit a count.

## chart (per story, OPTIONAL — include only when genuinely numeric)
2026-07-17: actively LOOK for a chartable series rather than only reaching for one when it's the obvious center of the story — most financial/corporate/policy stories have SOME real numeric trend nearby even when it's not the headline itself (a company's stock/profit over recent quarters, a sector's growth rate across years, a policy rate's recent path, an IPO's subscription across investor categories). Search for one before deciding a story has no chart to offer. That said, the anti-fabrication rule below is absolute and unchanged by this: include "chart": {"title", "unit" (e.g. "%", "₹ lakh crore" — optional), "labels" (3-6 short strings like "FY22" or "Jan"), "values" (same count of plain numbers, no commas/symbols), "takeaway" (one sentence: what the chart proves)} only when you have 3+ REAL, sourced, comparable numbers in consistent units and chronological order. If you do not, OMIT "chart" entirely — a story without a chart is fine; a fabricated chart is a failure, full stop.

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
   "slug","category" (Banking|Economy|Technology|World|Policy|Corporate|IPO|Startups|AI),
   "summary","quickRead","whatHappened","whyToday","whyCare","whatNext","deepDiveRead",
   "timeMachine":{"today","future","pastEvents":[{"period","headline","detail"}]},
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

// Cross-day dedup — the same-edition exclusion list (seenHeadlines) only
// ever covered TODAY's stories, so nothing stopped an event that ran
// yesterday (or two days ago) from being written up again, even verbatim
// (confirmed 2026-07-15: the Hormuz-blockade headline ran identically on
// both 07-14 and 07-15). This pulls headlines from the last N days of
// data/archive/ so the prompt can tell the model what's already been
// covered recently — separate from the same-edition list because the rule
// here is softer: a genuine follow-up development (an IPO opening, then
// later listing) is fine, a same-day-style pure reword is not. Missing
// archive files (e.g. a day the pipeline didn't run) are skipped silently.
function loadRecentArchiveHeadlines(todayISO, days) {
  const out = [];
  const archiveDir = path.join(__dirname, "..", "data", "archive");
  const today = new Date(`${todayISO}T00:00:00`);
  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const file = path.join(archiveDir, `${dateStr}.json`);
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      (parsed.stories || []).forEach((s) => s.headline && out.push({ headline: s.headline, date: dateStr }));
    } catch {
      // Corrupt/partial archive file — skip rather than fail the whole run.
    }
  }
  return out;
}

function buildUserPrompt(storyCount, excludeHeadlines, recentDaysHeadlines) {
  const exclusionNote = excludeHeadlines?.length
    ? ` Do NOT repeat or overlap with these already-covered stories from the same edition: ${excludeHeadlines.map((h) => `"${h}"`).join(", ")}. Find ${storyCount} completely different fresh stories.`
    : "";
  const recentDaysNote = recentDaysHeadlines?.length
    ? ` These stories were already published in the last ${DEDUP_LOOKBACK_DAYS} days — do NOT cover the same underlying event again, even reworded, UNLESS there is a genuinely substantial new development (a materially different milestone, decision, outcome, or figure — not just a restated angle). If you do run a legitimate follow-up, its headline and summary must lead with what's NEW, not restate the earlier story: ${recentDaysHeadlines.map((h) => `"${h.headline}" (${h.date})`).join(", ")}.`
    : "";
  // Set by poll-rss.js when it dispatches a run specifically because a
  // World/geopolitics story matured and today's edition is short on that
  // category — see MIN_WORLD_STORIES there. Does not change length floors,
  // depth requirements, or anything else about story quality; it only
  // nudges which stories get picked for THIS batch.
  const focusCategory = (process.env.FOCUS_CATEGORY || "").trim();
  const focusNote = focusCategory
    ? ` PRIORITY FOR THIS BATCH: today's edition is short on the "${focusCategory}" category — of the ${storyCount} stories in this batch, favor genuine ${focusCategory === "World" ? "geopolitics/world-affairs stories with a clear India angle (trade, markets, security, diaspora impact)" : focusCategory} stories wherever a real fresh trigger exists, without forcing a weak or stale story into that category just to fill it.`
    : "";
  return `Today's actual date is ${getTodayISO()}. Generate ${storyCount} stories for today's Why Today edition dated ${getTodayISO()}, covering important Indian financial, banking, corporate, markets, policy, IPO/primary-market, startup/fintech, AI, and economy-relevant technology NEWS FROM TODAY AND YESTERDAY SPECIFICALLY — including results and major announcements of large listed companies (banks included) and technology developments affecting the economic landscape (${getTodayISO()} and the day before) — not general background topics. Search using date-qualified terms (include "${getTodayISO()}", "today", "latest") rather than generic topic searches, which tend to surface older established articles. Every story must have a genuine fresh news trigger from the last 24-48 hours — reject anything that's really an evergreen/recurring theme.${exclusionNote}${recentDaysNote}${focusNote} Follow every rule in your instructions exactly, especially the length floors AND ceilings, the recency requirement, the "Before returning output, verify" checklist, and the Deep Dive formatting. Also include the top-level edition fields (date, themeTitle, themeDescription, numberValue, numberLabel, numberTrend) summarizing the overall theme across these stories.`;
}

// ---------------------------------------------------------------------------
// RSS fallback grounding.
// When Google Search grounding is quota-blocked (the 3.x free tier gates it,
// unlike 2.5), we fetch real fresh headlines ourselves from Google News RSS
// and hand them to the model as context — same recency guarantee, zero
// grounding quota. Mode is controlled by GROUNDING_MODE=auto|search|rss.
// ---------------------------------------------------------------------------

const RSS_QUERIES = [
  '(RBI OR "monetary policy" OR "reserve bank") when:2d',
  "(India banking OR NPA OR lending) when:2d",
  "(India economy OR inflation OR GDP OR fiscal) when:2d",
  '(India "quarterly results" OR earnings OR listed) when:2d',
  "(India Sensex OR Nifty OR SEBI OR IPO) when:2d",
  "(India fintech OR UPI OR semiconductor OR technology policy) when:2d",
  '(India IPO OR "public issue" OR DRHP OR "stock market debut") when:2d',
  '(India startup OR fintech OR "funding round" OR unicorn) when:2d',
  '(India "artificial intelligence" OR AI OR "machine learning" OR chatbot) when:2d',
];

// Direct publisher RSS feeds, fetched alongside the Google News queries
// above. Google News re-crawls and re-indexes these same publishers, so it
// lags the source by anywhere from a few minutes to a couple hours; going
// straight to the publisher closes that gap for genuinely breaking stories.
// Each entry's `source` is used as a label since these feeds (unlike
// Google News RSS) don't carry a <source> tag of their own.
// URLs sourced 2026-07-13 (BBC/LiveMint/ET/Business Standard) and
// 2026-07-15 (Moneycontrol/Financial Express/Hindu BusinessLine/NDTV
// Business/Zee Business, added to widen source diversity) — everything
// past the original 8 came from a maintained curated RSS directory
// (plenaryapp/awesome-rss-feeds), not independently fetch-tested against
// live traffic. pullFeed() already logs+skips a feed that 404s or errors
// rather than failing the run, so a stale URL here degrades gracefully —
// but worth checking the Action's logs after the first run to confirm all
// 13 are actually returning items, not silently skipping.
const DIRECT_FEEDS = [
  { source: "Business Standard", url: "https://www.business-standard.com/rss/economy-102.rss" },
  { source: "Business Standard", url: "https://www.business-standard.com/rss/finance-103.rss" },
  { source: "Business Standard", url: "https://www.business-standard.com/rss/markets-106.rss" },
  { source: "Business Standard", url: "https://www.business-standard.com/rss/external-affairs-defence-security-227.rss" },
  { source: "Business Standard", url: "https://www.business-standard.com/rss/world-news-221.rss" },
  { source: "LiveMint", url: "https://www.livemint.com/rss/news" },
  { source: "Economic Times", url: "https://economictimes.indiatimes.com/rssfeedsdefault.cms" },
  { source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "Moneycontrol", url: "http://www.moneycontrol.com/rss/latestnews.xml" },
  { source: "Financial Express", url: "https://www.financialexpress.com/feed/" },
  { source: "Hindu BusinessLine", url: "https://www.thehindubusinessline.com/feeder/default.rss" },
  { source: "NDTV Business", url: "https://feeds.feedburner.com/NDTV-Business?format=xml" },
  { source: "Zee Business", url: "http://zeenews.india.com/rss/business.xml" },
];

// Fuzzy headline matching — two headlines describe the same underlying event
// when they share most of their significant words. Exact-string exclusion is
// useless against models that reword ("Keeps Interest Rates Steady" vs
// "Keeps Rates Steady"), which is exactly how batch 4 duplicated batch 2.
const STOPWORDS = new Set("the a an of in on to for with and or as at by from into over after amid amidst its their this that is are was were will be has have new says said".split(" "));
// Words so common across finance headlines that they dilute the overlap
// ratio without helping distinguish one event from another — "RBI" and
// "India" appear in a third of any day's headlines, so two UNRELATED
// stories sharing them looked more similar than two stories about the
// SAME event phrased in different styles ("Why did inflation break its
// streak?" vs "Inflation Hits 4.38%, Breaching RBI Target" — confirmed
// via today's real duplicates, which shared almost no tokens once the
// house-style "Why..." headline was compared to a wire-style rewrite of
// the identical release).
const GENERIC_FINANCE = new Set([
  "india", "indian", "rbi", "bank", "banks", "banking", "market", "markets",
  "government", "why", "sudden", "suddenly", "did", "just", "new", "major",
  "massive", "amid", "amidst",
]);
function significantTokens(headline) {
  return new Set(
    (headline || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !GENERIC_FINANCE.has(w))
      // Crude stemming so "banks/bank", "signalling/signal", "launched/launch"
      // count as the same token — batch runs kept slipping dupes past exact
      // token matching purely on inflection.
      .map((w) => w.replace(/(ing|ed|es|s)$/, ""))
      .filter((w) => w.length > 2 && !GENERIC_FINANCE.has(w))
  );
}
function isSameEvent(headlineA, headlineB) {
  const a = significantTokens(headlineA);
  const b = significantTokens(headlineB);
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  const overlap = shared / Math.min(a.size, b.size);
  // Lowered from 0.5 — tested against 2026-07-14's real duplicate cluster
  // (inflation story published 3x, Hormuz story published 2x under
  // different headlines) plus known-different headline pairs from the
  // same edition: 0.35 catches more real duplicates with zero false
  // positives in that test set. NOT a complete fix — keyword overlap has
  // a real ceiling for headlines this differently styled (house "Why..."
  // framing vs a wire-style rewrite can share almost no words even when
  // reporting the identical release). See the batch-merge TODO below for
  // the actual fix this points toward: an LLM-judged semantic pass.
  return overlap >= 0.35;
}

function decodeXml(s) {
  return (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    // Numeric character references (e.g. &#8377; or &#x20B9; for ₹) —
    // the named-entity replacements above don't cover these, and some
    // feeds use them instead of raw UTF-8 bytes for non-ASCII characters.
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
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
  const cutoff = Date.now() - 24 * 3600 * 1000;

  // One shared parser for both the Google News search feeds and the direct
  // publisher feeds below — both are standard RSS 2.0 <item> blocks.
  async function pullFeed(url, fallbackSource) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Force UTF-8 decoding from raw bytes rather than res.text(), which
      // trusts the response's Content-Type charset — some of these feeds
      // (confirmed: at least one direct publisher feed, not just Google
      // News) declare or imply a non-UTF-8 charset while actually serving
      // UTF-8 bytes, which res.text() then mis-decodes as Latin-1 (the
      // classic "₹" -> "â‚¹" mojibake pattern). Nearly all RSS in the wild
      // is genuinely UTF-8 today regardless of what a stale Content-Type
      // header claims, so forcing it here is the robust fix.
      const xml = Buffer.from(await res.arrayBuffer()).toString("utf8");
      let count = 0;
      for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        if (count >= 8) break;
        const block = m[1];
        const title = pickTag(block, "title");
        if (!title) continue;
        // Explainers, opinion pieces, and recaps are articles ABOUT events
        // (often old ones), not events — the EUV-lithography evergreen and
        // year-old deal stories all entered through this door.
        if (/\b(explained|explainer|opinion|analysis|editorial|recap|wrap-?up|week in review|what to know|all you need|top \d+|listicle|throwback|history of)\b/i.test(title)) continue;
        const key = title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
        if (seen.has(key)) continue;
        // Freshness is the entire point — an item with no parseable date is
        // not trustworthy enough to ground a "today's news" story on.
        const pub = Date.parse(pickTag(block, "pubDate") || "");
        if (Number.isNaN(pub) || pub < cutoff) continue;
        seen.add(key);
        count++;
        items.push({
          title,
          link: pickTag(block, "link"),
          source: pickTag(block, "source") || fallbackSource,
          pubDate: pickTag(block, "pubDate"),
          pubMs: pub,
          snippet: pickTag(block, "description").slice(0, 220),
        });
      }
    } catch (e) {
      console.warn(`RSS feed failed for ${fallbackSource} (${url}): ${e.message} — continuing with other feeds.`);
    }
  }

  for (const q of RSS_QUERIES) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
    await pullFeed(url, "Google News");
  }
  for (const { source, url } of DIRECT_FEEDS) {
    await pullFeed(url, source);
  }

  items.sort((a, b) => b.pubMs - a.pubMs);

  // Cross-outlet dedup: the `seen` set above only catches EXACT title
  // matches within a single feed's own pull, so the same wire story
  // (PTI/Reuters syndication, or just several outlets covering the same
  // release) still shows up once per outlet that ran it — bloating the
  // seed list with redundant coverage of one event rather than a diverse
  // set of distinct events. Reuses the same fuzzy matcher that already
  // catches same-event duplicates at the story level. Keeps the newest
  // (items are pre-sorted newest-first) and drops the rest; a dropped
  // item's source is folded into the kept item's `sources` list so the
  // model can still see it was multi-outlet corroborated, which is a
  // genuine signal of authenticity.
  const deduped = [];
  for (const item of items) {
    const dupOf = deduped.find((d) => isSameEvent(item.title, d.title));
    if (dupOf) {
      dupOf.sources = dupOf.sources || [dupOf.source];
      if (!dupOf.sources.includes(item.source)) dupOf.sources.push(item.source);
      continue;
    }
    deduped.push(item);
  }
  if (deduped.length < items.length) {
    console.log(`RSS cross-outlet dedup: ${items.length} raw items -> ${deduped.length} distinct events.`);
  }

  if (deduped.length < 6) {
    throw new Error(`RSS fallback could only fetch ${deduped.length} fresh headlines — not enough to ground an edition safely.`);
  }
  console.log(`RSS fallback: fetched ${deduped.length} distinct fresh headlines from ${RSS_QUERIES.length} Google News queries + ${DIRECT_FEEDS.length} direct publisher feeds.`);
  rssCache = deduped;
  return deduped;
}

function buildRssAddendum(items) {
  const list = items
    .map((it, i) => `${i + 1}. [${it.source || "News"}${it.sources && it.sources.length > 1 ? ` + ${it.sources.length - 1} more outlet(s)` : ""} | ${it.pubDate || "recent"}] ${it.title}${it.snippet ? ` — ${it.snippet}` : ""}${it.link ? ` (link: ${it.link})` : ""}`)
    .join("\n");
  return `\n\nIMPORTANT OVERRIDE — NO LIVE SEARCH THIS RUN: You do NOT have a web search tool in this run, so ignore every instruction above about searching. Instead, the REAL fresh headlines below were fetched minutes ago from Google News RSS (last 24 hours). Pick your stories ONLY from developments covered in this list, choosing the most significant ones. CRITICAL DE-DUPLICATION RULE: the exclusion list in the instructions above describes underlying news EVENTS that are already covered — you must NOT cover the same event again even with completely different wording, a different angle, or different emphasis. If a headline below matches an excluded event, skip that headline entirely and pick a different one. Each of your ${"stories"} must be about a DIFFERENT underlying event. TOPIC DIVERSITY RULE: at most ONE story per company, project, institution-action, or theme across the WHOLE edition — if the exclusion list already covers a semiconductor plant, a specific bank's deal, or a data release, do not write another story about that same plant, deal, or release even from a different angle or with different vocabulary. FRESH DEVELOPMENT RULE: a headline qualifies only if it reports a NEW development (announcement, inauguration, data release, deal milestone, decision) — skip explainers, opinion pieces, retrospectives, and background features about older events, no matter how interesting. DATE HONESTY RULE: anchor each story to its item's bracketed date — never write "today" or "announced today" unless that item's date IS today; otherwise name the actual day (e.g. "on Thursday"). Combine each headline with your background knowledge to explain WHY it matters, but do NOT invent precise figures that appear in neither the headline/snippet nor well-established public knowledge — describe qualitatively instead. COMPLETENESS RULE: the absence of live search does NOT reduce the required depth. Every story must include EVERY schema field — especially deepDiveRead (a full 500-800 words with ** bold emphasis markers) and keyNumbers — and must meet every length floor in the instructions above. Where the headline/snippet is thin, draw on your background knowledge of the institutions, mechanisms, history, and stakeholders involved to write full-length sections; explaining WHY never requires live data. Before returning, verify each story against the field list and length floors, and expand any section that falls short. QUIZ RULE: vary the position of the correct quiz answer across questions — do not put every correct answer in position 1. For each story's sources, use the matching link(s) from the list.\n\nFRESH HEADLINES (newest first):\n${list}`;
}

// RSS-SEEDED search mode: unlike buildRssAddendum() above (which removes
// the search tool entirely for the no-quota fallback path), this runs
// WITH google_search still attached. The RSS list becomes the primary
// candidate pool — feeding in real headlines from many established
// sources up front, rather than leaving topic selection entirely to the
// model's own open-ended search — while search is still used to verify
// and flesh out each one from authentic full-length coverage instead of
// writing off a thin snippet. The model can still go beyond this list
// when a headline lacks depth or something bigger and more urgent has
// broken since the feeds were fetched.
function buildRssSeedAddendum(items) {
  const list = items
    .map((it, i) => `${i + 1}. [${it.source || "News"}${it.sources && it.sources.length > 1 ? ` + ${it.sources.length - 1} more outlet(s)` : ""} | ${it.pubDate || "recent"}] ${it.title}${it.snippet ? ` — ${it.snippet}` : ""}`)
    .join("\n");
  return `\n\nRSS SEED LIST — you DO have live web search available for this run; use it. The headlines below were fetched minutes ago from Google News and direct publisher RSS feeds (last 24 hours, many established Indian and international outlets) and should be your PRIMARY candidate pool for what to cover. For each one you select, use google_search to find the full story and verify every specific figure, date, and claim against AUTHENTIC, ESTABLISHED sources — major wire services (Reuters, PTI), major Indian financial publishers (Business Standard, LiveMint, Economic Times, Moneycontrol, Financial Express, Hindu BusinessLine), or official/regulator sources corroborated by at least one independent outlet (RBI/SEBI/PIB releases repeated only in a single blog or an uncorroborated wire pickup are NOT sufficient). Do not rely on the headline/snippet alone — search and confirm. You are not restricted to this list: if a headline here doesn't have enough real depth to support a full story, or a bigger and more urgent development has broken since these feeds were fetched, search beyond it — but exhaust this list's genuinely strong candidates first rather than defaulting to an open search. Apply the same de-duplication, topic-diversity, fresh-development, and date-honesty rules from the instructions above to whichever headlines — listed or found via further search — you end up choosing.\n\nRSS SEED HEADLINES (newest first):\n${list}`;
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
  if (start === -1) return cleaned;
  // Balanced-brace scan from the first "{" instead of a naive
  // lastIndexOf("}") — the naive version is fooled by any stray "}" in
  // content that trails the real JSON (e.g. leftover thought-summary text
  // concatenated in from the API response — see the thought-part filter
  // below), which is exactly what caused "Unexpected non-whitespace
  // character after JSON" on 2026-07-15's rerun despite the response
  // otherwise containing perfectly valid JSON.
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
  // Unbalanced — likely genuinely truncated. Fall back to the old
  // last-brace behavior so existing truncation error messages still fire
  // downstream rather than silently returning something unparseable.
  const end = cleaned.lastIndexOf("}");
  return end > start ? cleaned.slice(start, end + 1) : cleaned;
}

const CATEGORY_SEARCH_TERMS = {
  Banking: "bank building finance india",
  Economy: "stock market trading india",
  Technology: "technology digital india startup",
  World: "world map global trade",
  Policy: "indian parliament government",
  Corporate: "business office india corporate",
  IPO: "stock exchange listing bell india",
  Startups: "startup office team india fintech",
  AI: "artificial intelligence technology digital",
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

// Words that are common, meaningful vocabulary IN a financial headline but
// read as unrelated literal imagery to a naive keyword-based image search —
// confirmed by real mismatches: "death toll ... fire" pulled a literal
// toll-road sign image, "Baker Hughes" (a company name) pulled a literal
// baker kneading dough. headlineToQuery skips these rather than picking
// them, falling through to the next eligible word (or the category
// fallback if too few good words remain) instead of risking a picture
// that's technically keyword-matched but obviously wrong to a reader.
const PEXELS_LITERAL_RISK_WORDS = new Set([
  "toll","drag","wave","crash","blast","strike","dead","death","fire","bull",
  "bear","war","live","today","morning","evening","night","gains","losses",
  "retreat","rally","strips","baker","bridge","bomb","attack","kill","killed",
  "flood","storm","quake","collapse","explosion","hostage","shooting",
]);

function headlineToQuery(story) {
  const words = String(story.headline || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !PEXELS_STOPWORDS.has(w) && !PEXELS_LITERAL_RISK_WORDS.has(w));
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
    // 1. A pre-computed query takes priority when supplied (e.g. Quick
    //    Reads' enrichWithSummaries asks the model for a query it already
    //    knows avoids literal-but-misleading terms) — falls through to
    //    headline-keyword-extraction, then the category default, exactly
    //    as before when no override is given.
    const queries = [story.imageQueryOverride, headlineToQuery(story), CATEGORY_SEARCH_TERMS[story.category] || "business finance india"]
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

async function generateBatch(storyCount, excludeHeadlines, recentDaysHeadlines, mode = "search", maxRetries = 3) {
  let attempt = 0;
  // 2026-07-17: mode-dependent pair — "search" mode makes a GROUNDED call
  // (google_search tool attached below), which needs GROUNDED_MODEL/
  // GROUNDED_FALLBACK_MODEL (Gemini 2.5 family, real grounding quota).
  // "rss" mode never attaches that tool at all, so it stays on the
  // regular MODEL/FALLBACK_MODEL pair — no reason to move it off a model
  // that's working fine for ungrounded calls. mode is fixed for the
  // duration of one generateBatch call (the caller decides it before
  // invoking), so picking the pair once here is safe.
  const [primaryModel, secondaryModel] = mode === "search"
    ? [GROUNDED_MODEL, GROUNDED_FALLBACK_MODEL]
    : [MODEL, FALLBACK_MODEL];
  let currentModel = primaryModel;
  const deadModels = new Set(); // models Google has retired (404) this run

  // Scales with batch size instead of a fixed value — the fixed 20000 was
  // sized for BATCH_SIZE=3 (~6500 tokens/story incl. deepDive, timeMachine,
  // quiz, keyNumbers, JSON overhead) and never got scaled up when BATCH_SIZE
  // was raised to 8, which is exactly what caused "Response was cut off
  // even at 8 stories" on 2026-07-15 (8 * 6500 = 52000, nearly 3x the old
  // fixed cap). gemini-3.5-flash's documented ceiling is 65,536 output
  // tokens, so this stays comfortably under that even for larger batches.
  const maxOutputTokens = Math.min(65536, storyCount * 6500 + 2000);
  // Scales with the same reasoning — a truncated 8-story generation still
  // took ~2m26s per the 2026-07-15 log (before it got cut off), so an
  // untruncated one needs real headroom. 45s/story + 60s base, capped at
  // 6 minutes.
  const requestTimeoutMs = Math.min(360000, storyCount * 45000 + 60000);

  let userPrompt = buildUserPrompt(storyCount, excludeHeadlines, recentDaysHeadlines);
  if (mode === "rss") {
    userPrompt += buildRssAddendum(await fetchRssHeadlines());
  } else if (mode === "search") {
    // Seed the model's own live search with real headlines from the 11
    // RSS sources first, rather than leaving topic discovery entirely
    // open-ended — see buildRssSeedAddendum(). Fails open: if RSS fetch
    // itself has a problem (all feeds down, network issue), the batch
    // still proceeds as a plain open search rather than failing outright
    // over what's meant to be a quality improvement, not a hard dependency.
    try {
      userPrompt += buildRssSeedAddendum(await fetchRssHeadlines());
    } catch (e) {
      console.warn(`RSS seeding unavailable for this batch (${e.message}) — proceeding with open search, no seed list.`);
    }
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
            maxOutputTokens,
            ...(mode === "rss" ? { responseMimeType: "application/json" } : {}),
          },
        }),
        signal: AbortSignal.timeout(requestTimeoutMs),
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

      // Gemini 3.x models think by default and can include a "thought":
      // true summary part alongside the real answer part — naively
      // concatenating ALL parts' .text mixes thought-summary prose into
      // what's supposed to be pure JSON, which is what actually caused
      // 2026-07-15's "Unexpected non-whitespace character after JSON"
      // failure (confirmed against Gemini's documented response shape:
      // thought parts carry "thought": true). Filter them out here.
      const text = candidate.content?.parts?.filter((p) => !p.thought).map((p) => p.text || "").join("") ?? "";

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
        const other = currentModel === primaryModel ? secondaryModel : primaryModel;
        if (deadModels.has(other)) {
          throw new Error(
            `Both ${primaryModel} and ${secondaryModel} return 404 — Google has retired them. ` +
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
        const other = currentModel === primaryModel ? secondaryModel : primaryModel;
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

    // 2026-07-17: validates the new flexible pastEvents format —
    // today/future are still fixed anchor fields, but the old
    // yesterday/lastMonth/lastYear/tenYearsAgo checkpoints are gone from
    // what the prompt now asks for (still accepted if a model somehow
    // returns them, for safety, but not required or expected).
    if (!story.timeMachine || typeof story.timeMachine !== "object" || Array.isArray(story.timeMachine)) {
      soft.push(`${label}: missing timeMachine (UI will hide the Time Machine block).`);
      delete story.timeMachine;
    } else {
      const missingAnchors = ["today", "future"].filter((k) => !asText(story.timeMachine[k]).trim());
      const events = Array.isArray(story.timeMachine.pastEvents) ? story.timeMachine.pastEvents : [];
      const validEvents = events.filter(
        (e) => e && typeof e === "object" && asText(e.period).trim() && asText(e.headline).trim() && asText(e.detail).trim()
      );
      if (missingAnchors.length > 0) soft.push(`${label}: timeMachine missing anchor field(s): ${missingAnchors.join(", ")}.`);
      if (validEvents.length < 3) soft.push(`${label}: timeMachine has only ${validEvents.length} valid pastEvents (wanted 3-6).`);
      // Drop malformed entries rather than the whole block, same
      // fail-soft philosophy as the chart validation just below.
      if (validEvents.length !== events.length) story.timeMachine.pastEvents = validEvents;
      if (missingAnchors.length === 2 || (validEvents.length === 0 && !story.timeMachine.yesterday)) {
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

function writeAndCommit(edition, batchLabel, isCI) {
  fs.writeFileSync(EDITION_PATH, JSON.stringify(edition, null, 2));
  console.log(`Written to ${EDITION_PATH} (${edition.stories.length}/${TOTAL_STORIES} stories).`);
  const cwd = path.join(__dirname, "..");
  try {
    execSync("git add data/edition.json data/photo-history.json data/glossary.json", { stdio: "inherit", cwd });
    execSync(`git commit -m "Daily edition ${edition.date}: ${batchLabel} (${edition.stories.length}/${TOTAL_STORIES} stories)"`, { stdio: "inherit", cwd });
    return true;
  } catch (err) {
    console.error("Git commit failed — file is written locally; commit and push manually.");
    console.error(err.message);
    if (isCI) process.exit(1);
    return false;
  }
}

// Pushed ONCE per run (not once per batch — 2026-07-14 decision to cut
// Netlify deploy/credit spend, since each push triggers a full deploy: 15
// credits on Netlify's credit-based plans, up to 5x a run before this).
// Each batch above still commits locally as it completes, so mid-run
// resilience is unchanged — if a later batch fails, everything up to that
// point is already committed and this still pushes it. What changes is
// WHEN it reaches Netlify: once, after the run's last batch, not per batch.
function pushPending(cwd) {
  for (let tryNum = 1; tryNum <= 3; tryNum++) {
    try {
      execSync("git push", { stdio: "inherit", cwd });
      console.log("Pushed — Netlify will redeploy with all of this run's stories at once.");
      return true;
    } catch {
      console.warn(`git push rejected (attempt ${tryNum}/3) — rebasing on latest main and retrying...`);
      try {
        execSync("git pull --rebase -X theirs origin main", { stdio: "inherit", cwd });
      } catch (rebaseErr) {
        console.error(`Rebase failed: ${rebaseErr.message}`);
        try { execSync("git rebase --abort", { stdio: "inherit", cwd }); } catch { /* nothing to abort */ }
      }
    }
  }
  console.error("Git push failed after 3 rebase attempts — commits are staged locally; the next run's push (or a manual `git push`) will carry them.");
  return false;
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
  const recentHeadlines = loadRecentArchiveHeadlines(today, DEDUP_LOOKBACK_DAYS);
  if (recentHeadlines.length) {
    console.log(`Loaded ${recentHeadlines.length} headline(s) from the last ${DEDUP_LOOKBACK_DAYS} day(s) of archive for cross-day dedup.`);
  }

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
  console.log(`Generating ${remaining} more stories in ${numBatches} batch(es) of up to ${BATCH_SIZE}, committing after each batch and pushing once at the end.`);

  // Confirm once up front (locally). Every clean batch after this pushes
  // automatically — no per-batch prompts.
  if (!isCI) {
    const proceed = await ask("\nEach successful batch will be committed locally; everything pushes together once the run finishes. Continue? (y/n): ");
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
      batch = await generateBatch(count, seenHeadlines, recentHeadlines, effectiveMode);
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
          batch = await generateBatch(count, seenHeadlines, recentHeadlines, "rss");
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

    const rawBatchStories = (Array.isArray(batch.stories) ? batch.stories : []).slice(0, count);
    // Safety net regardless of mode: drop any story that covers the same
    // underlying EVENT as one already published, even if the model reworded
    // the headline. This is what actually stops batch-N duplicating batch-M.
    let batchStories = rawBatchStories.filter((s) => {
      const dupOf = seenHeadlines.find((h) => isSameEvent(s.headline, h));
      if (dupOf) {
        console.warn(`Dropping duplicate story "${s.headline}" — same event as already-published "${dupOf}".`);
        return false;
      }
      return true;
    });

    // Cross-day repeats aren't auto-dropped like same-edition dupes are —
    // a genuine follow-up (IPO opens → IPO lists) is legitimate and the
    // prompt's recentDaysNote already asks the model to lead with what's
    // new in that case. This just surfaces a soft flag for manual review
    // when a published headline still closely matches a recent day's, in
    // case it slipped through as a plain reword rather than a real update.
    batchStories.forEach((s) => {
      const recentMatch = recentHeadlines.find((h) => isSameEvent(s.headline, h.headline));
      if (recentMatch) {
        allSoftIssues.push(`"${s.headline}": closely matches "${recentMatch.headline}" published ${recentMatch.date} — check this is a genuine follow-up, not a repeat.`);
      }
    });

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

    // --- Fact verification gate --------------------------------------------
    // Every story's OWN cited sources are fetched and its claims checked
    // against them — plain ungrounded Gemini calls, zero grounding quota
    // (see scripts/verify-edition.js, --mode source). A story whose central
    // event can't be confirmed, or that contains a claim its own sources
    // contradict, is held back and NEVER published — this is what stops a
    // fabricated story (like the SBI Q1 "results" that never happened) or a
    // wrong figure (wrong IPO dates, invented growth numbers) from reaching
    // the site. WARN (unverifiable but not contradicted) and PASS stories
    // publish normally; WARNs are logged for visibility.
    console.log(`Verifying ${batchStories.length} stor${batchStories.length === 1 ? "y" : "ies"} against their own sources before publishing...`);
    const verifiedStories = [];
    for (const story of batchStories) {
      const shortHeadline = (story.headline || "(no headline)").slice(0, 65);
      try {
        const sources = await fetchStorySources(story);
        if (sources.length === 0) {
          console.warn(`  WARN  "${shortHeadline}" — no fetchable sources, publishing but flagged for manual check.`);
          allSoftIssues.push(`"${story.headline}": published with no fetchable sources to verify against.`);
          verifiedStories.push(story);
          continue;
        }

        // --- Recency gate ---------------------------------------------------
        // Checks the story's own cited sources' actual publish dates —
        // independent of whether the model followed the prompt's recency
        // instructions. A story can be 100% factually accurate and still be
        // months old (the original bug: a 3-month-old "Operation SAKSHM"
        // passed fact-checking cleanly because it wasn't wrong, just stale).
        // This gate catches that regardless of the accuracy verdict below.
        const recency = checkSourceRecency(sources, today);
        if (!recency.ok) {
          console.error(`  STALE  "${shortHeadline}" — HELD BACK, not published. ${recency.reason}`);
          continue; // dropped — never enters verifiedStories
        }
        if (recency.unverifiable) {
          allSoftIssues.push(`"${story.headline}": ${recency.reason} — recency unverified, publishing but flagged for manual check.`);
        }

        const result = await verifyStoryAgainstSources(story, today, sources);
        if (result.verdict === "FAIL" || result.verdict === "FABRICATED") {
          console.error(`  ${result.verdict}  "${shortHeadline}" — HELD BACK, not published.`);
          if (result.notes) console.error(`         ${result.notes}`);
          (result.issues || []).forEach((iss) =>
            console.error(`         - [${iss.status}] ${iss.claim}${iss.detail ? ` — ${iss.detail}` : ""}`)
          );
          continue; // dropped — never enters verifiedStories
        }
        if (result.verdict === "WARN") {
          console.warn(`  WARN  "${shortHeadline}" — ${(result.issues || []).length} unverifiable claim(s), publishing.`);
          allSoftIssues.push(`"${story.headline}": verification WARN — ${(result.issues || []).length} unverifiable claim(s) (not contradicted, just unconfirmed).`);
        } else {
          console.log(`  PASS  "${shortHeadline}"`);
        }

        // --- Figure enrichment (RSS mode only) -----------------------------
        // RSS mode has no live search tool, so the story was deliberately
        // written to avoid inventing figures it couldn't verify at write
        // time — see the RSS-mode prompt override's "describe qualitatively
        // instead" instruction. Now that this story's own sources are
        // fetched in full for the fact-check above, that same text can fill
        // in real figures the writer had to skip. Only ever uses text
        // that's already been fetched and verified against — same
        // discipline as the fact-check itself, just adding instead of
        // subtracting.
        if (effectiveMode === "rss") {
          try {
            const changes = await enrichStoryWithSourceFigures(story, sources);
            if (changes && Object.keys(changes).length > 0) {
              Object.assign(story, changes);
              console.log(`  ENRICHED  "${shortHeadline}" — added real figures to: ${Object.keys(changes).join(", ")}`);
            }
          } catch {
            // Enrichment is a nice-to-have — never block publishing over it.
          }
          await sleep(2000);
        }

        verifiedStories.push(story);
      } catch (err) {
        // Verification itself errored (network hiccup, malformed JSON, etc.)
        // — publish rather than silently dropping a possibly-fine story, but
        // flag it loudly so it gets a human look.
        console.warn(`  ERROR verifying "${shortHeadline}" (${err.message}) — publishing unverified, flagged.`);
        allSoftIssues.push(`"${story.headline}": verification step errored (${err.message}) — published WITHOUT fact-checking.`);
        verifiedStories.push(story);
      }
      // Gentle spacing between per-story verification calls within a batch —
      // these are ungrounded calls (no grounding-quota risk) but still count
      // against the per-minute request cap.
      await sleep(3000);
    }
    batchStories = verifiedStories;
    if (batchStories.length === 0) {
      failedBatches++;
      console.error(`Batch ${b + 1}: every story failed verification — nothing to publish from this batch.`);
      continue;
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
    // In RSS mode, also remove the items these stories were based on so the
    // next batch's headline menu doesn't tempt the model back to them.
    if (rssCache) {
      rssCache = rssCache.filter((it) => !batchStories.some((s) => isSameEvent(s.headline, it.title)));
    }

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

    writeAndCommit(edition, `batch ${b + 1}`, isCI);
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

  // --- Single push for the whole run ---------------------------------------
  // Every batch above committed locally; nothing has reached Netlify yet.
  // This covers both a normal finish and an early `break` (e.g. quota
  // exhaustion) — both fall through to here, and whatever got committed
  // so far still goes out in one deploy.
  if (publishedBatches > 0) {
    pushPending(path.join(__dirname, ".."));
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

// Guarded so this file can be safely require()'d by other scripts (e.g.
// generate-quick-reads.js, which reuses fetchRssHeadlines/fetchPexelsImage
// below rather than duplicating ~150 lines of RSS-fetch/dedup logic —
// exactly the kind of drift that caused DIRECT_FEEDS to go out of sync
// between this file and poll-rss.js earlier). Without this guard,
// require()-ing this file for its exports would trigger the entire
// edition-generation pipeline, including real Gemini API calls.
if (require.main === module) {
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
    console.error("\nAny batches that already published are still committed locally — attempting to push them now...");
    try {
      pushPending(path.join(__dirname, ".."));
    } catch (pushErr) {
      console.error("Push-on-crash also failed:", pushErr.message, "— commits remain local; the next run's push will carry them.");
    }
    process.exit(1);
  });
}

module.exports = {
  fetchRssHeadlines,
  fetchPexelsImage,
  CATEGORY_SEARCH_TERMS,
  isSameEvent,
  extractJson,
  GEMINI_API_BASE,
  MODEL,
  FALLBACK_MODEL,
  GROUNDED_MODEL,
  GROUNDED_FALLBACK_MODEL,
  API_KEY,
  describeQuotaViolations,
};
