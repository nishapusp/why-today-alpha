#!/usr/bin/env node
/**
 * scripts/archive-edition.js
 *
 * Shared by roll-date.js and generate-edition.js — both scripts can be the
 * one to notice a day has turned over, and whichever notices first must
 * archive the outgoing edition before overwriting `data/edition.json`'s
 * date. Extracted after a bug (2026-07-17 through 07-22) where
 * generate-edition.js's own date self-heal silently overwrote several
 * days' worth of finished editions without ever saving them here, because
 * only roll-date.js used to know how to archive.
 *
 * Saves the outgoing day's FINISHED edition into data/archive/<date>.json
 * and prepends a summary to data/archive/index.json (sorted newest-first,
 * de-duplicated by date, never pruned — full history is kept by design).
 * No-op if that date is already archived, or if the edition is itself a
 * stale carryover (nothing new to archive in that case).
 */

const fs = require("fs");
const path = require("path");

const ARCHIVE_DIR = path.join(__dirname, "..", "data", "archive");
const ARCHIVE_INDEX_PATH = path.join(ARCHIVE_DIR, "index.json");

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

module.exports = { archiveOutgoingEdition, ARCHIVE_DIR, ARCHIVE_INDEX_PATH };
