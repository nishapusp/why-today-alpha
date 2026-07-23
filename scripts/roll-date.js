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
const { archiveOutgoingEdition } = require("./archive-edition");

const EDITION_PATH = path.join(__dirname, "..", "data", "edition.json");

function getTodayISO() {
  // IST, matching how editions are dated throughout the site
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
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
