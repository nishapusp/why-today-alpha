/**
 * Date helpers for story publication stamps (story.generatedAt).
 * All comparisons are done in IST, matching the edition's day boundary.
 */

const IST = "Asia/Kolkata";

function istDayString(d: Date): string {
  // en-CA gives YYYY-MM-DD, which compares correctly as a string.
  return d.toLocaleDateString("en-CA", { timeZone: IST });
}

/** "10 Jul" — short label for cards and meta rows. */
export function formatStoryDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: IST,
  });
}

/** True when the story was generated on a previous IST day. */
export function isFromEarlierDay(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return istDayString(d) < istDayString(new Date());
}
