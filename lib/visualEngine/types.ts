/**
 * Shared types for the WhyToday Visual Engine — classifies a Story into a
 * visual style and assembles a JSON storyboard that components/motion/*
 * render from. See app/visual-preview/[slug]/page.tsx for the entry point.
 */

export type StoryType =
  | "timeline"
  | "dashboard"
  | "comparison"
  | "process_flow"
  | "cause_effect"
  | "data_story"
  | "company_profile"
  | "map_story"
  | "money_flow"
  | "mixed";

export type MotionComponent =
  | "StatisticCard"
  | "Dashboard"
  | "Timeline"
  | "Comparison"
  | "ImpactCards"
  | "ProcessFlow"
  | "CompanyCard"
  | "QuoteCard"
  | "FactBox"
  | "WatchNext"
  | "MapStory"
  | "SankeyFlow"
  | "BarChart"
  | "Outro";

export type MotionAnimation =
  | "fade"
  | "slide-left"
  | "slide-right"
  | "count-up"
  | "draw-chart"
  | "grow-bar"
  | "zoom"
  | "highlight";

export interface Classification {
  story_type: StoryType;
  confidence: number; // 0-100
  recommended_style: string; // human-readable style name, e.g. "Animated Timeline"
  primary_visuals: MotionComponent[];
  animation_priority: MotionAnimation[];
  reason: string; // which rule matched — shown in the preview's debug panel
}

export type ThemeName =
  | "WhyToday"
  | "WhyToday Dark"
  | "Bloomberg"
  | "Financial Times"
  | "Dark Markets"
  | "India"
  | "Technology"
  | "Environment"
  | "Healthcare";

export interface VisualTheme {
  theme: ThemeName;
  background: string;
  surface: string; // card/panel background, one step off the base background
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  positive: string;
  negative: string;
  // Per-item color cycling for multi-stat/multi-node sections (StatisticCard
  // grids, Timeline dots) — the brand's actual reference video rotates a
  // different accent per item rather than using one flat accent throughout.
  accentRotation: string[];
}

// Canonical home for this shape (not components/StoryDetailView.tsx, which
// re-exports it) — a real .tsx component pulls in its own React-anchored
// type graph, which caused a React-18-vs-19 identity conflict when the
// isolated remotion/ workspace (React 18) imported it transitively via
// lib/visualEngine/blueprint.ts.
export interface StoryNeighbor {
  href: string;
  headline: string;
}

export interface BlueprintSection {
  title: string;
  component: MotionComponent;
  animation: MotionAnimation;
  duration: number; // seconds, 3-5
  visual_data: Record<string, unknown>;
}

export interface VisualBlueprint {
  hook: string;
  theme: VisualTheme;
  classification: Classification;
  sections: BlueprintSection[];
}
