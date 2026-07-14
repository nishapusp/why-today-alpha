import { Category, Edition, Sentiment, Story, Trend } from "./types";
import editionDataRaw from "@/data/edition.json";
import fs from "fs";
import path from "path";

const VALID_TRENDS: Trend[] = ["up", "down", "flat"];
const VALID_SENTIMENTS: Sentiment[] = ["positive", "caution", "critical", "neutral"];
const VALID_CATEGORIES: Category[] = ["Banking", "Economy", "Technology", "World", "Policy", "Corporate", "IPO", "Startups", "AI"];

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
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : undefined,
    quiz: Array.isArray(raw.quiz) ? (raw.quiz as Story["quiz"]) : undefined,
    // Fields below were once silently stripped here (same bug class that
    // previously ate generatedAt and quiz): anything the generator writes
    // MUST be listed or the UI never sees it, even though it's in the JSON.
    timeMachine:
      raw.timeMachine && typeof raw.timeMachine === "object"
        ? (raw.timeMachine as Story["timeMachine"])
        : undefined,
    chart:
      raw.chart && typeof raw.chart === "object"
        ? (raw.chart as Story["chart"])
        : undefined,
    notificationHeadline:
      typeof raw.notificationHeadline === "string" ? raw.notificationHeadline : undefined,
    whatsappHeadline:
      typeof raw.whatsappHeadline === "string" ? raw.whatsappHeadline : undefined,
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

/**
 * Homepage feed with yesterday's leftovers filling the gap.
 *
 * Early in the day only a few of the day's ~15 stories have been generated
 * (the pipeline runs in batches), so the feed would otherwise look sparse.
 * Instead we fill remaining slots with yesterday's stories that haven't
 * been replaced yet — same slug appearing in today's edition means it WAS
 * replaced, so it's excluded here to avoid a duplicate.
 *
 * Carried-over stories keep their original `generatedAt`, which is what
 * Top10List already uses to render the "↺ from <date>" badge — no new
 * field needed, and no risk of a carried story being mistaken for new.
 * As later batches land in edition.json, they push carry-overs out
 * automatically once the total reaches 15.
 */
export async function getHomeStories(): Promise<Story[]> {
  const edition = await getLatestEdition();
  const todaysStories = edition.stories.slice(0, 15);
  if (todaysStories.length >= 15) return todaysStories;

  const archiveIndex = await getArchiveIndex();
  const yesterdayEntry = archiveIndex.find((e) => e.date !== edition.date);
  if (!yesterdayEntry) return todaysStories;

  const yesterdayEdition = await getArchivedEdition(yesterdayEntry.date);
  if (!yesterdayEdition) return todaysStories;

  const todaySlugs = new Set(todaysStories.map((s) => s.slug));
  const carryOver = yesterdayEdition.stories.filter((s) => !todaySlugs.has(s.slug));

  return [...todaysStories, ...carryOver].slice(0, 15);
}

// --- Archive -----------------------------------------------------------
// data/archive/index.json + data/archive/YYYY-MM-DD.json are written by
// scripts/roll-date.js at midnight IST (see that script for details). All
// reads here run at BUILD time (generateStaticParams / page render during
// `next build`), which has full filesystem access — the resulting pages
// are then fully static, so none of this runs at request time.

export interface ArchiveIndexEntry {
  date: string; // YYYY-MM-DD
  themeTitle: string;
  numberValue: string;
  numberLabel: string;
  storyCount: number;
}

const ARCHIVE_DIR = path.join(process.cwd(), "data", "archive");
const ARCHIVE_INDEX_PATH = path.join(ARCHIVE_DIR, "index.json");

export async function getArchiveIndex(): Promise<ArchiveIndexEntry[]> {
  try {
    const raw = fs.readFileSync(ARCHIVE_INDEX_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ArchiveIndexEntry[]) : [];
  } catch {
    return []; // no archive yet — fine, e.g. brand-new deployment
  }
}

export async function getArchivedEdition(date: string): Promise<Edition | null> {
  // Guard against path traversal — date must be a plain YYYY-MM-DD.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  try {
    const raw = fs.readFileSync(path.join(ARCHIVE_DIR, `${date}.json`), "utf8");
    return normalizeEdition(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function getArchivedStoryBySlug(date: string, slug: string): Promise<Story | undefined> {
  const edition = await getArchivedEdition(date);
  return edition?.stories.find((s) => s.slug === slug);
}
