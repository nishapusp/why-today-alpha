"use client";

import { useState } from "react";
import { Story } from "@/lib/types";

interface KnowledgeChainProps {
  chain: string[];
  variant?: "teaser" | "full";
  accent?: string;
  tint?: string;
  deep?: string;
  story?: Story; // needed to call the live-expand relay in "full" mode
}

/**
 * The visual proof of the Bible's "no concept exists in isolation" principle.
 * Teaser: compact, used on homepage story cards.
 * Full: interactive, used on the story page — clicking a node fetches a
 * live, agent-generated explanation of *why* that link exists (falls back
 * to a simple local sentence if the relay isn't reachable).
 */
export default function KnowledgeChain({
  chain,
  variant = "teaser",
  accent = "var(--navy)",
  tint = "var(--border)",
  deep = "var(--navy)",
  story,
}: KnowledgeChainProps) {
  const [active, setActive] = useState<number | null>(null);
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<Record<number, "loading" | "error" | "idle">>({});

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

  async function handleNodeClick(i: number) {
    if (active === i) {
      setActive(null);
      return;
    }
    setActive(i);
    if (explanations[i] || status[i] === "loading" || !story) return;

    setStatus((s) => ({ ...s, [i]: "loading" }));
    try {
      const res = await fetch("/api/expand-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: "knowledgeChainNode",
          slug: story.slug,
          node: chain[i],
          headline: story.headline,
          summary: story.summary,
          category: story.category,
        }),
      });
      const data = await res.json();
      if (res.ok && data.content) {
        setExplanations((e) => ({ ...e, [i]: data.content }));
        setStatus((s) => ({ ...s, [i]: "idle" }));
      } else {
        setStatus((s) => ({ ...s, [i]: "error" }));
      }
    } catch {
      setStatus((s) => ({ ...s, [i]: "error" }));
    }
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
                onClick={() => handleNodeClick(i)}
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
          {status[active] === "loading" && (
            <span className="inline-flex items-center gap-2" style={{ color: deep }}>
              <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
              Thinking through this connection…
            </span>
          )}
          {status[active] === "error" && (
            <>
              <strong className="text-[var(--text-primary)]">{chain[active]}</strong>{" "}
              connects to this story because changes here ripple forward into{" "}
              {chain[active + 1] ? <strong>{chain[active + 1]}</strong> : "the wider economy"}.
              {" "}(live explanation unavailable right now)
            </>
          )}
          {explanations[active] && status[active] !== "loading" && (
            <span>{explanations[active]}</span>
          )}
          {!story && !explanations[active] && status[active] !== "loading" && status[active] !== "error" && (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
