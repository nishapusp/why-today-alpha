#!/usr/bin/env node
/**
 * scripts/roll-date.js
 *
 * Runs at 00:00 IST (see .github/workflows/roll-date.yml). Its ONLY job is
 * cosmetic: flip data/edition.json's `date` field to today so the site
 * never shows yesterday's date overnight, even though the actual stories
 * underneath are still yesterday's until the 6 AM generation run replaces
 * them.
 *
 * It marks the edition `stale: true` so generate-edition.js knows these
 * carried-over stories don't count toward today's target — the first
 * fresh batch generated after this replaces them outright instead of
 * appending to them.
 *
 * This script never touches story content and never calls the Gemini API.
 *
 * Usage:
 *   node scripts/roll-date.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const EDITION_PATH = path.join(__dirname, "..", "data", "edition.json");
const ARCHIVE_DIR = path.join(__dirname, "..", "data", "archive");
const ARCHIVE_INDEX_PATH = path.join(ARCHIVE_DIR, "index.json");

function getTodayISO() {
  // IST, matching how editions are dated throughout the site
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// Saves the outgoing day's FINISHED edition into data/archive/<date>.json
// and prepends a summary to data/archive/index.json (sorted newest-first,
// de-duplicated by date, never pruned — full history is kept by design).
// No-op if that date is already archived, or if the edition is itself a
// stale carryover (nothing new to archive in that case).
function archiveOutgoingEdition(edition) {
  if (!edition || !Array.isArray(edition.stories) || edition.stories.length === 0) return false;
  if (edition.stale) return false; // yesterday's content never actually refreshed — nothing new to archive

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

  const archivePath = path.join(ARCHIVE_DIR, `${edition.date}.json`);
  if (fs.existsSync(archivePath)) return false; // already archived this date

  fs.writeFileSync(archivePath, JSON.stringify(edition, null, 2));

  let index = [];
  try {
    index = JSON.parse(fs.readFileSync(ARCHIVE_INDEX_PATH, "utf8"));
    if (!Array.isArray(index)) index = [];
  } catch {
    index = [];
  }

  index = index.filter((e) => e.date !== edition.date); // de-dupe, just in case
  index.unshift({
    date: edition.date,
    themeTitle: edition.themeTitle || "",
    numberValue: edition.numberValue || "",
    numberLabel: edition.numberLabel || "",
    storyCount: edition.stories.length,
  });
  index.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

  fs.writeFileSync(ARCHIVE_INDEX_PATH, JSON.stringify(index, null, 2));
  console.log(`Archived ${edition.date} (${edition.stories.length} stories) to data/archive/${edition.date}.json`);
  return true;
}

function main() {
  if (!fs.existsSync(EDITION_PATH)) {
    console.log("No data/edition.json found yet — nothing to roll. (Run generate-edition.js first.)");
    process.exit(0);
  }

  const edition = JSON.parse(fs.readFileSync(EDITION_PATH, "utf8"));
  const today = getTodayISO();

  if (edition.date === today) {
    console.log(`edition.json is already dated ${today} — nothing to do.`);
    process.exit(0);
  }

  const archived = archiveOutgoingEdition(edition);

  console.log(`Rolling edition date: ${edition.date || "(none)"} -> ${today} (stories unchanged, marked stale for regeneration).`);
  edition.date = today;
  edition.stale = true;

  fs.writeFileSync(EDITION_PATH, JSON.stringify(edition, null, 2));

  const isCI = process.env.CI === "true";
  try {
    const cwd = path.join(__dirname, "..");
    execSync(`git add data/edition.json${archived ? " data/archive" : ""}`, { stdio: "inherit", cwd });
    execSync(`git commit -m "Roll edition date to ${today} (midnight IST)${archived ? " + archive previous day" : ""}"`, { stdio: "inherit", cwd });
    execSync("git push", { stdio: "inherit", cwd });
    console.log("Pushed — Netlify will redeploy with today's date. Fresh stories arrive at the next scheduled generation run.");
  } catch (err) {
    console.error("Git commit/push failed — file is written locally; commit and push manually if not running in CI.");
    console.error(err.message);
    if (isCI) process.exit(1);
  }
}

main();
