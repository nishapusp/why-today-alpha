// app/sitemap.ts — generated at build time from the edition + archive data.
// Next.js serves this at https://whytoday.in/sitemap.xml
import fs from "fs";
import path from "path";
import type { MetadataRoute } from "next";

const BASE = "https://whytoday.in";

function readJson(p: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/archive`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE}/glossary`, changeFrequency: "daily", priority: 0.5 },
  ];

  // Today's stories
  const edition = readJson(path.join(process.cwd(), "data", "edition.json"));
  for (const s of edition?.stories ?? []) {
    if (s?.slug) {
      entries.push({
        url: `${BASE}/story/${s.slug}`,
        changeFrequency: "daily",
        priority: 0.9,
      });
    }
  }

  // Archived editions and their stories
  const archiveDir = path.join(process.cwd(), "data", "archive");
  let dates: string[] = [];
  try {
    dates = fs
      .readdirSync(archiveDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(".json", ""));
  } catch {
    /* no archive yet */
  }
  for (const date of dates) {
    entries.push({
      url: `${BASE}/archive/${date}`,
      changeFrequency: "monthly",
      priority: 0.6,
    });
    const day = readJson(path.join(archiveDir, `${date}.json`));
    for (const s of day?.stories ?? []) {
      if (s?.slug) {
        entries.push({
          url: `${BASE}/archive/${date}/${s.slug}`,
          changeFrequency: "monthly",
          priority: 0.5,
        });
      }
    }
  }
  return entries;
}
