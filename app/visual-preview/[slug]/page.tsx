import { notFound } from "next/navigation";
import { getLatestEdition, getStoryBySlug } from "@/lib/getData";
import { classifyStory } from "@/lib/visualEngine/classify";
import { getVisualTheme } from "@/lib/visualEngine/theme";
import { buildVisualBlueprint } from "@/lib/visualEngine/blueprint";
import { makeQrDataUri } from "@/lib/visualEngine/qr";
import VisualEngineViewer from "@/components/motion/VisualEngineViewer";

// Not linked from primary nav (reached via the "Watch the Visual Story"
// banner on /story/[slug]). Renders whatever the classifier + blueprint
// generator produce for a real story, purely from data/edition.json.
export const revalidate = 300;

export default async function VisualPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // ?debug=1 reveals the classification/theme diagnostic overlay — off by
  // default so the reader-facing storyboard starts clean, brand header first.
  searchParams: Promise<{ debug?: string }>;
}) {
  const { slug } = await params;
  const { debug } = await searchParams;
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
  const outroSection = blueprint.sections.find((s) => s.component === "Outro");
  const qrDataUri = outroSection ? await makeQrDataUri(outroSection.visual_data.url as string) : null;

  return (
    <VisualEngineViewer
      blueprint={blueprint}
      headlineImage={story.headlineImage}
      qrDataUri={qrDataUri ?? undefined}
      backHref={`/story/${slug}`}
      slug={slug}
      debug={debug === "1"}
    />
  );
}
