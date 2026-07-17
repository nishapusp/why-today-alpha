import { notFound } from "next/navigation";
import { getArchiveIndex, getArchivedEdition, getArchivedStoryBySlug } from "@/lib/getData";
import StoryDetailView from "@/components/StoryDetailView";
import { getTermDefinitions } from "@/lib/glossaryLookup";

export async function generateStaticParams() {
  const index = await getArchiveIndex();
  const params: { date: string; slug: string }[] = [];
  for (const entry of index) {
    const edition = await getArchivedEdition(entry.date);
    edition?.stories.forEach((story) => {
      params.push({ date: entry.date, slug: story.slug });
    });
  }
  return params;
}

export default async function ArchivedStoryPage({
  params,
}: {
  params: Promise<{ date: string; slug: string }>;
}) {
  const { date, slug } = await params;
  const story = await getArchivedStoryBySlug(date, slug);

  if (!story) {
    notFound();
  }

  const edition = await getArchivedEdition(date);
  const idx = edition ? edition.stories.findIndex((s) => s.slug === slug) : -1;
  const prevStory = edition && idx > 0 ? edition.stories[idx - 1] : undefined;
  const nextStory =
    edition && idx >= 0 && idx < edition.stories.length - 1
      ? edition.stories[idx + 1]
      : undefined;

  return (
    <StoryDetailView
      story={story}
      backHref={`/archive/${date}`}
      backLabel={`Back to ${date}`}
      prev={prevStory && { href: `/archive/${date}/${prevStory.slug}`, headline: prevStory.headline }}
      next={nextStory && { href: `/archive/${date}/${nextStory.slug}`, headline: nextStory.headline }}
      terms={getTermDefinitions(story.knowledgeChain)}
      position={edition && idx >= 0 ? { index: idx + 1, total: edition.stories.length } : undefined}
      linkBase={`/archive/${date}`}
    />
  );
}
