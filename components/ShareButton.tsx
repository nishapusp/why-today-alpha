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
 *
 * A second small "copy caption" button sits next to Share — added
 * 2026-07-17 after a real report that WhatsApp broadcast lists don't
 * appear as a destination in ANY share sheet (a genuine WhatsApp
 * restriction, not something this app can route around — broadcast
 * lists are deliberately excluded from both the forward picker and
 * cross-app share targets). The only reliable way to send to a
 * broadcast list is: save the card image, open the list directly inside
 * WhatsApp, and attach it there manually — but that path loses the
 * caption+link that normally travels bundled with the image via
 * navigator.share(). This button copies that exact text to the
 * clipboard so it can be pasted into WhatsApp's caption field after
 * attaching the saved image, closing that gap.
 */
export default function ShareButton({
  slug,
  headline,
  accent,
  linkBase = "/story",
}: {
  slug: string;
  headline: string;
  accent?: string;
  linkBase?: string; // "/story" for today, "/archive/2026-07-08" for an archived day
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  function buildFullMessage(): string {
    // 2026-07-17: was always /story/${slug}, which 404s for anything not
    // in today's edition — a real report of an archived story's shared
    // link being broken led here.
    const url = `${window.location.origin}${linkBase}/${slug}`;
    // Shortened per feedback: the earlier "headline + preamble line + url +
    // tagline" (4 effective lines) looked cluttered next to the card image.
    // Now just headline, link, tagline — same information, less bulk.
    return `${headline}\n\n${url}\n\nGet the latest banking, economy & finance news in 1 minute — all in one place — on whytoday.in`;
  }

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
    const fullMessage = buildFullMessage();
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
            await navigator.share({ files: [main], text: fullMessage });
            return;
          } catch (err) {
            // AbortError = user closed the share sheet themselves — don't
            // retry, that's not a failure to fall back from.
            if (err instanceof DOMException && err.name === "AbortError") return;
            // Any other error (unsupported file share, in-app-browser
            // restriction, etc.) — fall through to the text-only share.
          }
        }

        await navigator.share({ title: headline, text: fullMessage, url: `${window.location.origin}${linkBase}/${slug}` });
        return;
      }
      // No Web Share API at all — WhatsApp web deep link.
      window.open(
        `https://wa.me/?text=${encodeURIComponent(fullMessage)}`,
        "_blank",
        "noopener"
      );
    } catch {
      // User closed the share sheet — not an error.
    } finally {
      setBusy(false);
    }
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(buildFullMessage());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable/blocked — nothing more to do here,
      // the button just won't show the "Copied" confirmation.
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
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

      {/* Copy caption — for the WhatsApp-broadcast-list manual-attach
          workflow: save the image separately (long-press it, or Share ->
          Save), then paste this into WhatsApp's caption field. */}
      <button
        onClick={copyCaption}
        className="inline-flex items-center justify-center w-9 h-9 rounded-full border transition-colors active:scale-95"
        style={{ borderColor: accent || "var(--accent)", color: accent || "var(--accent)" }}
        aria-label="Copy caption and link (for broadcast lists)"
        title="Copy caption and link — paste into WhatsApp when attaching a saved image to a broadcast list"
      >
        {copied ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" />
          </svg>
        )}
      </button>
    </div>
  );
}
