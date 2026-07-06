"use client";

import { useState } from "react";

interface KnowledgeChainProps {
  chain: string[];
  variant?: "teaser" | "full";
  accent?: string;
  tint?: string;
  deep?: string;
}

/**
 * The visual proof of the Bible's "no concept exists in isolation" principle.
 * Teaser: compact, used on homepage story cards.
 * Full: interactive, used on the story page — clicking a node reveals a
 * one-line explanation of *why* that link exists. Colored by the story's
 * category so each story page feels distinct rather than uniformly navy.
 */
export default function KnowledgeChain({
  chain,
  variant = "teaser",
  accent = "var(--navy)",
  tint = "var(--border)",
  deep = "var(--navy)",
}: KnowledgeChainProps) {
  const [active, setActive] = useState<number | null>(null);

  if (variant === "teaser") {
    return (
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
        {chain.slice(0, 4).map((node, i) => (
          <span key={node} className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-secondary)] whitespace-nowrap">
              {node}
            </span>
            {i < Math.min(chain.length, 4) - 1 && (
              <span className="text-[var(--text-secondary)] text-xs">→</span>
            )}
          </span>
        ))}
        {chain.length > 4 && (
          <span className="text-[11px] text-[var(--text-secondary)] ml-1">
            +{chain.length - 4} more
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-6" style={{ background: tint }}>
      <p className="text-xs font-mono uppercase tracking-wide mb-4" style={{ color: deep }}>
        Knowledge Chain — tap a concept
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {chain.map((node, i) => {
          const isActive = active === i;
          return (
            <span key={node} className="flex items-center gap-2 max-w-full">
              <button
                onClick={() => setActive(isActive ? null : i)}
                className="text-sm font-mono px-3 py-1.5 rounded-full border transition-colors break-words"
                style={
                  isActive
                    ? { background: accent, color: "#fff", borderColor: accent }
                    : { borderColor: "rgba(0,0,0,0.1)", color: "var(--text-primary)", background: "rgba(255,255,255,0.55)" }
                }
              >
                {node}
              </button>
              {i < chain.length - 1 && (
                <span className="shrink-0" style={{ color: accent }}>→</span>
              )}
            </span>
          );
        })}
      </div>
      {active !== null && (
        <div
          className="mt-4 text-sm text-[var(--text-secondary)] pt-3 animate-in fade-in duration-200"
          style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}
        >
          <strong className="text-[var(--text-primary)]">{chain[active]}</strong>{" "}
          connects to this story because changes here ripple forward into{" "}
          {chain[active + 1] ? <strong>{chain[active + 1]}</strong> : "the wider economy"}
          {chain[active - 1] ? (
            <>
              {" "}
              and follows from <strong>{chain[active - 1]}</strong>
            </>
          ) : null}
          . Understanding this link is what separates a headline from real
          insight.
        </div>
      )}
    </div>
  );
}
