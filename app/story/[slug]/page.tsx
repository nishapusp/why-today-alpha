import Link from "next/link";
import { notFound } from "next/navigation";
import { getLatestEdition, getStoryBySlug } from "@/lib/getData";
import ReadingLevelToggle from "@/components/ReadingLevelToggle";
import DataCardGrid from "@/components/DataCard";

const CATEGORY_ICON: Record<string, string> = {
  Banking: "🏦",
  Economy: "📊",
  Technology: "🔷",
  World: "🌐",
  Policy: "📋",
  Corporate: "🏢",
};

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

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 overflow-x-hidden">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        ← Back to today&apos;s edition
      </Link>

      <article className={`sentiment-${story.sentiment}`}>
        <div className="flex items-center gap-2 mb-3">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--accent)" }}
          />
          <span className="text-xs font-mono uppercase tracking-wide text-[var(--text-secondary)]">
            {CATEGORY_ICON[story.category]} {story.category}
          </span>
          <span className="text-xs text-[var(--text-secondary)] ml-auto">
            {story.readMinutes} min read
          </span>
        </div>

        <h1 className="font-display text-2xl md:text-3xl leading-snug text-[var(--text-primary)] mb-3">
          {story.headline}
        </h1>
        <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed mb-6">
          {story.summary}
        </p>

        <DataCardGrid numbers={story.keyNumbers} />

        <ReadingLevelToggle story={story} />

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
                    className="text-sm text-[var(--soft-blue)] hover:underline break-words"
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
