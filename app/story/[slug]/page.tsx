import { notFound } from "next/navigation";
import { getLatestEdition, getStoryBySlug } from "@/lib/getData";
import StoryDetailView from "@/components/StoryDetailView";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const story = await getStoryBySlug(slug);
  if (!story) return {};
  return {
    title: story.headline,
    description: story.summary,
    openGraph: {
      title: story.headline,
      description: story.summary,
      type: "article",
      // Pre-rendered 1080x1350 share card (scripts/generate-share-cards.js).
      // WhatsApp/Telegram/Twitter link previews all pick this up.
      images: [{ url: `/cards/${slug}.png`, width: 1080, height: 1350 }],
    },
    twitter: {
      card: "summary_large_image",
      title: story.headline,
      description: story.summary,
      images: [`/cards/${slug}.png`],
    },
  };
}

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

  // Left/right story connect: neighbors within today's edition order.
  const edition = await getLatestEdition();
  const idx = edition.stories.findIndex((s) => s.slug === slug);
  const prevStory = idx > 0 ? edition.stories[idx - 1] : undefined;
  const nextStory =
    idx >= 0 && idx < edition.stories.length - 1 ? edition.stories[idx + 1] : undefined;

  return (
    <StoryDetailView
      story={story}
      backHref="/"
      backLabel="Back to today"
      prev={prevStory && { href: `/story/${prevStory.slug}`, headline: prevStory.headline }}
      next={nextStory && { href: `/story/${nextStory.slug}`, headline: nextStory.headline }}
    />
  );
}
