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
    <section className="rounded-3xl bg-gradient-to-br from-[var(--navy)] to-[#132a52] text-white p-8 md:p-10 relative overflow-hidden">
      <div className="relative z-10">
        <p className="text-sm text-white/70 mb-2">
          {greeting()}, {userName} 👋
        </p>
        <h1 className="font-display text-3xl md:text-4xl mb-3">{dateLabel}</h1>
        <p className="text-white/80 max-w-md mb-6">
          {edition.stories.length} stories, 1 number, and insights to make you
          smarter today.
        </p>

        <div className="flex flex-wrap gap-3">
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
      <div className="absolute -right-6 -bottom-6 text-[140px] leading-none opacity-[0.06] font-mono select-none">
        →
      </div>
    </section>
  );
}

function Pill({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`text-sm px-3.5 py-1.5 rounded-full backdrop-blur-sm ${
        accent ? "bg-[var(--amber)]/25 text-white" : "bg-white/10 text-white/90"
      }`}
    >
      {children}
    </span>
  );
}
