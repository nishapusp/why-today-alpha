import { getStore } from "@netlify/blobs";

export type ReadingLevel = "quick" | "understand" | "deep";
const LEVEL_RANK: Record<ReadingLevel, number> = { quick: 1, understand: 2, deep: 3 };

export interface UserPreferences {
  defaultReadingLevel?: ReadingLevel;
  streakCount: number;
  lastVisitDate: string; // YYYY-MM-DD, in IST
  readSlugs: string[]; // stories the user has opened — hidden from the feed once read
  readLevels: Record<string, ReadingLevel>; // deepest tier reached per story
  quizCorrect: number; // cumulative, across all stories
  quizTotal: number;
  termsEncountered: string[]; // distinct glossary terms from opened stories' knowledgeChain
}

const DEFAULTS: UserPreferences = {
  streakCount: 0,
  lastVisitDate: "",
  readSlugs: [],
  readLevels: {},
  quizCorrect: 0,
  quizTotal: 0,
  termsEncountered: [],
};

function store() {
  return getStore("why-today-user-preferences");
}

function todayIST(): string {
  // Editions are dated in IST; keep streak logic on the same clock.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}

export async function getPreferences(userId: string): Promise<UserPreferences> {
  try {
    const raw = await store().get(userId, { type: "text" });
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function savePreferences(userId: string, prefs: Partial<UserPreferences>): Promise<UserPreferences> {
  const current = await getPreferences(userId);
  const updated = { ...current, ...prefs };
  await store().set(userId, JSON.stringify(updated));
  return updated;
}

export async function markStoryRead(userId: string, slug: string, terms?: string[]): Promise<UserPreferences> {
  const current = await getPreferences(userId);
  const alreadyRead = current.readSlugs.includes(slug);
  const mergedTerms = terms?.length
    ? Array.from(new Set([...current.termsEncountered, ...terms]))
    : current.termsEncountered;
  if (alreadyRead && mergedTerms.length === current.termsEncountered.length) return current;
  const updated = {
    ...current,
    readSlugs: alreadyRead ? current.readSlugs : [...current.readSlugs, slug],
    termsEncountered: mergedTerms,
  };
  await store().set(userId, JSON.stringify(updated));
  return updated;
}

/** Keeps the DEEPEST level reached per story — reading Deep Dive after
 * Quick shouldn't downgrade the score if they later peek at Quick again. */
export async function recordReadingLevel(userId: string, slug: string, level: ReadingLevel): Promise<UserPreferences> {
  const current = await getPreferences(userId);
  const existing = current.readLevels[slug];
  if (existing && LEVEL_RANK[existing] >= LEVEL_RANK[level]) return current;
  const updated = { ...current, readLevels: { ...current.readLevels, [slug]: level } };
  await store().set(userId, JSON.stringify(updated));
  return updated;
}

export async function recordQuizResult(userId: string, correct: number, total: number): Promise<UserPreferences> {
  const current = await getPreferences(userId);
  const updated = {
    ...current,
    quizCorrect: current.quizCorrect + correct,
    quizTotal: current.quizTotal + total,
  };
  await store().set(userId, JSON.stringify(updated));
  return updated;
}

/**
 * Learning score — a mix of reading depth, quiz accuracy, streak
 * consistency, and glossary terms encountered, per the 2026-07-13
 * decision to combine all three signals rather than pick one.
 * Deliberately whole numbers with round-ish weights so it's legible
 * ("that quiz question was worth 3 points") rather than an opaque
 * formula — legibility matters more than precision for a motivational
 * number like this.
 */
export function computeLearningScore(prefs: UserPreferences): number {
  const depthPoints = Object.values(prefs.readLevels).reduce(
    (sum, level) => sum + { quick: 2, understand: 5, deep: 10 }[level],
    0
  );
  const quizPoints = prefs.quizCorrect * 3;
  const streakPoints = prefs.streakCount * 5;
  const termsPoints = prefs.termsEncountered.length * 1;
  return depthPoints + quizPoints + streakPoints + termsPoints;
}

/**
 * Call once per page load (server-side) for a signed-in user. Updates the
 * streak based on calendar days (IST) since their last visit:
 * - same day as last visit: streak unchanged
 * - exactly one day later: streak +1
 * - more than one day gap: streak resets to 1
 * - first ever visit: streak starts at 1
 */
export async function recordVisitAndGetStreak(userId: string): Promise<number> {
  const prefs = await getPreferences(userId);
  const today = todayIST();

  if (prefs.lastVisitDate === today) {
    return prefs.streakCount || 1;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const newStreak = prefs.lastVisitDate === yesterdayStr ? (prefs.streakCount || 0) + 1 : 1;

  await savePreferences(userId, { streakCount: newStreak, lastVisitDate: today });
  return newStreak;
}
