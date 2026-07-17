"use client";

import { useState } from "react";
import { TimeMachine as TimeMachineData } from "@/lib/types";
import { CategoryStyle } from "@/lib/categoryStyle";
import type { TermDefinition } from "@/lib/glossaryLookup";
import type { Story } from "@/lib/types";
import InlineTermHighlighter from "@/components/InlineTermHighlighter";

/**
 * Time Machine — the temporal spine of a story.
 *
 * 2026-07-17: redesigned per explicit request from a rigid 6-checkpoint
 * format (yesterday/lastMonth/lastYear/tenYearsAgo/today/future) to a
 * flexible "pastEvents" list — forcing an event into every fixed
 * interval produced weak/padded content when nothing significant
 * actually happened right at that checkpoint; a flexible list surfaces
 * only the events that genuinely mattered, clustered wherever real
 * history actually clusters. Renders BOTH shapes: new stories use
 * data.pastEvents (rendered here with tap-to-expand term highlighting,
 * reusing InlineTermHighlighter — the exact same mechanism the story
 * summary already uses, not a new pattern), while every already-
 * published story still has the old fixed keys and renders exactly as
 * before — this is additive, not a breaking migration of historical
 * data.
 *
 * Reads top-to-bottom like time travel toward today: the long view
 * first, accelerating into TODAY (the emphasized node), then one dashed
 * step into the future. The spine + node structure is meaningful, not
 * decorative — this content genuinely IS a sequence.
 *
 * Renders nothing if data is absent (older stories) so archive pages stay
 * clean. Client-side because it owns its own on-demand share button for
 * the -tm.png card — see ShareButton.tsx for why that card isn't bundled
 * into the default story share anymore.
 */

const OLD_STEPS: { key: "tenYearsAgo" | "lastYear" | "lastMonth" | "yesterday" | "today" | "future"; label: string }[] = [
  { key: "tenYearsAgo", label: "10 years ago" },
  { key: "lastYear", label: "Last year" },
  { key: "lastMonth", label: "Last month" },
  { key: "yesterday", label: "Yesterday" },
  { key: "today", label: "Today" },
  { key: "future", label: "What happens next?" },
];

export default function TimeMachine({
  data,
  cat,
  slug,
  linkBase = "/story",
  terms,
  story,
}: {
  data?: TimeMachineData;
  cat: CategoryStyle;
  slug: string;
  linkBase?: string; // "/story" for today, "/archive/2026-07-08" for an archived day
  terms?: TermDefinition[]; // for tap-to-expand highlighting on pastEvents' detail text — same mechanism the story summary already uses
  story?: Story; // required by InlineTermHighlighter's live-expand API call
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!data) return null;

  // New flexible format: needs at least 2 real events plus the two
  // anchors to feel like a genuine arc, not a fragment.
  const events = Array.isArray(data.pastEvents) ? data.pastEvents.filter((e) => e?.detail?.trim()) : [];
  const hasFlexibleFormat = events.length >= 2 && !!data.today?.trim() && !!data.future?.trim();

  // Old fixed format — unchanged from before, for every already-
  // published story that doesn't have pastEvents.
  const oldSteps = OLD_STEPS.filter((s) => (data[s.key] || "").trim());
  const hasOldFormat = !hasFlexibleFormat && oldSteps.length >= 3;

  if (!hasFlexibleFormat && !hasOldFormat) return null; // too sparse either way

  function buildFullMessage(): string {
    const url = `${window.location.origin}${linkBase}/${slug}`;
    return `How this story evolved over time — via Why Today\n\n${url}\n\nGet the latest banking, economy & finance news in 1 minute — all in one place — on whytoday.in`;
  }

  async function shareTimeline() {
    if (busy) return;
    setBusy(true);
    // 2026-07-17: was always /story/${slug} — same 404-on-archived-story
    // bug as ShareButton.tsx, fixed the same way.
    const fullMessage = buildFullMessage();
    try {
      if (navigator.share) {
        let file: File | null = null;
        try {
          const res = await fetch(`/cards/${slug}-tm.png`);
          if (res.ok) {
            const blob = await res.blob();
            file = new File([blob], `why-today-${slug}-time-machine.png`, { type: "image/png" });
          }
        } catch {
          // fall through to text-only share below
        }
        if (file) {
          try {
            await navigator.share({ files: [file], text: fullMessage });
            return;
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            // fall through to text-only share below
          }
        }
        await navigator.share({ title: "Time Machine", text: fullMessage, url: `${window.location.origin}${linkBase}/${slug}` });
        return;
      }
      window.open(
        `https://wa.me/?text=${encodeURIComponent(fullMessage)}`,
        "_blank",
        "noopener"
      );
    } catch {
      // user closed the share sheet — not an error
    } finally {
      setBusy(false);
    }
  }

  // 2026-07-17: same WhatsApp-broadcast-list gap as ShareButton.tsx — see
  // that file's header comment for the full explanation. Broadcast lists
  // can't be reached via any share sheet, so the workaround is manually
  // attaching a saved image inside the list, which loses the caption
  // this button normally bundles — this copies it to the clipboard so
  // it can be pasted in alongside the manually-attached image.
  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(buildFullMessage());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable/blocked — button just won't confirm.
    }
  }

  return (
    <section
      aria-label="Time Machine: how this story evolved over time"
      className="rounded-2xl border border-[var(--border)] p-5 mb-8 overflow-hidden"
      style={{ background: cat.tint }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p className="text-xs font-mono uppercase tracking-wide" style={{ color: cat.deep }}>
          ⏳ Time Machine
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={shareTimeline}
            disabled={busy}
            aria-label="Share this timeline"
            className="text-[11px] font-semibold rounded-full px-2.5 py-1 disabled:opacity-60"
            style={{ background: "rgba(255,255,255,0.55)", color: cat.deep }}
          >
            {busy ? "Sharing…" : "↗ Share timeline"}
          </button>
          <button
            onClick={copyCaption}
            aria-label="Copy caption and link (for broadcast lists)"
            title="Copy caption and link — paste into WhatsApp when attaching a saved image to a broadcast list"
            className="inline-flex items-center justify-center w-6 h-6 rounded-full"
            style={{ background: "rgba(255,255,255,0.55)", color: cat.deep }}
          >
            {copied ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="12" height="12" rx="2" />
                <path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <p className="text-[13px] mb-5" style={{ color: cat.deep, opacity: 0.75 }}>
        How today&rsquo;s news fits into the bigger picture
      </p>

      <ol className="relative m-0 p-0 list-none">
        {(hasFlexibleFormat
          ? [
              ...events.map((e) => ({ key: e.period, label: e.period, isToday: false, isFuture: false, headline: e.headline, detail: e.detail })),
              { key: "today", label: "Today", isToday: true, isFuture: false, headline: undefined, detail: data.today },
              { key: "future", label: "What happens next?", isToday: false, isFuture: true, headline: undefined, detail: data.future },
            ]
          : oldSteps.map((s) => ({
              key: s.key,
              label: s.label,
              isToday: s.key === "today",
              isFuture: s.key === "future",
              headline: undefined as string | undefined,
              detail: data[s.key] as string,
            }))
        ).map((node, i, arr) => {
          const isLast = i === arr.length - 1;
          return (
            <li key={node.key} className="relative pl-7 pb-5 last:pb-0">
              {/* connector to the next node — dashed once time turns speculative */}
              {!isLast && (
                <span
                  aria-hidden
                  className="absolute left-[7px] top-4 bottom-0 w-0"
                  style={{
                    borderLeft: node.isToday
                      ? `2px dashed ${cat.accent}`
                      : `2px solid ${cat.accent}55`,
                  }}
                />
              )}
              {/* node */}
              <span
                aria-hidden
                className="absolute left-0 top-[3px] rounded-full"
                style={
                  node.isToday
                    ? {
                        width: "16px",
                        height: "16px",
                        background: cat.accent,
                        boxShadow: `0 0 0 4px ${cat.accent}33`,
                      }
                    : node.isFuture
                      ? {
                          width: "12px",
                          height: "12px",
                          left: "2px",
                          background: "transparent",
                          border: `2px dashed ${cat.accent}`,
                        }
                      : {
                          width: "10px",
                          height: "10px",
                          left: "3px",
                          background: `${cat.accent}`,
                          opacity: 0.55,
                        }
                }
              />
              <p
                className={`font-mono uppercase tracking-wide mb-1 ${node.isToday ? "text-xs font-semibold" : "text-[11px]"}`}
                style={{ color: node.isToday ? cat.accent : cat.deep, opacity: node.isToday ? 1 : 0.8 }}
              >
                {node.label}
              </p>
              {node.headline && (
                <p className="text-[13px] font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>
                  {node.headline}
                </p>
              )}
              {/* 2026-07-17: new-format event details get the same tap-to-
                  expand term highlighting the story summary already uses —
                  reusing InlineTermHighlighter directly rather than a new
                  pattern. Falls back to plain text if terms/story weren't
                  passed in (e.g. an older call site), and always plain text
                  for today/future (anchors, not "past events" to explore
                  deeper) and for the old fixed format. */}
              {hasFlexibleFormat && !node.isToday && !node.isFuture && terms && terms.length > 0 && story ? (
                <div className="text-sm [&_p]:mb-0 [&_p]:text-[var(--text-primary)] [&_p]:leading-relaxed [&_p]:break-words">
                  <InlineTermHighlighter text={node.detail} terms={terms} story={story} accent={cat.accent} deep={cat.deep} />
                </div>
              ) : (
                <p
                  className={`leading-relaxed break-words ${node.isToday ? "text-[15px] font-medium text-[var(--text-primary)]" : "text-sm text-[var(--text-primary)]"}`}
                  style={node.isFuture ? { opacity: 0.85, fontStyle: "italic" } : undefined}
                >
                  {node.detail}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
