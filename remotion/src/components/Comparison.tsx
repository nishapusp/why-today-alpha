import React from "react";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { useEntranceStyle } from "../lib/entrance";

export interface ComparisonSide {
  title: string;
  stats: { label: string; value: string }[];
}

export interface ComparisonProps {
  left: ComparisonSide;
  right: ComparisonSide;
  theme: VisualTheme;
}

function Side({ side, theme, align, animation }: { side: ComparisonSide; theme: VisualTheme; align: "left" | "right"; animation: "slide-left" | "slide-right" }) {
  const style = useEntranceStyle(animation);
  return (
    <div
      style={{
        ...style,
        flex: 1,
        borderRadius: 28,
        padding: 36,
        background: theme.surface,
        border: `2px solid ${theme.border}`,
        textAlign: align,
      }}
    >
      <p style={{ fontSize: 26, textTransform: "uppercase", color: theme.accent, margin: 0 }}>{side.title}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 16 }}>
        {side.stats.map((s) => (
          <div key={s.label}>
            <p style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 44, color: theme.text, margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: 22, color: theme.textMuted, margin: 0 }}>{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Comparison({ left, right, theme }: ComparisonProps) {
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
      <Side side={left} theme={theme} align="left" animation="slide-left" />
      <div style={{ display: "flex", alignItems: "center", fontSize: 30, color: theme.textMuted }}>vs</div>
      <Side side={right} theme={theme} align="right" animation="slide-right" />
    </div>
  );
}
