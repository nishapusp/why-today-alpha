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
};

export function getCategoryStyle(category: Category | string): CategoryStyle {
  return CATEGORY_STYLE[category as Category] ?? CATEGORY_STYLE.Policy;
}
