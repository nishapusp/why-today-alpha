import { notFound } from "next/navigation";
import { getArchiveIndex, getArchivedEdition, getArchivedStoryBySlug } from "@/lib/getData";
import StoryDetailView from "@/components/StoryDetailView";

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

  return (
    <StoryDetailView
      story={story}
      backHref={`/archive/${date}`}
      backLabel={`Back to ${date}`}
    />
  );
}
