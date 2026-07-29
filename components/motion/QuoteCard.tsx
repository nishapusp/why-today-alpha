import { VisualTheme } from "@/lib/visualEngine/types";

export interface QuoteCardProps {
  quote: string;
  attribution?: string;
  theme: VisualTheme;
}

export default function QuoteCard({ quote, attribution, theme }: QuoteCardProps) {
  return (
    <div className="text-center px-2">
      <span className="text-5xl leading-none" style={{ color: `${theme.accent}88` }}>
        &ldquo;
      </span>
      <p className="font-display text-xl leading-snug -mt-3" style={{ color: theme.text }}>
        {quote}
      </p>
      {attribution && (
        <p className="text-xs font-mono uppercase tracking-wide mt-4" style={{ color: theme.accent }}>
          {attribution}
        </p>
      )}
    </div>
  );
}
