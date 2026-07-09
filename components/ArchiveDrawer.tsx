"use client";

import { useState } from "react";
import Link from "next/link";
import { ArchiveIndexEntry } from "@/lib/getData";

export default function ArchiveDrawer({ recentDays }: { recentDays: ArchiveIndexEntry[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-2.5 py-1.5 rounded-full border border-[var(--border)]"
      >
        🗂 Archive
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* backdrop */}
          <button
            aria-label="Close archive"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
          />

          {/* panel */}
          <div className="relative w-full max-w-xs h-full bg-[var(--background)] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border)]">
              <h2 className="font-display text-base text-[var(--text-primary)]">Past editions</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-lg leading-none px-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {recentDays.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)] py-4">
                  No archived editions yet — check back tomorrow.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {recentDays.map((entry) => (
                    <li key={entry.date}>
                      <Link
                        href={`/archive/${entry.date}`}
                        onClick={() => setOpen(false)}
                        className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl hover:bg-[var(--surface-hover,rgba(0,0,0,0.03))] transition-colors"
                      >
                        <span className="text-sm font-medium text-[var(--text-primary)]">{entry.date}</span>
                        <span className="text-xs text-[var(--text-secondary)] truncate">
                          {entry.themeTitle} · {entry.storyCount} stories
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="px-4 py-3 border-t border-[var(--border)]">
              <Link
                href="/archive"
                onClick={() => setOpen(false)}
                className="block text-center text-sm font-semibold text-[var(--gold-light,var(--text-primary))] py-2"
              >
                View full archive →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
