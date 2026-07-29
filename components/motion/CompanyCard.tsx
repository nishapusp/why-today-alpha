import { Category, KeyNumber, Sentiment } from "@/lib/types";
import { VisualTheme } from "@/lib/visualEngine/types";
import { getCategoryStyle } from "@/lib/categoryStyle";
import StatisticCard from "./StatisticCard";

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
  const cat = getCategoryStyle(category);
  return (
    <div className="rounded-2xl p-5" style={{ background: theme.surface, border: `1px solid ${theme.border}` }}>
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[11px] font-semibold uppercase tracking-wide rounded-full px-2.5 py-1"
          style={{ background: `${theme.accent}22`, color: theme.accent }}
        >
          {cat.icon} {category}
        </span>
        <span className="text-[11px] font-mono uppercase" style={{ color: theme.textMuted }}>
          {SENTIMENT_LABEL[sentiment]}
        </span>
      </div>
      <h3 className="font-display text-lg font-semibold leading-snug mb-4" style={{ color: theme.text }}>
        {headline}
      </h3>
      {stats?.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {stats.slice(0, 4).map((s, i) => (
            <StatisticCard
              key={s.label}
              {...s}
              theme={theme}
              size="sm"
              color={theme.accentRotation[i % theme.accentRotation.length]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
