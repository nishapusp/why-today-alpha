import { KeyNumber } from "@/lib/types";
import { VisualTheme } from "@/lib/visualEngine/types";
import Reveal from "./Reveal";

export interface MapStoryProps {
  regions: string[];
  stats?: KeyNumber[];
  theme: VisualTheme;
}

/**
 * Simplified stand-in for "Interactive Map" — a labeled region grid, not a
 * real projection/cartography (no geo library in this project yet). Pairs
 * positionally with keyNumbers when the counts line up, otherwise just
 * surfaces the detected place names as tags. Swap for a real map component
 * later without changing this JSON shape.
 */
export default function MapStory({ regions, stats, theme }: MapStoryProps) {
  if (!regions?.length) return null;
  const paired = stats && stats.length === regions.length;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {regions.map((region, i) => (
        <Reveal key={region} animation="fade" delay={i * 100}>
          <div
            className="rounded-xl p-3"
            style={{ background: theme.surface, border: `1px solid ${theme.accent}33` }}
          >
            <p className="text-sm font-semibold" style={{ color: theme.text }}>
              📍 {region}
            </p>
            {paired && (
              <p className="text-xs font-mono mt-1" style={{ color: theme.accent }}>
                {stats![i].value}
              </p>
            )}
          </div>
        </Reveal>
      ))}
    </div>
  );
}
