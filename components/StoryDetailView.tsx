import Link from "next/link";
import { Story } from "@/lib/types";
import { getCategoryStyle } from "@/lib/categoryStyle";
import ReadingLevelToggle from "@/components/ReadingLevelToggle";
import ShareButton from "@/components/ShareButton";
import { formatStoryDate } from "@/lib/storyDate";
import DataCardGrid from "@/components/DataCard";
import StoryFeedback from "@/components/StoryFeedback";
import StoryChart from "@/components/StoryChart";
import TimeMachine from "@/components/TimeMachine";
import InlineTermHighlighter from "@/components/InlineTermHighlighter";
import KnowledgeChain from "@/components/KnowledgeChain";
import SwipeNavigator from "@/components/SwipeNavigator";
import SignInPrompt from "@/components/SignInPrompt";
import type { TermDefinition } from "@/lib/glossaryLookup";

export interface StoryNeighbor {
  href: string;
  headline: string;
}

export default function StoryDetailView({
  story,
  backHref,
  backLabel,
  prev,
  next,
  terms,
  position,
  linkBase = "/story",
}: {
  story: Story;
  backHref: string;
  backLabel: string;
  prev?: StoryNeighbor; // previous story in the same edition
  next?: StoryNeighbor; // next story in the same edition
  terms?: TermDefinition[]; // knowledge-chain terms + glossary definitions
  position?: { index: number; total: number }; // place in edition, for the swipe pill
  // 2026-07-17: added after a real report that a shared archived
  // story's link (and its card's embedded QR code) pointed to
  // /story/<slug>, which 404s for anything not in today's edition —
  // both ShareButton and TimeMachine hardcoded that path. Matches
  // Top10List's existing linkBase pattern for the same today-vs-
  // archived distinction, rather than inventing a new convention.
  linkBase?: string; // "/story" for today, "/archive/2026-07-08" for an archived day
}) {
  const cat = getCategoryStyle(story.category);

  return (
    <main className="max-w-2xl mx-auto pb-16 overflow-x-hidden">
    <SignInPrompt slug={story.slug} />
    <SwipeNavigator
      prevHref={prev?.href}
      nextHref={next?.href}
      position={position}
      accent={cat.accent}
    >
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
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-white/85 hover:text-white transition-colors bg-white/15 backdrop-blur-sm rounded-full px-3 py-1.5 mb-5 w-fit"
          >
            ← {backLabel}
          </Link>

          <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-white/90 bg-white/15 backdrop-blur-sm rounded-full px-2.5 py-1 mb-3 w-fit">
            {cat.icon} {story.category}
          </span>

          <h1 className="font-display text-2xl md:text-3xl leading-snug text-white mb-3 break-words" style={{ textShadow: story.headlineImage ? "0 1px 8px rgba(0,0,0,0.4)" : "none" }}>
            {story.headline}
          </h1>

          <div className="flex items-center gap-3 text-xs text-white/80">
            {formatStoryDate(story.generatedAt) && (
              <span>{formatStoryDate(story.generatedAt)}</span>
            )}
            <span>{story.readMinutes} min read</span>
            {story.headlineImage && <span>· 📷 {story.headlineImage.credit}</span>}
            <span className="ml-auto flex items-center gap-2">
              {/* /visual-preview/[slug] only resolves today's edition
                  (see lib/getData.ts getStoryBySlug) — hide the link for
                  archived stories rather than point at a 404. */}
              {linkBase === "/story" && (
                <Link
                  href={`/visual-preview/${story.slug}`}
                  className="text-[11px] text-white/80 hover:text-white bg-white/15 backdrop-blur-sm rounded-full px-2.5 py-1.5 transition-colors"
                  title="Preview this story as an auto-generated visual storyboard"
                >
                  🎬 Visual Story
                </Link>
              )}
              <ShareButton slug={story.slug} headline={story.headline} accent={cat.accent} linkBase={linkBase} />
            </span>
          </div>
        </div>
      </div>

      <article className="px-4 pt-6">
        {terms && terms.length > 0 ? (
          <InlineTermHighlighter
            text={story.summary}
            terms={terms}
            story={story}
            accent={cat.accent}
            deep={cat.deep}
          />
        ) : (
          <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed mb-6 text-justify">
            {story.summary}
          </p>
        )}

        <DataCardGrid numbers={story.keyNumbers} tint={cat.tint} deep={cat.deep} accent={cat.accent} />

        <StoryChart chart={story.chart} cat={cat} />

        <TimeMachine data={story.timeMachine} cat={cat} slug={story.slug} linkBase={linkBase} terms={terms} story={story} />

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

        {story.knowledgeChain && story.knowledgeChain.length > 0 && (
          <div className="mt-8 pt-6 border-t border-[var(--border)]">
            <KnowledgeChain
              chain={story.knowledgeChain}
              variant="full"
              story={story}
              accent={cat.accent}
              tint={cat.tint}
              deep={cat.deep}
            />
          </div>
        )}

        {(prev || next) && (
          <nav
            aria-label="More stories in this edition"
            className="mt-8 pt-6 border-t border-[var(--border)] grid grid-cols-2 gap-3"
          >
            {prev ? (
              <Link
                href={prev.href}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5 hover:border-[var(--accent)] transition-colors min-w-0"
              >
                <span className="block text-[10px] font-mono uppercase tracking-wide text-[var(--text-secondary)] mb-1">
                  ← Previous story
                </span>
                <span className="block text-[13px] font-medium leading-snug text-[var(--text-primary)] break-words">
                  {prev.headline.length > 70 ? `${prev.headline.slice(0, 70)}…` : prev.headline}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={next.href}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5 hover:border-[var(--accent)] transition-colors text-right min-w-0"
              >
                <span className="block text-[10px] font-mono uppercase tracking-wide text-[var(--text-secondary)] mb-1">
                  Next story →
                </span>
                <span className="block text-[13px] font-medium leading-snug text-[var(--text-primary)] break-words">
                  {next.headline.length > 70 ? `${next.headline.slice(0, 70)}…` : next.headline}
                </span>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </article>
    </SwipeNavigator>
    </main>
  );
}
