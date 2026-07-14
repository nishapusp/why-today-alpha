import fs from "fs";
import path from "path";
import { getArchiveIndex, getLatestEdition } from "@/lib/getData";

export interface SearchStoryHit {
  kind: "story";
  headline: string;
  category: string;
  date: string; // YYYY-MM-DD
  slug: string;
  href: string;
}

export interface SearchTermHit {
  kind: "term";
  term: string;
  definition: string;
  href: string;
}

export type SearchHit = SearchStoryHit | SearchTermHit;

const ARCHIVE_DIR = path.join(process.cwd(), "data", "archive");
const GLOSSARY_PATH = path.join(process.cwd(), "data", "glossary.json");

/**
 * Builds the full search index at request time. Cheap at current scale
 * (a handful of archive days, a few hundred glossary terms at most) — if
 * the archive grows large this should move to a build-time generated JSON
 * instead of reading every file per request.
 */
export async function getSearchIndex(): Promise<SearchHit[]> {
  const hits: SearchHit[] = [];
  const seenSlugDate = new Set<string>();

  // Today's edition first, so a same-day story isn't skipped if it hasn't
  // rolled into the archive index yet.
  try {
    const latest = await getLatestEdition();
    for (const story of latest.stories) {
      const key = `${latest.date}:${story.slug}`;
      if (seenSlugDate.has(key)) continue;
      seenSlugDate.add(key);
      hits.push({
        kind: "story",
        headline: story.headline,
        category: story.category,
        date: latest.date,
        slug: story.slug,
        href: `/story/${story.slug}`,
      });
    }
  } catch {
    // no latest edition available — fine, archive-only search still works
  }

  // Archived days.
  const archiveIndex = await getArchiveIndex();
  for (const entry of archiveIndex) {
    try {
      const raw = fs.readFileSync(path.join(ARCHIVE_DIR, `${entry.date}.json`), "utf8");
      const day = JSON.parse(raw) as { stories?: { headline: string; category: string; slug: string }[] };
      for (const story of day.stories ?? []) {
        const key = `${entry.date}:${story.slug}`;
        if (seenSlugDate.has(key)) continue;
        seenSlugDate.add(key);
        hits.push({
          kind: "story",
          headline: story.headline,
          category: story.category,
          date: entry.date,
          slug: story.slug,
          href: `/archive/${entry.date}/${story.slug}`,
        });
      }
    } catch {
      // skip unreadable/malformed day file rather than fail the whole index
    }
  }

  // Glossary terms.
  try {
    const raw = fs.readFileSync(GLOSSARY_PATH, "utf8");
    const terms = JSON.parse(raw) as { term: string; definition: string }[];
    for (const t of terms) {
      hits.push({
        kind: "term",
        term: t.term,
        definition: t.definition,
        href: `/glossary#${encodeURIComponent(t.term)}`,
      });
    }
  } catch {
    // no glossary yet — fine
  }

  return hits;
}
