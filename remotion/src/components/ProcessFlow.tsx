import React from "react";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { useEntranceStyle } from "../lib/entrance";

export interface ProcessFlowProps {
  variant: "process" | "cause-effect";
  steps: string[];
  theme: VisualTheme;
}

function Step({ step, index, isChain, theme }: { step: string; index: number; isChain: boolean; theme: VisualTheme }) {
  const style = useEntranceStyle("slide-left", index * 8);
  const color = isChain ? theme.negative : theme.accent;
  return (
    <div style={style}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, borderRadius: 24, padding: 24, background: theme.surface, border: `2px solid ${theme.border}` }}>
        <span
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: `${color}22`,
            color,
            fontSize: 28,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {index + 1}
        </span>
        <p style={{ fontSize: 32, color: theme.text, margin: 0 }}>{step}</p>
      </div>
    </div>
  );
}

export default function ProcessFlow({ variant, steps, theme }: ProcessFlowProps) {
  if (!steps?.length) return null;
  const isChain = variant === "cause-effect";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {steps.map((step, i) => (
        <Step key={`${step}-${i}`} step={step} index={i} isChain={isChain} theme={theme} />
      ))}
    </div>
  );
}
