"use client";

import { useState } from "react";
import Link from "next/link";
import { Story } from "@/lib/types";

const CATEGORY_ICON: Record<string, string> = {
  Banking: "🏦",
  Economy: "📈",
  Technology: "🔷",
  World: "🌐",
  Policy: "📋",
  Corporate: "🏢",
};

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "var(--emerald)",
  caution: "var(--amber)",
  critical: "var(--crimson)",
  neutral: "var(--soft-blue)",
};

export default function Top10List({ stories }: { stories: Story[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const top10 = stories.slice(0, 10);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {top10.map((story, i) => {
        const isOpen = openIndex === i;
        const color = SENTIMENT_COLOR[story.sentiment] ?? "var(--soft-blue)";
        return (
          <div key={story.slug} className="border-b border-[var(--border)] last:border-0">
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-center gap-3 py-2.5 px-3 text-left"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <span className="font-mono text-xs text-[var(--text-secondary)] w-4">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[15px] shrink-0">{CATEGORY_ICON[story.category]}</span>
              <span className="text-[13px] leading-snug flex-1 text-[var(--text-primary)]">
                {story.headline}
              </span>
              <span className="text-[var(--text-secondary)] text-xs shrink-0">
                {isOpen ? "▾" : "›"}
              </span>
            </button>

            {isOpen && (
              <div className="px-3 pb-3 pl-9" style={{ background: "rgba(59,130,246,0.04)" }}>
                <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mb-2">
                  {story.summary}
                </p>
                {story.knowledgeChain?.length > 0 && (
                  <div className="flex items-center gap-1 mb-2 overflow-x-auto no-scrollbar">
                    {story.knowledgeChain.slice(0, 3).map((node, j) => (
                      <span key={node} className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] font-mono border border-[var(--border)] rounded-full px-1.5 py-0.5 text-[var(--text-secondary)] whitespace-nowrap">
                          {node}
                        </span>
                        {j < Math.min(story.knowledgeChain.length, 3) - 1 && (
                          <span className="text-[10px] text-[var(--text-secondary)]">→</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                <Link
                  href={`/story/${story.slug}`}
                  className="text-xs font-medium text-[var(--soft-blue)]"
                >
                  Full story →
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
