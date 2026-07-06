"use client";

import { useState } from "react";
import { WonderingItem } from "@/lib/types";

export default function WonderingBlock({
  items,
  accent = "var(--soft-blue)",
  tint,
  deep = "var(--navy)",
}: {
  items: WonderingItem[];
  accent?: string;
  tint?: string;
  deep?: string;
}) {
  const [open, setOpen] = useState<number | null>(0);

  if (!items?.length) return null;

  return (
    <div className="rounded-2xl p-6" style={{ background: tint ?? "rgba(0,0,0,0.03)" }}>
      <p className="font-display text-lg mb-4" style={{ color: deep }}>
        💭 If you're wondering…
      </p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="last:border-0 pb-2 last:pb-0"
            style={{ borderBottom: i < items.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none" }}
          >
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full text-left flex items-center justify-between gap-3 py-1.5"
            >
              <span className="text-[15px] font-medium text-[var(--text-primary)]">
                {item.q}
              </span>
              <span className="text-lg leading-none shrink-0" style={{ color: accent }}>
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
