"use client";

import { useState } from "react";
import { HeadlineImage } from "@/lib/types";
import { BlueprintSection, MotionComponent, VisualBlueprint, VisualTheme } from "@/lib/visualEngine/types";
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

// These components drive their own internal per-item reveal animations
// (staggered list entries) rather than a single whole-block entrance, so
// the viewer skips wrapping them in an extra outer Reveal.
const SELF_ANIMATING = new Set<MotionComponent>([
  "StatisticCard", "Dashboard", "Timeline", "ProcessFlow", "MapStory", "ImpactCards", "Comparison",
]);

function renderComponent(section: BlueprintSection, theme: VisualTheme) {
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
    default:
      return null;
  }
}

export default function VisualEngineViewer({
  blueprint,
  headlineImage,
}: {
  blueprint: VisualBlueprint;
  headlineImage?: HeadlineImage;
}) {
  const [showDebug, setShowDebug] = useState(false);
  const { theme, sections, classification } = blueprint;

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4 bg-black">
      <div className="w-full max-w-sm mb-3 flex items-center justify-between text-white/70 text-xs font-mono">
        <span>
          {classification.recommended_style} · {classification.confidence}% confidence · {theme.theme} theme
        </span>
        <button onClick={() => setShowDebug((v) => !v)} className="underline shrink-0 ml-2">
          {showDebug ? "hide" : "debug"}
        </button>
      </div>

      {showDebug && (
        <pre className="w-full max-w-sm mb-3 max-h-64 overflow-auto text-[10px] leading-relaxed bg-white/5 text-emerald-300 rounded-lg p-3">
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
      )}

      <div
        className="w-full max-w-sm aspect-[9/16] rounded-[2rem] overflow-y-auto no-scrollbar snap-y snap-mandatory shadow-2xl"
        style={{ background: theme.background }}
      >
        {headlineImage && (
          <div className="snap-start h-full w-full relative">
            <img src={headlineImage.url} alt={headlineImage.alt} className="absolute inset-0 w-full h-full object-cover" />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(180deg, rgba(0,0,0,.1) 0%, rgba(0,0,0,.8) 100%)" }}
            />
            <div className="absolute inset-0 flex flex-col justify-end p-6">
              <p className="text-white/70 text-[11px] font-mono uppercase tracking-wide mb-2">Why Today</p>
              <p className="text-white text-xl font-display leading-snug">{blueprint.hook}</p>
            </div>
          </div>
        )}

        {sections.map((section, i) => (
          <section key={`${section.component}-${i}`} className="snap-start h-full w-full flex flex-col justify-center p-6">
            <p className="text-[10px] font-mono uppercase tracking-widest mb-4" style={{ color: theme.textMuted }}>
              {section.title} · {section.duration}s
            </p>
            {SELF_ANIMATING.has(section.component) ? (
              renderComponent(section, theme)
            ) : (
              <Reveal animation={section.animation}>{renderComponent(section, theme)}</Reveal>
            )}
          </section>
        ))}
      </div>

      <p className="text-white/40 text-[11px] mt-3">
        Scroll to move through the storyboard · {sections.length} sections
      </p>
    </div>
  );
}
