import React from "react";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { useEntranceStyle } from "../lib/entrance";

export interface FactBoxProps {
  question: string;
  answer: string;
  theme: VisualTheme;
}

export default function FactBox({ question, answer, theme }: FactBoxProps) {
  const style = useEntranceStyle("fade");
  return (
    <div style={{ ...style, borderRadius: 28, padding: 40, background: theme.surface, border: `2px solid ${theme.border}` }}>
      <p style={{ fontSize: 26, textTransform: "uppercase", color: theme.accent, margin: 0 }}>If you&rsquo;re wondering</p>
      <p style={{ fontSize: 34, fontWeight: 700, color: theme.text, margin: "16px 0 8px" }}>{question}</p>
      <p style={{ fontSize: 28, color: theme.textMuted, margin: 0, lineHeight: 1.4 }}>{answer}</p>
    </div>
  );
}
