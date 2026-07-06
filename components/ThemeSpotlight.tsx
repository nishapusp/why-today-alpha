import { Edition } from "@/lib/types";

const ICONS: Record<string, string> = {
  shield: "🛡️",
  chart: "📈",
  globe: "🌍",
  bank: "🏦",
  cpu: "🧠",
};

export default function ThemeSpotlight({ edition }: { edition: Edition }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col justify-between h-full">
      <div>
        <p className="text-xs font-mono uppercase tracking-wide text-[var(--soft-blue)] mb-2">
          Today's Theme
        </p>
        <div className="flex items-start gap-3 mb-3">
          <span className="text-3xl">{ICONS[edition.themeIcon] ?? "🛡️"}</span>
          <h2 className="font-display text-2xl text-[var(--text-primary)]">
            {edition.themeTitle}
          </h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          {edition.themeDescription}
        </p>
      </div>
      <a
        href="#theme-story"
        className="inline-flex items-center gap-1 text-sm font-medium text-white bg-[var(--navy)] px-4 py-2 rounded-full w-fit mt-5 hover:opacity-90 transition-opacity"
      >
        Read Theme Story →
      </a>
    </div>
  );
}
