import Link from "next/link";
import { Story } from "@/lib/types";
import { formatStoryDate, isFromEarlierDay } from "@/lib/storyDate";
import KnowledgeChain from "./KnowledgeChain";

const CATEGORY_ICON: Record<string, string> = {
  Banking: "🏦",
  Economy: "📊",
  Technology: "🔷",
  World: "🌐",
  Policy: "📋",
  Corporate: "🏢",
};

export default function StoryCard({ story }: { story: Story }) {
  const dateLabel = formatStoryDate(story.generatedAt);
  const earlier = isFromEarlierDay(story.generatedAt);
  return (
    <Link
      href={`/story/${story.slug}`}
      className={`sentiment-${story.sentiment} group block rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--accent)] hover:shadow-[0_2px_16px_rgba(15,23,42,0.06)] transition-all`}
    >
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
        {dateLabel && (
          <span
            className={
              earlier
                ? "text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-amber-100 text-amber-800"
                : "text-xs text-[var(--text-secondary)]"
            }
            title={earlier ? "Published on an earlier day" : undefined}
          >
            {dateLabel}
          </span>
        )}
      </div>

      <h3 className="font-display text-lg leading-snug text-[var(--text-primary)] mb-1.5 group-hover:text-[var(--navy)] transition-colors">
        {story.headline}
      </h3>
      <p className="text-sm text-[var(--text-secondary)] mb-4">{story.summary}</p>

      <KnowledgeChain chain={story.knowledgeChain} variant="teaser" />

      <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--soft-blue)] mt-3">
        Read
        <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </span>
    </Link>
  );
}
