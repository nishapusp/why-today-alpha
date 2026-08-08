export type Sentiment = "positive" | "caution" | "critical" | "neutral";
export type Trend = "up" | "down" | "flat";
export type ThemeIcon = "shield" | "chart" | "globe" | "bank" | "cpu";
export type Category =
  | "Banking"
  | "Economy"
  | "Technology"
  | "World"
  | "Policy"
  | "Corporate"
  | "IPO"
  | "Startups"
  | "AI"
  | "Personal Finance"
  | "Real Estate"
  | "Auto & EV";

export interface KeyNumber {
  label: string;
  value: string;
  previousValue?: string; // for tap-to-compare — e.g. "6.25%"
  previousLabel?: string; // e.g. "3 months ago", "Same period last year"
  trendNote?: string; // one short sentence of context on the change
}

export interface WonderingItem {
  q: string;
  a: string;
}

export interface SourceLink {
  label: string;
  url: string;
}

export interface TimelineEvent {
  date: string;
  event: string;
}

export interface WordOfTheDay {
  term: string;
  definition: string;
}

export interface HeadlineImage {
  url: string;
  alt: string;
  credit: string; // photographer name, shown small even though Pexels doesn't require it
  creditUrl: string;
}

// Six steps of temporal context per story — reads top-to-bottom like time
// travel toward today. Generated with Search grounding; steps are 1-2
// sentences each. Older stories lack this entirely.
export interface TimeMachineEvent {
  period: string; // a real date/year label, e.g. "2018", "March 2024", "Last week" — NOT a fixed slot name
  headline: string; // short title for this event (a few words)
  detail: string; // the researched substance — real figures/outcomes, not a one-liner
}

export interface TimeMachine {
  today: string;
  future: string; // "What happens next?"
  // 2026-07-17: replaced the rigid yesterday/lastMonth/lastYear/tenYearsAgo
  // checkpoints with a flexible event list per explicit request — forcing
  // a fixed "what happened exactly 1 month ago" slot produced weak/padded
  // content when nothing significant actually happened at that specific
  // interval; a flexible "the events that actually mattered" naturally
  // surfaces only the strong material, clustered wherever real history
  // actually clusters rather than evenly spaced. today/future stay as
  // their own anchor fields (the current moment and its trajectory are a
  // different kind of thing than "a past event," not really "history").
  pastEvents?: TimeMachineEvent[];
  // OLD fixed-checkpoint fields — kept optional, never removed. Every
  // already-published story (this launched 2026-07 and has been
  // generating daily editions since) has these, not pastEvents.
  // TimeMachine.tsx renders whichever shape is present rather than this
  // being a breaking migration of historical data.
  yesterday?: string;
  lastMonth?: string;
  lastYear?: string;
  tenYearsAgo?: string;
}

// Optional per-story mini chart — only present when the story centers on a
// real measurable series. labels/values are same-length and chronological;
// generate-edition.js drops anything malformed before it reaches the UI.
export interface StoryChart {
  title: string;
  unit?: string; // e.g. "%", "₹ lakh crore"
  labels: string[]; // 3-6 short labels
  values: number[]; // same count as labels
  takeaway: string; // one sentence: what the chart proves
}

export interface QuizQuestion {
  question: string;
  options: string[]; // exactly 4
  answerIndex: number; // 0-3
  explanation?: string; // 1-2 sentences shown after answering
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  dateAdded: string; // YYYY-MM-DD of the edition that introduced it
}

export interface Story {
  headline: string;
  whatsappHeadline?: string; // curiosity-engine share variant, ≤9 words; older stories lack it
  notificationHeadline?: string; // push-style variant, ≤7 words; older stories lack it
  slug: string;
  category: Category;
  summary: string;
  quickRead: string;
  understandRead: string;
  deepDiveRead: string;
  whatHappened: string;
  whyToday: string;
  whyCare: string;
  whatNext: string;
  timeline?: TimelineEvent[];
  keyNumbers: KeyNumber[];
  knowledgeChain: string[];
  ifYoureWondering: WonderingItem[];
  officialSources: SourceLink[];
  readMinutes: number;
  sentiment: Sentiment;
  headlineImage?: HeadlineImage; // every story gets one, fetched from Pexels at generation time
  generatedAt?: string; // ISO timestamp stamped by generate-edition.js; older editions lack it
  quiz?: QuizQuestion[]; // 3-4 comprehension MCQs; older stories lack them
  timeMachine?: TimeMachine; // six-step temporal context; older stories lack it
  chart?: StoryChart; // optional "one chart explains everything" data block
}

export interface VocabularyItem {
  term: string;
  definition: string;
}

export interface QAItem {
  question: string;
  answer: string;
}

export interface Edition {
  date: string; // YYYY-MM-DD
  slug: string;
  themeTitle: string;
  themeDescription: string;
  themeIcon: ThemeIcon;
  numberValue: string;
  numberLabel: string;
  numberTrend: Trend;
  wordOfTheDay?: WordOfTheDay;
  podcastNotes?: string;
  stories: Story[];
  vocabulary: VocabularyItem[];
  questions: QAItem[];
}

export type ReadingLevel = "quick" | "understand" | "deep";

// Pulse / Quick Reads — the swipe feed, distinct from the flagship Story
// type above. Extractive (RSS headline + snippet + link out), not
// verified/deep-dived like flagship stories — see scripts/generate-quick-reads.js.
export interface QuickReadImage {
  url: string;
  alt: string;
  credit: string;
  creditUrl: string;
}

export interface QuickRead {
  id: string;
  headline: string;
  snippet: string;
  category: Category;
  source: string;
  corroboratedBy: string[]; // outlets independently covering the same event
  link: string | null; // original article, opens externally
  publishedAt: string | null;
  image: QuickReadImage | null;
}

export interface QuickReadsFeed {
  generatedAt: string;
  items: QuickRead[];
}
