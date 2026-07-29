import { VisualTheme } from "@/lib/visualEngine/types";
import Reveal from "./Reveal";

export interface ComparisonSide {
  title: string;
  stats: { label: string; value: string }[];
}

export interface ComparisonProps {
  left: ComparisonSide;
  right: ComparisonSide;
  theme: VisualTheme;
}

function Side({ side, theme, align }: { side: ComparisonSide; theme: VisualTheme; align: "left" | "right" }) {
  return (
    <div
      className="rounded-2xl p-4 flex-1 min-w-0"
      style={{ background: theme.surface, border: `1px solid ${theme.accent}33`, textAlign: align }}
    >
      <p className="text-xs font-mono uppercase tracking-wide mb-2" style={{ color: theme.accent }}>
        {side.title}
      </p>
      <div className="space-y-2">
        {side.stats.map((s) => (
          <div key={s.label}>
            <p className="font-mono font-semibold text-lg" style={{ color: theme.text }}>
              {s.value}
            </p>
            <p className="text-[11px]" style={{ color: theme.textMuted }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Comparison({ left, right, theme }: ComparisonProps) {
  return (
    <div className="flex gap-3 items-stretch">
      <Reveal animation="slide-left" className="flex-1 min-w-0">
        <Side side={left} theme={theme} align="left" />
      </Reveal>
      <div className="flex items-center font-mono text-sm" style={{ color: theme.textMuted }}>
        vs
      </div>
      <Reveal animation="slide-right" className="flex-1 min-w-0">
        <Side side={right} theme={theme} align="right" />
      </Reveal>
    </div>
  );
}
