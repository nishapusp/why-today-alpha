"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getCategoryStyle } from "@/lib/categoryStyle";
import type { QuickRead } from "@/lib/types";

/**
 * "Pulse" — the Quick Reads swipe feed. Deliberately a different register
 * from the flagship story pages: extractive, not verified/deep-dived (see
 * scripts/generate-quick-reads.js), so it's visually distinct on purpose —
 * no Knowledge Chain, no deep-dive CTA, no "Verified against sources"
 * badge, just a headline, the outlets covering it, and a link out. Keeping
 * that boundary honest was the whole point of building this as a separate
 * surface rather than folding it into the flagship list.
 *
 * Swipe-up-for-next is native CSS scroll-snap on a full-height container —
 * no gesture library needed, works identically on touch, wheel, and
 * keyboard, and respects the user's own scroll physics rather than
 * fighting it with custom JS.
 */
export default function PulseFeed() {
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
        title="Pulse is taking a breather"
        body="Couldn't load the feed just now. Check your connection and try again."
      />
    );
  }

  if (items === null) {
    return (
      <div className="h-dvh flex items-center justify-center bg-[var(--navy-deep)]">
        <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        body="Pulse refreshes through the day as major financial and market-moving stories break. Check back soon."
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-dvh overflow-y-scroll snap-y snap-mandatory no-scrollbar overscroll-y-contain"
    >
      {items.map((item) => (
        <PulseCard key={item.id} item={item} />
      ))}

      {/* Progress ticks — reuses the bottom nav's gold-hairline active
          indicator language rather than inventing a new motif, so this
          feature reads as part of the same product. */}
      <div className="fixed right-2.5 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-20">
        {items.map((_, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full transition-all duration-300"
            style={{
              height: i === active ? "18px" : "8px",
              background: i === active ? "var(--gold)" : "rgba(255,255,255,0.35)",
            }}
          />
        ))}
      </div>

      <Link
        href="/"
        aria-label="Back to today's stories"
        className="fixed top-3 left-3 z-20 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white text-lg"
      >
        ✕
      </Link>
    </div>
  );
}

function PulseCard({ item }: { item: QuickRead }) {
  const style = getCategoryStyle(item.category);
  const corroborated = item.corroboratedBy.length >= 2;

  return (
    <section className="h-dvh w-full snap-start relative flex flex-col justify-end overflow-hidden">
      {/* Background image, or a category-tinted gradient fallback when no
          image was fetchable — never a blank/broken image state. */}
      {item.image ? (
        <img
          src={item.image.url}
          alt={item.image.alt}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center text-[120px] opacity-20"
          style={{ background: `linear-gradient(180deg, ${style.deep}, var(--navy-deep))` }}
        >
          {style.icon}
        </div>
      )}

      {/* Gradient overlay — text legibility can't depend on the photo
          being dark enough on its own; a financial publication's cards
          need to read cleanly regardless of what image landed. */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(6,15,33,0.15) 0%, rgba(6,15,33,0.25) 45%, rgba(6,15,33,0.92) 100%)" }}
      />

      <div className="relative z-10 px-5 pb-10 pt-16 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2.5 py-1 rounded-full"
            style={{ background: style.accent, color: "#fff" }}
          >
            {style.icon} {item.category}
          </span>
          {corroborated && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-2.5 py-1 rounded-full bg-white/15 text-white backdrop-blur-sm">
              ✓ {item.corroboratedBy.length} outlets reporting
            </span>
          )}
        </div>

        <h2 className="font-display text-[26px] leading-[1.2] font-semibold text-white">
          {item.headline}
        </h2>

        {item.snippet && (
          <p className="text-[15px] leading-relaxed text-white/80">{item.snippet}</p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[13px] text-white/60 font-medium truncate">{item.source}</span>
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1 text-[13px] font-semibold px-4 py-2 rounded-full"
              style={{ background: "var(--gold)", color: "var(--navy-deep)" }}
            >
              Read full story ↗
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="h-dvh flex flex-col items-center justify-center text-center px-8 bg-[var(--navy-deep)]">
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
