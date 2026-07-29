import { Story } from "@/lib/types";

// ~150 words/minute — a comfortable, unhurried narration pace, not a
// speed-read.
const WORDS_PER_SECOND = 2.5;

/**
 * Builds a spoken-narration script sized to roughly fit totalSeconds of
 * audio: the headline always plays in full, then whole sentences from
 * whyCare are appended while they still fit the time budget — never cut
 * off mid-sentence.
 */
export function buildNarrationScript(story: Story, totalSeconds: number): string {
  const targetWords = Math.max(8, Math.round(totalSeconds * WORDS_PER_SECOND));

  const headline = story.headline.trim();
  let script = /[.?!]$/.test(headline) ? headline : `${headline}.`;
  let wordCount = script.split(/\s+/).length;

  const sentences = story.whyCare.trim().split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const sentenceWords = sentence.split(/\s+/).length;
    if (wordCount + sentenceWords > targetWords) break;
    script += ` ${sentence}`;
    wordCount += sentenceWords;
  }

  return script;
}
