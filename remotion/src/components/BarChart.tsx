import React from "react";
import { interpolate } from "remotion";
import type { StoryChart as StoryChartData } from "../../../lib/types";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { useEntranceProgress } from "../lib/entrance";

export interface BarChartProps {
  chart: StoryChartData;
  theme: VisualTheme;
}

const VIEW_W = 960;
const PLOT_TOP = 100;
const PLOT_BOTTOM = 420;
const LABEL_Y = 480;

function formatValue(v: number, unit?: string) {
  const s = Math.abs(v) >= 1000 ? v.toLocaleString("en-IN") : String(v);
  return unit ? `${s}${unit === "%" ? unit : ` ${unit}`}` : s;
}

// Video variant of components/motion/BarChart.tsx's animated line-and-dot
// chart — same visual design, but the "draw" is a direct interpolate() of
// stroke-dashoffset against frame time instead of a CSS transition (which
// doesn't play deterministically during headless rendering).
export default function BarChart({ chart, theme }: BarChartProps) {
  const progress = useEntranceProgress();

  if (
    !chart ||
    !Array.isArray(chart.labels) ||
    !Array.isArray(chart.values) ||
    chart.labels.length < 2 ||
    chart.labels.length !== chart.values.length
  ) {
    return null;
  }

  const n = chart.values.length;
  const max = Math.max(...chart.values);
  const min = Math.min(...chart.values);
  const span = max - min || 1;
  const xs = chart.labels.map((_, i) => 60 + i * ((VIEW_W - 120) / (n - 1)));
  const ys = chart.values.map((v) => PLOT_BOTTOM - ((v - min) / span) * (PLOT_BOTTOM - PLOT_TOP));
  const points = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  const latest = n - 1;

  return (
    <div>
      <svg viewBox={`0 0 ${VIEW_W} ${LABEL_Y + 30}`} width="100%" style={{ overflow: "visible" }}>
        <polyline
          points={points}
          fill="none"
          stroke={theme.accent}
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: interpolate(progress, [0, 1], [1, 0]) }}
        />
        <line x1={48} y1={PLOT_BOTTOM + 24} x2={VIEW_W - 48} y2={PLOT_BOTTOM + 24} stroke={theme.border} strokeWidth={2} />
        {xs.map((x, i) => (
          <g key={i} style={{ opacity: interpolate(progress, [i / n, Math.min(1, (i + 1) / n)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            <circle cx={x} cy={ys[i]} r={i === latest ? 15 : 12} fill={i === latest ? theme.accent : theme.background} stroke={theme.accent} strokeWidth={6} />
            <text x={x} y={ys[i] - 34} textAnchor="middle" fontSize={34} fontWeight={i === latest ? 700 : 500} fill={i === latest ? theme.accent : theme.textMuted}>
              {formatValue(chart.values[i], chart.unit)}
            </text>
            <text x={x} y={LABEL_Y} textAnchor="middle" fontSize={28} fill={theme.textMuted}>
              {chart.labels[i]}
            </text>
          </g>
        ))}
      </svg>
      {chart.takeaway && (
        <p style={{ fontSize: 28, color: theme.textMuted, marginTop: 24, paddingTop: 24, borderTop: `2px solid ${theme.border}`, lineHeight: 1.4 }}>
          {chart.takeaway}
        </p>
      )}
    </div>
  );
}
