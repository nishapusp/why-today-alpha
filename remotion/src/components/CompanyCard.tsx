import React from "react";
import type { Category, KeyNumber, Sentiment } from "../../../lib/types";
import type { VisualTheme } from "../../../lib/visualEngine/types";
import { getCategoryStyle } from "../../../lib/categoryStyle";
import StatisticCard from "./StatisticCard";
import { useEntranceStyle } from "../lib/entrance";

export interface CompanyCardProps {
  headline: string;
  category: Category;
  sentiment: Sentiment;
  stats: KeyNumber[];
  theme: VisualTheme;
}

const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: "Positive",
  caution: "Watch closely",
  critical: "Critical",
  neutral: "Neutral",
};

export default function CompanyCard({ headline, category, sentiment, stats, theme }: CompanyCardProps) {
  const style = useEntranceStyle("zoom");
  const cat = getCategoryStyle(category);
  return (
    <div style={{ ...style, borderRadius: 28, padding: 44, background: theme.surface, border: `2px solid ${theme.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            textTransform: "uppercase",
            borderRadius: 999,
            padding: "10px 22px",
            background: `${theme.accent}22`,
            color: theme.accent,
          }}
        >
          {cat.icon} {category}
        </span>
        <span style={{ fontSize: 22, color: theme.textMuted, textTransform: "uppercase" }}>{SENTIMENT_LABEL[sentiment]}</span>
      </div>
      <h3 style={{ fontFamily: "Georgia, serif", fontSize: 44, fontWeight: 700, color: theme.text, marginBottom: 32 }}>{headline}</h3>
      {stats?.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {stats.slice(0, 4).map((s, i) => (
            <StatisticCard key={s.label} {...s} theme={theme} size="sm" color={theme.accentRotation[i % theme.accentRotation.length]} />
          ))}
        </div>
      )}
    </div>
  );
}
