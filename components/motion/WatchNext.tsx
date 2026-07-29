import Link from "next/link";
import { StoryNeighbor, VisualTheme } from "@/lib/visualEngine/types";

export interface WatchNextProps {
  prev?: StoryNeighbor;
  next?: StoryNeighbor;
  theme: VisualTheme;
}

export default function WatchNext({ prev, next, theme }: WatchNextProps) {
  const items = [next, prev].filter((s): s is StoryNeighbor => Boolean(s));
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-mono uppercase tracking-wide mb-2" style={{ color: theme.accent }}>
        Keep reading
      </p>
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-xl p-3 transition-transform active:scale-[0.98]"
            style={{ background: theme.surface, border: `1px solid ${theme.border}` }}
          >
            <p className="text-sm leading-snug" style={{ color: theme.text }}>
              {item.headline}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
