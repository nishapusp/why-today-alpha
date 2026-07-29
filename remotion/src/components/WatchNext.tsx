import React from "react";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { useEntranceStyle } from "../lib/entrance";

export interface StoryNeighborLike {
  href: string;
  headline: string;
}

export interface WatchNextProps {
  prev?: StoryNeighborLike;
  next?: StoryNeighborLike;
  theme: VisualTheme;
}

// No click target in a rendered video — plain informational cards instead
// of the web version's <Link>.
export default function WatchNext({ prev, next, theme }: WatchNextProps) {
  const style = useEntranceStyle("fade");
  const items = [next, prev].filter((s): s is StoryNeighborLike => Boolean(s));
  if (!items.length) return null;
  return (
    <div style={style}>
      <p style={{ fontSize: 26, textTransform: "uppercase", color: theme.accent, marginBottom: 20 }}>Keep reading</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items.map((item) => (
          <div key={item.href} style={{ borderRadius: 24, padding: 28, background: theme.surface, border: `2px solid ${theme.border}` }}>
            <p style={{ fontSize: 30, color: theme.text, margin: 0 }}>{item.headline}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
