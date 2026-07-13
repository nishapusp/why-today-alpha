import { Edition } from "@/lib/types";
import Link from "next/link";

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
  learningScore,
}: {
  edition: Edition;
  userName?: string;
  streakDays?: number;
  learningScore?: number;
}) {
  const dateLabel = new Date(edition.date).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <section className="rounded-2xl bg-gradient-to-br from-[var(--navy-deep)] via-[var(--navy)] to-[var(--navy-light)] text-white px-5 py-4 relative overflow-hidden ring-1 ring-white/10">
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-white/60 truncate">
            {greeting()}, {userName} 👋 · {dateLabel}
          </p>
          <p className="text-[13px] text-white/85 mt-0.5">
            {edition.stories.length} stories today, worth a 2 min skim
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {streakDays ? (
            <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm border bg-[var(--gold)]/15 text-[var(--gold-light)] border-[var(--gold)]/40">
              🔥 Day {streakDays}
            </span>
          ) : null}
          {typeof learningScore === "number" ? (
            <Link
              href="/progress"
              className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-white/10 text-white/75 hover:bg-white/15 transition-colors"
            >
              🧠 {learningScore} pts ›
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
