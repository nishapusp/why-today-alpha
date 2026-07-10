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
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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
  return `You produce part of a daily "edition" as JSON for Indian bankers, MSME credit officers, UPSC aspirants, and policy-watchers. Goal: explain WHY, in plain language, not just headlines. Be CONCISE — every sentence must earn its place. No padding, no restating the same fact in different words.

## Voice — this is the difference between useful and boring
Write like a sharp friend explaining why something matters over chai, not like a press release or a policy memo. Open every field with the single most surprising or relevant fact — never a throat-clearing lead-in. Headlines must create curiosity or state a direct stake — never sound like a government bulletin title (banned patterns: "X Continues Y", "Government Relaxes Z", "X Maintains Y Pace"). Every keyNumbers value must be an actual figure (₹ amount, %, date, count) — never a vague phrase. Omit a keyNumbers entry entirely rather than inventing one without a real figure.

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
Re-read every prose field and confirm: no stray numbers/citations inline; no story-position numbers in text; every jargon term explained on first use; whatHappened/whyToday/whyCare are each 120-160 words (a one-sentence field is an automatic failure, and so is a 250-word one); readMinutes matches the actual word count; EVERY story is genuinely from the last 24-48 hours, not an evergreen/recurring topic — if any story fails this recency check, replace it with a fresher one before finalizing. For deepDiveRead specifically, verify all of these are literally present in the text, not just planned: 500-800 words total; all 5 "## " headers; a "- " bullet list (3-4 lines) placed right after the first header; at least one "**...**" bold marker in at least 3 sections; the LAST paragraph of "## The Backstory" starting with "Then vs. now:" or "Compared to". If any single one of these is missing, add it before finalizing — this is not optional formatting. A field that says only one vague sentence (e.g. "Updated data highlighted the scale of the increase.") is not acceptable output under any circumstance — it must be rewritten with real, specific figures.

## Schema (exact field names, always exactly ${storyCount} stories in this response)
Return ONLY valid JSON matching this shape:
{
 "date","themeTitle","themeDescription","numberValue","numberLabel","numberTrend",
 "stories":[{
   "headline","slug","category" (Banking|Economy|Technology|World|Policy|Corporate),
   "summary","quickRead","whatHappened","whyToday","whyCare","whatNext","deepDiveRead",
   "keyNumbers":[{"label","value","previousValue?","previousLabel?","trendNote?"}],
   "knowledgeChain":["..."],
   "ifYoureWondering":[{"q","a"}],
   "officialSources":[{"label","url"}],
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
  return `Today's actual date is ${getTodayISO()}. Generate ${storyCount} stories for today's Why Today edition dated ${getTodayISO()}, covering important Indian financial, banking, and policy NEWS FROM TODAY AND YESTERDAY SPECIFICALLY (${getTodayISO()} and the day before) — not general background topics. Search using date-qualified terms (include "${getTodayISO()}", "today", "latest") rather than generic topic searches, which tend to surface older established articles. Every story must have a genuine fresh news trigger from the last 24-48 hours — reject anything that's really an evergreen/recurring theme.${exclusionNote} Follow every rule in your instructions exactly, especially the length floors AND ceilings, the recency requirement, the "Before returning output, verify" checklist, and the Deep Dive formatting. Also include the top-level edition fields (date, themeTitle, themeDescription, numberValue, numberLabel, numberTrend) summarizing the overall theme across these stories.`;
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

async function fetchPexelsImage(story, apiKey) {
  const query = CATEGORY_SEARCH_TERMS[story.category] || "business finance india";
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
      { headers: { Authorization: apiKey } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.photos?.length) return null;
    const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
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

async function generateBatch(storyCount, excludeHeadlines, maxRetries = 1) {
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(`${GEMINI_API_BASE}/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: buildSystemPrompt(storyCount) }] },
          contents: [{ role: "user", parts: [{ text: buildUserPrompt(storyCount, excludeHeadlines) }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            // NOTE: responseMimeType: "application/json" is deliberately NOT
            // set here — Gemini rejects that combined with the google_search
            // tool (400 INVALID_ARGUMENT: "Tool use with a response mime
            // type ... is unsupported"). We rely on the prompt's "Return
            // ONLY valid JSON" instruction plus extractJson()'s fence-
            // stripping fallback instead. Do not re-add responseMimeType
            // while google_search is in tools.
            maxOutputTokens: 16000,
          },
        }),
        signal: AbortSignal.timeout(240000), // 4 min — 3-story batches usually finish well under 2
      });

      if (!res.ok) {
        const bodyText = await res.text();
        const err = new Error(`Gemini API error (${res.status}): ${bodyText}`);
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
      attempt++;
      if (attempt > maxRetries) {
        throw err; // preserves err.status so main() can detect quota exhaustion and stop the whole run
      }
      if (err.status === 429) {
        const waitMs = extractRetryDelayMs(err.body, 20000);
        console.warn(`\nBatch attempt ${attempt} hit a rate limit. Waiting ${Math.round(waitMs / 1000)}s before retrying (per Gemini's own retry-after)...`);
        await sleep(waitMs);
      } else {
        console.warn(`\nBatch attempt ${attempt} failed (${err.message}). Retrying...`);
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
    execSync("git add data/edition.json", { stdio: "inherit", cwd });
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

  for (let b = 0; b < numBatches; b++) {
    const count = Math.min(BATCH_SIZE, TOTAL_STORIES - publishedCount);
    if (count <= 0) break;
    console.log(`\n=== Batch ${b + 1}/${numBatches}: requesting ${count} stories ===`);

    let batch;
    try {
      batch = await generateBatch(count, seenHeadlines);
    } catch (err) {
      failedBatches++;
      if (err.status === 429 && /free_tier|RESOURCE_EXHAUSTED/i.test(err.body || err.message)) {
        console.error(`\nBatch ${b + 1} failed: Gemini's free-tier quota is exhausted for now.`);
        console.error("Stopping here instead of burning the rest of today's quota on batches that would also fail.");
        console.error("Stories published so far stay live. Wait for the quota to reset (per-minute limits reset within a minute; daily limits reset at midnight Pacific time), then re-run — it will resume from where it left off.");
        console.error("If this keeps happening, the free tier (5 req/min, ~20 req/day for gemini-2.5-flash) may be too low — consider enabling billing on the Gemini API project to move to a paid tier.");
        break; // stop the loop entirely — further batches will just fail the same way
      }
      console.error(`Batch ${b + 1} failed permanently: ${err.message}`);
      console.error("Moving on — stories published so far stay live. Re-run the script later to fill the rest.");
      continue;
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
    // Non-zero exit in CI so the run shows as needing attention — but note
    // everything generated so far is ALREADY live.
    if (isCI) process.exit(1);
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
