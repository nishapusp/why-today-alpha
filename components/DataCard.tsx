"use client";

import { useState } from "react";
import { KeyNumber } from "@/lib/types";

export default function DataCardGrid({
  numbers,
  tint,
  deep,
  accent,
}: {
  numbers: KeyNumber[];
  tint?: string;
  deep?: string;
  accent?: string;
}) {
  const [openLabel, setOpenLabel] = useState<string | null>(null);

  if (!numbers?.length) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 my-6">
      {numbers.map((n) => {
        const hasHistory = Boolean(n.previousValue);
        const isOpen = openLabel === n.label;

        return (
          <button
            key={n.label}
            onClick={() => hasHistory && setOpenLabel(isOpen ? null : n.label)}
            className={`text-left rounded-xl p-4 transition-all ${isOpen ? "col-span-2" : ""} ${hasHistory ? "active:scale-[0.98]" : ""}`}
            style={{ background: tint ?? "var(--surface)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-xl font-semibold" style={{ color: deep ?? "var(--navy)" }}>
                {n.value}
              </p>
              {hasHistory && (
                <span className="text-[10px] mt-1" style={{ color: accent ?? deep }}>
                  {isOpen ? "▾" : "vs. past ›"}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1">{n.label}</p>

            {isOpen && hasHistory && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-mono text-sm font-semibold text-[var(--text-secondary)]">{n.previousValue}</p>
                    <p className="text-[10px] text-[var(--text-secondary)]">{n.previousLabel || "Previously"}</p>
                  </div>
                  <span style={{ color: accent ?? deep }}>→</span>
                  <div>
                    <p className="font-mono text-sm font-semibold" style={{ color: deep ?? "var(--navy)" }}>{n.value}</p>
                    <p className="text-[10px] text-[var(--text-secondary)]">Now</p>
                  </div>
                </div>
                {n.trendNote && (
                  <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">{n.trendNote}</p>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
