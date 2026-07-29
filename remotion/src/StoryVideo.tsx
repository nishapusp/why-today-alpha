import React from "react";
import { AbsoluteFill, Img, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { BlueprintSection, MotionComponent, VisualBlueprint, VisualTheme } from "../../lib/visualEngine/types";
import StatisticCard, { StatisticCardProps } from "./components/StatisticCard";
import Dashboard, { DashboardProps } from "./components/Dashboard";
import Timeline, { TimelineProps } from "./components/Timeline";
import Comparison, { ComparisonProps } from "./components/Comparison";
import ImpactCards, { ImpactCardsProps } from "./components/ImpactCards";
import ProcessFlow, { ProcessFlowProps } from "./components/ProcessFlow";
import CompanyCard, { CompanyCardProps } from "./components/CompanyCard";
import QuoteCard, { QuoteCardProps } from "./components/QuoteCard";
import FactBox, { FactBoxProps } from "./components/FactBox";
import WatchNext, { WatchNextProps } from "./components/WatchNext";
import MapStory, { MapStoryProps } from "./components/MapStory";
import SankeyFlow, { SankeyFlowProps } from "./components/SankeyFlow";
import BarChart, { BarChartProps } from "./components/BarChart";
import Outro, { OutroProps } from "./components/Outro";
import { useEntranceStyle } from "./lib/entrance";

export const HERO_SECONDS = 3;

export interface StoryVideoProps {
  blueprint: VisualBlueprint;
  headlineImageUrl?: string;
  qrDataUri?: string;
  // Remotion's Composition/renderMedia generics require props to
  // structurally satisfy Record<string, unknown> (they're serialized to
  // JSON for the render worker).
  [key: string]: unknown;
}

function renderSection(section: BlueprintSection, theme: VisualTheme, qrDataUri?: string) {
  const d = section.visual_data;
  switch (section.component as MotionComponent) {
    case "StatisticCard":
      return <StatisticCard {...(d as unknown as Omit<StatisticCardProps, "theme">)} theme={theme} />;
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

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        alignSelf: "flex-start",
        borderRadius: 999,
        padding: "16px 32px",
        fontSize: 26,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 1,
        color: "#fff",
        background: color,
        marginBottom: 36,
      }}
    >
      {label}
    </span>
  );
}

function HeroSlide({ url, hook, theme }: { url: string; hook: string; theme: VisualTheme }) {
  return (
    <AbsoluteFill>
      <Img src={url} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.1) 0%, rgba(0,0,0,.8) 100%)" }} />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72 }}>
        <Pill label="Flagship Story" color={theme.negative} />
        <p style={{ color: "#fff", fontSize: 56, fontFamily: "Georgia, serif", lineHeight: 1.3, margin: 0 }}>{hook}</p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function SectionSlide({ section, theme, index, qrDataUri }: { section: BlueprintSection; theme: VisualTheme; index: number; qrDataUri?: string }) {
  const pillColor = theme.accentRotation[index % theme.accentRotation.length];
  const style = useEntranceStyle(section.animation);
  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: 72 }}>
      <Pill label={section.title} color={pillColor} />
      <div style={style}>{renderSection(section, theme, qrDataUri)}</div>
    </AbsoluteFill>
  );
}

function Chrome({ theme, totalSlides, activeIndex }: { theme: VisualTheme; totalSlides: number; activeIndex: number }) {
  return (
    <>
      <AbsoluteFill style={{ top: 0, bottom: "auto", height: "auto" }}>
        <div style={{ height: 8, background: theme.accent }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0 16px", background: theme.background }}>
          <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 36, color: theme.text }}>WHY TODAY</span>
          <span style={{ marginTop: 8, width: 74, height: 5, borderRadius: 4, background: theme.accent }} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ top: "auto", bottom: 0, height: "auto" }}>
        <div style={{ background: theme.background, paddingTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
            {Array.from({ length: totalSlides }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === activeIndex ? 36 : 16,
                  height: 16,
                  borderRadius: 999,
                  background: i <= activeIndex ? theme.accent : theme.border,
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: "16px 0" }}>
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: theme.accent }} />
            <span style={{ fontSize: 28, fontWeight: 700, color: theme.accent }}>whytoday.in</span>
          </div>
          <div style={{ height: 8, background: theme.accent }} />
        </div>
      </AbsoluteFill>
    </>
  );
}

export default function StoryVideo({ blueprint, headlineImageUrl, qrDataUri }: StoryVideoProps) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const { theme, sections, hook } = blueprint;

  const heroFrames = headlineImageUrl ? HERO_SECONDS * fps : 0;
  let cursor = heroFrames;
  const ranges = [
    ...(headlineImageUrl ? [{ from: 0, durationInFrames: heroFrames }] : []),
    ...sections.map((section) => {
      const from = cursor;
      const durationInFrames = Math.round(section.duration * fps);
      cursor += durationInFrames;
      return { section, from, durationInFrames };
    }),
  ];

  const activeIndex = Math.max(
    0,
    ranges.findIndex((r) => frame >= r.from && frame < r.from + r.durationInFrames)
  );

  return (
    <AbsoluteFill style={{ background: theme.background, fontFamily: "Helvetica, Arial, sans-serif" }}>
      {headlineImageUrl && (
        <Sequence from={0} durationInFrames={heroFrames}>
          <HeroSlide url={headlineImageUrl} hook={hook} theme={theme} />
        </Sequence>
      )}
      {sections.map((section, i) => {
        const range = ranges[headlineImageUrl ? i + 1 : i];
        return (
          <Sequence key={`${section.component}-${i}`} from={range.from} durationInFrames={range.durationInFrames}>
            <SectionSlide section={section} theme={theme} index={i} qrDataUri={qrDataUri} />
          </Sequence>
        );
      })}
      <Chrome theme={theme} totalSlides={ranges.length} activeIndex={activeIndex} />
    </AbsoluteFill>
  );
}

export function totalDurationInFrames(blueprint: VisualBlueprint, fps: number, hasHero: boolean): number {
  const heroFrames = hasHero ? HERO_SECONDS * fps : 0;
  const sectionFrames = blueprint.sections.reduce((total, s) => total + Math.round(s.duration * fps), 0);
  return heroFrames + sectionFrames;
}
