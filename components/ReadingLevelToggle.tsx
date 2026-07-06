"use client";

import { useState } from "react";
import { ReadingLevel, Story } from "@/lib/types";
import WonderingBlock from "./WonderingBlock";
import KnowledgeChain from "./KnowledgeChain";

const LEVELS: { key: ReadingLevel; label: string; minutes: string }[] = [
  { key: "quick", label: "Quick", minutes: "1–2 min" },
  { key: "understand", label: "Understand", minutes: "5–7 min" },
  { key: "deep", label: "Deep Dive", minutes: "10–30 min" },
];

export default function ReadingLevelToggle({ story }: { story: Story }) {
  const [level, setLevel] = useState<ReadingLevel>("understand");

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 p-1 bg-[var(--border)]/40 rounded-full w-fit">
        {LEVELS.map((l) => (
          <button
            key={l.key}
            onClick={() => setLevel(l.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              level === l.key
                ? "bg-[var(--navy)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
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
          <StructuredBlock label="What happened?" text={story.whatHappened} />
          <StructuredBlock label="Why today?" text={story.whyToday} />
          <StructuredBlock label="Why should I care?" text={story.whyCare} />
          <StructuredBlock label="What happens next?" text={story.whatNext} />
        </div>
      )}

      {level === "deep" && (
        <div className="prose-custom space-y-4 text-[var(--text-primary)] leading-relaxed">
          {story.deepDiveRead.split("\n\n").map((block, i) =>
            block.startsWith("## ") ? (
              <h3 key={i} className="font-display text-xl mt-6 mb-1 text-[var(--navy)]">
                {block.replace("## ", "")}
              </h3>
            ) : (
              <p key={i}>{block}</p>
            )
          )}
        </div>
      )}

      <div className="mt-8 pt-6 border-t border-[var(--border)]">
        <KnowledgeChain chain={story.knowledgeChain} variant="full" />
      </div>

      <div className="mt-6">
        <WonderingBlock items={story.ifYoureWondering} />
      </div>
    </div>
  );
}

function StructuredBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-mono uppercase tracking-wide text-[var(--soft-blue)] mb-1">
        {label}
      </p>
      <p className="text-[15px] leading-relaxed text-[var(--text-primary)]">{text}</p>
    </div>
  );
}
