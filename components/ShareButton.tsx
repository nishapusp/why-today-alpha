"use client";

import { useState } from "react";

/**
 * Share a story to WhatsApp (or anywhere, via the native share sheet).
 *
 * Strategy, best first:
 * 1. Web Share API with the headline card (/cards/<slug>.png).
 * 2. Web Share API text-only — if the browser can't share files at all.
 * 3. wa.me deep link with headline + URL — desktop / older browsers. The
 *    link preview still shows the card because og:image points at it.
 *
 * The Time Machine card is intentionally NOT bundled here — sharing "this
 * story" and sharing "how this story evolved over time" are different
 * impulses from the reader, so the TM card gets its own on-demand share
 * button right on the Time Machine block instead (see TimeMachine.tsx).
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

  async function fetchCard(path: string, name: string): Promise<File | null> {
    try {
      const res = await fetch(path);
      if (!res.ok) return null;
      const blob = await res.blob();
      return new File([blob], name, { type: "image/png" });
    } catch {
      return null;
    }
  }

  async function share() {
    if (busy) return;
    setBusy(true);
    const url = `${window.location.origin}/story/${slug}`;
    const text = `${headline}\n\nRead why it matters on Why Today:`;
    try {
      if (navigator.share) {
        const main = await fetchCard(`/cards/${slug}.png`, `why-today-${slug}.png`);

        // Prefer the actual card. canShare() is known to be unreliably
        // conservative on some mobile browsers — it can report false even
        // when share() with files would have worked — so we attempt the
        // real share first and only drop to text on a genuine failure,
        // rather than pre-filtering on canShare() and silently skipping
        // the image.
        if (main) {
          try {
            await navigator.share({ files: [main], text: `${text} ${url}` });
            return;
          } catch (err) {
            // AbortError = user closed the share sheet themselves — don't
            // retry, that's not a failure to fall back from.
            if (err instanceof DOMException && err.name === "AbortError") return;
            // Any other error (unsupported file share, in-app-browser
            // restriction, etc.) — fall through to the text-only share.
          }
        }

        await navigator.share({ title: headline, text, url });
        return;
      }
      // No Web Share API at all — WhatsApp web deep link.
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
