"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getCategoryStyle } from "@/lib/categoryStyle";
import type { QuickRead } from "@/lib/types";

/**
 * Quick Reads — the swipe feed (was "Pulse", renamed 2026-07-15 to match
 * the /api/quick-reads route it already read from). Deliberately a
 * different register from the flagship story pages: extractive, not
 * verified/deep-dived (see scripts/generate-quick-reads.js), so it's
 * visually distinct on purpose — no Knowledge Chain, no deep-dive CTA, no
 * "Verified against sources" badge, just a headline, a short blurb, the
 * outlets covering it, and a link out. Keeping that boundary honest was
 * the whole point of building this as a separate surface rather than
 * folding it into the flagship list.
 *
 * Swipe-up-for-next is native CSS scroll-snap on a full-height container —
 * no gesture library needed, works identically on touch, wheel, and
 * keyboard, and respects the user's own scroll physics rather than
 * fighting it with custom JS.
 */
export default function QuickReadsFeed() {
  const [items, setItems] = useState<QuickRead[] | null>(null);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/quick-reads")
      .then((r) => r.json())
      .then((data) => setItems(data.items || []))
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !items?.length) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollTop / el.clientHeight);
      setActive(Math.min(Math.max(idx, 0), items.length - 1));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [items]);

  if (error) {
    return (
      <EmptyState
        title="Quick Reads is taking a breather"
        body="Couldn't load the feed just now. Check your connection and try again."
      />
    );
  }

  if (items === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--navy-deep)]">
        <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        body="Quick Reads refreshes through the day as major financial and market-moving stories break. Check back soon."
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-screen overflow-y-scroll snap-y snap-mandatory no-scrollbar overscroll-y-contain"
    >
      {items.map((item) => (
        <QuickReadCard key={item.id} item={item} />
      ))}

      {/* Progress ticks — reuses the bottom nav's gold-hairline active
          indicator language rather than inventing a new motif. Positioned
          within the image region, not vertically centered across the
          whole screen, since the bottom portion is now a white panel
          where light ticks wouldn't read against a light background. */}
      <div className="fixed right-2.5 top-[20%] flex flex-col gap-1.5 z-20">
        {items.map((_, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full transition-all duration-300"
            style={{
              height: i === active ? "18px" : "8px",
              background: i === active ? "var(--gold)" : "rgba(255,255,255,0.5)",
              boxShadow: i === active ? "none" : "0 0 2px rgba(0,0,0,0.3)",
            }}
          />
        ))}
      </div>

      {/* Was positioned at top-3, which sat directly underneath the
          global sticky header (z-50) from app/layout.tsx and was
          therefore invisible/untappable — this is a full-screen route
          but the header still renders above it. Pushed below the
          header's height and raised above it in z-index so it's
          reliably visible and tappable as the way back to Home. */}
      <Link
        href="/"
        aria-label="Back to today's stories"
        className="fixed top-[60px] left-3 z-[60] w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white text-lg"
      >
        ✕
      </Link>
    </div>
  );
}

function QuickReadCard({ item }: { item: QuickRead }) {
  const style = getCategoryStyle(item.category);
  const corroborated = item.corroboratedBy.length >= 2;

  // Whole card opens the source link now (matches the flagship
  // StoryCard's existing whole-card-tappable pattern, per explicit
  // request — was previously only the small "Read full story" button).
  // The button below stops propagation so tapping it directly doesn't
  // also fire this handler and open a second tab.
  const open = () => {
    if (item.link) window.open(item.link, "_blank", "noopener,noreferrer");
  };

  return (
    <section
      className="h-screen w-full snap-start relative flex flex-col overflow-hidden bg-white cursor-pointer"
      onClick={open}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") open();
      }}
    >
      {/* Top: image (or a category-tinted gradient + icon fallback when
          no image was fetchable — never a blank state). Reduced from the
          first version's 52% to 42% — the panel below needed more room
          once the snippet came back, and every element in it is now
          line-clamped so total height is bounded regardless of how long
          a given headline/snippet actually is (the "goes out of screen"
          fix — clamping, not just resizing, since content length varies
          per story). */}
      <div className="relative h-[36%] w-full shrink-0 overflow-hidden">
        {item.image ? (
          <img
            src={item.image.url}
            alt={item.image.alt}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-[90px] opacity-25"
            style={{ background: `linear-gradient(180deg, ${style.tint}, ${style.accent})` }}
          >
            {style.icon}
          </div>
        )}
        <div
          className="absolute inset-x-0 bottom-0 h-14"
          style={{ background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.95))" }}
        />
      </div>

      {/* Bottom: white info panel, matching the app's own light design
          system. min-h-0 + overflow-hidden on this flex child, combined
          with line-clamp on the text elements below, is what actually
          guarantees the panel never exceeds its allotted space no matter
          how long a real headline or snippet turns out to be. */}
      <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col px-5 pt-4 pb-4 -mt-4 rounded-t-3xl bg-white z-10">
        <div className="flex items-center gap-2 flex-wrap mb-2.5 shrink-0">
          <span
            className="inline-flex items-center gap-1 text-[10.5px] font-mono font-medium px-2.5 py-1 rounded-full"
            style={{ background: style.tint, color: style.deep }}
          >
            {style.icon} {item.category}
          </span>
          {corroborated && (
            <span
              className="inline-flex items-center gap-1 text-[10.5px] font-mono font-medium px-2.5 py-1 rounded-full"
              style={{ background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              ✓ {item.corroboratedBy.length} outlets
            </span>
          )}
        </div>

        {/* Headline — regular weight, not bold, matching the flagship
            story page's own h1 (which also doesn't set a bold weight
            class) rather than the punchier semibold this had before.
            Serif display face at a normal weight is what reads as
            "serious and premium" rather than a heavy attention-grabbing
            weight. line-clamp-3 bounds it regardless of length. */}
        <h2
          className="font-display text-[20px] leading-[1.32] font-normal line-clamp-3 shrink-0"
          style={{ color: "var(--navy)" }}
        >
          {item.headline}
        </h2>

        {/* Short blurb — a genuine "quick read" alongside the headline,
            not just a bare title. Sourced from the same RSS snippet
            already fetched for free (see generate-quick-reads.js) — no
            new cost. Many get nulled upstream (near-duplicate of the
            headline, or the source RSS item just had no description —
            common for wire/transcript items like earnings-call pieces).
            Rather than rendering nothing in that case (which left a
            blank gap under the headline), fall back to a short
            source+category line so every card always shows *some*
            description. line-clamp-10 (not 2, and not the earlier
            interim value of 6) is deliberate: the enrichment prompt now
            targets ~85 words (up to 120), and the panel — widened to
            64% of the screen after also shrinking the image to 36% —
            has real room for that. Clamping too tight was cutting the
            blurb short AND leaving the panel's remaining height empty,
            which is what caused the "blank space" look in the first
            place. */}
        {/* Font raised from 13.5px to 15.5px per explicit request, to help
            fill the remaining space at a given word count. line-clamp
            raised to 12 (not lowered) to compensate — a bigger font fits
            fewer characters per line, so the same ~85-120 word blurb
            needs MORE lines to display in full at this size, not fewer. */}
        <p
          className="text-[15.5px] leading-relaxed line-clamp-12 mt-1.5 shrink-0 text-justify"
          style={{ color: "var(--text-secondary)" }}
        >
          {item.snippet || `More on this ${item.category.toLowerCase()} story from ${item.source}.`}
        </p>

        <div className="flex items-center justify-between gap-3 mt-4 shrink-0">
          <span className="text-[12.5px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>
            {item.source}
          </span>
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 inline-flex items-center gap-1 text-[12.5px] font-semibold px-4 py-2 rounded-full"
              style={{ background: "var(--gold)", color: "white" }}
            >
              Read full story ↗
            </a>
          )}
        </div>

        {/* Safe-area padding for iOS/Android gesture bar — the bottom nav
            is hidden on this route, so this card owns its own bottom
            inset instead. */}
        <div className="shrink-0" style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
      </div>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="h-screen flex flex-col items-center justify-center text-center px-8 bg-[var(--navy-deep)]">
      <p className="font-display text-xl text-white mb-2">{title}</p>
      <p className="text-[14px] text-white/60 max-w-xs mb-6">{body}</p>
      <Link
        href="/"
        className="text-[13px] font-semibold px-5 py-2.5 rounded-full"
        style={{ background: "var(--gold)", color: "var(--navy-deep)" }}
      >
        Back to today&apos;s stories
      </Link>
    </div>
  );
}
