import { KeyNumber } from "@/lib/types";

/**
 * Picks the single most compelling keyNumber for an always-visible,
 * screenshot-friendly stat at the top of the article — same "prefer a
 * real reported movement over a static figure" logic as
 * scripts/generate-share-cards.js's pickKeyNumber, kept as a separate
 * copy since that script is CommonJS and not importable from app code.
 */
export function pickHeroNumber(numbers?: KeyNumber[]): KeyNumber | null {
  const usable = (numbers || []).filter((n) => n && n.value && n.label);
  if (usable.length === 0) return null;
  const withRealChange = usable.find(
    (n) => n.previousValue && String(n.previousValue).trim() !== String(n.value).trim()
  );
  return withRealChange || usable.find((n) => n.previousValue) || usable[0];
}
