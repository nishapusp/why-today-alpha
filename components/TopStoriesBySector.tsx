import Link from "next/link";
import { Story } from "@/lib/types";
import { CATEGORY_ORDER, getCategoryStyle, categoryAnchor } from "@/lib/categoryStyle";

/**
 * One lead story per category from TODAY's edition, as a horizontal-scroll
 * row of image cards — the "cross-section" view of today's briefing,
 * complementing the single ranked Top10List above it. Each category shows
 * only its FIRST (lead) story, not every story in that category — this is
 * a map of what's covered today, not a duplicate feed.
 */
export default function TopStoriesBySector({ stories }: { stories: Story[] }) {
  const leadByCategory = new Map<string, Story>();
  for (const story of stories) {
    if (!leadByCategory.has(story.category)) leadByCategory.set(story.category, story);
  }
  const cards = CATEGORY_ORDER.map((c) => leadByCategory.get(c)).filter((s): s is Story => !!s);
  if (cards.length === 0) return null;

  return (
    <div id="top-stories-by-sector">
      <h2 className="font-display text-lg text-[var(--text-primary)] mb-3">Top stories by sector</h2>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory no-scrollbar">
        {cards.map((story) => {
          const cat = getCategoryStyle(story.category);
          return (
            <Link
              key={story.slug}
              href={`/story/${story.slug}`}
              id={categoryAnchor(story.category)}
              className="relative flex-shrink-0 rounded-2xl overflow-hidden snap-start transition-transform active:scale-[0.97]"
              style={{ width: 200, aspectRatio: "4 / 3", background: cat.tint }}
            >
              {story.headlineImage ? (
                <img
                  src={story.headlineImage.url}
                  alt={story.headlineImage.alt}
                  loading="lazy"
                  className="w-full h-full object-cover absolute inset-0"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-4xl">{cat.icon}</div>
              )}
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,.3) 62%, rgba(0,0,0,.8) 100%)" }}
              />
              <span
                className="absolute top-2.5 left-2.5 text-[9.5px] font-bold uppercase tracking-wide text-white rounded-full px-2 py-1"
                style={{ background: cat.accent }}
              >
                {cat.icon} {story.category}
              </span>
              <p className="absolute bottom-2.5 left-2.5 right-2.5 text-[13px] font-semibold leading-snug text-white line-clamp-3" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
                {story.headline}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
