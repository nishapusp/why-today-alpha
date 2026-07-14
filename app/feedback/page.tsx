"use client";

import { useState } from "react";
import Link from "next/link";

const CATEGORIES = ["Markets", "Banking & Policy", "Corporate", "Geopolitics", "Personal finance"];

type WritingLevel = "too_simple" | "too_technical" | "about_right";
type Length = "too_short" | "too_long" | "right";
type Recommend = "yes" | "maybe" | "no";

function OptionRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className="text-[13.5px] font-medium px-3.5 py-2 rounded-full border transition-colors"
          style={
            value === opt.key
              ? { background: "var(--navy)", borderColor: "var(--navy)", color: "white" }
              : { background: "white", borderColor: "var(--border)", color: "var(--text-primary)" }
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const [writingLevel, setWritingLevel] = useState<WritingLevel | null>(null);
  const [wantMore, setWantMore] = useState<string[]>([]);
  const [length, setLength] = useState<Length | null>(null);
  const [wouldRecommend, setWouldRecommend] = useState<Recommend | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  const canSubmit = writingLevel && length && wouldRecommend && status !== "submitting";

  function toggleCategory(cat: string) {
    setWantMore((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function submit() {
    if (!canSubmit) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/app-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ writingLevel, wantMore, length, wouldRecommend, comment }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10 text-center">
        <p className="text-3xl mb-3">🙏</p>
        <p className="font-display text-xl mb-2" style={{ color: "var(--text-primary)" }}>
          Thanks for the feedback
        </p>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          This directly shapes what we cover and how we write it.
        </p>
        <Link href="/" className="text-sm font-medium" style={{ color: "var(--navy)" }}>
          ← Back to today
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-5"
      >
        ← Back to today
      </Link>

      <h1 className="font-display text-2xl mb-1.5" style={{ color: "var(--text-primary)" }}>
        Help us improve
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
        Five quick questions — this shapes what we write about next, not just how the app looks.
      </p>

      <div className="space-y-7">
        <div>
          <p className="text-[14px] font-medium mb-2.5" style={{ color: "var(--text-primary)" }}>
            Is the writing too simple, too technical, or about right?
          </p>
          <OptionRow
            value={writingLevel}
            onChange={setWritingLevel}
            options={[
              { key: "too_simple", label: "Too simple" },
              { key: "about_right", label: "About right" },
              { key: "too_technical", label: "Too technical" },
            ]}
          />
        </div>

        <div>
          <p className="text-[14px] font-medium mb-2.5" style={{ color: "var(--text-primary)" }}>
            Which do you want more of?
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className="text-[13.5px] font-medium px-3.5 py-2 rounded-full border transition-colors"
                style={
                  wantMore.includes(cat)
                    ? { background: "var(--navy)", borderColor: "var(--navy)", color: "white" }
                    : { background: "white", borderColor: "var(--border)", color: "var(--text-primary)" }
                }
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[14px] font-medium mb-2.5" style={{ color: "var(--text-primary)" }}>
            Today&apos;s stories: too short, too long, or right length?
          </p>
          <OptionRow
            value={length}
            onChange={setLength}
            options={[
              { key: "too_short", label: "Too short" },
              { key: "right", label: "Right length" },
              { key: "too_long", label: "Too long" },
            ]}
          />
        </div>

        <div>
          <p className="text-[14px] font-medium mb-2.5" style={{ color: "var(--text-primary)" }}>
            Would you recommend Why Today to a friend?
          </p>
          <OptionRow
            value={wouldRecommend}
            onChange={setWouldRecommend}
            options={[
              { key: "yes", label: "Yes" },
              { key: "maybe", label: "Maybe" },
              { key: "no", label: "No" },
            ]}
          />
        </div>

        <div>
          <p className="text-[14px] font-medium mb-2.5" style={{ color: "var(--text-primary)" }}>
            Anything you wish we did differently?{" "}
            <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>(optional)</span>
          </p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            placeholder="Your thoughts…"
            className="w-full rounded-xl border p-3 text-[14px] outline-none focus:ring-2"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-primary)" }}
          />
        </div>

        {status === "error" && (
          <p className="text-sm" style={{ color: "var(--crimson)" }}>
            Something went wrong submitting this — please try again.
          </p>
        )}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="w-full text-[15px] font-medium py-3 rounded-full text-white transition-opacity disabled:opacity-40"
          style={{ background: "var(--navy)" }}
        >
          {status === "submitting" ? "Submitting…" : "Submit feedback"}
        </button>
      </div>
    </main>
  );
}
