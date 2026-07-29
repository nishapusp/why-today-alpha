import { Story } from "@/lib/types";
import { Classification, MotionAnimation, MotionComponent, StoryType } from "./types";

/**
 * Rule-based story classifier — the first stage of the Visual Engine.
 * Deterministic and free (no LLM call), so it runs at render time on every
 * page view.
 *
 * Every rule is scored independently as a candidate (confidence + reason),
 * then the highest-confidence candidate wins — NOT first-match-wins. That
 * matters in practice: a single loose keyword hit buried in prose (e.g.
 * "...more public spending on infrastructure" inside a story's `whyCare`
 * paragraph) must not out-rank a strong structural signal like "this story
 * has a chart AND its keyNumbers labels are literally an IIP/PMI/GDP
 * reading" — scoring both and comparing avoids that. Keyword scans use
 * word-boundary regex, not substring `.includes()`, to avoid short
 * keywords (e.g. "how", "us") matching inside unrelated words ("however",
 * "trust", "focus").
 *
 * Kept as a pure function of Story so an LLM-based classifier (Prompt 1 in
 * the original spec) can later be swapped in as an alternate implementation
 * of the same `(story) => Classification` shape, run once at generation
 * time in scripts/generate-edition.js instead of on every request.
 */

const STYLE_LABEL: Record<StoryType, string> = {
  timeline: "Animated Timeline",
  dashboard: "Dashboard",
  comparison: "Split Screen",
  process_flow: "Step Flow",
  cause_effect: "Chain Diagram",
  data_story: "Data Story",
  company_profile: "Business Card",
  map_story: "Interactive Map",
  money_flow: "Sankey Flow",
  mixed: "Mixed",
};

const VISUALS_BY_TYPE: Record<StoryType, MotionComponent[]> = {
  timeline: ["Timeline", "StatisticCard", "FactBox"],
  dashboard: ["Dashboard", "BarChart", "StatisticCard"],
  comparison: ["Comparison", "StatisticCard", "FactBox"],
  process_flow: ["ProcessFlow", "StatisticCard", "FactBox"],
  cause_effect: ["ProcessFlow", "ImpactCards", "StatisticCard"],
  data_story: ["BarChart", "StatisticCard", "FactBox"],
  company_profile: ["CompanyCard", "StatisticCard", "FactBox"],
  map_story: ["MapStory", "StatisticCard", "FactBox"],
  money_flow: ["SankeyFlow", "StatisticCard", "FactBox"],
  mixed: ["Timeline", "StatisticCard", "ImpactCards"],
};

const ANIMATIONS_BY_TYPE: Record<StoryType, MotionAnimation[]> = {
  timeline: ["slide-left", "draw-chart", "fade"],
  dashboard: ["count-up", "grow-bar", "fade"],
  comparison: ["slide-left", "slide-right", "highlight"],
  process_flow: ["slide-left", "fade", "highlight"],
  cause_effect: ["slide-left", "highlight", "fade"],
  data_story: ["grow-bar", "count-up", "fade"],
  company_profile: ["zoom", "count-up", "fade"],
  map_story: ["fade", "highlight", "zoom"],
  money_flow: ["grow-bar", "fade", "highlight"],
  mixed: ["fade", "count-up", "slide-left"],
};

// Deliberately specific phrases only — generic single words like "tax",
// "revenue", or "spending" show up incidentally in almost any economy
// story's prose (e.g. "more public spending on infrastructure" as a
// downstream consequence) without the story actually being ABOUT a money
// flow, so they're excluded.
const MONEY_FLOW_KEYWORDS = [
  "budget", "subsidy", "subsidies", "allocation", "disbursement", "outlay",
  "fund flow", "taxation", "fiscal deficit", "government spending",
];
const CAUSAL_KEYWORDS = [
  "because", "triggered", "fell", "dropped", "crashed", "led to", "due to",
  "sparked", "wiped out", "plunge", "plunged",
];
const PROCESS_KEYWORDS = ["works", "transmission", "upi", "mechanism", "step by step", "how it works"];
const MACRO_KEYWORDS = ["pmi", "gdp", "inflation", "iip", "repo rate", "cpi", "wpi", "gva", "fiscal deficit", "index of industrial production"];
const REGION_KEYWORDS = [
  "china", "maharashtra", "tamil nadu", "karnataka", "gujarat", "delhi",
  "mumbai", "bengaluru", "uttar pradesh", "west bengal", "punjab", "kerala",
  "rajasthan", "japan", "eurozone", "russia", "middle east",
];

function tightText(story: Story): string {
  return [story.headline, story.summary].filter(Boolean).join(" ").toLowerCase();
}
function fullText(story: Story): string {
  return [story.headline, story.summary, story.whatHappened, story.whyToday, story.whyCare]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function countKeywordHits(text: string, keywords: string[]): number {
  return keywords.reduce((n, kw) => (new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(text) ? n + 1 : n), 0);
}

interface Candidate {
  story_type: StoryType;
  confidence: number;
  reason: string;
}

function candidatesFor(story: Story): Candidate[] {
  const tight = tightText(story);
  const full = fullText(story);
  const numberLabels = (story.keyNumbers ?? []).map((n) => n.label.toLowerCase()).join(" ");
  const candidates: Candidate[] = [{ story_type: "mixed", confidence: 25, reason: "fallback floor" }];

  if (story.category === "Corporate" || story.category === "IPO") {
    candidates.push({ story_type: "company_profile", confidence: 92, reason: `category is "${story.category}"` });
  }

  const hasVsInHeadline = / vs\.? | versus /i.test(story.headline);
  const withHistory = (story.keyNumbers ?? []).filter((n) => n.previousValue).length;
  if (hasVsInHeadline) {
    candidates.push({ story_type: "comparison", confidence: 88, reason: '"vs"/"versus" in headline' });
  } else if (story.category === "World" && withHistory >= 1 && (story.keyNumbers ?? []).length >= 2) {
    candidates.push({ story_type: "comparison", confidence: 45, reason: "comparable then/now figures in a World story" });
  }

  const macroHits = countKeywordHits(tight + " " + numberLabels, MACRO_KEYWORDS);
  if (story.chart && macroHits >= 1) {
    candidates.push({
      story_type: "dashboard",
      confidence: Math.min(95, 75 + macroHits * 6),
      reason: `chart present + macro-indicator keyword match (${macroHits})`,
    });
  }
  if (story.chart) {
    candidates.push({ story_type: "data_story", confidence: 58, reason: "chart present" });
  } else if ((story.keyNumbers ?? []).length >= 3) {
    candidates.push({ story_type: "data_story", confidence: 38, reason: `${story.keyNumbers.length} key numbers, no chart` });
  }

  const causalHits = countKeywordHits(full, CAUSAL_KEYWORDS);
  if ((story.sentiment === "critical" || story.sentiment === "caution") && causalHits >= 1) {
    candidates.push({
      story_type: "cause_effect",
      confidence: Math.min(85, 42 + causalHits * 10),
      reason: `${story.sentiment} sentiment + causal language (${causalHits} hits)`,
    });
  }

  const processHits = countKeywordHits(tight, PROCESS_KEYWORDS);
  if ((story.category === "Technology" || story.category === "Banking") && processHits >= 1) {
    candidates.push({
      story_type: "process_flow",
      confidence: Math.min(80, 40 + processHits * 15),
      reason: `${story.category} + mechanism keywords in headline/summary (${processHits} hits)`,
    });
  }

  const moneyHitsTight = countKeywordHits(tight, MONEY_FLOW_KEYWORDS);
  const moneyHitsFull = countKeywordHits(full, MONEY_FLOW_KEYWORDS);
  if (moneyHitsTight >= 1) {
    candidates.push({
      story_type: "money_flow",
      confidence: Math.min(85, 55 + moneyHitsTight * 12),
      reason: `budget/subsidy/allocation keyword in headline/summary (${moneyHitsTight})`,
    });
  } else if (moneyHitsFull >= 1) {
    candidates.push({
      story_type: "money_flow",
      confidence: 22 + moneyHitsFull * 5,
      reason: `budget/subsidy/allocation keyword only in body text (${moneyHitsFull})`,
    });
  }

  const regionHitsTight = countKeywordHits(tight + " " + numberLabels, REGION_KEYWORDS);
  if (regionHitsTight >= 2) {
    candidates.push({
      story_type: "map_story",
      confidence: Math.min(80, 45 + regionHitsTight * 10),
      reason: `${regionHitsTight} region/geography mentions in headline/summary`,
    });
  }

  if (story.timeline && story.timeline.length >= 2) {
    candidates.push({ story_type: "timeline", confidence: 65, reason: `${story.timeline.length} timeline events` });
  } else if (story.timeMachine?.pastEvents && story.timeMachine.pastEvents.length >= 2) {
    candidates.push({ story_type: "timeline", confidence: 35, reason: "timeMachine.pastEvents used as a timeline" });
  }

  return candidates;
}

export function classifyStory(story: Story): Classification {
  const candidates = candidatesFor(story);
  const best = candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  return {
    story_type: best.story_type,
    confidence: best.confidence,
    recommended_style: STYLE_LABEL[best.story_type],
    primary_visuals: VISUALS_BY_TYPE[best.story_type],
    animation_priority: ANIMATIONS_BY_TYPE[best.story_type],
    reason: best.reason,
  };
}
