"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { ReadingLevel, Story } from "@/lib/types";
import { getCategoryStyle } from "@/lib/categoryStyle";
import WonderingBlock from "./WonderingBlock";
import KnowledgeChain from "./KnowledgeChain";
import AudioReader from "./AudioReader";

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

      <div className="mb-5">
        <AudioReader text={getSpokenText(story, level, deepDiveText)} accent={cat.accent} />
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
          {deepDiveStatus !== "loading" && renderDeepDive(deepDiveText, cat)}
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

function renderInlineBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function renderDeepDive(text: string, cat: ReturnType<typeof getCategoryStyle>): React.ReactNode {
  const blocks = text.split("\n\n");

  return blocks.map((block, i) => {
    const trimmed = block.trim();

    // Header
    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={i} className="font-display text-xl mt-6 mb-1" style={{ color: cat.deep }}>
          {trimmed.replace("## ", "")}
        </h3>
      );
    }

    // Bullet list (e.g. the "Fast Facts" block) — render as a tinted callout
    const lines = trimmed.split("\n").filter(Boolean);
    const isBulletList = lines.length > 1 && lines.every((l) => l.trim().startsWith("- "));
    if (isBulletList) {
      return (
        <ul
          key={i}
          className="rounded-xl p-4 my-3 space-y-1.5 list-none"
          style={{ background: cat.tint }}
        >
          {lines.map((line, j) => (
            <li key={j} className="text-[14.5px] flex gap-2">
              <span style={{ color: cat.accent }}>●</span>
              <span>{renderInlineBold(line.replace(/^-\s*/, ""))}</span>
            </li>
          ))}
        </ul>
      );
    }

    // Comparison paragraph — visually set apart with a left border
    if (/^(Then vs\.? now:|Compared to)/i.test(trimmed)) {
      return (
        <p
          key={i}
          className="pl-4 my-3 italic text-[15px]"
          style={{ borderLeft: `3px solid ${cat.accent}`, color: "var(--text-primary)" }}
        >
          {renderInlineBold(trimmed)}
        </p>
      );
    }

    // Ordinary paragraph, with inline bold support
    return <p key={i}>{renderInlineBold(trimmed)}</p>;
  });
}

function getSpokenText(story: Story, level: ReadingLevel, liveDeepDive: string): string {
  if (level === "quick") return `${story.headline}. ${story.quickRead}`;
  if (level === "understand") {
    return [
      story.headline,
      story.whatHappened,
      story.whyToday,
      story.whyCare,
      story.whatNext,
    ].join(". ");
  }
  // deep — strip markdown syntax so it isn't read aloud literally
  return `${story.headline}. ${liveDeepDive
    .replace(/##\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/^-\s*/gm, "")}`;
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
