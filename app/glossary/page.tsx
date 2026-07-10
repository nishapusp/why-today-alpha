import fs from "fs";
import path from "path";
import Link from "next/link";
import { GlossaryEntry } from "@/lib/types";

export const revalidate = 300;

export const metadata = {
  title: "Glossary — Why Today",
  description:
    "Every banking, finance, and policy term Why Today has explained — a growing plain-language glossary for bankers and UPSC aspirants.",
};

function loadGlossary(): GlossaryEntry[] {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "data", "glossary.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((g) => g && g.term && g.definition);
  } catch {
    return [];
  }
}

export default function GlossaryPage() {
  const glossary = loadGlossary().sort((a, b) =>
    a.term.localeCompare(b.term, "en", { sensitivity: "base" })
  );

  // Group alphabetically for scannability once the list grows.
  const groups = new Map<string, GlossaryEntry[]>();
  for (const entry of glossary) {
    const letter = /^[a-z]/i.test(entry.term) ? entry.term[0].toUpperCase() : "#";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(entry);
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-5"
      >
        ← Back to today
      </Link>

      <h1 className="font-display text-2xl text-[var(--text-primary)] mb-1">
        📖 Glossary
      </h1>
      <p className="text-sm text-[var(--text-secondary)] mb-8">
        {glossary.length > 0
          ? `${glossary.length} banking, finance & policy terms explained in plain language — growing with every edition.`
          : "Terms explained in Why Today stories will collect here, growing with every edition."}
      </p>

      {glossary.length === 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            The glossary starts filling up from the next edition onwards. Check
            back tomorrow!
          </p>
        </div>
      )}

      <div className="space-y-8">
        {[...groups.entries()].map(([letter, entries]) => (
          <section key={letter}>
            <h2
              className="font-display text-lg mb-3 pb-1 border-b border-[var(--border)]"
              style={{ color: "var(--navy)" }}
            >
              {letter}
            </h2>
            <dl className="space-y-4">
              {entries.map((entry) => (
                <div
                  key={entry.term}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <dt className="font-semibold text-[15px] text-[var(--text-primary)] mb-1">
                    {entry.term}
                  </dt>
                  <dd className="text-sm leading-relaxed text-[var(--text-secondary)]">
                    {entry.definition}
                  </dd>
                  {entry.dateAdded && (
                    <dd className="text-[11px] mt-2 text-[var(--text-secondary)] opacity-60">
                      Added {entry.dateAdded}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </main>
  );
}
