import { VisualTheme } from "@/lib/visualEngine/types";
import Reveal from "./Reveal";

export interface TimelineItem {
  date: string;
  event: string;
  detail?: string;
}

export interface TimelineProps {
  items: TimelineItem[];
  theme: VisualTheme;
}

export default function Timeline({ items, theme }: TimelineProps) {
  if (!items?.length) return null;
  return (
    <div className="relative pl-6">
      <div className="absolute left-[7px] top-1 bottom-1 w-px" style={{ background: theme.border }} />
      <div className="space-y-5">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const color = theme.accentRotation[i % theme.accentRotation.length];
          return (
            <Reveal key={`${item.date}-${i}`} animation="slide-left" delay={i * 150} className="relative">
              <span
                className="absolute top-1 rounded-full border-2"
                style={{
                  left: isLast ? "-25px" : "-22px",
                  width: isLast ? 16 : 10,
                  height: isLast ? 16 : 10,
                  background: color,
                  borderColor: theme.background,
                }}
              />
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.textMuted }}>
                {item.date}
              </p>
              <p className="font-display text-base font-semibold mt-0.5" style={{ color }}>
                {item.event}
              </p>
              {item.detail && (
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: theme.textMuted }}>
                  {item.detail}
                </p>
              )}
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
