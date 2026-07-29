import React from "react";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { useEntranceStyle } from "../lib/entrance";

export interface QuoteCardProps {
  quote: string;
  attribution?: string;
  theme: VisualTheme;
}

export default function QuoteCard({ quote, attribution, theme }: QuoteCardProps) {
  const style = useEntranceStyle("zoom");
  return (
    <div style={{ ...style, textAlign: "center", padding: "0 24px" }}>
      <span style={{ fontSize: 120, lineHeight: 0.5, color: `${theme.accent}88` }}>&ldquo;</span>
      <p style={{ fontFamily: "Georgia, serif", fontSize: 52, lineHeight: 1.35, color: theme.text, marginTop: 24 }}>{quote}</p>
      {attribution && (
        <p style={{ fontSize: 26, textTransform: "uppercase", letterSpacing: 2, color: theme.accent, marginTop: 32 }}>{attribution}</p>
      )}
    </div>
  );
}
