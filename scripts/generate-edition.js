#!/usr/bin/env node
/**
 * scripts/generate-edition.js
 *
 * One-command daily edition generation via the Gemini API (replaces the
 * earlier Copilot Studio / Direct Line version — one HTTP call instead
 * of a multi-turn conversation, no "which format?" handling needed since
 * Gemini's JSON mode returns structured output directly).
 *
 * Usage:
 *   GEMINI_API_KEY="..." node scripts/generate-edition.js
 *
 * Nothing is written or pushed without you confirming at the prompt.
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"; // Pro is paid-only now (confirmed: free tier limit is 0) — Flash + the fixes below should carry the quality
const API_KEY = process.env.GEMINI_API_KEY;
const EDITION_PATH = path.join(__dirname, "..", "data", "edition.json");

const REQUIRED_STORY_FIELDS = [
  "headline", "slug", "category", "summary", "quickRead", "whatHappened",
  "whyToday", "whyCare", "whatNext", "deepDiveRead", "keyNumbers",
  "knowledgeChain", "ifYoureWondering", "officialSources", "readMinutes", "sentiment",
];
const REQUIRED_EDITION_FIELDS = ["date", "themeTitle", "numberValue", "stories"];
const WORD_FLOORS = {
  quickRead: 180, whatHappened: 220, whyToday: 220, whyCare: 220, whatNext: 180,
};

// Keep this in sync with lib/prompts.ts's DAILY_EDITION_SYSTEM_PROMPT.
// (Duplicated here rather than imported since this script runs as plain
// Node/CommonJS, not through Next.js's TypeScript build.)
const SYSTEM_PROMPT = `You produce one daily "edition" as JSON for Indian bankers, MSME credit officers, UPSC aspirants, and policy-watchers. Goal: explain WHY, in plain language, not just headlines.

## Voice — this is the difference between useful and boring
Write like a sharp friend explaining why something matters over chai, not like a press release or a policy memo. Open every field with the single most surprising or relevant fact — never a throat-clearing lead-in. Headlines must create curiosity or state a direct stake — never sound like a government bulletin title (banned patterns: "X Continues Y", "Government Relaxes Z", "X Maintains Y Pace"). Every keyNumbers value must be an actual figure (₹ amount, %, date, count) — never a vague phrase. Omit a keyNumbers entry entirely rather than inventing one without a real figure.

## Sourcing
Use Google Search to check 4-6 real, current sources per story, drawn from DIFFERENT categories: national financial press (Economic Times, Business Standard, Mint, Moneycontrol, Financial Express, Hindu BusinessLine, CNBC-TV18), official/regulatory (RBI, SEBI, NSE, BSE, PIB), and international (Reuters, Bloomberg) when relevant. Rotate outlets across stories. Cross-check figures against 2+ sources.

## Recency is mandatory, not a preference
Every one of the 15 stories must be about something that was reported or happened within the last 24-48 hours specifically — not a general/recurring topic dressed up as news. When searching, use date-qualified queries: include words like "today," "this week," the actual current date, or "latest" in your search terms rather than generic topic searches, which tend to surface older, more established articles instead of breaking ones.
Reject any story candidate that is really an evergreen or recurring theme (e.g. "RBI's ongoing approach to liquidity management" without a specific new trigger event) — if you can't find a genuinely fresh news hook for a topic, search again with different terms or pick a different story entirely. It is better to search harder than to include a stale story.
If it's very early in the day and today's news cycle hasn't produced 15 fresh stories yet, prioritize the most recent 24 hours available (including late the previous evening) rather than reaching back multiple days.

## Output rules (strict)
No citation markers, footnote numbers, brackets, or "(Source)" text inline anywhere — sources go ONLY in officialSources. No story position/number inside any text field. Every field = complete sentences. Explain every technical term in plain words the first time it's used. Write for someone with zero finance background.

## Length floors (minimums)
summary: 2+ sentences (35-45 words). quickRead: 180-260 words. whatHappened, whyToday, whyCare: 220-280 words each, each including at least one concrete comparison. whatNext: 180-220 words with a timeframe if known. deepDiveRead: 900-1400 words total across 5 headers: ## What Changed (150-250w), ## The Backstory (150-250w), ## Why It Matters (200-300w), ## Broader Connections (150-250w), ## Alternative View (150-200w).

## Deep Dive must feel immersive, not a wall of paragraphs
Open with a "Fast Facts" bullet list (3-4 lines starting with "- ", each a concrete number). Use **bold** around the single most important number per section. Include a "Then vs. now:" or "Compared to [X]:" comparison paragraph. Vary sentence rhythm — mix short punchy sentences with longer ones. In Alternative View, frame it as a real disagreement ("Not everyone reads this the same way.").

## knowledgeChain
3-6 word labels, each explained in "Broader Connections".

## Before returning output, verify — do not skip this step
Re-read every prose field and confirm: no stray numbers/citations inline; no story-position numbers in text; every jargon term explained on first use; whatHappened/whyToday/whyCare are each 220-280 words (not shorter — a one-sentence field is an automatic failure); deepDiveRead is 900-1400 words with all 5 headers and a Fast Facts bullet list; readMinutes matches the actual word count; EVERY story is genuinely from the last 24-48 hours, not an evergreen/recurring topic — if any story fails this recency check, replace it with a fresher one before finalizing. A field that says only one vague sentence (e.g. "Updated data highlighted the scale of the increase.") is not acceptable output under any circumstance — it must be rewritten with real, specific figures.

## Schema (exact field names, always all 15 stories)
Return ONLY valid JSON matching this shape:
{
 "date","themeTitle","themeDescription","numberValue","numberLabel","numberTrend",
 "stories":[{
   "headline","slug","category" (Banking|Economy|Technology|World|Policy|Corporate),
   "summary","quickRead","whatHappened","whyToday","whyCare","whatNext","deepDiveRead",
   "keyNumbers":[{"label","value"}],
   "knowledgeChain":["..."],
   "ifYoureWondering":[{"q","a"}],
   "officialSources":[{"label","url"}],
   "readMinutes" (integer = word_count/200, rounded up),
   "sentiment" (positive|caution|critical|neutral)
 }]
}`;

function getTodayISO() {
  // IST, matching how editions are dated throughout the site
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const USER_PROMPT = `Today's actual date is ${getTodayISO()}. Generate today's full Why Today edition dated ${getTodayISO()}: 15 stories covering the most important Indian financial, banking, and policy NEWS FROM TODAY AND YESTERDAY SPECIFICALLY (${getTodayISO()} and the day before) — not general background topics. Search using date-qualified terms (include "${getTodayISO()}", "today", "latest") rather than generic topic searches, which tend to surface older established articles. Every story must have a genuine fresh news trigger from the last 24-48 hours — reject anything that's really an evergreen/recurring theme. Follow every rule in your instructions exactly, especially the length floors, the recency requirement, the "Before returning output, verify" checklist, and the Deep Dive formatting.`;

function wordCount(str) {
  return (str || "").trim().split(/\s+/).filter(Boolean).length;
}

function extractJson(text) {
  // Strip ```json ... ``` or ``` ... ``` fences if the model wrapped the output in one.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  // Otherwise, grab from the first { to the last } — handles any stray text before/after.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
}

// Maps our story categories to search terms that actually return good photos
// on a stock site — "Economy" alone returns vague results, "stock market
// trading India" returns something real.
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
    // Pick randomly among the top results so same-category stories on the
    // same day don't all get the identical photo.
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

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

function validateEdition(edition) {
  const issues = [];
  for (const field of REQUIRED_EDITION_FIELDS) {
    if (!(field in edition)) issues.push(`Missing top-level field: ${field}`);
  }
  if (!Array.isArray(edition.stories)) {
    issues.push("`stories` is not an array — cannot validate further.");
    return issues;
  }
  if (edition.stories.length !== 15) {
    issues.push(`Expected 15 stories, got ${edition.stories.length}.`);
  }
  edition.stories.forEach((story, i) => {
    const label = `Story ${i + 1} ("${story.headline || "no headline"}")`;
    for (const field of REQUIRED_STORY_FIELDS) {
      if (!(field in story)) issues.push(`${label}: missing field "${field}"`);
    }
    for (const [field, floor] of Object.entries(WORD_FLOORS)) {
      if (story[field] && wordCount(story[field]) < floor) {
        issues.push(`${label}: "${field}" is ${wordCount(story[field])} words, below the ${floor}-word floor`);
      }
    }
    if (story.deepDiveRead) {
      const dd = wordCount(story.deepDiveRead);
      if (dd < 700) issues.push(`${label}: deepDiveRead is only ${dd} words (floor is 900-1400)`);
      const headers = ["What Changed", "The Backstory", "Why It Matters", "Broader Connections", "Alternative View"];
      for (const h of headers) {
        if (!story.deepDiveRead.includes(h)) issues.push(`${label}: deepDiveRead is missing the "${h}" section`);
      }
      if (!story.deepDiveRead.includes("- ")) issues.push(`${label}: deepDiveRead has no Fast Facts bullet list`);
    }
    if (/[a-z]\.\d+\s/.test(story.whatHappened || "") || /[a-z]\.\d+\s/.test(story.deepDiveRead || "")) {
      issues.push(`${label}: possible leaked citation marker detected.`);
    }
    if (/\bstory\s*\d+\b/i.test(story.headline || "")) {
      issues.push(`${label}: headline appears to contain a story number.`);
    }
  });
  return issues;
}

async function main() {
  if (!API_KEY) {
    console.error("Set GEMINI_API_KEY first:\n  GEMINI_API_KEY=\"...\" node scripts/generate-edition.js");
    process.exit(1);
  }

  console.log(`Calling Gemini (${MODEL}) with Google Search grounding — this can take 1-3 minutes for 15 full stories...`);

  const res = await fetch(`${GEMINI_API_BASE}/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: USER_PROMPT }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        maxOutputTokens: 65536,
      },
    }),
    signal: AbortSignal.timeout(360000), // 6 minutes — generous margin above the expected 1-3 min
  });

  if (!res.ok) {
    console.error(`\nGemini API error (${res.status}):`, await res.text());
    process.exit(1);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];

  if (!candidate) {
    console.error("\nNo candidates returned:", JSON.stringify(data, null, 2));
    process.exit(1);
  }
  if (candidate.finishReason === "MAX_TOKENS") {
    console.error("\nResponse was cut off (hit the token limit). Try again — if it keeps happening, this script's maxOutputTokens may need raising.");
    process.exit(1);
  }

  const text = candidate.content?.parts?.map((p) => p.text || "").join("") ?? "";
  let finalJson;
  try {
    finalJson = JSON.parse(extractJson(text));
  } catch (err) {
    console.error("\nCouldn't parse Gemini's response as JSON:", err.message);
    console.error("\nRaw response (first 2000 chars):\n", text.slice(0, 2000));
    process.exit(1);
  }

  if (process.env.PEXELS_API_KEY && Array.isArray(finalJson.stories)) {
    console.log(`\nFetching ${finalJson.stories.length} headline images from Pexels...`);
    for (const story of finalJson.stories) {
      story.headlineImage = await fetchPexelsImage(story, process.env.PEXELS_API_KEY);
    }
    const found = finalJson.stories.filter((s) => s.headlineImage).length;
    console.log(`Got images for ${found}/${finalJson.stories.length} stories.`);
  } else if (Array.isArray(finalJson.stories)) {
    console.log("\nPEXELS_API_KEY not set — skipping headline images (stories will have none).");
  }

  console.log("\n=== VALIDATION ===");
  const issues = validateEdition(finalJson);
  if (issues.length === 0) {
    console.log("No issues found.");
  } else {
    console.log(`${issues.length} issue(s) found:`);
    issues.forEach((issue) => console.log(`  - ${issue}`));
  }

  console.log("\n=== TODAY'S HEADLINES ===");
  (finalJson.stories || []).forEach((s, i) => {
    console.log(`  ${i + 1}. [${s.category || "?"}] ${s.headline || "(no headline)"}`);
  });

  console.log(`\nNumber of the day: ${finalJson.numberValue || "?"} — ${finalJson.themeTitle || "?"}`);

  const proceed = await ask("\nWrite this to data/edition.json and push to GitHub? (y/n): ");
  if (proceed.trim().toLowerCase() !== "y") {
    console.log("Not written. Nothing changed.");
    process.exit(0);
  }

  fs.writeFileSync(EDITION_PATH, JSON.stringify(finalJson, null, 2));
  console.log(`Written to ${EDITION_PATH}`);

  try {
    execSync("git add data/edition.json", { stdio: "inherit", cwd: path.join(__dirname, "..") });
    execSync(`git commit -m "Daily edition: ${finalJson.date || "update"}"`, { stdio: "inherit", cwd: path.join(__dirname, "..") });
    execSync("git push", { stdio: "inherit", cwd: path.join(__dirname, "..") });
    console.log("\nPushed. Netlify will redeploy automatically.");
  } catch (err) {
    console.error("\nGit commit/push failed — the file is written locally, but you'll need to commit and push manually.");
    console.error(err.message);
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
    console.error("(3) trying a different network if you're on a work/office connection");
    console.error("that might block this domain, (4) testing https://generativelanguage.googleapis.com directly in a browser.");
  }
  process.exit(1);
});
