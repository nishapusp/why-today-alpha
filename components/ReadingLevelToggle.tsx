"use client";

import { useState } from "react";
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
  const [level, setLevel] = useState<ReadingLevel>("understand");
  const cat = getCategoryStyle(story.category);

  return (
    <div>
      <div className="flex items-center gap-1 mb-6 p-1 rounded-full w-fit" style={{ background: cat.tint }}>
        {LEVELS.map((l) => (
          <button
            key={l.key}
            onClick={() => setLevel(l.key)}
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
          {story.deepDiveRead.split("\n\n").map((block, i) =>
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
