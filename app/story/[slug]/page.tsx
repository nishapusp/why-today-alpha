import Link from "next/link";
import { notFound } from "next/navigation";
import { getLatestEdition, getStoryBySlug } from "@/lib/getData";
import { getCategoryStyle } from "@/lib/categoryStyle";
import ReadingLevelToggle from "@/components/ReadingLevelToggle";
import DataCardGrid from "@/components/DataCard";
import StoryFeedback from "@/components/StoryFeedback";

export const revalidate = 300;

export async function generateStaticParams() {
  const edition = await getLatestEdition();
  return edition.stories.map((story) => ({ slug: story.slug }));
}

export default async function StoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const story = await getStoryBySlug(slug);

  if (!story) {
    notFound();
  }

  const cat = getCategoryStyle(story.category);

  return (
    <main className="max-w-2xl mx-auto pb-10 overflow-x-hidden">
      {/* Hero: the story's actual photo when available, category gradient otherwise */}
      <div
        className="px-4 pt-6 pb-8 md:rounded-b-3xl relative overflow-hidden"
        style={
          story.headlineImage
            ? { minHeight: "280px" }
            : { background: `linear-gradient(150deg, ${cat.deep}, ${cat.accent})` }
        }
      >
        {story.headlineImage && (
          <img
            src={story.headlineImage.url}
            alt={story.headlineImage.alt}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div
          className="pointer-events-none absolute inset-0"
          style={
            story.headlineImage
              ? { background: "linear-gradient(180deg, rgba(0,0,0,.15) 0%, rgba(0,0,0,.35) 55%, rgba(0,0,0,.8) 100%)" }
              : {}
          }
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent" />
        <div className="relative flex flex-col justify-end h-full min-h-[240px]">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-white/85 hover:text-white transition-colors bg-white/15 backdrop-blur-sm rounded-full px-3 py-1.5 mb-5 w-fit"
          >
            ← Back to today
          </Link>

          <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-white/90 bg-white/15 backdrop-blur-sm rounded-full px-2.5 py-1 mb-3 w-fit">
            {cat.icon} {story.category}
          </span>

          <h1 className="font-display text-2xl md:text-3xl leading-snug text-white mb-3 break-words" style={{ textShadow: story.headlineImage ? "0 1px 8px rgba(0,0,0,0.4)" : "none" }}>
            {story.headline}
          </h1>

          <div className="flex items-center gap-3 text-xs text-white/80">
            <span>{story.readMinutes} min read</span>
            {story.headlineImage && <span>· 📷 {story.headlineImage.credit}</span>}
          </div>
        </div>
      </div>

      <article className="px-4 pt-6">
        <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed mb-6 text-justify">
          {story.summary}
        </p>

        <DataCardGrid numbers={story.keyNumbers} tint={cat.tint} deep={cat.deep} accent={cat.accent} />

        <ReadingLevelToggle story={story} />

        <StoryFeedback
          slug={story.slug}
          headline={story.headline}
          accent={cat.accent}
          tint={cat.tint}
          deep={cat.deep}
        />

        {story.officialSources?.length > 0 && (
          <div className="mt-8 pt-6 border-t border-[var(--border)]">
            <p className="text-xs font-mono uppercase tracking-wide text-[var(--text-secondary)] mb-3">
              Official sources
            </p>
            <ul className="space-y-2">
              {story.officialSources.map((source) => (
                <li key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm hover:underline break-words"
                    style={{ color: cat.accent }}
                  >
                    {source.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </main>
  );
}
