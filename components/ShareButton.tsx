"use client";

import { useState } from "react";

/**
 * Share a story to WhatsApp (or anywhere, via the native share sheet).
 *
 * Strategy, best first:
 * 1. Web Share API WITH the pre-rendered card image (/cards/<slug>.png) —
 *    on Android/iOS this opens the share sheet and WhatsApp receives the
 *    actual 1080x1350 branded card plus the link.
 * 2. Web Share API text-only — if the browser can't share files.
 * 3. wa.me deep link with headline + URL — desktop / older browsers. The
 *    link preview still shows the card because og:image points at it.
 */
export default function ShareButton({
  slug,
  headline,
  accent,
}: {
  slug: string;
  headline: string;
  accent?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function share() {
    if (busy) return;
    setBusy(true);
    const url = `${window.location.origin}/story/${slug}`;
    const text = `${headline}\n\nRead why it matters on Why Today:`;
    try {
      // 1. Try sharing the actual card image.
      if (navigator.share) {
        let files: File[] | undefined;
        try {
          const res = await fetch(`/cards/${slug}.png`);
          if (res.ok) {
            const blob = await res.blob();
            const file = new File([blob], `why-today-${slug}.png`, {
              type: "image/png",
            });
            if (!navigator.canShare || navigator.canShare({ files: [file] })) {
              files = [file];
            }
          }
        } catch {
          /* card missing — fall through to text share */
        }
        await navigator.share(
          files ? { files, text: `${text} ${url}` } : { title: headline, text, url }
        );
        return;
      }
      // 3. No Web Share API at all — WhatsApp web deep link.
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
        "_blank",
        "noopener"
      );
    } catch {
      // User closed the share sheet — not an error.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={share}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm active:scale-95 transition-transform disabled:opacity-60"
      style={{ background: accent || "var(--accent)" }}
      aria-label="Share this story"
    >
      {/* share-arrow icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
        <path d="M16 6l-4-4-4 4" />
        <path d="M12 2v13" />
      </svg>
      {busy ? "Sharing…" : "Share"}
    </button>
  );
}
