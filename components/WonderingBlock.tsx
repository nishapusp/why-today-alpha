"use client";

import { useState } from "react";
import { WonderingItem } from "@/lib/types";

export default function WonderingBlock({ items }: { items: WonderingItem[] }) {
  const [open, setOpen] = useState<number | null>(0);

  if (!items?.length) return null;

  return (
    <div className="rounded-2xl bg-[var(--soft-blue)]/[0.06] border border-[var(--soft-blue)]/20 p-6">
      <p className="font-display text-lg text-[var(--navy)] mb-4">
        💭 If you're wondering…
      </p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="border-b border-[var(--soft-blue)]/15 last:border-0 pb-2 last:pb-0">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full text-left flex items-center justify-between gap-3 py-1.5"
            >
              <span className="text-[15px] font-medium text-[var(--text-primary)]">
                {item.q}
              </span>
              <span className="text-[var(--soft-blue)] text-lg leading-none shrink-0">
                {open === i ? "–" : "+"}
              </span>
            </button>
            {open === i && (
              <p className="text-sm text-[var(--text-secondary)] pb-2 pr-6 leading-relaxed">
                {item.a}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
