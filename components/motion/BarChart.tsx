"use client";

import { StoryChart as StoryChartData } from "@/lib/types";
import { VisualTheme } from "@/lib/visualEngine/types";
import { useInView } from "./useInView";

export interface BarChartProps {
  chart: StoryChartData;
  theme: VisualTheme;
}

const VIEW_W = 320;
const PLOT_TOP = 34;
const PLOT_BOTTOM = 130;
const LABEL_Y = 152;

function formatValue(v: number, unit?: string) {
  const s = Math.abs(v) >= 1000 ? v.toLocaleString("en-IN") : String(v);
  return unit ? `${s}${unit === "%" ? unit : ` ${unit}`}` : s;
}

/**
 * Animated line-and-dot trend chart — matches the reference brand
 * storyboard's "Growth by Sector"/"IIP Growth Trend" slides (a connected
 * line with circular markers), not horizontal bars. The line "draws" in via
 * an SVG pathLength=1 + stroke-dashoffset transition, which is what the
 * "draw-chart" animation (defined in lib/visualEngine/types.ts but unused
 * until now) was always meant for.
 */
export default function BarChart({ chart, theme }: BarChartProps) {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);

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
  const xs = chart.labels.map((_, i) => 20 + i * ((VIEW_W - 40) / (n - 1)));
  const ys = chart.values.map((v) => PLOT_BOTTOM - ((v - min) / span) * (PLOT_BOTTOM - PLOT_TOP));
  const points = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  const latest = n - 1;

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${VIEW_W} ${LABEL_Y + 10}`} className="w-full h-auto overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke={theme.accent}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: inView ? 0 : 1,
            transition: "stroke-dashoffset 1.1s ease-out",
          }}
        />
        <line x1={16} y1={PLOT_BOTTOM + 8} x2={VIEW_W - 16} y2={PLOT_BOTTOM + 8} stroke={theme.border} strokeWidth={1} />
        {xs.map((x, i) => (
          <g
            key={i}
            style={{
              opacity: inView ? 1 : 0,
              transition: `opacity 400ms ease-out ${150 + i * 140}ms`,
            }}
          >
            <circle cx={x} cy={ys[i]} r={i === latest ? 5 : 4} fill={i === latest ? theme.accent : theme.background} stroke={theme.accent} strokeWidth={2} />
            <text
              x={x}
              y={ys[i] - 12}
              textAnchor="middle"
              fontSize={13}
              fontWeight={i === latest ? 700 : 500}
              fill={i === latest ? theme.accent : theme.textMuted}
            >
              {formatValue(chart.values[i], chart.unit)}
            </text>
            <text x={x} y={LABEL_Y} textAnchor="middle" fontSize={11} fill={theme.textMuted}>
              {chart.labels[i]}
            </text>
          </g>
        ))}
      </svg>
      {chart.takeaway && (
        <p className="text-xs leading-relaxed mt-3 pt-3" style={{ color: theme.textMuted, borderTop: `1px solid ${theme.border}` }}>
          {chart.takeaway}
        </p>
      )}
    </div>
  );
}
