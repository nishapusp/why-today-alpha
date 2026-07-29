import { KeyNumber } from "@/lib/types";
import { VisualTheme } from "@/lib/visualEngine/types";
import StatisticCard from "./StatisticCard";

export interface DashboardProps {
  stats: KeyNumber[];
  theme: VisualTheme;
}

/** Economic-indicator grid — PMI/GDP/inflation-style stories. */
export default function Dashboard({ stats, theme }: DashboardProps) {
  if (!stats?.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.slice(0, 4).map((s, i) => (
        <StatisticCard
          key={s.label}
          {...s}
          theme={theme}
          size={stats.length > 2 ? "sm" : "lg"}
          color={theme.accentRotation[i % theme.accentRotation.length]}
        />
      ))}
    </div>
  );
}
