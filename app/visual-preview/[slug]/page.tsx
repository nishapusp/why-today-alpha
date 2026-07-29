import Link from "next/link";
import { notFound } from "next/navigation";
import { getLatestEdition, getStoryBySlug } from "@/lib/getData";
import { classifyStory } from "@/lib/visualEngine/classify";
import { getVisualTheme } from "@/lib/visualEngine/theme";
import { buildVisualBlueprint } from "@/lib/visualEngine/blueprint";
import VisualEngineViewer from "@/components/motion/VisualEngineViewer";

// Test harness for the WhyToday Visual Engine — not linked from primary
// nav. Renders whatever the classifier + blueprint generator produce for a
// real story, purely from data/edition.json, for review before any of this
// is wired into production surfaces.
export const revalidate = 300;

export default async function VisualPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const story = await getStoryBySlug(slug);
  if (!story) notFound();

  const edition = await getLatestEdition();
  const idx = edition.stories.findIndex((s) => s.slug === slug);
  const prevStory = idx > 0 ? edition.stories[idx - 1] : undefined;
  const nextStory = idx >= 0 && idx < edition.stories.length - 1 ? edition.stories[idx + 1] : undefined;

  const classification = classifyStory(story);
  const theme = getVisualTheme(story);
  const blueprint = buildVisualBlueprint(story, classification, theme, {
    prev: prevStory && { href: `/story/${prevStory.slug}`, headline: prevStory.headline },
    next: nextStory && { href: `/story/${nextStory.slug}`, headline: nextStory.headline },
  });

  return (
    <div className="bg-black min-h-screen">
      <div className="max-w-sm mx-auto pt-4 px-4">
        <Link href={`/story/${slug}`} className="text-white/60 text-xs hover:text-white/90">
          ← Back to article
        </Link>
      </div>
      <VisualEngineViewer blueprint={blueprint} headlineImage={story.headlineImage} />
    </div>
  );
}
