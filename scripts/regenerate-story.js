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

// Reuse generate-edition.js's already-fixed versions rather than
// maintaining separate copies that can drift — this file's own local
// extractJson (removed 2026-07-16) still had the naive first-brace/
// last-brace bug fixed elsewhere in the codebase weeks ago, and this
// script uses google_search grounding (tools below), which is exactly
// the scenario where a thought-part getting concatenated into the
// response text fools naive brace matching. Also picks up FALLBACK_MODEL
// for free, which this file never had at all before.
const { GEMINI_API_BASE, API_KEY, extractJson, describeQuotaViolations, fetchPexelsImage } = require("./generate-edition.js");
// 2026-07-16: this file's API call uses google_search grounding, which
// needs a DIFFERENT model choice than generate-edition.js's own MODEL/
// FALLBACK_MODEL (those are tuned for ungrounded/text-only calls
// elsewhere in the pipeline, no longer imported here since this file
// only ever makes the one grounded call). Confirmed from the real usage
// dashboard: "Gemini 3" family search-grounding quota is 0/0 on the
// free tier — a hard architectural cap, not something that resets or
// clears with waiting — while "Gemini 2.5" family shows 37/1.5K, over
// 1,400 requests of real headroom completely unused. gemini-3.5-flash/
// gemini-3.1-flash-lite (generate-edition.js's MODEL/FALLBACK_MODEL)
// are BOTH "Gemini 3" family, so every grounded call through them was
// guaranteed to fail regardless of retries or switching between them —
// this is why every attempt failed identically no matter how many times
// it was retried. Using the 2.5 family here specifically, where
// grounding is actually available.
const GROUNDED_MODEL = process.env.GEMINI_GROUNDED_MODEL || "gemini-2.5-flash";
const GROUNDED_FALLBACK_MODEL = process.env.GEMINI_GROUNDED_FALLBACK_MODEL || "gemini-2.5-flash-lite";
const EDITION_PATH = path.join(__dirname, "..", "data", "edition.json");

const SYSTEM_PROMPT = `You are regenerating ONE story's complete JSON object for Why Today, a daily briefing for readers who follow India's economy, markets, banking, corporate news, and economy-relevant technology. Do not produce top-level edition fields — only the one story object.

Write like a sharp friend explaining why something matters over chai, not a press release. Open every field with the single most surprising or relevant fact. Every keyNumbers value must be an actual figure (₹ amount, %, date, count), never a vague phrase — omit the entry if you don't have a real number.

Headlines — the Curiosity Engine: "headline" max 11 words, language a Class 8 student understands, must make the reader think "Wait… why?" — surprise, curiosity, or a direct stake; NEVER clickbait (the story must deliver everything the headline promises); no bulletin language or jargon. Score it on curiosity /10 — rewrite until it's at least 9. Also include "whatsappHeadline" (max 9 words, punchier, at most one emoji, truthful) and "notificationHeadline" (max 7 words, hook first).

timeMachine (required): six keys, each 1-2 plain sentences (15-35 words) — "yesterday" (immediate setup), "lastMonth", "lastYear", "tenYearsAgo", "today" (one crisp line), "future" (most likely next step, with timeframe if known). For lastMonth/lastYear/tenYearsAgo, run dedicated date-qualified searches for the actual historical data — each must carry a concrete dated figure or named event with its year. Never invent precise figures — honest era context beats a fake number.

chart (OPTIONAL — only when the story centers on a measurable series): {"title","unit?","labels" (3-6 short strings),"values" (same count of plain numbers, consistent units, chronological),"takeaway" (one sentence)}. All values must be real, from your sources. If you don't have 3+ real comparable numbers, OMIT chart entirely.

Use Google Search to check current sources before writing. No citation markers or story-position numbers in any text field.

Length rules (both floors AND ceilings — do not exceed them): summary 30-40 words, quickRead 100-150 words, whatHappened/whyToday/whyCare 120-160 words each with a concrete comparison, whatNext 80-120 words, deepDiveRead 500-800 words across 5 headers (## What Changed, ## The Backstory, ## Why It Matters, ## Broader Connections, ## Alternative View), opening with a "Fast Facts" bullet list and using **bold** on key numbers. Tight and specific beats long and padded.

IMPORTANT: "deepDiveRead" must be ONE plain string value containing all 5 sections with their "## " markdown headers embedded directly in that string (e.g. "## What Changed\n\n...\n\n## The Backstory\n\n...") — NOT an array of 5 separate strings, and NOT an object with one key per section. A JSON array or object here will break how the story renders on the actual site.

If the user describes what was wrong with the original, fix that specific issue first.

QUARTERLY RESULTS STORIES — special handling (this readership includes bankers who read past the headline number): cover the full picture (NII/margin, asset quality, deposit/advances growth, CASA, fee income, capital adequacy, cost-to-income, ROA/ROE where available), not just profit. Name what was good AND weak separately — if a blended figure (e.g. "non-interest income") looks unremarkable, check whether it's actually blending a strong and a weak component and report that segment breakdown instead. Peer comparison only when genuinely comparable: same bank type (PSU-vs-PSU, private-vs-private, never across), same reporting period, and ONLY if the peer has actually announced results — if not, say so explicitly rather than omitting silently. Use the chart field for a real, sourced peer comparison when that data exists (e.g. advances growth % across banks) — omit rather than force one with incomplete data. Every figure must trace to a source; if sources conflict on a number, flag it rather than silently picking one.

Return ONLY valid JSON matching this shape:
{
  "headline", "whatsappHeadline", "notificationHeadline",
  "slug", "category" (Banking|Economy|Technology|World|Policy|Corporate|IPO|Startups|AI),
  "summary", "quickRead", "whatHappened", "whyToday", "whyCare", "whatNext", "deepDiveRead",
  "timeMachine": {"yesterday","lastMonth","lastYear","tenYearsAgo","today","future"},
  "chart": {"title","unit?","labels":["..."],"values":[numbers],"takeaway"} (OPTIONAL — omit if not genuinely numeric),
  "keyNumbers": [{"label","value","previousValue?","previousLabel?","trendNote?"}],
  "knowledgeChain": ["..."],
  "ifYoureWondering": [{"q","a"}],
  "officialSources": [{"label","url"}],
  "readMinutes",
  "sentiment" (positive|caution|critical|neutral)
}`;

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function main() {
  const first = process.argv[2];
  const second = process.argv[3] || "";
  // Fully whitespace-and-dash-tolerant "--new" detection. This started as
  // an exact "--new" check and needed three successive patches for real
  // typing/autocorrect variants hit in practice: an em-dash substitution
  // ("—new", common mobile-keyboard autocorrect for "--"), a bare "New"
  // (a natural-language attempt that didn't realize exact flag syntax
  // mattered), and a stray space ("- new"). Rather than keep adding exact
  // strings to a list, this strips ALL whitespace, normalizes any
  // dash-like character to a plain hyphen, then matches 0-2 leading
  // hyphens followed by "new" — covers every variant seen so far and any
  // similar one not yet seen. Real story slugs are always multi-word
  // kebab-case, so this can never false-match an actual slug.
  const normalizedFirst = (first || "").replace(/\s+/g, "").replace(/[\u2012-\u2015\u2212]/g, "-").toLowerCase();
  const isNew = /^-{0,2}new$/.test(normalizedFirst);

  if (!API_KEY) {
    console.error("Set GEMINI_API_KEY first:\n  GEMINI_API_KEY=\"...\" node scripts/regenerate-story.js <slug> [\"feedback\"]\n  GEMINI_API_KEY=\"...\" node scripts/regenerate-story.js --new \"topic description\"");
    process.exit(1);
  }
  if (!first) {
    console.error("Usage: node scripts/regenerate-story.js <slug> [\"what was wrong with it\"]\n   or: node scripts/regenerate-story.js --new \"topic description\"");
    process.exit(1);
  }

  const edition = JSON.parse(fs.readFileSync(EDITION_PATH, "utf-8"));
  let index = -1;
  let original = null;
  let userPrompt;

  if (isNew) {
    // Added 2026-07-16 per explicit request: generating a brand new story
    // alongside the existing ones, rather than replacing one by slug, so
    // a failed/imperfect attempt never destroys a story that's already
    // publishing fine — the old one can be removed manually once the new
    // one is confirmed good, rather than the replace flow's all-or-
    // nothing swap.
    if (!second) {
      console.error('For --new mode, pass a topic description as the second argument, e.g.:\n  node scripts/regenerate-story.js --new "Union Bank Q1 FY27 results — full deep dive with peer comparison"');
      process.exit(1);
    }
    userPrompt = `Write a brand new story on this topic:\n${second}\n\nThis is a genuinely new story, not a regeneration of an existing one — do not reference "the original" or "what was wrong with it," just write the strongest possible version from scratch.`;
    console.log(`Generating new story: "${second}"...`);
  } else {
    const slug = first;
    const feedback = second;
    index = edition.stories.findIndex((s) => s.slug === slug);
    if (index === -1) {
      console.error(`No story with slug "${slug}" found in data/edition.json. Current slugs:`);
      edition.stories.forEach((s) => console.error(`  - ${s.slug}`));
      process.exit(1);
    }
    original = edition.stories[index];
    userPrompt = `Regenerate this story:\nOriginal headline: "${original.headline}"\nCategory: ${original.category}\nOriginal summary: "${original.summary}"\n${feedback ? `What was wrong with it: ${feedback}` : "No specific complaint — just write a stronger version."}`;
    console.log(`Regenerating "${original.headline}"...`);
  }

  // 2026-07-16: wrapped the whole generate+parse cycle in this outer loop
  // after a real run got a genuinely successful API response (200 OK,
  // substantial accurate content) that then failed to PARSE — a
  // malformed array partway through the model's own JSON output. That
  // used to exit immediately, wasting a real successful generation
  // (including real grounding-quota spend) on what's often just a one-
  // off LLM output glitch rather than a systemic problem — a fresh
  // attempt has a good chance of producing valid JSON. HTTP-level
  // failures (both models genuinely unavailable, hard quota exhaustion)
  // still exit immediately inside the inner loop below, since retrying
  // generation doesn't help those; only a parse failure on an otherwise-
  // successful response gets this outer retry.
  const maxGenAttempts = 3;
  let newStory;

  for (let genAttempt = 1; genAttempt <= maxGenAttempts; genAttempt++) {
    let currentModel = GROUNDED_MODEL;
    const deadModels = new Set();
    let attempt = 0;
    const maxRetries = 3;
    let data;

    while (attempt <= maxRetries) {
      const res = await fetch(`${GEMINI_API_BASE}/${currentModel}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          tools: [{ google_search: {} }],
          // 2026-07-16: raised from 8192 — likely the actual cause of the
          // "syntax error" failures (a JSON.parse SyntaxError is exactly
          // what a truncated response produces). generate-edition.js
          // allocates roughly 6500 tokens PER STORY for this same schema;
          // 8192 was already tight for a full deep dive + timeMachine +
          // chart + keyNumbers, and the quarterly-results guidance added
          // in the same session asks for meaningfully more content
          // (segment-level analysis, peer comparison data) without this
          // budget ever being revisited.
          generationConfig: { maxOutputTokens: 20000 },
        }),
      });

      if (res.ok) {
        data = await res.json();
        break;
      }

      const bodyText = await res.text();
      const quota429 = res.status === 429 ? describeQuotaViolations(bodyText) : null;
      // 2026-07-16: was bodyText.slice(0, 300) — that 300-char cutoff was
      // hiding exactly the field that matters (details[].violations[].
      // quotaId), which is what tells us WHICH quota was actually hit.
      // Confirmed from real logs: every truncated message cut off right at
      // `"stat` before the useful part. Now logs the parsed quotaId
      // directly (short, always useful) plus the full body underneath (for
      // anything the parser didn't recognize).
      console.warn(`\n${currentModel} error (${res.status})${quota429 ? ` — quota: ${quota429.joined || "(unrecognized shape)"}` : ""}`);
      console.warn(bodyText);

      if (res.status === 404) {
        // Model name retired — switching is the only option, no amount of
        // waiting fixes this.
        deadModels.add(currentModel);
        const other = currentModel === GROUNDED_MODEL ? GROUNDED_FALLBACK_MODEL : GROUNDED_MODEL;
        if (deadModels.has(other)) {
          console.error(`\nBoth ${GROUNDED_MODEL} and ${GROUNDED_FALLBACK_MODEL} are unavailable (404). Last error:`, bodyText);
          process.exit(1);
        }
        console.log(`${currentModel} unavailable — switching to ${other}...`);
        currentModel = other;
        continue;
      }

      if (res.status === 429) {
        // GROUNDING quota (this call uses tools: [{google_search:{}}]) is
        // project-level and shared within a model FAMILY, not per exact
        // model — confirmed from the real dashboard that "Gemini 3" family
        // (gemini-3.5-flash + gemini-3.1-flash-lite, the two models this
        // used before 2026-07-16) has a HARD 0/0 grounding cap on the free
        // tier, which is why every attempt failed identically no matter
        // how many times it retried or switched between them — 0/0 isn't
        // a temporary spike, switching within the same capped family does
        // nothing. Now using the Gemini 2.5 family instead (confirmed
        // 37/1.5K used, real headroom) — this check stays as a defensive
        // safeguard in case that family's shared grounding budget also
        // gets exhausted someday, failing fast rather than wasting time
        // retrying/switching within a family that's actually out.
        if (quota429.isGrounding) {
          console.error(`\nGrounding quota exhausted (${quota429.joined}) — shared within the ${currentModel.includes("2.5") ? "Gemini 2.5" : "current"} model family, so switching models or waiting briefly won't help.`);
          process.exit(1);
        }
        if (!quota429.isLongWindow) {
          attempt++;
          if (attempt > maxRetries) {
            console.error(`\n${currentModel} still rate-limited after ${maxRetries} short retries — trying the other model instead.`);
          } else {
            const waitMs = 8000 * attempt;
            console.warn(`${currentModel} hit a short-term rate limit (not daily quota) — waiting ${Math.round(waitMs / 1000)}s and retrying the same model (${attempt}/${maxRetries})...`);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
        }
        deadModels.add(currentModel);
        const other = currentModel === GROUNDED_MODEL ? GROUNDED_FALLBACK_MODEL : GROUNDED_MODEL;
        if (deadModels.has(other)) {
          console.error(`\nBoth ${GROUNDED_MODEL} and ${GROUNDED_FALLBACK_MODEL} are quota-blocked. Last error:`, bodyText);
          process.exit(1);
        }
        console.log(`Switching to ${other}...`);
        currentModel = other;
        attempt = 0; // fresh short-retry budget on the new model
        continue;
      }

      attempt++;
      if (attempt > maxRetries) {
        console.error(`\nGemini API error (${res.status}) after ${maxRetries} retries:`, bodyText);
        process.exit(1);
      }
      const waitMs = Math.min(5000 * 3 ** (attempt - 1), 45000);
      console.warn(`Waiting ${Math.round(waitMs / 1000)}s before retry ${attempt}/${maxRetries}...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    const candidate = data.candidates?.[0];
    if (!candidate) {
      console.error("\nNo candidates returned:", JSON.stringify(data, null, 2));
      process.exit(1);
    }

    // Thought-part filter — gemini-3.x models think by default and can
    // return a "thought": true part alongside the real answer; naively
    // joining every part's .text mixes thinking-prose into what's supposed
    // to be pure JSON. Fixed everywhere else in the codebase already; this
    // file was the one place still missing it.
    const text = candidate.content?.parts?.filter((p) => !p.thought).map((p) => p.text || "").join("") ?? "";
    try {
      newStory = JSON.parse(extractJson(text));
      // 2026-07-16: a real run crashed here — newStory.deepDiveRead came
      // back as something other than a plain string (most likely an
      // array, one entry per section, since the quarterly-results
      // guidance describes 5 distinct parts — "## What Changed" etc —
      // which the model apparently sometimes interprets as 5 separate
      // array items rather than 5 markdown headers within one string).
      // lib/types.ts requires deepDiveRead: string — writing a non-
      // string into edition.json wouldn't just break this diagnostic
      // log, it would break the actual story page's rendering on the
      // live site. Normalize here, once, rather than just guarding the
      // log line below.
      if (Array.isArray(newStory.deepDiveRead)) {
        console.warn("\ndeepDiveRead came back as an array, not a string — joining into one markdown string.");
        newStory.deepDiveRead = newStory.deepDiveRead
          .map((section) => (typeof section === "string" ? section : Object.values(section || {}).join("\n\n")))
          .join("\n\n");
      } else if (newStory.deepDiveRead && typeof newStory.deepDiveRead === "object") {
        console.warn("\ndeepDiveRead came back as an object, not a string — joining its values into one markdown string.");
        newStory.deepDiveRead = Object.values(newStory.deepDiveRead).join("\n\n");
      }
      break; // valid JSON — done, exit the outer generation-retry loop
    } catch (err) {
      console.error(`\nCouldn't parse response as JSON (generation attempt ${genAttempt}/${maxGenAttempts}): ${err.message}`);
      console.error(text.slice(0, 1500));
      if (genAttempt >= maxGenAttempts) {
        console.error(`\nGave up after ${maxGenAttempts} generation attempts, all producing malformed JSON.`);
        process.exit(1);
      }
      console.log("Trying a fresh generation...");
    }
  }

  // 2026-07-16: this was missing entirely — regenerate-story.js never
  // fetched an image at all, unlike generate-edition.js which does this
  // for every story. Confirmed from a real published story showing
  // headlineImage: undefined. Same pattern as generate-edition.js: only
  // runs if PEXELS_API_KEY is actually set (also needed adding to
  // regenerate-story.yml's env, done in the same change), and fails
  // open — a missing/failed image fetch shouldn't block publishing the
  // story text, same as it doesn't in the main pipeline.
  if (process.env.PEXELS_API_KEY) {
    try {
      newStory.headlineImage = await fetchPexelsImage(newStory, process.env.PEXELS_API_KEY);
    } catch (err) {
      console.warn(`\nCouldn't fetch an image (publishing without one): ${err.message}`);
    }
  } else {
    console.warn("\nPEXELS_API_KEY not set — publishing without an image.");
  }

  console.log("\n=== NEW VERSION ===");
  console.log(`Headline: ${newStory.headline}`);
  console.log(`Summary: ${newStory.summary}`);
  // Defensive coercion regardless of the normalization above — a string
  // is guaranteed at this point, but keeping this resilient rather than
  // assuming, so a future unexpected shape logs a word count of 0
  // instead of crashing the whole script on a mere diagnostic line
  // right after a successful generation (which is what happened here —
  // the story data was already fine, only this log line crashed).
  console.log(`Deep dive length: ${String(newStory.deepDiveRead || "").split(/\s+/).filter(Boolean).length} words`);

  const confirmPrompt = isNew
    ? `\nAdd this as a new story (position 1, alongside the existing ${edition.stories.length}) and push? (y/n): `
    : `\nReplace story ${index + 1} in edition.json with this version and push? (y/n): `;
  const proceed = process.env.AUTO_CONFIRM === "1"
    ? "y" // non-interactive path (GH Actions workflow) — readline.question would
          // hang forever waiting for stdin that never comes in CI, so this
          // bypasses it explicitly rather than accidentally working by luck.
    : await ask(confirmPrompt);
  if (proceed.trim().toLowerCase() !== "y") {
    console.log("Not applied. Nothing changed.");
    process.exit(0);
  }

  let commitMessage;
  if (isNew) {
    // Slugify the model's own slug field (or the headline, if the model
    // omitted slug) and de-dupe against existing slugs — a brand new
    // story has no "original" to inherit a slug from, unlike the replace
    // path below.
    const base = (newStory.slug || newStory.headline || "story")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70);
    const existingSlugs = new Set(edition.stories.map((s) => s.slug));
    let candidateSlug = base;
    let n = 2;
    while (existingSlugs.has(candidateSlug)) {
      candidateSlug = `${base}-${n}`;
      n++;
    }
    newStory.slug = candidateSlug;
    // Unshift (not push) — a story specifically requested via --new is
    // presumably meant to be prominent, not buried at the end of the list.
    edition.stories.unshift(newStory);
    commitMessage = `Add new story: ${newStory.slug}`;
  } else {
    // Keep the original slug so any existing links/cache keys still point to this story.
    newStory.slug = original.slug;
    edition.stories[index] = newStory;
    commitMessage = `Regenerate story: ${original.slug}`;
  }

  fs.writeFileSync(EDITION_PATH, JSON.stringify(edition, null, 2));
  console.log("Written to data/edition.json");

  try {
    execSync("git add data/edition.json", { stdio: "inherit", cwd: path.join(__dirname, "..") });
    execSync(`git commit -m "${commitMessage}"`, { stdio: "inherit", cwd: path.join(__dirname, "..") });
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
