import { Edition } from "@/lib/types";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export default function Hero({
  edition,
  userName = "there",
  streakDays,
}: {
  edition: Edition;
  userName?: string;
  streakDays?: number;
}) {
  const dateLabel = new Date(edition.date).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="rounded-3xl bg-gradient-to-br from-[var(--navy-deep)] via-[var(--navy)] to-[var(--navy-light)] text-white p-8 md:p-10 relative overflow-hidden ring-1 ring-white/10 shadow-xl shadow-black/20">
      {/* subtle top sheen for a premium, glassy edge */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.06] to-transparent" />

      <div className="relative z-10">
        <p className="text-sm text-white/60 mb-2 tracking-wide">
          {greeting()}, {userName} 👋
        </p>
        <h1 className="font-display text-3xl md:text-4xl mb-3 tracking-tight">
          {dateLabel}
        </h1>
        <p className="text-white/70 max-w-md mb-6 leading-relaxed">
          {edition.stories.length} stories, 1 number, and insights to make you
          smarter today.
        </p>

        <div className="flex flex-wrap gap-2.5">
          <Pill>📖 {edition.stories.length} Stories</Pill>
          <Pill>
            ⏱ {edition.stories.reduce((a, s) => a + s.readMinutes, 0)} min read
          </Pill>
          <Pill>✨ AI-Powered</Pill>
          {streakDays ? (
            <Pill accent>🔥 Day {streakDays} of understanding</Pill>
          ) : null}
        </div>
      </div>

      {/* ambient background mark — quiet, not decorative-for-its-own-sake:
          a faint version of the Knowledge Chain arrow motif */}
      <div className="absolute -right-6 -bottom-6 text-[140px] leading-none opacity-[0.05] font-mono select-none">
        →
      </div>
    </section>
  );
}

function Pill({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`text-sm px-3.5 py-1.5 rounded-full backdrop-blur-sm border ${
        accent
          ? "bg-[var(--gold)]/15 text-[var(--gold-light)] border-[var(--gold)]/40"
          : "bg-white/[0.06] text-white/85 border-white/10"
      }`}
    >
      {children}
    </span>
  );
}
