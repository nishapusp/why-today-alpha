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
}

export interface WonderingItem {
  q: string;
  a: string;
}

export interface SourceLink {
  label: string;
  url: string;
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
  keyNumbers: KeyNumber[];
  knowledgeChain: string[];
  ifYoureWondering: WonderingItem[];
  officialSources: SourceLink[];
  readMinutes: number;
  sentiment: Sentiment;
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
  stories: Story[];
  vocabulary: VocabularyItem[];
  questions: QAItem[];
}

export type ReadingLevel = "quick" | "understand" | "deep";
