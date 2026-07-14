"use client";

import { Fragment, useState } from "react";
import type { TermDefinition } from "@/lib/glossaryLookup";
import type { Story } from "@/lib/types";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits text into plain-string and matched-term segments. Only the FIRST
 * occurrence of each term is marked, longest terms matched first so e.g.
 * "interest rate" doesn't get pre-empted by a shorter "rate" match.
 */
function splitOnTerms(text: string, terms: string[]): { text: string; termIndex: number | null }[] {
  if (terms.length === 0) return [{ text, termIndex: null }];

  const ordered = terms
    .map((t, i) => ({ term: t, i }))
    .filter((t) => t.term.trim().length > 0)
    .sort((a, b) => b.term.length - a.term.length);

  const pattern = new RegExp(`(${ordered.map((t) => escapeRegExp(t.term)).join("|")})`, "gi");

  const segments: { text: string; termIndex: number | null }[] = [];
  const claimed = new Set<number>();
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const matchedStr = match[0];
    const termEntry = ordered.find((t) => t.term.toLowerCase() === matchedStr.toLowerCase());
    if (!termEntry || claimed.has(termEntry.i)) continue; // already highlighted this term once

    segments.push({ text: text.slice(lastEnd, match.index), termIndex: null });
    segments.push({ text: matchedStr, termIndex: termEntry.i });
    claimed.add(termEntry.i);
    lastEnd = match.index + matchedStr.length;
  }
  segments.push({ text: text.slice(lastEnd), termIndex: null });

  return segments;
}

export default function InlineTermHighlighter({
  text,
  terms,
  story,
  accent,
  deep,
}: {
  text: string;
  terms: TermDefinition[];
  story: Story;
  accent: string;
  deep: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<Record<number, "loading" | "error" | "idle">>({});

  const termNames = terms.map((t) => t.term);
  const segments = splitOnTerms(text, termNames);
  const activeTerm = active !== null ? terms[active] : null;

  async function handleTap(i: number) {
    if (active === i) {
      setActive(null);
      return;
    }
    setActive(i);
    if (explanations[i] || status[i] === "loading") return;

    setStatus((s) => ({ ...s, [i]: "loading" }));
    try {
      const res = await fetch("/api/expand-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: "knowledgeChainNode",
          slug: story.slug,
          node: terms[i].term,
          headline: story.headline,
          summary: story.summary,
          category: story.category,
        }),
      });
      const data = await res.json();
      if (res.ok && data.content) {
        setExplanations((e) => ({ ...e, [i]: data.content }));
        setStatus((s) => ({ ...s, [i]: "idle" }));
      } else {
        setStatus((s) => ({ ...s, [i]: "error" }));
      }
    } catch {
      setStatus((s) => ({ ...s, [i]: "error" }));
    }
  }

  return (
    <div className="mb-6">
      <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed text-justify">
        {segments.map((seg, i) =>
          seg.termIndex === null ? (
            <Fragment key={i}>{seg.text}</Fragment>
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => handleTap(seg.termIndex as number)}
              className="font-medium border-b transition-colors"
              style={{
                borderBottomStyle: "dotted",
                borderBottomWidth: 1.5,
                borderColor: active === seg.termIndex ? accent : deep,
                color: active === seg.termIndex ? accent : "var(--text-primary)",
              }}
            >
              {seg.text}
            </button>
          )
        )}
      </p>

      {activeTerm && (
        <div
          className="mt-2.5 rounded-xl p-3.5 text-[13.5px] leading-relaxed"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <span className="font-semibold" style={{ color: deep }}>
            {activeTerm.term}
          </span>
          {activeTerm.definition && <span className="text-[var(--text-primary)]">: {activeTerm.definition}</span>}

          <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            {status[active as number] === "loading" && (
              <span className="inline-flex items-center gap-2" style={{ color: deep }}>
                <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                Thinking through this connection…
              </span>
            )}
            {status[active as number] === "error" && (
              <span className="text-[var(--text-secondary)]">
                Live explanation unavailable right now — the term definition above still applies.
              </span>
            )}
            {active !== null && explanations[active] && status[active] !== "loading" && (
              <span className="text-[var(--text-secondary)]">{explanations[active]}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
