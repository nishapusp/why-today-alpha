import { VisualTheme } from "@/lib/visualEngine/types";
import Reveal from "./Reveal";

export interface ImpactCardsProps {
  positive: string[];
  negative: string[];
  theme: VisualTheme;
}

export default function ImpactCards({ positive, negative, theme }: ImpactCardsProps) {
  if (!positive?.length && !negative?.length) return null;
  return (
    <div className="grid grid-cols-1 gap-3">
      {positive?.length > 0 && (
        <Reveal animation="slide-left">
          <div style={{ background: theme.surface, border: `1px solid ${theme.positive}55` }} className="rounded-2xl p-4">
            <p className="text-xs font-mono uppercase tracking-wide mb-2" style={{ color: theme.positive }}>
              ▲ Upside
            </p>
            <ul className="space-y-1.5">
              {positive.map((p, i) => (
                <li key={i} className="text-sm leading-snug" style={{ color: theme.text }}>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      )}
      {negative?.length > 0 && (
        <Reveal animation="slide-right" delay={150}>
          <div style={{ background: theme.surface, border: `1px solid ${theme.negative}55` }} className="rounded-2xl p-4">
            <p className="text-xs font-mono uppercase tracking-wide mb-2" style={{ color: theme.negative }}>
              ▼ Risk
            </p>
            <ul className="space-y-1.5">
              {negative.map((n, i) => (
                <li key={i} className="text-sm leading-snug" style={{ color: theme.text }}>
                  {n}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      )}
    </div>
  );
}
