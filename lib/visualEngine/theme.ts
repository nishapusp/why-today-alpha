import { Story } from "@/lib/types";
import { ThemeName, VisualTheme } from "./types";

// Same brand colors as app/globals-tokens.css (--gold, --emerald, --crimson,
// --soft-blue) — the reference storyboard video turned out to use this
// exact palette, just applied to a dedicated infographic layout rather than
// the reading UI. --violet has no equivalent in globals-tokens.css; it's a
// Visual-Engine-only addition for the 5th rotation slot (matches the
// "Time Machine" signature badge/dots in the reference video).
const GOLD = "#c8952f";
const EMERALD = "#0e9d6e";
const CRIMSON = "#c93b3b";
const SOFT_BLUE = "#3767c9";
const VIOLET = "#7c5cbf";

const WHY_TODAY_ROTATION = [GOLD, SOFT_BLUE, EMERALD, CRIMSON, VIOLET];

const PALETTES: Record<ThemeName, VisualTheme> = {
  WhyToday: {
    theme: "WhyToday",
    background: "#fffdf7",
    surface: "#ffffff",
    border: "#e8e3d9",
    text: "#12161f",
    textMuted: "#5b6472",
    accent: GOLD,
    positive: EMERALD,
    negative: CRIMSON,
    accentRotation: WHY_TODAY_ROTATION,
  },
  Bloomberg: {
    theme: "Bloomberg",
    background: "#0a0a0a",
    surface: "#161616",
    border: "#ff9f1c33",
    text: "#f5f5f0",
    textMuted: "#9a9a90",
    accent: "#ff9f1c",
    positive: "#3ddc84",
    negative: "#ff5252",
    accentRotation: ["#ff9f1c", "#3ddc84", "#5ce1ff", "#ff5252", "#c9a9ff"],
  },
  "Financial Times": {
    theme: "Financial Times",
    background: "#fff1e5",
    surface: "#ffffff",
    border: "#7d1a1a33",
    text: "#1a1a1a",
    textMuted: "#66605a",
    accent: "#7d1a1a",
    positive: "#0e7c4a",
    negative: "#b3261e",
    accentRotation: ["#7d1a1a", "#0e7c4a", "#b3261e", "#66605a", "#a56a3c"],
  },
  "Dark Markets": {
    theme: "Dark Markets",
    background: "#05070d",
    surface: "#10141f",
    border: "#ff3b3b33",
    text: "#eef1f8",
    textMuted: "#8892a6",
    accent: "#ff3b3b",
    positive: "#22c55e",
    negative: "#ff3b3b",
    accentRotation: ["#ff3b3b", "#22c55e", "#5ce1ff", "#c9a9ff", "#ff9f1c"],
  },
  India: {
    theme: "India",
    background: "#0b1a33",
    surface: "#132441",
    border: "#ff993333",
    text: "#f8f6f0",
    textMuted: "#a9b6cc",
    accent: "#ff9933",
    positive: "#128a3e",
    negative: "#d94141",
    accentRotation: ["#ff9933", "#128a3e", "#d94141", "#5ce1ff", "#c9a9ff"],
  },
  Technology: {
    theme: "Technology",
    background: "#0d1117",
    surface: "#161b22",
    border: "#5ce1ff33",
    text: "#e6edf3",
    textMuted: "#8b96a5",
    accent: "#5ce1ff",
    positive: "#3ddc84",
    negative: "#ff6b6b",
    accentRotation: ["#5ce1ff", "#3ddc84", "#ff6b6b", "#c9a9ff", "#ff9f1c"],
  },
  Environment: {
    theme: "Environment",
    background: "#0c1f16",
    surface: "#143324",
    border: "#4ade8033",
    text: "#eef7f0",
    textMuted: "#9fc2ac",
    accent: "#4ade80",
    positive: "#4ade80",
    negative: "#f87171",
    accentRotation: ["#4ade80", "#5ce1ff", "#f87171", "#c9a9ff", "#ff9f1c"],
  },
  Healthcare: {
    theme: "Healthcare",
    background: "#f0f9f8",
    surface: "#ffffff",
    border: "#14b8a633",
    text: "#0f2a27",
    textMuted: "#557d78",
    accent: "#14b8a6",
    positive: "#0e9d6e",
    negative: "#e0574c",
    accentRotation: ["#14b8a6", "#0e9d6e", "#e0574c", "#3767c9", "#7c5cbf"],
  },
};

/**
 * The reference storyboard video (the actual brand asset, not a mockup of
 * one) makes clear WhyToday has a single consistent visual identity — light
 * background, gold/navy brand chrome, per-item color rotation — rather than
 * a different "mood" per category. So this always returns the WhyToday
 * palette now. The other 7 palettes stay defined (and reachable via
 * getAllThemes) as alternate looks for later, but aren't selected by
 * default anymore.
 */
// `story` kept in the signature (matching classifyStory's shape) since
// per-story theme selection is the obvious next step once there's more
// than one look.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getVisualTheme(_story: Story): VisualTheme {
  return PALETTES.WhyToday;
}

export function getAllThemes(): VisualTheme[] {
  return Object.values(PALETTES);
}
