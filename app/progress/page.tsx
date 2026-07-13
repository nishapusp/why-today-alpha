"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { LearningScoreBreakdown } from "@/lib/preferences";

/**
 * Direct answer to the "points appear but nowhere to see how they're
 * earned" gap — the Hero badge links here. Shows the same four signals
 * computeLearningScoreBreakdown() combines, each with its own point value
 * spelled out, so the number is explicable rather than a black box.
 */
export default function ProgressPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [data, setData] = useState<LearningScoreBreakdown | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setStatus("error");
      return;
    }
    fetch("/api/preferences")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((json) => {
        setData(json.scoreBreakdown);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [isLoaded, isSignedIn]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/" className="text-sm text-[var(--text-secondary)] mb-4 inline-block">
        ← Back
      </Link>
      <h1 className="font-display text-2xl text-[var(--text-primary)] mb-1">Your learning score</h1>

      {status === "loading" && <p className="text-[var(--text-secondary)] text-sm mt-6">Loading…</p>}

      {status === "error" && (
        <p className="text-[var(--text-secondary)] text-sm mt-6">
          Sign in to start tracking your learning score.
        </p>
      )}

      {status === "ready" && data && (
        <>
          <p className="text-4xl font-display mt-2 mb-6" style={{ color: "var(--navy)" }}>
            🧠 {data.total} <span className="text-lg text-[var(--text-secondary)] font-sans">points</span>
          </p>

          <div className="space-y-3">
            <Row
              icon="📖"
              label="Reading depth"
              points={data.depthPoints}
              detail={`${data.storiesRead} ${data.storiesRead === 1 ? "story" : "stories"} read — 2 pts for Quick, 5 for Understand, 10 for Deep Dive`}
            />
            <Row
              icon="🎯"
              label="Quiz accuracy"
              points={data.quizPoints}
              detail={`${data.quizCorrect}/${data.quizTotal || 0} correct — 3 pts per correct answer`}
            />
            <Row
              icon="🔥"
              label="Reading streak"
              points={data.streakPoints}
              detail={`${data.streakCount}-day streak — 5 pts per consecutive day`}
            />
            <Row
              icon="📚"
              label="Glossary terms"
              points={data.termsPoints}
              detail={`${data.termsCount} distinct terms encountered — 1 pt each`}
            />
          </div>

          <p className="text-xs text-[var(--text-secondary)] mt-6">
            Score updates as you read stories, switch reading levels, take quizzes, and keep your streak going.
          </p>
        </>
      )}
    </main>
  );
}

function Row({ icon, label, points, detail }: { icon: string; label: string; points: number; detail: string }) {
  return (
    <div className="rounded-2xl p-4 flex items-center justify-between gap-3" style={{ background: "rgba(0,0,0,0.035)" }}>
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-[var(--text-primary)]">
          {icon} {label}
        </p>
        <p className="text-[12.5px] text-[var(--text-secondary)] mt-0.5">{detail}</p>
      </div>
      <span className="shrink-0 text-lg font-display" style={{ color: "var(--navy)" }}>
        +{points}
      </span>
    </div>
  );
}
