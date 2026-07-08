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

## Output rules (strict)
No citation markers, footnote numbers, brackets, or "(Source)" text inline anywhere — sources go ONLY in officialSources. No story position/number inside any text field. Every field = complete sentences. Explain every technical term in plain words the first time it's used. Write for someone with zero finance background.

## Length floors (minimums)
summary: 2+ sentences (35-45 words). quickRead: 180-260 words. whatHappened, whyToday, whyCare: 220-280 words each, each including at least one concrete comparison. whatNext: 180-220 words with a timeframe if known. deepDiveRead: 900-1400 words total across 5 headers: ## What Changed (150-250w), ## The Backstory (150-250w), ## Why It Matters (200-300w), ## Broader Connections (150-250w), ## Alternative View (150-200w).

## Deep Dive must feel immersive, not a wall of paragraphs
Open with a "Fast Facts" bullet list (3-4 lines starting with "- ", each a concrete number). Use **bold** around the single most important number per section. Include a "Then vs. now:" or "Compared to [X]:" comparison paragraph. Vary sentence rhythm — mix short punchy sentences with longer ones. In Alternative View, frame it as a real disagreement ("Not everyone reads this the same way.").

## knowledgeChain
3-6 word labels, each explained in "Broader Connections".

## Before returning output, verify — do not skip this step
Re-read every prose field and confirm: no stray numbers/citations inline; no story-position numbers in text; every jargon term explained on first use; whatHappened/whyToday/whyCare are each 220-280 words (not shorter — a one-sentence field is an automatic failure); deepDiveRead is 900-1400 words with all 5 headers and a Fast Facts bullet list; readMinutes matches the actual word count. If ANY field fails these checks, rewrite that specific field before finalizing your response. A field that says only one vague sentence (e.g. "Updated data highlighted the scale of the increase.") is not acceptable output under any circumstance — it must be rewritten with real, specific figures.

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

const USER_PROMPT = `Today's actual date is ${getTodayISO()}. Generate today's full Why Today edition dated ${getTodayISO()}: 15 stories covering the most important Indian financial, banking, and policy news from the last 24-48 hours (i.e. roughly ${getTodayISO()} and the day or two before it — use Google Search to confirm what's actually current, don't guess). Follow every rule in your instructions exactly, especially the length floors, the "Before returning output, verify" checklist, and the Deep Dive formatting.`;

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
  process.exit(1);
});
