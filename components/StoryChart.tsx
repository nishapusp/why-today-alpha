import { StoryChart as StoryChartData } from "@/lib/types";
import { CategoryStyle } from "@/lib/categoryStyle";

/**
 * "One chart explains everything" — a per-story mini bar chart.
 *
 * Deliberately dependency-free (no recharts/chart.js): 3-6 horizontal bars
 * cost nothing at runtime, render identically in SSR, and can't break on
 * mobile. generate-edition.js validates the data shape before it ever gets
 * here, but we re-guard anyway since archive JSON is hand-editable.
 *
 * Server component. Renders nothing when the story has no chart.
 */
export default function StoryChart({
  chart,
  cat,
}: {
  chart?: StoryChartData;
  cat: CategoryStyle;
}) {
  if (
    !chart ||
    !Array.isArray(chart.labels) ||
    !Array.isArray(chart.values) ||
    chart.labels.length < 2 ||
    chart.labels.length !== chart.values.length ||
    !chart.values.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    return null;
  }

  const max = Math.max(...chart.values);
  const min = Math.min(...chart.values);
  // Bars scale from zero when all values are positive (honest proportions);
  // for mixed/negative series fall back to a min-based scale.
  const floor = min >= 0 ? 0 : min;
  const span = max - floor || 1;
  const latest = chart.values.length - 1;

  const formatValue = (v: number) => {
    const s = Math.abs(v) >= 1000 ? v.toLocaleString("en-IN") : String(v);
    return chart.unit ? `${s} ${chart.unit}` : s;
  };

  return (
    <section
      aria-label={`Chart: ${chart.title}`}
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-8"
    >
      <p className="text-xs font-mono uppercase tracking-wide text-[var(--text-secondary)] mb-1">
        📊 One chart explains it
      </p>
      <h3 className="font-display text-base text-[var(--text-primary)] mb-4 break-words">
        {chart.title}
      </h3>

      <div className="space-y-2.5">
        {chart.labels.map((label, i) => {
          const pct = Math.max(4, ((chart.values[i] - floor) / span) * 100);
          const isLatest = i === latest;
          return (
            <div key={`${label}-${i}`} className="grid grid-cols-[minmax(52px,auto)_1fr] items-center gap-2.5 min-w-0">
              <span
                className={`text-[11px] font-mono uppercase tracking-wide text-right ${isLatest ? "font-semibold" : ""}`}
                style={{ color: isLatest ? cat.accent : "var(--text-secondary)" }}
              >
                {label}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="h-5 rounded-md shrink-0 transition-[width]"
                  style={{
                    width: `${pct * 0.7}%`,
                    background: isLatest ? cat.accent : `${cat.accent}55`,
                  }}
                />
                <span
                  className={`text-xs whitespace-nowrap ${isLatest ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
                >
                  {formatValue(chart.values[i])}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {chart.takeaway && (
        <p
          className="text-[13px] leading-relaxed mt-4 pt-3 border-t border-[var(--border)] text-[var(--text-primary)]"
        >
          <span className="font-semibold" style={{ color: cat.deep }}>
            Takeaway:{" "}
          </span>
          {chart.takeaway}
        </p>
      )}
    </section>
  );
}
