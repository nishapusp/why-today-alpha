"use client";

import { useState } from "react";

interface KnowledgeChainProps {
  chain: string[];
  variant?: "teaser" | "full";
}

/**
 * The visual proof of the Bible's "no concept exists in isolation" principle.
 * Teaser: compact, used on homepage story cards.
 * Full: interactive, used on the story page — clicking a node reveals a
 * one-line explanation of *why* that link exists.
 */
export default function KnowledgeChain({ chain, variant = "teaser" }: KnowledgeChainProps) {
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
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <p className="text-xs font-mono uppercase tracking-wide text-[var(--text-secondary)] mb-4">
        Knowledge Chain — tap a concept
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {chain.map((node, i) => (
          <span key={node} className="flex items-center gap-2">
            <button
              onClick={() => setActive(active === i ? null : i)}
              className={`text-sm font-mono px-3 py-1.5 rounded-full border transition-colors ${
                active === i
                  ? "bg-[var(--navy)] text-white border-[var(--navy)]"
                  : "border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--navy)]"
              }`}
            >
              {node}
            </button>
            {i < chain.length - 1 && (
              <span className="text-[var(--text-secondary)]">→</span>
            )}
          </span>
        ))}
      </div>
      {active !== null && (
        <div className="mt-4 text-sm text-[var(--text-secondary)] border-t border-[var(--border)] pt-3 animate-in fade-in duration-200">
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
