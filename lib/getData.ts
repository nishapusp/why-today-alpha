import { Category, Edition, Sentiment, Story, Trend } from "./types";
import editionDataRaw from "@/data/edition.json";

const VALID_TRENDS: Trend[] = ["up", "down", "flat"];
const VALID_SENTIMENTS: Sentiment[] = ["positive", "caution", "critical", "neutral"];
const VALID_CATEGORIES: Category[] = ["Banking", "Economy", "Technology", "World", "Policy", "Corporate"];

/**
 * edition.json is generated fresh by Gemini every morning — it's real
 * content from an AI, not hand-written static data, so it won't always
 * perfectly match our strict TypeScript unions (e.g. numberTrend might
 * come back as something other than exactly "up"/"down"/"flat"). Rather
 * than trust a raw `as Edition` cast — which fails the entire production
 * BUILD if any single field is off — we normalize defensively here, so a
 * stray value degrades gracefully to a safe default instead of taking
 * the whole site down.
 */
function normalizeStory(raw: Record<string, unknown>): Story {
  const category = VALID_CATEGORIES.includes(raw.category as Category)
    ? (raw.category as Category)
    : "Economy";
  const sentiment = VALID_SENTIMENTS.includes(raw.sentiment as Sentiment)
    ? (raw.sentiment as Sentiment)
    : "neutral";

  return {
    headline: String(raw.headline ?? "Untitled story"),
    slug: String(raw.slug ?? "untitled"),
    category,
    summary: String(raw.summary ?? ""),
    quickRead: String(raw.quickRead ?? ""),
    understandRead: String(raw.understandRead ?? ""),
    deepDiveRead: String(raw.deepDiveRead ?? ""),
    whatHappened: String(raw.whatHappened ?? ""),
    whyToday: String(raw.whyToday ?? ""),
    whyCare: String(raw.whyCare ?? ""),
    whatNext: String(raw.whatNext ?? ""),
    timeline: Array.isArray(raw.timeline) ? (raw.timeline as Story["timeline"]) : undefined,
    keyNumbers: Array.isArray(raw.keyNumbers) ? (raw.keyNumbers as Story["keyNumbers"]) : [],
    knowledgeChain: Array.isArray(raw.knowledgeChain) ? (raw.knowledgeChain as string[]) : [],
    ifYoureWondering: Array.isArray(raw.ifYoureWondering) ? (raw.ifYoureWondering as Story["ifYoureWondering"]) : [],
    officialSources: Array.isArray(raw.officialSources) ? (raw.officialSources as Story["officialSources"]) : [],
    readMinutes: Number.isFinite(Number(raw.readMinutes)) ? Number(raw.readMinutes) : 3,
    sentiment,
    headlineImage: raw.headlineImage as Story["headlineImage"],
  };
}

function normalizeEdition(raw: Record<string, unknown>): Edition {
  const trend = VALID_TRENDS.includes(raw.numberTrend as Trend) ? (raw.numberTrend as Trend) : "flat";
  const stories = Array.isArray(raw.stories) ? raw.stories.map((s) => normalizeStory(s as Record<string, unknown>)) : [];

  return {
    date: String(raw.date ?? ""),
    slug: String(raw.slug ?? raw.date ?? "edition"),
    themeTitle: String(raw.themeTitle ?? ""),
    themeDescription: String(raw.themeDescription ?? ""),
    themeIcon: (raw.themeIcon as Edition["themeIcon"]) ?? "chart",
    numberValue: String(raw.numberValue ?? ""),
    numberLabel: String(raw.numberLabel ?? ""),
    numberTrend: trend,
    wordOfTheDay: raw.wordOfTheDay as Edition["wordOfTheDay"],
    podcastNotes: raw.podcastNotes as string | undefined,
    stories,
    vocabulary: Array.isArray(raw.vocabulary) ? (raw.vocabulary as Edition["vocabulary"]) : [],
    questions: Array.isArray(raw.questions) ? (raw.questions as Edition["questions"]) : [],
  };
}

/**
 * Reads today's edition directly from data/edition.json, which lives in
 * this repo. You (or later, an automated job) update that file daily and
 * push it to GitHub — Netlify redeploys automatically on every push.
 *
 * No external service, no API keys, no auth required.
 */
export async function getLatestEdition(): Promise<Edition> {
  return normalizeEdition(editionDataRaw as Record<string, unknown>);
}

export async function getStoryBySlug(slug: string): Promise<Story | undefined> {
  const edition = await getLatestEdition();
  return edition.stories.find((s) => s.slug === slug);
}
