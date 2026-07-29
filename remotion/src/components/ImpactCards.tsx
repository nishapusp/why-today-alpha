import React from "react";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { useEntranceStyle } from "../lib/entrance";

export interface ImpactCardsProps {
  positive: string[];
  negative: string[];
  theme: VisualTheme;
}

function Block({ title, items, color, theme, animation }: { title: string; items: string[]; color: string; theme: VisualTheme; animation: "slide-left" | "slide-right" }) {
  const style = useEntranceStyle(animation);
  return (
    <div style={{ ...style, borderRadius: 28, padding: 36, background: theme.surface, border: `2px solid ${color}88` }}>
      <p style={{ fontSize: 26, textTransform: "uppercase", color, margin: 0 }}>{title}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        {items.map((item, i) => (
          <p key={i} style={{ fontSize: 30, color: theme.text, margin: 0 }}>
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function ImpactCards({ positive, negative, theme }: ImpactCardsProps) {
  if (!positive?.length && !negative?.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {positive?.length > 0 && <Block title="▲ Upside" items={positive} color={theme.positive} theme={theme} animation="slide-left" />}
      {negative?.length > 0 && <Block title="▼ Risk" items={negative} color={theme.negative} theme={theme} animation="slide-right" />}
    </div>
  );
}
