import Link from "next/link";
import { GlossaryEntry } from "@/lib/termOfDay";

/**
 * Sits between Hero and the story list — "learn one thing" before "read
 * today's news," matching the financial-learning-made-easy positioning.
 * A distinct, clearly-labeled learning moment rather than a diluted news
 * story pretending to be simple: news stays as complex as the subject
 * demands, this is explicitly the beginner-friendly counterpart to it.
 */
export default function TermOfTheDay({ entry }: { entry: GlossaryEntry }) {
  return (
    <Link
      href="/glossary"
      className="block rounded-2xl px-5 py-4 ring-1 ring-[var(--gold)]/30 bg-[var(--gold)]/8 hover:bg-[var(--gold)]/12 transition-colors"
    >
      <p className="text-[11px] font-mono uppercase tracking-wide text-[var(--gold-light)] mb-1">
        📖 Term of the day
      </p>
      <p className="font-display text-base text-[var(--text-primary)] mb-0.5">{entry.term}</p>
      <p className="text-[14px] leading-relaxed text-[var(--text-secondary)]">{entry.definition}</p>
    </Link>
  );
}
