"use client";

import { useEffect, useState } from "react";
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
function TargetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke="var(--gold)" strokeWidth={1.4} />
      <circle cx="12" cy="12" r="4.5" stroke="var(--gold)" strokeWidth={1.4} />
      <circle cx="12" cy="12" r="1.2" fill="var(--gold)" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 6.5V19" stroke="var(--gold)" strokeWidth={1.6} strokeLinecap="round" />
      <path
        d="M12 6.5C10 5.2 6.8 4.7 4 5.2v12.3c2.8-.5 6 0 8 1.3"
        stroke="var(--gold)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 6.5c2-1.3 5.2-1.8 8-1.3v12.3c-2.8-.5-6 0-8 1.3"
        stroke="var(--gold)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function StackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4.5" y="6" width="15" height="3.2" rx="1" stroke="var(--gold)" strokeWidth={1.4} />
      <rect x="4.5" y="10.4" width="15" height="3.2" rx="1" stroke="var(--gold)" strokeWidth={1.4} />
      <rect x="4.5" y="14.8" width="15" height="3.2" rx="1" stroke="var(--gold)" strokeWidth={1.4} />
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

  const stats: { icon: React.ReactNode; value: string; label: string }[] = [
    { icon: <FlameIcon />, value: String(data.streakCount), label: "day streak" },
    { icon: <TargetIcon />, value: quizAvg !== null ? `${quizAvg}%` : "—", label: "quiz avg" },
    { icon: <BookIcon />, value: String(data.termsCount), label: "terms learned" },
    { icon: <StackIcon />, value: String(data.storiesRead), label: "stories read" },
  ];

  return (
    <div className="border-y" style={{ borderColor: "var(--border)" }}>
      <div className="max-w-2xl mx-auto grid grid-cols-4 px-2 py-3">
        {stats.map((s, i) => (
          <div key={i} className="flex flex-col items-center gap-1 text-center">
            {s.icon}
            <span className="font-mono text-[15px] font-semibold" style={{ color: "var(--navy)" }}>
              {s.value}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
