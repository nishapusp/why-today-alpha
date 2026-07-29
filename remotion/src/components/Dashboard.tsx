import React from "react";
import type { KeyNumber } from "../../../lib/types";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import StatisticCard from "./StatisticCard";

export interface DashboardProps {
  stats: KeyNumber[];
  theme: VisualTheme;
}

export default function Dashboard({ stats, theme }: DashboardProps) {
  if (!stats?.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      {stats.slice(0, 4).map((s, i) => (
        <StatisticCard
          key={s.label}
          {...s}
          theme={theme}
          size={stats.length > 2 ? "sm" : "lg"}
          color={theme.accentRotation[i % theme.accentRotation.length]}
          delayFrames={i * 6}
        />
      ))}
    </div>
  );
}
