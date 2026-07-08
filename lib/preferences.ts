import { getStore } from "@netlify/blobs";

export interface UserPreferences {
  defaultReadingLevel?: "quick" | "understand" | "deep";
  streakCount: number;
  lastVisitDate: string; // YYYY-MM-DD, in IST
  readSlugs: string[]; // stories the user has opened — hidden from the feed once read
}

const DEFAULTS: UserPreferences = {
  streakCount: 0,
  lastVisitDate: "",
  readSlugs: [],
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

export async function markStoryRead(userId: string, slug: string): Promise<UserPreferences> {
  const current = await getPreferences(userId);
  if (current.readSlugs.includes(slug)) return current;
  const updated = { ...current, readSlugs: [...current.readSlugs, slug] };
  await store().set(userId, JSON.stringify(updated));
  return updated;
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
