"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { ReadingLevel, Story } from "@/lib/types";
import { getCategoryStyle } from "@/lib/categoryStyle";
import WonderingBlock from "./WonderingBlock";
import KnowledgeChain from "./KnowledgeChain";

const LEVELS: { key: ReadingLevel; label: string; minutes: string }[] = [
  { key: "quick", label: "Quick", minutes: "1–2 min" },
  { key: "understand", label: "Understand", minutes: "5–7 min" },
  { key: "deep", label: "Deep Dive", minutes: "10–30 min" },
];

export default function ReadingLevelToggle({ story }: { story: Story }) {
  const { isSignedIn } = useUser();
  const [level, setLevel] = useState<ReadingLevel>("understand");
  const cat = getCategoryStyle(story.category);

  // Load the signed-in user's saved reading-level preference once.
  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.defaultReadingLevel) setLevel(data.defaultReadingLevel);
      })
      .catch(() => {});
  }, [isSignedIn]);

  // Live-generated Deep Dive content, fetched on first tap of that tab.
  const [liveDeepDive, setLiveDeepDive] = useState<string | null>(null);
  const [deepDiveStatus, setDeepDiveStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleSelectLevel(key: ReadingLevel) {
    setLevel(key);

    if (isSignedIn) {
      fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultReadingLevel: key }),
      }).catch(() => {});
    }

    if (key === "deep" && liveDeepDive === null && deepDiveStatus === "idle") {
      setDeepDiveStatus("loading");
      try {
        const res = await fetch("/api/expand-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            field: "deepDiveRead",
            slug: story.slug,
            headline: story.headline,
            summary: story.summary,
            category: story.category,
          }),
        });
        const data = await res.json();
        if (res.ok && data.content) {
          setLiveDeepDive(data.content);
          setDeepDiveStatus("idle");
        } else {
          setDeepDiveStatus("error");
        }
      } catch {
        setDeepDiveStatus("error");
      }
    }
  }

  const deepDiveText = liveDeepDive ?? story.deepDiveRead;

  return (
    <div>
      <div className="flex items-center gap-1 mb-6 p-1 rounded-full w-fit" style={{ background: cat.tint }}>
        {LEVELS.map((l) => (
          <button
            key={l.key}
            onClick={() => handleSelectLevel(l.key)}
            className="px-4 py-2 rounded-full text-sm font-medium transition-all"
            style={
              level === l.key
                ? { background: cat.accent, color: "#fff" }
                : { color: cat.deep }
            }
          >
            {l.label}
            <span className="ml-1.5 text-xs opacity-70">{l.minutes}</span>
          </button>
        ))}
      </div>

      {level === "quick" && (
        <p className="text-lg leading-relaxed font-body text-[var(--text-primary)]">
          {story.quickRead}
        </p>
      )}

      {level === "understand" && (
        <div className="space-y-5">
          <StructuredBlock label="What happened?" text={story.whatHappened} color={cat.deep} />
          <StructuredBlock label="Why today?" text={story.whyToday} color={cat.deep} />
          <StructuredBlock label="Why should I care?" text={story.whyCare} color={cat.deep} />
          <StructuredBlock label="What happens next?" text={story.whatNext} color={cat.deep} />
        </div>
      )}

      {level === "deep" && (
        <div className="prose-custom space-y-4 text-[var(--text-primary)] leading-relaxed">
          {deepDiveStatus === "loading" && (
            <div className="flex items-center gap-2 text-sm" style={{ color: cat.deep }}>
              <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              Generating a fresh deep dive on this story…
            </div>
          )}
          {deepDiveStatus === "error" && (
            <p className="text-sm" style={{ color: cat.deep }}>
              Couldn&apos;t reach the live agent just now — showing the saved version instead.
            </p>
          )}
          {deepDiveStatus !== "loading" &&
            deepDiveText.split("\n\n").map((block, i) =>
              block.startsWith("## ") ? (
                <h3 key={i} className="font-display text-xl mt-6 mb-1" style={{ color: cat.deep }}>
                  {block.replace("## ", "")}
                </h3>
              ) : (
                <p key={i}>{block}</p>
              )
            )}
        </div>
      )}

      <div className="mt-8 pt-6 border-t border-[var(--border)]">
        <KnowledgeChain
          chain={story.knowledgeChain}
          variant="full"
          accent={cat.accent}
          tint={cat.tint}
          deep={cat.deep}
          story={story}
        />
      </div>

      <div className="mt-6">
        <WonderingBlock items={story.ifYoureWondering} accent={cat.accent} tint={cat.tint} deep={cat.deep} />
      </div>
    </div>
  );
}

function StructuredBlock({ label, text, color }: { label: string; text: string; color: string }) {
  return (
    <div>
      <p className="text-xs font-mono uppercase tracking-wide mb-1" style={{ color }}>
        {label}
      </p>
      <p className="text-[15px] leading-relaxed text-[var(--text-primary)]">{text}</p>
    </div>
  );
}
