import { Edition, Story } from "./types";
import editionData from "@/data/edition.json";

/**
 * Reads today's edition directly from data/edition.json, which lives in
 * this repo. You (or later, an automated job) update that file daily and
 * push it to GitHub — Netlify redeploys automatically on every push.
 *
 * No external service, no API keys, no auth required.
 */
export async function getLatestEdition(): Promise<Edition> {
  return editionData as Edition;
}

export async function getStoryBySlug(slug: string): Promise<Story | undefined> {
  const edition = await getLatestEdition();
  return edition.stories.find((s) => s.slug === slug);
}
