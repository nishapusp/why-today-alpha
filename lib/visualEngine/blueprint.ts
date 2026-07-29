import { KeyNumber, Story } from "@/lib/types";
import { StoryNeighbor } from "@/components/StoryDetailView";
import { Classification, BlueprintSection, VisualBlueprint, VisualTheme } from "./types";

const MAX_TOTAL_DURATION = 35;
// Same convention as app/sitemap.ts's BASE constant.
const SITE_URL = "https://whytoday.in";

/**
 * Story prose occasionally carries **bold** markdown (deepDiveRead always
 * does, and — as seen in testing — summary/whyCare sometimes do too), but
 * motion components are plain-text display surfaces, not a markdown
 * renderer. Strip it once here rather than in every component.
 */
function stripMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|\s)\*([^*\s].*?)\*(?=\s|$)/g, "$1$2").trim();
}

function cleanKeyNumber(n: KeyNumber): KeyNumber {
  return {
    label: stripMarkdown(n.label),
    value: stripMarkdown(n.value),
    previousValue: n.previousValue ? stripMarkdown(n.previousValue) : n.previousValue,
    previousLabel: n.previousLabel ? stripMarkdown(n.previousLabel) : n.previousLabel,
    trendNote: n.trendNote ? stripMarkdown(n.trendNote) : n.trendNote,
  };
}

/** Shallow copy of the free-text fields the Visual Engine actually reads, markdown-stripped. */
function cleanStoryForVisuals(story: Story): Story {
  return {
    ...story,
    headline: stripMarkdown(story.headline),
    summary: stripMarkdown(story.summary),
    whyCare: stripMarkdown(story.whyCare),
    keyNumbers: (story.keyNumbers ?? []).map(cleanKeyNumber),
    ifYoureWondering: (story.ifYoureWondering ?? []).map((q) => ({ q: stripMarkdown(q.q), a: stripMarkdown(q.a) })),
    timeline: story.timeline?.map((t) => ({ date: stripMarkdown(t.date), event: stripMarkdown(t.event) })),
    chart: story.chart && { ...story.chart, title: stripMarkdown(story.chart.title), takeaway: stripMarkdown(story.chart.takeaway) },
    timeMachine: story.timeMachine && {
      ...story.timeMachine,
      pastEvents: story.timeMachine.pastEvents?.map((e) => ({
        period: stripMarkdown(e.period),
        headline: stripMarkdown(e.headline),
        detail: stripMarkdown(e.detail),
      })),
    },
  };
}

const REGION_KEYWORDS = [
  "India", "China", "US", "United States", "Maharashtra", "Tamil Nadu",
  "Karnataka", "Gujarat", "Delhi", "Mumbai", "Bengaluru", "Uttar Pradesh",
  "West Bengal", "Punjab", "Kerala", "Rajasthan", "Japan", "Europe",
  "Eurozone", "UK", "Russia", "Middle East", "Asia",
];

function section(
  title: string,
  component: BlueprintSection["component"],
  animation: BlueprintSection["animation"],
  visual_data: Record<string, unknown>,
  duration = 4
): BlueprintSection {
  return { title, component, animation, duration, visual_data };
}

const MAX_TIMELINE_ITEMS = 3;
const MAX_DETAIL_LENGTH = 70;

/** Cuts at the last whole word within the limit rather than mid-word. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/**
 * Prefers real `timeline` events; falls back to timeMachine's researched
 * past-events (which also carry a `detail` sentence, unlike plain
 * timeline). Capped and trimmed — this renders on one compact storyboard
 * card, not the full Time Machine feature on the story page, so it needs
 * a handful of the most essential beats, not the complete research.
 */
function timelineItemsFromStory(story: Story): { date: string; event: string; detail?: string }[] {
  const items = story.timeline?.length
    ? story.timeline.map((t) => ({ date: t.date, event: t.event }))
    : story.timeMachine?.pastEvents?.map((e) => ({
        date: e.period,
        event: e.headline,
        detail: e.detail ? truncate(e.detail, MAX_DETAIL_LENGTH) : undefined,
      })) ?? [];
  return items.slice(-MAX_TIMELINE_ITEMS);
}

function detectRegions(story: Story): string[] {
  const haystack = [story.headline, story.summary, story.whatHappened]
    .filter(Boolean)
    .join(" ");
  const found = REGION_KEYWORDS.filter((r) => new RegExp(`\\b${r}\\b`, "i").test(haystack));
  return Array.from(new Set(found)).slice(0, 6);
}

function buildComparisonData(story: Story) {
  const withHistory = (story.keyNumbers ?? []).filter((n) => n.previousValue);
  if (withHistory.length > 0) {
    return {
      left: {
        title: withHistory[0].previousLabel || "Before",
        stats: withHistory.map((n) => ({ label: n.label, value: n.previousValue as string })),
      },
      right: {
        title: "Now",
        stats: withHistory.map((n) => ({ label: n.label, value: n.value })),
      },
    };
  }
  const match = story.headline.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+)/i);
  const nums = story.keyNumbers ?? [];
  const half = Math.ceil(nums.length / 2);
  return {
    left: {
      title: match?.[1]?.trim() ?? story.headline,
      stats: nums.slice(0, half).map((n) => ({ label: n.label, value: n.value })),
    },
    right: {
      title: match?.[2]?.trim() ?? "Comparison",
      stats: nums.slice(half).map((n) => ({ label: n.label, value: n.value })),
    },
  };
}

function typeSections(story: Story, c: Classification): BlueprintSection[] {
  const anim = c.animation_priority;
  const topNumbers = (story.keyNumbers ?? []).slice(0, 4);

  switch (c.story_type) {
    case "timeline":
      return [section("Timeline", "Timeline", anim[0] ?? "slide-left", { items: timelineItemsFromStory(story) }, 5)];

    case "dashboard": {
      const out: BlueprintSection[] = [
        section("Dashboard", "Dashboard", anim[0] ?? "count-up", { stats: topNumbers }, 5),
      ];
      if (story.chart) {
        out.push(section(story.chart.title, "BarChart", "grow-bar", { chart: story.chart }, 5));
      }
      return out;
    }

    case "comparison":
      return [section("Comparison", "Comparison", anim[0] ?? "slide-left", buildComparisonData(story), 5)];

    case "process_flow":
      return [
        section("How It Works", "ProcessFlow", anim[0] ?? "slide-left", {
          variant: "process",
          steps: story.knowledgeChain ?? [],
        }, 5),
      ];

    case "cause_effect":
      return [
        section("The Chain Reaction", "ProcessFlow", anim[0] ?? "slide-left", {
          variant: "cause-effect",
          steps: story.knowledgeChain ?? [],
        }, 5),
        section("Impact", "ImpactCards", "highlight", buildImpactData(story), 4),
      ];

    case "data_story": {
      const out: BlueprintSection[] = [];
      if (story.chart) out.push(section(story.chart.title, "BarChart", "grow-bar", { chart: story.chart }, 5));
      if (topNumbers.length) out.push(section("By The Numbers", "Dashboard", "count-up", { stats: topNumbers }, 4));
      return out;
    }

    case "company_profile":
      return [
        section("The Company", "CompanyCard", "zoom", {
          headline: story.headline,
          category: story.category,
          sentiment: story.sentiment,
          stats: topNumbers,
        }, 5),
      ];

    case "map_story":
      return [
        section("Where It's Happening", "MapStory", "fade", {
          regions: detectRegions(story),
          stats: topNumbers,
        }, 4),
      ];

    case "money_flow": {
      const nums = story.keyNumbers ?? [];
      const [totalNum, ...rest] = nums;
      return [
        section("Where The Money Goes", "SankeyFlow", "grow-bar", {
          total: totalNum,
          segments: (rest.length ? rest : nums).map((n) => ({ label: n.label, value: n.value })),
        }, 5),
      ];
    }

    case "mixed":
    default:
      return topNumbers[0]
        ? [section(topNumbers[0].label, "StatisticCard", "count-up", { ...topNumbers[0] }, 4)]
        : [];
  }
}

function buildImpactData(story: Story) {
  const positive: string[] = [];
  const negative: string[] = [];
  for (const n of story.keyNumbers ?? []) {
    const line = n.trendNote || `${n.label}: ${n.value}`;
    if (n.previousValue && n.value === n.previousValue) continue;
    const isNegativeSentiment = story.sentiment === "critical" || story.sentiment === "caution";
    (isNegativeSentiment ? negative : positive).push(line);
  }
  if (!positive.length && !negative.length && story.whyCare) {
    (story.sentiment === "positive" ? positive : negative).push(story.whyCare.split(". ")[0] + ".");
  }
  return { positive, negative };
}

export function buildVisualBlueprint(
  story: Story,
  classification: Classification,
  theme: VisualTheme,
  neighbors?: { prev?: StoryNeighbor; next?: StoryNeighbor }
): VisualBlueprint {
  story = cleanStoryForVisuals(story);
  const sections: BlueprintSection[] = [];

  // 1. Hook
  sections.push(
    section(story.category, "QuoteCard", "zoom", { quote: story.summary, attribution: story.category }, 4)
  );

  // 2. Type-specific sections
  sections.push(...typeSections(story, classification));

  // 3. Context — Timeline (if not already used) else ImpactCards (if not already used)
  const used = new Set(sections.map((s) => s.component));
  const hasTimelineData = (story.timeline && story.timeline.length >= 2) || (story.timeMachine?.pastEvents?.length ?? 0) >= 2;
  if (!used.has("Timeline") && hasTimelineData) {
    sections.push(section("Timeline", "Timeline", "slide-left", { items: timelineItemsFromStory(story) }, 4));
  } else if (!used.has("ImpactCards")) {
    const impact = buildImpactData(story);
    if (impact.positive.length || impact.negative.length) {
      sections.push(section("Impact", "ImpactCards", "highlight", impact, 4));
    }
  }

  // 4. Fact
  if (story.ifYoureWondering?.length) {
    const item = story.ifYoureWondering[0];
    sections.push(section("Good Question", "FactBox", "fade", { question: item.q, answer: item.a }, 4));
  }

  // 5. Keep reading (optional, before the true closer)
  if (neighbors?.prev || neighbors?.next) {
    sections.push(section("Keep Reading", "WatchNext", "fade", { ...neighbors }, 3));
  }

  // 6. Close — the branded CTA card, always last (matches the reference
  // storyboard's outro: tagline + "Read Full Story" + QR).
  sections.push(
    section("Read More", "Outro", "fade", {
      tagline: "Financial learning, made easy.",
      ctaLabel: "Read Full Story →",
      url: `${SITE_URL}/story/${story.slug}`,
    }, 4)
  );

  // Cap total duration — trim optional middle sections (never the hook or
  // the closing Outro) starting from the least essential first.
  const trimOrder: BlueprintSection["component"][] = ["FactBox", "WatchNext", "ImpactCards", "StatisticCard"];
  let total = sections.reduce((t, s) => t + s.duration, 0);
  for (const comp of trimOrder) {
    if (total <= MAX_TOTAL_DURATION) break;
    const idx = sections.findIndex((s) => s.component === comp);
    if (idx > 0 && sections[idx].component !== "Outro") {
      total -= sections[idx].duration;
      sections.splice(idx, 1);
    }
  }

  return {
    hook: story.headline,
    theme,
    classification,
    sections,
  };
}
