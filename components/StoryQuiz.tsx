"use client";

import { useState } from "react";
import { QuizQuestion } from "@/lib/types";

/**
 * Comprehension quiz shown on the Understand and Deep Dive reading levels.
 * One question on screen at a time: tap an option -> instant right/wrong
 * coloring + a short explanation -> "Next question" -> score card at the
 * end with a retry option. All state is local; nothing is stored.
 */
export default function StoryQuiz({
  quiz,
  accent,
  tint,
  deep,
  onComplete,
}: {
  quiz: QuizQuestion[];
  accent: string;
  tint: string;
  deep: string;
  onComplete?: (correct: number, total: number) => void;
}) {
  const [current, setCurrent] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  if (!quiz || quiz.length === 0) return null;
  const q = quiz[current];
  const answered = picked !== null;
  const isLast = current === quiz.length - 1;

  function pick(i: number) {
    if (answered) return;
    setPicked(i);
    if (i === q.answerIndex) setScore((s) => s + 1);
  }

  function next() {
    if (isLast) {
      setFinished(true);
      onComplete?.(score, quiz.length);
    } else {
      setCurrent((c) => c + 1);
      setPicked(null);
    }
  }

  function retry() {
    setCurrent(0);
    setPicked(null);
    setScore(0);
    setFinished(false);
  }

  return (
    <div className="mt-8 rounded-2xl p-5" style={{ background: tint }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-mono uppercase tracking-wide" style={{ color: deep }}>
          🎯 Did you get it?
        </p>
        {!finished && (
          <span className="text-xs font-medium" style={{ color: deep }}>
            {current + 1} / {quiz.length}
          </span>
        )}
      </div>

      {finished ? (
        <div className="text-center py-2">
          <p className="font-display text-2xl mb-1" style={{ color: deep }}>
            {score} / {quiz.length}
          </p>
          <p className="text-sm mb-4 text-[var(--text-secondary)]">
            {score === quiz.length
              ? "Perfect — you've truly understood this story."
              : score >= Math.ceil(quiz.length / 2)
                ? "Good grasp — one more read of the tricky part and you're set."
                : "Worth another read — the Understand tab covers everything asked here."}
          </p>
          <button
            onClick={retry}
            className="text-sm font-medium px-4 py-2 rounded-full text-white active:scale-95 transition-transform"
            style={{ background: accent }}
          >
            Try again
          </button>
        </div>
      ) : (
        <div>
          <p className="text-[15px] font-medium mb-4 text-[var(--text-primary)]">
            {q.question}
          </p>

          <div className="space-y-2">
            {q.options.map((opt, i) => {
              const isCorrect = i === q.answerIndex;
              const isPicked = i === picked;
              let style: React.CSSProperties = {
                background: "var(--surface)",
                border: "1.5px solid var(--border)",
              };
              if (answered && isCorrect) {
                style = { background: "#E8F5EC", border: "1.5px solid #34A853", color: "#1E7A38" };
              } else if (answered && isPicked && !isCorrect) {
                style = { background: "#FDECEA", border: "1.5px solid #D93025", color: "#B3261E" };
              }
              return (
                <button
                  key={i}
                  onClick={() => pick(i)}
                  disabled={answered}
                  className="w-full text-left text-[14px] leading-snug rounded-xl px-4 py-3 transition-all disabled:cursor-default"
                  style={style}
                >
                  <span className="font-mono text-xs mr-2 opacity-60">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {opt}
                  {answered && isCorrect && <span className="ml-1.5">✓</span>}
                  {answered && isPicked && !isCorrect && <span className="ml-1.5">✕</span>}
                </button>
              );
            })}
          </div>

          {answered && (
            <div className="mt-4">
              {q.explanation && (
                <p className="text-[13.5px] leading-relaxed mb-3 text-[var(--text-secondary)]">
                  {q.explanation}
                </p>
              )}
              <button
                onClick={next}
                className="text-sm font-medium px-4 py-2 rounded-full text-white active:scale-95 transition-transform"
                style={{ background: accent }}
              >
                {isLast ? "See my score" : "Next question →"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
