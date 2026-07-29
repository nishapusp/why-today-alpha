import { VisualTheme } from "@/lib/visualEngine/types";

export interface FactBoxProps {
  question: string;
  answer: string;
  theme: VisualTheme;
}

export default function FactBox({ question, answer, theme }: FactBoxProps) {
  return (
    <div className="rounded-2xl p-4" style={{ background: theme.surface, border: `1px solid ${theme.accent}33` }}>
      <p className="text-xs font-mono uppercase tracking-wide mb-2" style={{ color: theme.accent }}>
        If you&rsquo;re wondering
      </p>
      <p className="text-sm font-semibold mb-1.5" style={{ color: theme.text }}>
        {question}
      </p>
      <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>
        {answer}
      </p>
    </div>
  );
}
