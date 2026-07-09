"use client";

import { useState } from "react";
import Link from "next/link";
import { Story } from "@/lib/types";
import { getCategoryStyle } from "@/lib/categoryStyle";
import AudioReader from "./AudioReader";

export default function Top10List({
  stories,
  readSlugs = [],
  linkBase = "/story",
  trackReads = true,
}: {
  stories: Story[];
  readSlugs?: string[];
  linkBase?: string; // "/story" for today, "/archive/2026-07-08" for an archived day
  trackReads?: boolean; // false for archived days — no point marking old stories "read" against today's streak
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [newlyRead, setNewlyRead] = useState<Set<string>>(new Set());
  const [showRead, setShowRead] = useState(false);

  const all = stories.slice(0, 15);
  const alreadyReadSet = new Set(readSlugs);
  const hiddenCount = all.filter((s) => alreadyReadSet.has(s.slug)).length;

  // Stories read in a PAST session are hidden by default (feed feels fresh).
  // Stories opened just now, in THIS session, stay visible with a ✓ badge —
  // never yanked out from under someone actively reading it.
  const visible = showRead ? all : all.filter((s) => !alreadyReadSet.has(s.slug));

  async function markRead(slug: string) {
    if (!trackReads) return;
    if (newlyRead.has(slug)) return;
    setNewlyRead((prev) => new Set(prev).add(slug));
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markRead: slug }),
      });
    } catch {
      // Non-fatal — worst case it just doesn't persist as read for next visit.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((story, i) => {
        const isOpen = openIndex === i;
        const cat = getCategoryStyle(story.category);
        const isRead = newlyRead.has(story.slug);

        return (
          <div
            key={story.slug}
            className="rounded-2xl overflow-hidden transition-shadow"
            style={{ background: cat.tint, border: "1px solid rgba(0,0,0,0.04)" }}
          >
            {i === 0 && story.headlineImage ? (
              <button
                onClick={() => {
                  const opening = !isOpen;
                  setOpenIndex(opening ? i : null);
                  if (opening) markRead(story.slug);
                }}
                className="relative w-full text-left block"
                style={{ aspectRatio: "4 / 3" }}
              >
                <img
                  src={story.headlineImage.url}
                  alt={story.headlineImage.alt}
                  loading="lazy"
                  className="w-full h-full object-cover absolute inset-0"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.35) 65%, rgba(0,0,0,.82) 100%)",
                  }}
                />
                <span
                  className="absolute top-2.5 right-3 text-[9px] text-white/75"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                >
                  📷 {story.headlineImage.credit}
                </span>
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="text-[11px] font-bold text-white rounded-full px-2.5 py-1" style={{ background: "rgba(255,255,255,0.22)", backdropFilter: "blur(6px)" }}>
                    01
                  </span>
                  <span className="text-[10.5px] font-bold uppercase tracking-wide text-white rounded-full px-2.5 py-1" style={{ background: "rgba(255,255,255,0.22)", backdropFilter: "blur(6px)" }}>
                    {cat.icon} {story.category}
                  </span>
                </div>
                <div className="absolute left-0 right-0 bottom-0 p-4">
                  <h3 className="font-display font-semibold text-white text-[17px] leading-snug mb-1" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.3)" }}>
                    {story.headline}
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/75">{story.readMinutes} min read</span>
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white"
                      style={{ background: "rgba(255,255,255,0.22)", backdropFilter: "blur(6px)" }}
                    >
                      {isOpen ? "▾" : "›"}
                    </span>
                  </div>
                </div>
              </button>
            ) : (
              <button
                onClick={() => {
                  const opening = !isOpen;
                  setOpenIndex(opening ? i : null);
                  if (opening) markRead(story.slug);
                }}
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
                {isRead && (
                  <span className="text-[10px] shrink-0" style={{ color: cat.accent }} title="Won't show next visit">
                    ✓
                  </span>
                )}
                <span
                  className="text-xs shrink-0 ml-1"
                  style={{ color: cat.deep }}
                >
                  {isOpen ? "▾" : "›"}
                </span>
              </button>
            )}

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

                <div className="mb-3.5">
                  <AudioReader
                    text={`${story.headline}. ${story.summary}`}
                    label="Listen"
                    accent={cat.accent}
                  />
                </div>

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
                  href={`${linkBase}/${story.slug}`}
                  onClick={() => markRead(story.slug)}
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

      {hiddenCount > 0 && !showRead && (
        <button
          onClick={() => setShowRead(true)}
          className="text-xs text-[var(--text-secondary)] underline py-2 text-center"
        >
          {hiddenCount} already read today · Show them
        </button>
      )}
      {showRead && hiddenCount > 0 && (
        <button
          onClick={() => setShowRead(false)}
          className="text-xs text-[var(--text-secondary)] underline py-2 text-center"
        >
          Hide already-read stories
        </button>
      )}
    </div>
  );
}
