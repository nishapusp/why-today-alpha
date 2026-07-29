import { VisualTheme } from "@/lib/visualEngine/types";
import Reveal from "./Reveal";

export interface TimelineItem {
  date: string;
  event: string;
}

export interface TimelineProps {
  items: TimelineItem[];
  theme: VisualTheme;
}

export default function Timeline({ items, theme }: TimelineProps) {
  if (!items?.length) return null;
  return (
    <div className="relative pl-5">
      <div className="absolute left-1.5 top-1 bottom-1 w-px" style={{ background: `${theme.accent}55` }} />
      <div className="space-y-4">
        {items.map((item, i) => (
          <Reveal key={`${item.date}-${i}`} animation="slide-left" delay={i * 130} className="relative">
            <span
              className="absolute -left-5 top-1 w-3 h-3 rounded-full"
              style={{ background: theme.accent }}
            />
            <p className="text-xs font-mono uppercase tracking-wide" style={{ color: theme.accent }}>
              {item.date}
            </p>
            <p className="text-sm mt-0.5 leading-snug" style={{ color: theme.text }}>
              {item.event}
            </p>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
