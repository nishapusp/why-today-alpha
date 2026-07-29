import { StoryChart as StoryChartData } from "@/lib/types";
import { VisualTheme } from "@/lib/visualEngine/types";

export interface BarChartProps {
  chart: StoryChartData;
  theme: VisualTheme;
}

/** Infographic-styled variant of StoryChart.tsx's bar logic, for data_story/dashboard sections. */
export default function BarChart({ chart, theme }: BarChartProps) {
  if (
    !chart ||
    !Array.isArray(chart.labels) ||
    !Array.isArray(chart.values) ||
    chart.labels.length < 2 ||
    chart.labels.length !== chart.values.length
  ) {
    return null;
  }

  const max = Math.max(...chart.values);
  const min = Math.min(...chart.values);
  const floor = min >= 0 ? 0 : min;
  const span = max - floor || 1;
  const latest = chart.values.length - 1;

  const formatValue = (v: number) => {
    const s = Math.abs(v) >= 1000 ? v.toLocaleString("en-IN") : String(v);
    return chart.unit ? `${s} ${chart.unit}` : s;
  };

  return (
    <div>
      <div className="space-y-2.5">
        {chart.labels.map((label, i) => {
          const pct = Math.max(6, ((chart.values[i] - floor) / span) * 100);
          const isLatest = i === latest;
          return (
            <div key={`${label}-${i}`} className="grid grid-cols-[minmax(48px,auto)_1fr] items-center gap-2.5">
              <span
                className="text-[11px] font-mono uppercase tracking-wide text-right"
                style={{ color: isLatest ? theme.accent : theme.textMuted }}
              >
                {label}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="h-5 rounded-md shrink-0 transition-[width] duration-700 ease-out"
                  style={{ width: `${pct * 0.7}%`, background: isLatest ? theme.accent : `${theme.accent}55` }}
                />
                <span className="text-xs whitespace-nowrap" style={{ color: theme.text }}>
                  {formatValue(chart.values[i])}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {chart.takeaway && (
        <p className="text-xs leading-relaxed mt-4 pt-3" style={{ color: theme.textMuted, borderTop: `1px solid ${theme.accent}22` }}>
          {chart.takeaway}
        </p>
      )}
    </div>
  );
}
