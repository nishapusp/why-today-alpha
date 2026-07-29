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
  | "BarChart";

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
  text: string;
  textMuted: string;
  accent: string;
  positive: string;
  negative: string;
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
