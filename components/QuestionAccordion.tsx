"use client";

import { useState } from "react";
import { QAItem } from "@/lib/types";

export default function QuestionAccordion({ items }: { items: QAItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 h-full">
      <p className="text-xs font-mono uppercase tracking-wide text-[var(--text-secondary)] mb-4">
        People Are Asking
      </p>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="border-b border-[var(--border)] last:border-0">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between gap-3 py-2.5 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                <span className="text-[var(--soft-blue)]">?</span>
                {item.question}
              </span>
              <span className="text-[var(--text-secondary)]">
                {open === i ? "︿" : "﹀"}
              </span>
            </button>
            {open === i && (
              <p className="text-sm text-[var(--text-secondary)] pb-3 pl-6 leading-relaxed">
                {item.answer}
              </p>
            )}
          </div>
        ))}
      </div>
      <a
        href="/questions"
        className="text-sm font-medium text-[var(--soft-blue)] mt-3 inline-block"
      >
        View All Questions →
      </a>
    </div>
  );
}
