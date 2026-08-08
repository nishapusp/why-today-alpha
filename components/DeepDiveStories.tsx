import Link from "next/link";
import { Story } from "@/lib/types";

/**
 * Surfaces today's most substantial reads by readMinutes — every story
 * already has a full deepDiveRead, this just gives the longest/most
 * in-depth ones their own homepage moment instead of only being reachable
 * by scrolling to the bottom tab of an individual story page.
 */
export default function DeepDiveStories({ stories }: { stories: Story[] }) {
  const picks = [...stories]
    .filter((s) => s.deepDiveRead && s.deepDiveRead.length > 0)
    .sort((a, b) => (b.readMinutes || 0) - (a.readMinutes || 0))
    .slice(0, 4);
  if (picks.length === 0) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="font-display text-lg text-[var(--text-primary)]">Deep dive stories</h2>
          <p className="text-xs text-[var(--text-secondary)]">In-depth analysis. Detailed context. Better insights.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {picks.map((story) => (
          <Link
            key={story.slug}
            href={`/story/${story.slug}`}
            className="relative rounded-2xl overflow-hidden transition-transform active:scale-[0.97]"
            style={{ aspectRatio: "4 / 5", background: "var(--navy)" }}
          >
            {story.headlineImage && (
              <img
                src={story.headlineImage.url}
                alt={story.headlineImage.alt}
                loading="lazy"
                className="w-full h-full object-cover absolute inset-0 opacity-80"
              />
            )}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(180deg, rgba(10,20,40,0.15) 0%, rgba(10,20,40,0.35) 45%, rgba(10,20,40,0.9) 100%)" }}
            />
            <span
              className="absolute top-2.5 left-2.5 text-[9.5px] font-bold uppercase tracking-wide text-white rounded-full px-2 py-1"
              style={{ background: "rgba(255,255,255,0.22)", backdropFilter: "blur(6px)" }}
            >
              {story.readMinutes || 5} min read
            </span>
            <p className="absolute bottom-3 left-3 right-3 text-[13.5px] font-semibold leading-snug text-white line-clamp-4" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
              {story.headline}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
