"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Gesture layer for story pages: swipe left → next story, swipe right →
 * previous story, Inshorts-style, while the homepage stays a scannable
 * list. The list is for choosing; the deck is for reading through.
 *
 * Deliberately conservative gesture detection so it never fights vertical
 * scrolling or the horizontal key-number carousels:
 *  - horizontal delta must exceed 70px AND be 1.6x the vertical delta
 *  - swipes starting on elements inside a horizontally scrollable
 *    container are ignored
 * Falls back gracefully: the tap-based previous/next cards remain at the
 * bottom of every story.
 */
export default function SwipeNavigator({
  prevHref,
  nextHref,
  position,
  accent,
  children,
}: {
  prevHref?: string;
  nextHref?: string;
  position?: { index: number; total: number };
  accent: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);
  const ignore = useRef(false);
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Make the neighbor pages instant when the swipe lands.
    if (nextHref) router.prefetch(nextHref);
    if (prevHref) router.prefetch(prevHref);
  }, [router, nextHref, prevHref]);

  function insideHorizontalScroller(el: EventTarget | null): boolean {
    let node = el as HTMLElement | null;
    while (node && node !== document.body) {
      // Only a container that can actually scroll sideways counts.
      // Merely overflowing (e.g. main/body with overflow-x-hidden) must
      // NOT swallow the gesture — that bug made every swipe a no-op.
      if (node.scrollWidth > node.clientWidth + 4) {
        const ox = window.getComputedStyle(node).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    ignore.current = insideHorizontalScroller(e.target);
  }

  function navigate(dir: "left" | "right", href: string) {
    if (reducedMotion.current) {
      router.push(href);
      return;
    }
    setLeaving(dir);
    window.setTimeout(() => router.push(href), 160);
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!start.current || ignore.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    if (dx < 0 && nextHref) navigate("left", nextHref);
    else if (dx > 0 && prevHref) navigate("right", prevHref);
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        transition: "transform 160ms ease, opacity 160ms ease",
        transform: leaving
          ? `translateX(${leaving === "left" ? "-6%" : "6%"})`
          : undefined,
        opacity: leaving ? 0 : 1,
      }}
    >
      {children}

      {position && position.total > 1 && (
        <div className="fixed bottom-4 inset-x-0 z-40 flex justify-center pointer-events-none">
          <span
            className="pointer-events-auto flex items-center gap-2 text-[11px] font-mono rounded-full px-3 py-1.5 border backdrop-blur-md"
            style={{
              borderColor: "var(--border)",
              background: "color-mix(in srgb, var(--surface) 82%, transparent)",
              color: "var(--text-secondary)",
            }}
          >
            <span style={{ opacity: prevHref ? 1 : 0.25, color: accent }}>‹</span>
            {position.index} / {position.total}
            <span style={{ opacity: nextHref ? 1 : 0.25, color: accent }}>›</span>
            <span className="ml-1 hidden sm:inline">swipe for next</span>
          </span>
        </div>
      )}
    </div>
  );
}
