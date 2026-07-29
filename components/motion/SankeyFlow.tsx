import { KeyNumber } from "@/lib/types";
import { VisualTheme } from "@/lib/visualEngine/types";
import { parseLeadingNumber } from "./parseNumber";

export interface FlowSegment {
  label: string;
  value: string;
}

export interface SankeyFlowProps {
  total?: KeyNumber;
  segments: FlowSegment[];
  theme: VisualTheme;
}

/**
 * Simplified stand-in for "Sankey Flow" — proportional stacked bars, not
 * curved Sankey link paths (would need a graph-layout library). Same JSON
 * shape a real Sankey component could consume later.
 */
export default function SankeyFlow({ total, segments, theme }: SankeyFlowProps) {
  if (!segments?.length) return null;
  const parsed = segments.map((s) => parseLeadingNumber(s.value) ?? 0);
  const max = Math.max(...parsed, 1);

  return (
    <div>
      {total && (
        <div className="mb-4 text-center">
          <p className="font-mono text-2xl font-bold" style={{ color: theme.accent }}>
            {total.value}
          </p>
          <p className="text-xs" style={{ color: theme.textMuted }}>
            {total.label}
          </p>
        </div>
      )}
      <div className="space-y-2.5">
        {segments.map((s, i) => (
          <div key={s.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
            <div className="min-w-0">
              <p className="text-xs truncate mb-1" style={{ color: theme.textMuted }}>
                {s.label}
              </p>
              <div className="h-4 rounded-md overflow-hidden" style={{ background: `${theme.accent}1a` }}>
                <div
                  className="h-full rounded-md transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.max(8, (parsed[i] / max) * 100)}%`, background: theme.accent }}
                />
              </div>
            </div>
            <span className="font-mono text-sm whitespace-nowrap" style={{ color: theme.text }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
