import { Edition } from "@/lib/types";

const TREND_STYLE: Record<string, { icon: string; color: string }> = {
  up: { icon: "↑", color: "var(--emerald)" },
  down: { icon: "↓", color: "var(--crimson)" },
  flat: { icon: "→", color: "var(--slate)" },
};

export default function TodaysNumber({ edition }: { edition: Edition }) {
  const trend = TREND_STYLE[edition.numberTrend] ?? TREND_STYLE.flat;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col justify-between h-full">
      <p className="text-xs font-mono uppercase tracking-wide text-[var(--emerald)] mb-2">
        Today's Number
      </p>
      <div className="flex items-center gap-3 mb-2">
        <span className="font-mono text-4xl font-semibold text-[var(--text-primary)]">
          {edition.numberValue}
        </span>
        <span
          className="text-2xl font-mono"
          style={{ color: trend.color }}
          aria-label={`trend ${edition.numberTrend}`}
        >
          {trend.icon}
        </span>
      </div>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
        {edition.numberLabel}
      </p>
      <a
        href="#"
        className="text-sm font-medium text-[var(--emerald)] hover:underline w-fit"
      >
        Why this number matters →
      </a>
    </div>
  );
}
