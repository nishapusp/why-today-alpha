import { Category, Story } from "@/lib/types";
import { ThemeName, VisualTheme } from "./types";

/**
 * Standalone infographic color identities, deliberately separate from the
 * site's reading-mode tokens in app/globals-tokens.css (--navy/--emerald/
 * etc.) — these are distinct visual languages for the Visual Engine canvas,
 * not a light/dark reading theme.
 */
const PALETTES: Record<ThemeName, VisualTheme> = {
  Bloomberg: {
    theme: "Bloomberg",
    background: "#0a0a0a",
    surface: "#161616",
    text: "#f5f5f0",
    textMuted: "#9a9a90",
    accent: "#ff9f1c",
    positive: "#3ddc84",
    negative: "#ff5252",
  },
  "Financial Times": {
    theme: "Financial Times",
    background: "#fff1e5",
    surface: "#ffffff",
    text: "#1a1a1a",
    textMuted: "#66605a",
    accent: "#7d1a1a",
    positive: "#0e7c4a",
    negative: "#b3261e",
  },
  "Dark Markets": {
    theme: "Dark Markets",
    background: "#05070d",
    surface: "#10141f",
    text: "#eef1f8",
    textMuted: "#8892a6",
    accent: "#ff3b3b",
    positive: "#22c55e",
    negative: "#ff3b3b",
  },
  India: {
    theme: "India",
    background: "#0b1a33",
    surface: "#132441",
    text: "#f8f6f0",
    textMuted: "#a9b6cc",
    accent: "#ff9933",
    positive: "#128a3e",
    negative: "#d94141",
  },
  Technology: {
    theme: "Technology",
    background: "#0d1117",
    surface: "#161b22",
    text: "#e6edf3",
    textMuted: "#8b96a5",
    accent: "#5ce1ff",
    positive: "#3ddc84",
    negative: "#ff6b6b",
  },
  Environment: {
    theme: "Environment",
    background: "#0c1f16",
    surface: "#143324",
    text: "#eef7f0",
    textMuted: "#9fc2ac",
    accent: "#4ade80",
    positive: "#4ade80",
    negative: "#f87171",
  },
  Healthcare: {
    theme: "Healthcare",
    background: "#f0f9f8",
    surface: "#ffffff",
    text: "#0f2a27",
    textMuted: "#557d78",
    accent: "#14b8a6",
    positive: "#0e9d6e",
    negative: "#e0574c",
  },
};

// Environment/Healthcare have no matching Category today — kept in the
// palette table above per the spec's 7-theme list, reachable once such a
// category exists, but never selected by this mapping yet.
const THEME_BY_CATEGORY: Partial<Record<Category, ThemeName>> = {
  Corporate: "Financial Times",
  IPO: "Financial Times",
  Technology: "Technology",
  AI: "Technology",
  Startups: "Technology",
  World: "India",
  Policy: "India",
};

export function getVisualTheme(story: Story): VisualTheme {
  if (story.sentiment === "critical") {
    return PALETTES["Dark Markets"];
  }
  const name = THEME_BY_CATEGORY[story.category] ?? "Bloomberg";
  return PALETTES[name];
}

export function getAllThemes(): VisualTheme[] {
  return Object.values(PALETTES);
}
