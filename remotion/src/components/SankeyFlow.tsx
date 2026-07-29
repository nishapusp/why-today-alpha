import React from "react";
import { interpolate } from "remotion";
import type { KeyNumber } from "../../../lib/types";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { parseLeadingNumber } from "../../../components/motion/parseNumber";
import { useEntranceProgress } from "../lib/entrance";

export interface FlowSegment {
  label: string;
  value: string;
}

export interface SankeyFlowProps {
  total?: KeyNumber;
  segments: FlowSegment[];
  theme: VisualTheme;
}

function Bar({ segment, index, max, theme }: { segment: FlowSegment; index: number; max: number; theme: VisualTheme }) {
  const progress = useEntranceProgress(index * 6);
  const parsed = parseLeadingNumber(segment.value) ?? 0;
  const targetPct = Math.max(8, (parsed / max) * 100);
  const widthPct = interpolate(progress, [0, 1], [0, targetPct]);
  return (
    <div>
      <p style={{ fontSize: 24, color: theme.textMuted, marginBottom: 8 }}>{segment.label}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ flex: 1, height: 32, borderRadius: 8, background: `${theme.accent}1a`, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${widthPct}%`, background: theme.accent, borderRadius: 8 }} />
        </div>
        <span style={{ fontSize: 28, color: theme.text, whiteSpace: "nowrap" }}>{segment.value}</span>
      </div>
    </div>
  );
}

// Simplified stand-in — proportional stacked bars, not curved Sankey links.
export default function SankeyFlow({ total, segments, theme }: SankeyFlowProps) {
  if (!segments?.length) return null;
  const parsedValues = segments.map((s) => parseLeadingNumber(s.value) ?? 0);
  const max = Math.max(...parsedValues, 1);

  return (
    <div>
      {total && (
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: 72, fontWeight: 700, color: theme.accent, margin: 0 }}>{total.value}</p>
          <p style={{ fontSize: 26, color: theme.textMuted, margin: 0 }}>{total.label}</p>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {segments.map((s, i) => (
          <Bar key={s.label} segment={s} index={i} max={max} theme={theme} />
        ))}
      </div>
    </div>
  );
}
