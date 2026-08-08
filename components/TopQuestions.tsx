"use client";

import { useState } from "react";
import { Story } from "@/lib/types";

/**
 * Pools ifYoureWondering Q&A pairs from today's top stories into one
 * compact accordion — every story already generates these, this just
 * gives them a home outside the individual story page's own accordion.
 * One question per source story keeps this from ballooning past a
 * skimmable size on a 10+ story day.
 */
export default function TopQuestions({ stories }: { stories: Story[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const items = stories
    .filter((s) => s.ifYoureWondering && s.ifYoureWondering.length > 0)
    .slice(0, 5)
    .map((s) => ({ ...s.ifYoureWondering[0], slug: s.slug }));

  if (items.length === 0) return null;

  return (
    <div>
      <h2 className="font-display text-lg text-[var(--text-primary)] mb-1">Why today? Top questions</h2>
      <p className="text-xs text-[var(--text-secondary)] mb-3">Curated answers to the most important questions.</p>
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
        {items.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={item.slug} style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
              <button
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="w-full flex items-center justify-between gap-3 text-left px-4 py-3.5"
              >
                <span className="text-[14px] font-medium text-[var(--text-primary)]">{item.q}</span>
                <span className="text-[var(--text-secondary)] flex-shrink-0 transition-transform" style={{ transform: isOpen ? "rotate(90deg)" : "none" }}>
                  ›
                </span>
              </button>
              {isOpen && (
                <p className="px-4 pb-4 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">{item.a}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
