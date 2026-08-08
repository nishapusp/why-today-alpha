import Link from "next/link";
import { Story } from "@/lib/types";
import { getCategoryStyle } from "@/lib/categoryStyle";

/**
 * Horizontal "Watch" strip near the top of the home page — the native
 * format for the Visual Engine's swipeable, Reels-style story
 * visualizations (/visual-preview/[slug]), which otherwise only surfaces
 * from a banner buried inside each story page. Same idea as an
 * Instagram/WhatsApp Status strip: vertical-leaning thumbnails, a play
 * badge, horizontal scroll.
 *
 * /visual-preview/[slug] only resolves TODAY's live edition (see
 * lib/getData.ts getStoryBySlug) — callers must only pass today's stories,
 * never archive ones, or the link 404s.
 */
export default function VisualStoryStrip({ stories }: { stories: Story[] }) {
  const withImage = stories.filter((s) => s.headlineImage).slice(0, 10);
  if (withImage.length === 0) return null;

  return (
    <div>
      <h2 className="font-display text-lg text-[var(--text-primary)] mb-3">🎬 Watch today&apos;s stories</h2>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory no-scrollbar">
        {withImage.map((story) => {
          const cat = getCategoryStyle(story.category);
          return (
            <Link
              key={story.slug}
              href={`/visual-preview/${story.slug}`}
              className="relative flex-shrink-0 rounded-2xl overflow-hidden snap-start transition-transform active:scale-[0.97]"
              style={{ width: 108, aspectRatio: "9 / 16" }}
            >
              <img
                src={story.headlineImage!.url}
                alt={story.headlineImage!.alt}
                loading="lazy"
                className="w-full h-full object-cover absolute inset-0"
              />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.75) 100%)" }}
              />
              <span
                className="absolute inset-0 flex items-center justify-center text-2xl"
                style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}
              >
                ▶
              </span>
              <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wide text-white rounded-full px-2 py-0.5" style={{ background: "rgba(255,255,255,0.22)", backdropFilter: "blur(6px)" }}>
                {cat.icon}
              </span>
              <p className="absolute bottom-2 left-2 right-2 text-[11px] font-semibold leading-tight text-white line-clamp-3" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
                {story.headline}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
