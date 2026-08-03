"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { HeadlineImage } from "@/lib/types";
import { BlueprintSection, MotionComponent, VisualBlueprint, VisualTheme } from "@/lib/visualEngine/types";
import { getAllThemes } from "@/lib/visualEngine/theme";
import Reveal from "./Reveal";
import StatisticCard, { StatisticCardProps } from "./StatisticCard";
import Dashboard, { DashboardProps } from "./Dashboard";
import Timeline, { TimelineProps } from "./Timeline";
import Comparison, { ComparisonProps } from "./Comparison";
import ImpactCards, { ImpactCardsProps } from "./ImpactCards";
import ProcessFlow, { ProcessFlowProps } from "./ProcessFlow";
import CompanyCard, { CompanyCardProps } from "./CompanyCard";
import QuoteCard, { QuoteCardProps } from "./QuoteCard";
import FactBox, { FactBoxProps } from "./FactBox";
import WatchNext, { WatchNextProps } from "./WatchNext";
import MapStory, { MapStoryProps } from "./MapStory";
import SankeyFlow, { SankeyFlowProps } from "./SankeyFlow";
import BarChart, { BarChartProps } from "./BarChart";
import Outro, { OutroProps } from "./Outro";

// These components drive their own internal per-item reveal animations
// (staggered list entries) rather than a single whole-block entrance, so
// the viewer skips wrapping them in an extra outer Reveal.
const SELF_ANIMATING = new Set<MotionComponent>([
  "StatisticCard", "Dashboard", "Timeline", "ProcessFlow", "MapStory", "ImpactCards", "Comparison",
]);

function renderComponent(section: BlueprintSection, theme: VisualTheme, qrDataUri?: string) {
  const d = section.visual_data;
  switch (section.component) {
    case "StatisticCard":
      return <StatisticCard {...(d as unknown as Omit<StatisticCardProps, "theme">)} theme={theme} animation={section.animation} />;
    case "Dashboard":
      return <Dashboard {...(d as unknown as Omit<DashboardProps, "theme">)} theme={theme} />;
    case "Timeline":
      return <Timeline {...(d as unknown as Omit<TimelineProps, "theme">)} theme={theme} />;
    case "Comparison":
      return <Comparison {...(d as unknown as Omit<ComparisonProps, "theme">)} theme={theme} />;
    case "ImpactCards":
      return <ImpactCards {...(d as unknown as Omit<ImpactCardsProps, "theme">)} theme={theme} />;
    case "ProcessFlow":
      return <ProcessFlow {...(d as unknown as Omit<ProcessFlowProps, "theme">)} theme={theme} />;
    case "CompanyCard":
      return <CompanyCard {...(d as unknown as Omit<CompanyCardProps, "theme">)} theme={theme} />;
    case "QuoteCard":
      return <QuoteCard {...(d as unknown as Omit<QuoteCardProps, "theme">)} theme={theme} />;
    case "FactBox":
      return <FactBox {...(d as unknown as Omit<FactBoxProps, "theme">)} theme={theme} />;
    case "WatchNext":
      return <WatchNext {...(d as unknown as Omit<WatchNextProps, "theme">)} theme={theme} />;
    case "MapStory":
      return <MapStory {...(d as unknown as Omit<MapStoryProps, "theme">)} theme={theme} />;
    case "SankeyFlow":
      return <SankeyFlow {...(d as unknown as Omit<SankeyFlowProps, "theme">)} theme={theme} />;
    case "BarChart":
      return <BarChart {...(d as unknown as Omit<BarChartProps, "theme">)} theme={theme} />;
    case "Outro":
      return <Outro {...(d as unknown as Omit<OutroProps, "theme" | "qrDataUri">)} theme={theme} qrDataUri={qrDataUri} />;
    default:
      return null;
  }
}

// No BlueprintSection (and thus no authored `duration`) exists for the
// headline-image hero slide, so it gets its own fixed dwell time here —
// close to Remotion's HERO_SECONDS so the web preview and exported video
// feel like the same pacing.
const HERO_AUTO_ADVANCE_SECONDS = 4;

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-block self-start max-w-full rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white mb-4 line-clamp-2"
      style={{ background: color }}
    >
      {label}
    </span>
  );
}

export default function VisualEngineViewer({
  blueprint,
  headlineImage,
  qrDataUri,
  backHref,
  slug,
  debug = false,
}: {
  blueprint: VisualBlueprint;
  headlineImage?: HeadlineImage;
  qrDataUri?: string;
  backHref?: string;
  // Used to source the same narration+music mix already rendered for
  // the downloadable video (/api/visual-video/[slug]) — reused here as
  // an inline-streamed <audio> track rather than re-generating anything,
  // so the web preview isn't silent while the video export has sound.
  slug?: string;
  // Diagnostic overlay (classification/confidence, theme switcher, raw
  // blueprint JSON) — only ever meant for reviewing the engine's output,
  // not for the actual reader-facing storyboard. Opt in with ?debug=1
  // rather than always rendering it.
  debug?: boolean;
}) {
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [theme, setTheme] = useState<VisualTheme>(blueprint.theme);
  const [muted, setMuted] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const isInteractingRef = useRef(false);
  const { sections, classification } = blueprint;
  const totalSlides = (headlineImage ? 1 : 0) + sections.length;
  const allThemes = getAllThemes();

  // Same seconds-per-slide the video export uses (section.duration), so
  // the auto-advancing preview and the downloaded video feel like the
  // same story at the same pace.
  const slideDurations = useMemo(
    () => [...(headlineImage ? [HERO_AUTO_ADVANCE_SECONDS] : []), ...sections.map((s) => s.duration)],
    [headlineImage, sections]
  );

  // Cumulative start time (seconds) of each slide — lets a manual swipe
  // seek the audio to roughly the right point instead of leaving it
  // playing from wherever it happened to be.
  const cumulativeStart = useMemo(() => {
    const out: number[] = [];
    let t = 0;
    for (const d of slideDurations) {
      out.push(t);
      t += d;
    }
    return out;
  }, [slideDurations]);

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el || el.clientHeight === 0) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    setActiveIndex(Math.max(0, Math.min(totalSlides - 1, idx)));
  }

  // Auto-advances to the next slide after its dwell time, like a stories
  // UI — but a manual swipe always wins: it updates activeIndex via
  // handleScroll, which reruns this effect for the new slide and cancels
  // whatever timer was pending for the old one.
  useEffect(() => {
    if (activeIndex >= totalSlides - 1) return;
    const seconds = slideDurations[activeIndex];
    if (!seconds) return;
    const timer = setTimeout(() => {
      if (isInteractingRef.current) return;
      const el = scrollerRef.current;
      el?.scrollTo({ top: el.clientHeight * (activeIndex + 1), behavior: "smooth" });
    }, seconds * 1000);
    return () => clearTimeout(timer);
  }, [activeIndex, slideDurations, totalSlides]);

  // Keeps the narration+music track roughly aligned with whichever slide
  // is showing. Auto-advance already keeps them in sync on its own (both
  // derive from the same section.duration values), so this only actually
  // corrects anything after a manual swipe jumps several slides at once —
  // a small tolerance avoids fighting normal playback with redundant seeks.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioAvailable) return;
    const target = cumulativeStart[activeIndex] ?? 0;
    if (Math.abs(audio.currentTime - target) > 1.5) {
      audio.currentTime = target;
    }
  }, [activeIndex, cumulativeStart, audioAvailable]);

  return (
    <div className="min-h-dvh flex flex-col items-center bg-black">
      {debug && (
        <div className="w-full max-w-md p-3 text-xs font-mono text-white/70">
          <div className="flex items-center justify-between">
            <span>
              {classification.recommended_style} · {classification.confidence}% confidence · {theme.theme} theme
            </span>
            <button onClick={() => setShowDebugPanel((v) => !v)} className="underline shrink-0 ml-2">
              {showDebugPanel ? "hide" : "debug"}
            </button>
          </div>

          {showDebugPanel && (
            <>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {allThemes.map((t) => (
                  <button
                    key={t.theme}
                    onClick={() => setTheme(t)}
                    title={t.theme}
                    className="flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-[10px] transition-colors"
                    style={{
                      background: t.theme === theme.theme ? "rgba(255,255,255,.15)" : "transparent",
                      color: t.theme === theme.theme ? "#fff" : "rgba(255,255,255,.55)",
                      border: `1px solid ${t.theme === theme.theme ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.12)"}`,
                    }}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ background: t.background, border: `1px solid ${t.accent}` }}
                    />
                    {t.theme}
                  </button>
                ))}
              </div>
              <pre className="mt-3 max-h-64 overflow-auto leading-relaxed bg-white/5 text-emerald-300 rounded-lg p-3">
                {JSON.stringify(
                  {
                    classification,
                    hook: blueprint.hook,
                    sections: sections.map((s) => ({
                      title: s.title,
                      component: s.component,
                      animation: s.animation,
                      duration: s.duration,
                      visual_data: s.visual_data,
                    })),
                  },
                  null,
                  2
                )}
              </pre>
            </>
          )}
        </div>
      )}

      <div className="w-full max-w-md h-dvh flex flex-col relative" style={{ background: theme.background }}>
        {slug && audioAvailable && (
          // Muted autoplay is universally allowed without a user gesture;
          // unmuted requires one, which the toggle button below provides.
          // Same file the "Download Video" link uses (no ?download=1
          // here, so the API route serves it as inline/streamable rather
          // than forcing a save-to-device).
          <audio
            ref={audioRef}
            src={`/api/visual-video/${slug}`}
            autoPlay
            muted={muted}
            preload="auto"
            onError={() => setAudioAvailable(false)}
            className="hidden"
          />
        )}
        {backHref && (
          <Link
            href={backHref}
            className="absolute top-3 left-3 z-20 w-8 h-8 rounded-full flex items-center justify-center text-sm backdrop-blur-sm"
            style={{ background: "rgba(0,0,0,.25)", color: "#fff" }}
            aria-label="Back to article"
          >
            ←
          </Link>
        )}
        {slug && audioAvailable && (
          <button
            onClick={() => {
              setMuted((v) => {
                const next = !v;
                // Some browsers pause playback when muted state is
                // toggled programmatically outside a direct user gesture
                // path — re-assert play() defensively on unmute.
                if (!next) audioRef.current?.play().catch(() => {});
                return next;
              });
            }}
            className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center text-sm backdrop-blur-sm"
            style={{ background: "rgba(0,0,0,.25)", color: "#fff" }}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        )}

        {/* Persistent brand header — matches every frame of the reference storyboard, not baked into each slide */}
        <div className="shrink-0 z-10" style={{ background: theme.background }}>
          <div style={{ height: 3, background: theme.accent }} />
          <div className="flex flex-col items-center pt-2.5 pb-2">
            <span className="font-display font-bold text-sm tracking-tight" style={{ color: theme.text }}>
              WHY TODAY
            </span>
            <span className="mt-1 rounded-full" style={{ width: 28, height: 2, background: theme.accent }} />
          </div>
        </div>

        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          onPointerDown={() => {
            isInteractingRef.current = true;
          }}
          onPointerUp={() => {
            isInteractingRef.current = false;
          }}
          className="flex-1 min-h-0 overflow-y-auto no-scrollbar snap-y snap-mandatory"
        >
          {headlineImage && (
            <div className="snap-start h-full w-full relative">
              <img src={headlineImage.url} alt={headlineImage.alt} className="absolute inset-0 w-full h-full object-cover" />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(180deg, rgba(0,0,0,.1) 0%, rgba(0,0,0,.8) 100%)" }}
              />
              <div className="absolute inset-0 flex flex-col justify-between p-6">
                <Pill label="Flagship Story" color={theme.negative} />
                <p className="text-white text-xl font-display leading-snug">{blueprint.hook}</p>
              </div>
            </div>
          )}

          {sections.map((section, i) => {
            const pillColor = theme.accentRotation[i % theme.accentRotation.length];
            return (
              <section key={`${section.component}-${i}`} className="snap-start h-full w-full flex flex-col justify-center p-6">
                <Pill label={section.title} color={pillColor} />
                {SELF_ANIMATING.has(section.component) ? (
                  renderComponent(section, theme, qrDataUri)
                ) : (
                  <Reveal animation={section.animation}>{renderComponent(section, theme, qrDataUri)}</Reveal>
                )}
              </section>
            );
          })}
        </div>

        {/* Persistent brand footer — progress dots + whytoday.in, same treatment on every slide */}
        <div className="shrink-0 z-10" style={{ background: theme.background }}>
          <div className="flex items-center justify-center gap-1.5 pt-2">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <span
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === activeIndex ? 14 : 6,
                  height: 6,
                  background: i <= activeIndex ? theme.accent : theme.border,
                }}
              />
            ))}
          </div>
          <div className="flex items-center justify-center gap-1.5 py-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: theme.accent }} />
            <span className="text-[11px] font-bold" style={{ color: theme.accent }}>
              whytoday.in
            </span>
          </div>
          <div style={{ height: 3, background: theme.accent }} />
        </div>
      </div>
    </div>
  );
}
