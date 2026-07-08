#!/usr/bin/env node
/**
 * scripts/review-feedback.js
 *
 * Reads all story feedback collected via the website's 👍/👎 widget and
 * prints a summary, with a ready-to-run regenerate-story.js command for
 * any story with negative feedback and comments.
 *
 * Needs two things (different from GEMINI_API_KEY — these are Netlify's
 * own credentials, required because this runs outside Netlify's servers):
 *   NETLIFY_SITE_ID    — Site configuration > General > Site details
 *   NETLIFY_API_TOKEN  — User settings (top-right avatar) > Applications
 *                        > Personal access tokens > New access token
 *
 * Usage:
 *   NETLIFY_SITE_ID="..." NETLIFY_API_TOKEN="..." node scripts/review-feedback.js
 */

const { getStore } = require("@netlify/blobs");

async function main() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;

  if (!siteID || !token) {
    console.error("Set both NETLIFY_SITE_ID and NETLIFY_API_TOKEN first — see the comment at the top of this script for where to find them.");
    process.exit(1);
  }

  const store = getStore({ name: "why-today-feedback", siteID, token });

  const { blobs } = await store.list();
  if (!blobs.length) {
    console.log("No feedback collected yet.");
    return;
  }

  const results = [];
  for (const blob of blobs) {
    const raw = await store.get(blob.key, { type: "text" });
    if (!raw) continue;
    const record = JSON.parse(raw);
    results.push({ slug: blob.key, ...record });
  }

  results.sort((a, b) => b.down - a.down);

  console.log("=== FEEDBACK SUMMARY ===\n");
  for (const r of results) {
    console.log(`${r.slug}`);
    console.log(`  👍 ${r.up}   👎 ${r.down}`);
    if (r.comments?.length) {
      r.comments.forEach((c) => console.log(`  - "${c}"`));
    }
    console.log("");
  }

  const needsWork = results.filter((r) => r.down > 0 && r.down >= r.up);
  if (needsWork.length) {
    console.log("=== SUGGESTED FIXES ===\n");
    needsWork.forEach((r) => {
      const feedback = r.comments?.length ? r.comments.join("; ") : "readers marked this as needing improvement";
      console.log(`GEMINI_API_KEY="..." node scripts/regenerate-story.js ${r.slug} "${feedback}"`);
    });
  } else {
    console.log("No stories currently need regeneration based on feedback.");
  }
}

main().catch((err) => {
  console.error("Script failed:", err.message);
  process.exit(1);
});
