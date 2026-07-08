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
            type="button"
            onClick={() => setOpenLabel(isOpen ? null : n.label)}
            className={`text-left rounded-xl p-4 transition-all active:scale-[0.98] ${isOpen ? "col-span-2" : ""}`}
            style={{ background: tint ?? "var(--surface)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-xl font-semibold" style={{ color: deep ?? "var(--navy)" }}>
                {n.value}
              </p>
              <span className="text-[10px] mt-1 shrink-0" style={{ color: accent ?? deep }}>
                {isOpen ? "▾" : hasHistory ? "vs. past ›" : "›"}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-1">{n.label}</p>

            {isOpen && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                {hasHistory ? (
                  <>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-[var(--text-secondary)] break-words">{n.previousValue}</p>
                        <p className="text-[10px] text-[var(--text-secondary)] break-words">{n.previousLabel || "Previously"}</p>
                      </div>
                      <span className="shrink-0" style={{ color: accent ?? deep }}>→</span>
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold break-words" style={{ color: deep ?? "var(--navy)" }}>{n.value}</p>
                        <p className="text-[10px] text-[var(--text-secondary)]">Now</p>
                      </div>
                    </div>
                    {n.trendNote && (
                      <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed text-justify">{n.trendNote}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)] italic">
                    No historical comparison available for this figure yet.
                  </p>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
