"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Story } from "@/lib/types";
import { getCategoryStyle } from "@/lib/categoryStyle";
import { formatStoryDate, isFromEarlierDay } from "@/lib/storyDate";
import AudioReader from "./AudioReader";

export default function Top10List({
  stories,
  readSlugs: initialReadSlugs = [],
  linkBase = "/story",
  trackReads = true,
  previewCount,
}: {
  stories: Story[];
  readSlugs?: string[];
  linkBase?: string; // "/story" for today, "/archive/2026-07-08" for an archived day
  trackReads?: boolean; // false for archived days — no point marking old stories "read" against today's streak
  previewCount?: number; // 2026-08-08: cap the initial render (home page uses this — a
  // full 15-story list stacked above several other new sections made the
  // page unreasonably long) with a "Show all" expand. Omit for the
  // uncapped behavior every existing caller (archive days, etc.) still gets.
}) {
  const { isSignedIn, isLoaded } = useUser();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [newlyRead, setNewlyRead] = useState<Set<string>>(new Set());
  const [showRead, setShowRead] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // 2026-07-17: readSlugs is now fetched client-side (below), not passed
  // pre-resolved from a server-side auth() call — that auth() call in
  // app/page.tsx was forcing the whole home page to skip ISR caching and
  // render fresh on every visit (confirmed via real PageSpeed data
  // showing ~2s of server-response latency). Starts as whatever the
  // caller passed (empty array for the common case) and updates once
  // the client-side fetch below resolves — same "loads in shortly after
  // initial paint" pattern JourneyStrip already uses successfully.
  const [readSlugs, setReadSlugs] = useState<string[]>(initialReadSlugs);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !trackReads) return;
    fetch("/api/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (Array.isArray(json?.readSlugs)) setReadSlugs(json.readSlugs);
      })
      .catch(() => {});
    // Only re-run if sign-in state changes — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  const all = stories.slice(0, 15);
  const alreadyReadSet = new Set(readSlugs);
  const hiddenCount = all.filter((s) => alreadyReadSet.has(s.slug)).length;

  // Stories read in a PAST session are hidden by default (feed feels fresh).
  // Stories opened just now, in THIS session, stay visible with a ✓ badge —
  // never yanked out from under someone actively reading it.
  const unread = showRead ? all : all.filter((s) => !alreadyReadSet.has(s.slug));
  const cappedCount = previewCount && !expanded ? Math.max(previewCount, 1) : unread.length;
  const visible = unread.slice(0, cappedCount);
  const remainingCount = unread.length - visible.length;

  async function markRead(slug: string, terms?: string[]) {
    if (!trackReads) return;
    if (newlyRead.has(slug)) return;
    setNewlyRead((prev) => new Set(prev).add(slug));
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markRead: slug, terms }),
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
              // Tapping the hero photo goes straight to the full story —
              // the image itself is the doorway, no separate button needed.
              <Link
                href={`${linkBase}/${story.slug}`}
                onClick={() => markRead(story.slug, story.knowledgeChain)}
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
                      →
                    </span>
                  </div>
                </div>
              </Link>
            ) : (
              <button
                onClick={() => {
                  const opening = !isOpen;
                  setOpenIndex(opening ? i : null);
                  if (opening) markRead(story.slug, story.knowledgeChain);
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
                {/* Photo lives on the main page now — hidden while the row is
                    collapsed, revealed on tap. Tapping the photo itself opens
                    the full story. (Skip for #1, whose hero already shows it.) */}
                {story.headlineImage && i !== 0 && (
                  <Link
                    href={`${linkBase}/${story.slug}`}
                    onClick={() => markRead(story.slug, story.knowledgeChain)}
                    className="relative block rounded-xl overflow-hidden mb-3 active:scale-[0.99] transition-transform"
                    style={{ aspectRatio: "16 / 9" }}
                  >
                    <img
                      src={story.headlineImage.url}
                      alt={story.headlineImage.alt}
                      loading="lazy"
                      className="w-full h-full object-cover absolute inset-0"
                    />
                    <div
                      className="absolute inset-0"
                      style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,.45) 100%)" }}
                    />
                    <span
                      className="absolute top-2 right-2.5 text-[9px] text-white/75"
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                    >
                      📷 {story.headlineImage.credit}
                    </span>
                    <span
                      className="absolute bottom-2 right-2.5 text-[11px] font-semibold text-white rounded-full px-2.5 py-1"
                      style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
                    >
                      Tap for full story →
                    </span>
                  </Link>
                )}
                <span
                  className="inline-block text-[10.5px] font-semibold uppercase tracking-wide rounded-full px-2.5 py-1 mb-3"
                  style={{ background: "rgba(255,255,255,0.65)", color: cat.deep }}
                >
                  {cat.icon} {story.category}
                </span>
                {formatStoryDate(story.generatedAt) && (
                  <span
                    className="inline-block text-[10.5px] font-semibold rounded-full px-2.5 py-1 mb-3 ml-1.5"
                    style={
                      isFromEarlierDay(story.generatedAt)
                        ? { background: "rgba(245,158,11,0.15)", color: "#92400e" }
                        : { background: "rgba(255,255,255,0.65)", color: cat.deep }
                    }
                  >
                    {isFromEarlierDay(story.generatedAt) ? "↺ from " : "🗓 "}
                    {formatStoryDate(story.generatedAt)}
                  </span>
                )}

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
                  onClick={() => markRead(story.slug, story.knowledgeChain)}
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

      {remainingCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-sm font-semibold text-center py-2.5 rounded-xl"
          style={{ color: "var(--navy)", background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          View all {unread.length} stories ({remainingCount} more) ↓
        </button>
      )}

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
