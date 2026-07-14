"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

interface Prefs {
  readSlugs: string[];
  readLevels: Record<string, "quick" | "understand" | "deep">;
}

const LEVEL_LABEL: Record<string, string> = {
  quick: "Quick read",
  understand: "Understand",
  deep: "Deep Dive",
};

export default function ContinueLearning({
  storiesBySlug,
}: {
  storiesBySlug: Record<string, { headline: string; slug: string }>;
}) {
  const { isSignedIn, isLoaded } = useUser();
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch("/api/preferences")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json) setPrefs(json);
      })
      .catch(() => {});
  }, [isLoaded, isSignedIn]);

  if (!prefs || prefs.readSlugs.length === 0) return null;

  const lastSlug = prefs.readSlugs[prefs.readSlugs.length - 1];
  const story = storiesBySlug[lastSlug];
  if (!story) return null; // last read story isn't in today's set — skip rather than guess

  const level = prefs.readLevels[lastSlug];
  const isDeep = level === "deep";

  return (
    <Link
      href={`/story/${story.slug}`}
      className="block rounded-xl border p-4 transition-colors hover:border-[var(--navy)]"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <p className="font-mono text-[10px] uppercase tracking-wide mb-1.5" style={{ color: "var(--text-secondary)" }}>
        Continue learning
      </p>
      <p className="text-[14.5px] font-medium leading-snug mb-2" style={{ color: "var(--text-primary)" }}>
        {story.headline}
      </p>
      <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
        {isDeep
          ? `You've read the ${LEVEL_LABEL[level]} — tap to revisit`
          : `You read ${LEVEL_LABEL[level] || "this"} — tap for the Deep Dive`}
      </p>
    </Link>
  );
}
