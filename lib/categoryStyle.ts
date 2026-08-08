import { Category } from "./types";

export interface CategoryStyle {
  icon: string;
  accent: string; // saturated, used for text/borders/CTAs
  tint: string; // pale card background
  deep: string; // darker shade, used for text-on-tint and hero gradients
}

/**
 * One color identity per category — used to tint story cards, hero bands on
 * the story page, and the knowledge chain. Kept muted (not primary-saturated)
 * so a page full of them reads as considered, not like a toy.
 */
export const CATEGORY_STYLE: Record<Category, CategoryStyle> = {
  Banking: {
    icon: "🏦",
    accent: "#B8862E",
    tint: "#FBF3E2",
    deep: "#8A6420",
  },
  Economy: {
    icon: "📊",
    accent: "#B14A34",
    tint: "#FBEAE5",
    deep: "#8A3826",
  },
  Technology: {
    icon: "🔷",
    accent: "#1F6F63",
    tint: "#E7F2EF",
    deep: "#154E45",
  },
  World: {
    icon: "🌐",
    accent: "#3767C9",
    tint: "#EAF0FC",
    deep: "#25489E",
  },
  Policy: {
    icon: "📋",
    accent: "#3E4C8A",
    tint: "#EBEDF7",
    deep: "#2E3A6B",
  },
  Corporate: {
    icon: "🏢",
    accent: "#7A4B6B",
    tint: "#F5EDF2",
    deep: "#5C3850",
  },
  IPO: {
    icon: "🔔",
    accent: "#B08628",
    tint: "#FBF2DF",
    deep: "#82611B",
  },
  Startups: {
    icon: "🚀",
    accent: "#2E7D6B",
    tint: "#E6F3EE",
    deep: "#1F594B",
  },
  AI: {
    icon: "✨",
    accent: "#4A5FBF",
    tint: "#ECEFFB",
    deep: "#333F8C",
  },
  "Personal Finance": {
    icon: "💰",
    accent: "#2E7D32",
    tint: "#E9F5EA",
    deep: "#1E5C22",
  },
  "Real Estate": {
    icon: "🏗️",
    accent: "#946A3E",
    tint: "#F5EEE4",
    deep: "#6D4C28",
  },
  "Auto & EV": {
    icon: "🚗",
    accent: "#C24B2E",
    tint: "#FBEBE5",
    deep: "#8F361F",
  },
};

export function getCategoryStyle(category: Category | string): CategoryStyle {
  return CATEGORY_STYLE[category as Category] ?? CATEGORY_STYLE.Policy;
}

// URL-safe anchor id for a category name — several categories now contain
// spaces/ampersands ("Personal Finance", "Auto & EV") that aren't valid
// as-is in a fragment link.
export function categoryAnchor(category: Category | string): string {
  return category.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Fixed order so every category-grouped section (today's stories, archive,
// sector nav) reads the same way every day, rather than shuffling with
// whatever order Object.keys happened to return. Single source of truth —
// shared across all category-grouped homepage sections.
export const CATEGORY_ORDER: Category[] = [
  "Banking",
  "Economy",
  "Personal Finance",
  "Real Estate",
  "Technology",
  "AI",
  "Auto & EV",
  "World",
  "Policy",
  "Corporate",
  "IPO",
  "Startups",
];
