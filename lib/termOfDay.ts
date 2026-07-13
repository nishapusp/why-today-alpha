import fs from "fs";
import path from "path";

export interface GlossaryEntry {
  term: string;
  definition: string;
  dateAdded?: string;
}

/**
 * Picks one term per day, deterministically, cycling through the whole
 * cumulative glossary rather than always surfacing the newest — the
 * glossary grows slowly (a handful of terms per story), so "newest" would
 * repeat the same few terms for days. A stable per-date hash means the
 * same term shows all day (no flicker on refresh) and the pick is
 * reproducible without needing to store any "last shown" state.
 */
export function getTermOfTheDay(): GlossaryEntry | null {
  let glossary: GlossaryEntry[];
  try {
    glossary = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data", "glossary.json"), "utf8")
    );
  } catch {
    return null;
  }
  if (!glossary.length) return null;

  const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  let hash = 0;
  for (let i = 0; i < todayISO.length; i++) {
    hash = (hash * 31 + todayISO.charCodeAt(i)) >>> 0;
  }
  return glossary[hash % glossary.length];
}
