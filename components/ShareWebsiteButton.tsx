"use client";

import { useState } from "react";

/**
 * Shares the SITE itself, not any particular story — for when someone
 * wants to invite a friend to Why Today generally. Reuses the exact
 * share mechanics ShareButton.tsx already has working (Web Share API
 * with the card image, falling back to text-only, falling back to a
 * wa.me deep link) rather than inventing a new pattern, just pointed at
 * the site-level card (public/cards/site-share.png, built once per
 * deploy by generate-share-cards.js) and the homepage URL instead of a
 * story's.
 */
export default function ShareWebsiteButton({
  className,
  iconOnly = false,
}: {
  className?: string;
  iconOnly?: boolean; // compact circular icon button, no text label — for placing directly on the home page hero banner rather than a menu list
}) {
  const [busy, setBusy] = useState(false);

  async function fetchCard(): Promise<File | null> {
    try {
      const res = await fetch("/cards/site-share.png");
      if (!res.ok) return null;
      const blob = await res.blob();
      return new File([blob], "why-today.png", { type: "image/png" });
    } catch {
      return null;
    }
  }

  async function share() {
    if (busy) return;
    setBusy(true);
    const url = window.location.origin;
    // Catchy, standalone caption — not tied to any one story, since this
    // is inviting someone to the app itself.
    const fullMessage = `📊 Banking, economy & markets — verified, explained, in 1 minute a day.\n\nI've been using Why Today to stay on top of financial news without the noise. Worth a look:\n\n${url}`;
    try {
      if (navigator.share) {
        const card = await fetchCard();
        if (card) {
          try {
            await navigator.share({ files: [card], text: fullMessage });
            return;
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            // fall through to text-only share below
          }
        }
        await navigator.share({ title: "Why Today", text: fullMessage, url });
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(fullMessage)}`, "_blank", "noopener");
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.error("Share failed:", err);
      }
    } finally {
      setBusy(false);
    }
  }

  if (iconOnly) {
    return (
      <button
        onClick={share}
        disabled={busy}
        aria-label="Share Why Today"
        title="Share Why Today"
        className={
          className ??
          "inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-colors disabled:opacity-60"
        }
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="18" cy="5" r="3" stroke="white" strokeWidth={1.8} />
          <circle cx="6" cy="12" r="3" stroke="white" strokeWidth={1.8} />
          <circle cx="18" cy="19" r="3" stroke="white" strokeWidth={1.8} />
          <path d="M8.6 10.5L15.4 6.5M8.6 13.5L15.4 17.5" stroke="white" strokeWidth={1.8} strokeLinecap="round" />
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={share}
      disabled={busy}
      className={
        className ??
        "flex items-center gap-3 w-full px-3 py-3 rounded-lg text-[14.5px] font-medium hover:bg-[var(--surface)] transition-colors disabled:opacity-60"
      }
      style={{ color: "var(--text-primary)" }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="18" cy="5" r="3" stroke="var(--navy)" strokeWidth={1.6} />
        <circle cx="6" cy="12" r="3" stroke="var(--navy)" strokeWidth={1.6} />
        <circle cx="18" cy="19" r="3" stroke="var(--navy)" strokeWidth={1.6} />
        <path d="M8.6 10.5L15.4 6.5M8.6 13.5L15.4 17.5" stroke="var(--navy)" strokeWidth={1.6} strokeLinecap="round" />
      </svg>
      {busy ? "Sharing..." : "Share Why Today"}
    </button>
  );
}
