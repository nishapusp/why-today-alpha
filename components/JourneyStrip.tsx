"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser, SignInButton } from "@clerk/nextjs";
import type { LearningScoreBreakdown } from "@/lib/preferences";

function FlameIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3c1 3 4 4.5 4 8a4 4 0 01-8 0c0-1.2.5-2 1-2.7C9.6 9.8 10 11 10 11s-1-3 2-8z"
        stroke="var(--gold)"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}
export default function JourneyStrip() {
  const { isSignedIn, isLoaded } = useUser();
  const [data, setData] = useState<LearningScoreBreakdown | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch("/api/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.scoreBreakdown) setData(json.scoreBreakdown);
      })
      .catch(() => {});
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <div className="border-y" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Sign in to track your streak, quiz score, and reading progress.
          </p>
          <SignInButton mode="modal">
            <button
              className="text-[12.5px] font-medium px-3 py-1.5 rounded-full text-white whitespace-nowrap shrink-0"
              style={{ background: "var(--navy)" }}
            >
              Sign in
            </button>
          </SignInButton>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const quizAvg = data.quizTotal > 0 ? Math.round((data.quizCorrect / data.quizTotal) * 100) : null;

  // Condensed from a 4-icon stat grid (py-3, its own row of icons) down
  // to one minimal line — per explicit feedback that it was eating too
  // much space above the fold alongside ThreadBanner. Full breakdown
  // (same four signals, each explained) already lives at /progress —
  // also reachable from the hamburger menu — so nothing is lost, just
  // no longer duplicated inline on every visit.
  return (
    <div className="border-y" style={{ borderColor: "var(--border)" }}>
      <Link
        href="/progress"
        className="max-w-2xl mx-auto flex items-center justify-between gap-3 px-4 py-2"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="flex items-center gap-1 shrink-0">
            <FlameIcon />
            <span className="font-mono text-[13px] font-semibold" style={{ color: "var(--navy)" }}>
              {data.streakCount}
            </span>
          </span>
          <span className="text-[12px] truncate" style={{ color: "var(--text-secondary)" }}>
            day streak{quizAvg !== null ? ` · ${quizAvg}% quiz avg` : ""} · {data.storiesRead} stories read
          </span>
        </div>
        <span className="text-[11.5px] font-medium shrink-0" style={{ color: "var(--gold)" }}>
          View progress →
        </span>
      </Link>
    </div>
  );
}
