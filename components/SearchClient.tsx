"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SearchHit } from "@/lib/searchIndex";

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function matches(hit: SearchHit, query: string): boolean {
  const q = normalize(query);
  if (hit.kind === "story") {
    return normalize(hit.headline).includes(q) || normalize(hit.category).includes(q);
  }
  return normalize(hit.term).includes(q) || normalize(hit.definition).includes(q);
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SearchClient({ index }: { index: SearchHit[] }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    const filtered = index.filter((hit) => matches(hit, query));
    // Stories first (most likely intent), then terms — cap so a broad query
    // like "rbi" doesn't dump hundreds of rows at once.
    const stories = filtered.filter((h) => h.kind === "story").slice(0, 20);
    const terms = filtered.filter((h) => h.kind === "term").slice(0, 15);
    return [...stories, ...terms];
  }, [query, index]);

  return (
    <div>
      <div className="relative mb-6">
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="10.5" cy="10.5" r="6.5" stroke="var(--navy)" strokeWidth="2" />
          <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="var(--navy)" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stories & glossary terms…"
          className="w-full pl-11 pr-4 py-3 rounded-xl border text-[15px] outline-none focus:ring-2"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {query.trim().length >= 2 && results.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)] text-center py-8">
          No stories or terms match &ldquo;{query}&rdquo;.
        </p>
      )}

      {query.trim().length > 0 && query.trim().length < 2 && (
        <p className="text-sm text-[var(--text-secondary)] text-center py-8">
          Keep typing — at least 2 characters.
        </p>
      )}

      <div className="space-y-2">
        {results.map((hit) =>
          hit.kind === "story" ? (
            <Link
              key={`story-${hit.date}-${hit.slug}`}
              href={hit.href}
              className="block rounded-xl border p-3.5 transition-colors hover:border-[var(--navy)]"
              style={{ borderColor: "var(--border)", background: "white" }}
            >
              <p
                className="text-[11px] font-mono tracking-wide uppercase mb-1"
                style={{ color: "var(--text-secondary)" }}
              >
                {hit.category} · {formatDate(hit.date)}
              </p>
              <p className="text-[15px] font-medium leading-snug" style={{ color: "var(--text-primary)" }}>
                {hit.headline}
              </p>
            </Link>
          ) : (
            <Link
              key={`term-${hit.term}`}
              href={hit.href}
              className="block rounded-xl border p-3.5 transition-colors hover:border-[var(--navy)]"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <p
                className="text-[11px] font-mono tracking-wide uppercase mb-1"
                style={{ color: "var(--soft-blue)" }}
              >
                Glossary term
              </p>
              <p className="text-[15px] font-medium leading-snug mb-1" style={{ color: "var(--text-primary)" }}>
                {hit.term}
              </p>
              <p className="text-[13px] leading-snug line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                {hit.definition}
              </p>
            </Link>
          )
        )}
      </div>
    </div>
  );
}
