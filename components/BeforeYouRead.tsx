"use client";

import { useState } from "react";
import Link from "next/link";
import type { TermDefinition } from "@/lib/glossaryLookup";

/**
 * "To understand this story" — the knowledge chain, moved to the TOP of
 * the story per reader feedback. Bankers read this way: resolve the
 * unfamiliar terms first, then the story makes sense on first pass.
 *
 * Chips expand inline to their cumulative-glossary definition. Every term
 * shown here also lives permanently at /glossary from the next build.
 */
export default function BeforeYouRead({
  terms,
  accent,
  tint,
  deep,
}: {
  terms: TermDefinition[];
  accent: string;
  tint: string;
  deep: string;
}) {
  const [open, setOpen] = useState<number | null>(null);

  if (!terms || terms.length === 0) return null;
  const active = open !== null ? terms[open] : null;

  return (
    <section
      aria-label="Terms to know before reading"
      className="rounded-2xl border p-4 mb-6"
      style={{ borderColor: tint, background: `color-mix(in srgb, ${tint} 22%, var(--surface))` }}
    >
      <p
        className="text-[10px] font-mono uppercase tracking-widest mb-2.5"
        style={{ color: deep }}
      >
        To understand this story
      </p>

      <div className="flex flex-wrap gap-1.5">
        {terms.map((t, i) => {
          const expandable = t.definition.length > 0;
          const isOpen = open === i;
          return (
            <button
              key={t.term}
              type="button"
              disabled={!expandable}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="text-[12px] font-medium px-2.5 py-1 rounded-full border transition-colors disabled:cursor-default"
              style={
                isOpen
                  ? { background: accent, borderColor: accent, color: "#fff" }
                  : { borderColor: tint, color: "var(--text-primary)", background: "var(--surface)" }
              }
            >
              {t.term}
              {expandable && <span className="ml-1 opacity-60">{isOpen ? "−" : "+"}</span>}
            </button>
          );
        })}
      </div>

      {active && active.definition && (
        <div
          className="mt-3 pt-3 border-t text-[13px] leading-relaxed"
          style={{ borderColor: tint, color: "var(--text-primary)" }}
        >
          <span className="font-semibold" style={{ color: deep }}>
            {active.term}:
          </span>{" "}
          {active.definition}
        </div>
      )}

      <Link
        href="/glossary"
        className="inline-block mt-2.5 text-[11px] hover:underline"
        style={{ color: deep }}
      >
        All terms stay in the glossary →
      </Link>
    </section>
  );
}
