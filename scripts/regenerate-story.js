#!/usr/bin/env node
/**
 * scripts/regenerate-story.js
 *
 * Regenerates ONE story (by slug) without touching the other 14 — the
 * Gemini-based replacement for the old "regenerate-single-story" skill.
 *
 * Usage:
 *   GEMINI_API_KEY="..." node scripts/regenerate-story.js <slug> ["what was wrong with it"]
 *
 * Example:
 *   GEMINI_API_KEY="..." node scripts/regenerate-story.js forex-reserves-fall-15-month-low "too short, needs real numbers"
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const API_KEY = process.env.GEMINI_API_KEY;
const EDITION_PATH = path.join(__dirname, "..", "data", "edition.json");

const SYSTEM_PROMPT = `You are regenerating ONE story's complete JSON object for Why Today, a daily briefing for Indian bankers, MSME credit officers, UPSC aspirants, and policy-watchers. Do not produce top-level edition fields — only the one story object.

Write like a sharp friend explaining why something matters over chai, not a press release. Open every field with the single most surprising or relevant fact. Headlines must create curiosity or state a direct stake — never sound like a government bulletin title. Every keyNumbers value must be an actual figure (₹ amount, %, date, count), never a vague phrase — omit the entry if you don't have a real number.

Use Google Search to check current sources before writing. No citation markers or story-position numbers in any text field.

Length floors: summary 35-45 words, quickRead 180-260 words, whatHappened/whyToday/whyCare 220-280 words each with a concrete comparison, whatNext 180-220 words, deepDiveRead 900-1400 words across 5 headers (## What Changed, ## The Backstory, ## Why It Matters, ## Broader Connections, ## Alternative View), opening with a "Fast Facts" bullet list and using **bold** on key numbers.

If the user describes what was wrong with the original, fix that specific issue first.

Return ONLY valid JSON matching this shape:
{
  "headline", "slug", "category" (Banking|Economy|Technology|World|Policy|Corporate),
  "summary", "quickRead", "whatHappened", "whyToday", "whyCare", "whatNext", "deepDiveRead",
  "keyNumbers": [{"label","value","previousValue?","previousLabel?","trendNote?"}],
  "knowledgeChain": ["..."],
  "ifYoureWondering": [{"q","a"}],
  "officialSources": [{"label","url"}],
  "readMinutes",
  "sentiment" (positive|caution|critical|neutral)
}`;

function extractJson(text) {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
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

async function main() {
  const slug = process.argv[2];
  const feedback = process.argv[3] || "";

  if (!API_KEY) {
    console.error("Set GEMINI_API_KEY first:\n  GEMINI_API_KEY=\"...\" node scripts/regenerate-story.js <slug> [\"feedback\"]");
    process.exit(1);
  }
  if (!slug) {
    console.error("Usage: node scripts/regenerate-story.js <slug> [\"what was wrong with it\"]");
    process.exit(1);
  }

  const edition = JSON.parse(fs.readFileSync(EDITION_PATH, "utf-8"));
  const index = edition.stories.findIndex((s) => s.slug === slug);
  if (index === -1) {
    console.error(`No story with slug "${slug}" found in data/edition.json. Current slugs:`);
    edition.stories.forEach((s) => console.error(`  - ${s.slug}`));
    process.exit(1);
  }

  const original = edition.stories[index];
  const userPrompt = `Regenerate this story:\nOriginal headline: "${original.headline}"\nCategory: ${original.category}\nOriginal summary: "${original.summary}"\n${feedback ? `What was wrong with it: ${feedback}` : "No specific complaint — just write a stronger version."}`;

  console.log(`Regenerating "${original.headline}"...`);

  const res = await fetch(`${GEMINI_API_BASE}/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 8192 },
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

  const text = candidate.content?.parts?.map((p) => p.text || "").join("") ?? "";
  let newStory;
  try {
    newStory = JSON.parse(extractJson(text));
  } catch (err) {
    console.error("\nCouldn't parse response as JSON:", err.message);
    console.error(text.slice(0, 1500));
    process.exit(1);
  }

  console.log("\n=== NEW VERSION ===");
  console.log(`Headline: ${newStory.headline}`);
  console.log(`Summary: ${newStory.summary}`);
  console.log(`Deep dive length: ${(newStory.deepDiveRead || "").split(/\s+/).length} words`);

  const proceed = await ask(`\nReplace story ${index + 1} in edition.json with this version and push? (y/n): `);
  if (proceed.trim().toLowerCase() !== "y") {
    console.log("Not applied. Nothing changed.");
    process.exit(0);
  }

  // Keep the original slug so any existing links/cache keys still point to this story.
  newStory.slug = original.slug;
  edition.stories[index] = newStory;
  fs.writeFileSync(EDITION_PATH, JSON.stringify(edition, null, 2));
  console.log("Written to data/edition.json");

  try {
    execSync("git add data/edition.json", { stdio: "inherit", cwd: path.join(__dirname, "..") });
    execSync(`git commit -m "Regenerate story: ${slug}"`, { stdio: "inherit", cwd: path.join(__dirname, "..") });
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
