"use client";

import { useState } from "react";
import Link from "next/link";
import { Story } from "@/lib/types";
import { getCategoryStyle } from "@/lib/categoryStyle";

export default function Top10List({ stories }: { stories: Story[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const top10 = stories.slice(0, 10);

  return (
    <div className="flex flex-col gap-3">
      {top10.map((story, i) => {
        const isOpen = openIndex === i;
        const cat = getCategoryStyle(story.category);

        return (
          <div
            key={story.slug}
            className="rounded-2xl overflow-hidden transition-shadow"
            style={{ background: cat.tint, border: "1px solid rgba(0,0,0,0.04)" }}
          >
            <button
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-center gap-3 py-3.5 px-4 text-left min-w-0"
            >
              <span
                className="font-mono text-[11px] font-semibold shrink-0 w-5"
                style={{ color: cat.deep }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-base shrink-0">{cat.icon}</span>
              <span className="text-[14px] leading-snug flex-1 min-w-0 text-[var(--text-primary)] font-medium break-words">
                {story.headline}
              </span>
              <span
                className="text-xs shrink-0 ml-1"
                style={{ color: cat.deep }}
              >
                {isOpen ? "▾" : "›"}
              </span>
            </button>

            {isOpen && (
              <div className="px-4 pb-4">
                <span
                  className="inline-block text-[10.5px] font-semibold uppercase tracking-wide rounded-full px-2.5 py-1 mb-3"
                  style={{ background: "rgba(255,255,255,0.65)", color: cat.deep }}
                >
                  {cat.icon} {story.category}
                </span>

                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-3">
                  {story.summary}
                </p>

                {story.knowledgeChain?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 mb-3.5">
                    {story.knowledgeChain.slice(0, 3).map((node, j) => (
                      <span key={node} className="flex items-center gap-1.5 max-w-full">
                        <span
                          className="text-[11px] font-medium rounded-lg px-2.5 py-1 break-words"
                          style={{ background: "rgba(255,255,255,0.65)", color: "var(--text-primary)" }}
                        >
                          {node}
                        </span>
                        {j < Math.min(story.knowledgeChain.length, 3) - 1 && (
                          <span className="text-[11px] shrink-0" style={{ color: cat.accent }}>
                            →
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                <Link
                  href={`/story/${story.slug}`}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-full text-white transition-transform active:scale-[0.97]"
                  style={{ background: cat.accent }}
                >
                  Full story <span>→</span>
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
