export type Sentiment = "positive" | "caution" | "critical" | "neutral";
export type Trend = "up" | "down" | "flat";
export type ThemeIcon = "shield" | "chart" | "globe" | "bank" | "cpu";
export type Category =
  | "Banking"
  | "Economy"
  | "Technology"
  | "World"
  | "Policy"
  | "Corporate";

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

export interface Story {
  headline: string;
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
