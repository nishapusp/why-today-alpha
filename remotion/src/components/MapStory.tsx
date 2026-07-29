import React from "react";
import type { KeyNumber } from "../../../lib/types";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { useEntranceStyle } from "../lib/entrance";

export interface MapStoryProps {
  regions: string[];
  stats?: KeyNumber[];
  theme: VisualTheme;
}

function RegionTag({ region, index, value, theme }: { region: string; index: number; value?: string; theme: VisualTheme }) {
  const style = useEntranceStyle("fade", index * 5);
  return (
    <div style={{ ...style, borderRadius: 24, padding: 28, background: theme.surface, border: `2px solid ${theme.border}` }}>
      <p style={{ fontSize: 32, fontWeight: 700, color: theme.text, margin: 0 }}>📍 {region}</p>
      {value && <p style={{ fontSize: 26, color: theme.accent, marginTop: 8 }}>{value}</p>}
    </div>
  );
}

// Simplified stand-in — same caveat as components/motion/MapStory.tsx: a
// labeled region grid, not real cartography.
export default function MapStory({ regions, stats, theme }: MapStoryProps) {
  if (!regions?.length) return null;
  const paired = stats && stats.length === regions.length;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      {regions.map((region, i) => (
        <RegionTag key={region} region={region} index={i} value={paired ? stats![i].value : undefined} theme={theme} />
      ))}
    </div>
  );
}
