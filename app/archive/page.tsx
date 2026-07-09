import Link from "next/link";
import { getArchiveIndex } from "@/lib/getData";

export default async function ArchiveIndexPage() {
  const index = await getArchiveIndex();

  // Group by "Month Year" for readability once this list gets long.
  const groups = new Map<string, typeof index>();
  for (const entry of index) {
    const label = new Date(entry.date + "T00:00:00").toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 overflow-x-hidden">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors w-fit mb-3"
        >
          ← Back to today
        </Link>
        <h1 className="font-display text-xl text-[var(--text-primary)] mb-1">Archive</h1>
        <p className="text-xs text-[var(--text-secondary)]">
          {index.length} day{index.length === 1 ? "" : "s"} of past editions
        </p>
      </div>

      {index.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          No archived editions yet — they&apos;ll start appearing here the day after this feature goes live.
        </p>
      )}

      {[...groups.entries()].map(([monthLabel, entries]) => (
        <div key={monthLabel}>
          <h2 className="text-xs font-mono uppercase tracking-wide text-[var(--text-secondary)] mb-2">
            {monthLabel}
          </h2>
          <ul className="divide-y divide-[var(--border)] rounded-2xl overflow-hidden border border-[var(--border)]">
            {entries.map((entry) => (
              <li key={entry.date}>
                <Link
                  href={`/archive/${entry.date}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-hover,rgba(0,0,0,0.02))] transition-colors"
                >
                  <span className="text-sm text-[var(--text-primary)] font-medium">
                    {entry.date}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] truncate text-right">
                    {entry.themeTitle} · {entry.storyCount} stories
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </main>
  );
}
