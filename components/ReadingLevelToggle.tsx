"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { ReadingLevel, Story } from "@/lib/types";
import { getCategoryStyle } from "@/lib/categoryStyle";
import WonderingBlock from "./WonderingBlock";
import AudioReader from "./AudioReader";
import StoryQuiz from "./StoryQuiz";

const LEVELS: { key: ReadingLevel; label: string; minutes: string }[] = [
  { key: "quick", label: "Quick", minutes: "1m" },
  { key: "understand", label: "Understand", minutes: "3m" },
  { key: "deep", label: "Deep Dive", minutes: "8m" },
];

export default function ReadingLevelToggle({ story }: { story: Story }) {
  const { isSignedIn } = useUser();
  const [level, setLevel] = useState<ReadingLevel>("quick");
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

  async function handleSelectLevel(key: ReadingLevel) {
    setLevel(key);

    if (isSignedIn) {
      fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultReadingLevel: key }),
      }).catch(() => {});
      fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingLevel: { slug: story.slug, level: key } }),
      }).catch(() => {});
    }
  }

  // deepDiveRead is a REQUIRED field, already generated + validated (500-800
  // words, specific section headers, fact-checked) during the daily batch —
  // there is nothing to fetch. An earlier version of this component called
  // /api/expand-content to regenerate it live on first tap, which was pure
  // waste (an extra Gemini call for content that already existed) and a
  // real source of "Deep Dive isn't working": if that redundant call failed
  // under quota pressure, readers saw an error message instead of the
  // perfectly good content sitting in story.deepDiveRead the whole time.
  const deepDiveText = story.deepDiveRead;

  return (
    <div>
      <div className="flex items-center gap-1 mb-6 p-1 rounded-full overflow-x-auto no-scrollbar" style={{ background: cat.tint, touchAction: "pan-x" }}>
        {LEVELS.map((l) => (
          <button
            key={l.key}
            onClick={() => handleSelectLevel(l.key)}
            className="px-3 py-2 rounded-full text-[13px] font-medium transition-all whitespace-nowrap shrink-0"
            style={
              level === l.key
                ? { background: cat.accent, color: "#fff", touchAction: "manipulation" }
                : { color: cat.deep, touchAction: "manipulation" }
            }
          >
            {l.label}
            <span className="ml-1 text-[11px] opacity-70">{l.minutes}</span>
          </button>
        ))}
      </div>

      <div className="mb-5">
        <AudioReader text={getSpokenText(story, level, deepDiveText)} accent={cat.accent} />
      </div>

      {level === "quick" && (
        <p className="text-lg leading-relaxed font-body text-[var(--text-primary)] text-justify">
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
          {renderDeepDive(deepDiveText, cat)}
        </div>
      )}

      {level !== "quick" && story.quiz && story.quiz.length > 0 && (
        <StoryQuiz
          quiz={story.quiz}
          accent={cat.accent}
          tint={cat.tint}
          deep={cat.deep}
          onComplete={(correct, total) => {
            if (!isSignedIn) return;
            fetch("/api/preferences", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ quizResult: { correct, total } }),
            }).catch(() => {});
          }}
        />
      )}

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

type DeepDiveBlock =
  | { type: "header"; content: string }
  | { type: "bullets"; content: string[] }
  | { type: "paragraph"; content: string };

/**
 * Line-by-line parser — deliberately NOT a naive `split("\n\n")`. That
 * approach silently swallowed bullet lists into the preceding header
 * whenever Gemini wrote them with no blank line in between (e.g.
 * "## What Changed\n- fact one\n- fact two" — completely natural
 * markdown, but blank-line splitting treated the whole chunk as one
 * header block and the bullets never rendered as a list at all).
 */
function parseDeepDiveBlocks(text: string): DeepDiveBlock[] {
  const lines = text.split("\n");
  const blocks: DeepDiveBlock[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length) {
      blocks.push({ type: "paragraph", content: paragraphBuffer.join(" ").trim() });
      paragraphBuffer = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      flushParagraph();
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      blocks.push({ type: "header", content: line.replace("## ", "") });
      i++;
      continue;
    }
    if (line.startsWith("- ")) {
      flushParagraph();
      const bulletLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) {
        bulletLines.push(lines[i].trim().replace(/^-\s*/, ""));
        i++;
      }
      blocks.push({ type: "bullets", content: bulletLines });
      continue;
    }
    paragraphBuffer.push(line);
    i++;
  }
  flushParagraph();

  return blocks;
}

function renderDeepDive(text: string, cat: ReturnType<typeof getCategoryStyle>): React.ReactNode {
  const blocks = parseDeepDiveBlocks(text);

  return blocks.map((block, i) => {
    if (block.type === "header") {
      return (
        <h3 key={i} className="font-display text-xl mt-6 mb-1" style={{ color: cat.deep }}>
          {block.content}
        </h3>
      );
    }

    if (block.type === "bullets") {
      return (
        <ul
          key={i}
          className="rounded-xl p-4 my-3 space-y-1.5 list-none"
          style={{ background: cat.tint }}
        >
          {block.content.map((line, j) => (
            <li key={j} className="text-[14.5px] flex gap-2">
              <span style={{ color: cat.accent }}>●</span>
              <span>{renderInlineBold(line)}</span>
            </li>
          ))}
        </ul>
      );
    }

    // Comparison paragraph — visually set apart with a left border
    if (/^(Then vs\.? now:|Compared to)/i.test(block.content)) {
      return (
        <p
          key={i}
          className="pl-4 my-3 italic text-[15px] text-justify"
          style={{ borderLeft: `3px solid ${cat.accent}`, color: "var(--text-primary)" }}
        >
          {renderInlineBold(block.content)}
        </p>
      );
    }

    // Ordinary paragraph, with inline bold support
    return <p key={i} className="text-justify">{renderInlineBold(block.content)}</p>;
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
      <p className="text-[15px] leading-relaxed text-[var(--text-primary)] text-justify">{text}</p>
    </div>
  );
}
