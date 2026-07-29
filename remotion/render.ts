/**
 * Render driver — one .mp4 per story, run via `npx tsx render.ts` (or
 * `npm run render` from this directory). Reuses the exact same
 * classify -> theme -> blueprint -> qr pipeline as the on-screen preview
 * (app/visual-preview/[slug]/page.tsx) so the video and the web preview
 * are always built from identical logic, just rendered differently.
 *
 * `--slug <slug>` renders just one story — use that while testing instead
 * of rendering the whole day's edition.
 */
import path from "path";
import fs from "fs";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { classifyStory } from "../lib/visualEngine/classify";
import { getVisualTheme } from "../lib/visualEngine/theme";
import { buildVisualBlueprint } from "../lib/visualEngine/blueprint";
import { makeQrDataUri } from "../lib/visualEngine/qr";
import type { Edition } from "../lib/types";
import type { StoryVideoProps } from "./src/StoryVideo";

const ROOT = path.join(__dirname, "..");
const EDITION_PATH = path.join(ROOT, "data", "edition.json");
const OUT_DIR = path.join(__dirname, "out");
// See public/audio/README.md — optional, videos render silently if absent.
// Passed as a plain public/-relative path, not resolved via staticFile()
// here: that helper reads `window.remotion_staticBase`, which only exists
// once the composition is running inside the rendered browser bundle, not
// in this plain Node driver script. StoryVideo.tsx resolves it instead.
const MUSIC_PATH = path.join(__dirname, "public", "audio", "bg-music.mp3");
const musicFile = fs.existsSync(MUSIC_PATH) ? "audio/bg-music.mp3" : undefined;
// Unset in CI (GitHub Actions has normal internet access — Remotion just
// downloads its own Chrome Headless Shell there). Set this to point at a
// pre-installed Chromium in sandboxes whose network egress is allowlisted
// and doesn't include Remotion's own download host.
const BROWSER_EXECUTABLE = process.env.REMOTION_BROWSER_EXECUTABLE || undefined;
// Off by default — real renders (CI, or any normal environment) should
// always validate certs when fetching each story's Pexels headline image.
// Only some sandboxes route HTTPS through a proxy whose CA isn't in the
// browser's trust store; this exists solely to unblock local testing there.
const IGNORE_CERT_ERRORS = process.env.REMOTION_IGNORE_CERT_ERRORS === "1";

function parseArgs() {
  const args = process.argv.slice(2);
  const slugIdx = args.indexOf("--slug");
  return {
    slug: slugIdx >= 0 ? args[slugIdx + 1] : undefined,
    // Skips fetching each story's Pexels headline image — useful for a
    // quick local smoke test of the rest of the pipeline in a network-
    // restricted sandbox, without waiting on/depending on that fetch.
    noHero: args.includes("--no-hero"),
  };
}

async function main() {
  const { slug, noHero } = parseArgs();
  const edition = JSON.parse(fs.readFileSync(EDITION_PATH, "utf8")) as Edition;
  const stories = slug ? edition.stories.filter((s) => s.slug === slug) : edition.stories;

  if (!stories.length) {
    console.error(slug ? `No story found for slug "${slug}"` : "No stories in edition.json");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(musicFile ? "Background music found — will mix in." : "No public/audio/bg-music.mp3 — rendering silently.");
  console.log("Bundling Remotion composition...");
  const bundleLocation = await bundle({ entryPoint: path.join(__dirname, "src", "index.ts") });

  for (const story of stories) {
    const idx = edition.stories.findIndex((s) => s.slug === story.slug);
    const prevStory = idx > 0 ? edition.stories[idx - 1] : undefined;
    const nextStory = idx >= 0 && idx < edition.stories.length - 1 ? edition.stories[idx + 1] : undefined;

    const classification = classifyStory(story);
    const theme = getVisualTheme(story);
    const blueprint = buildVisualBlueprint(story, classification, theme, {
      prev: prevStory && { href: `/story/${prevStory.slug}`, headline: prevStory.headline },
      next: nextStory && { href: `/story/${nextStory.slug}`, headline: nextStory.headline },
    });
    const outroSection = blueprint.sections.find((s) => s.component === "Outro");
    const qrDataUri = outroSection ? ((await makeQrDataUri(outroSection.visual_data.url as string)) ?? undefined) : undefined;

    const inputProps: StoryVideoProps = {
      blueprint,
      headlineImageUrl: noHero ? undefined : story.headlineImage?.url,
      qrDataUri,
      musicFile,
    };

    console.log(`Rendering ${story.slug}...`);
    // chrome-for-testing (a full Chrome binary, new headless mode) when a
    // custom browserExecutable is supplied — Remotion's default
    // chrome-headless-shell mode expects its own pinned binary, and a
    // regular Chrome no longer supports the old headless mode it assumes.
    const chromiumOptions = IGNORE_CERT_ERRORS ? { ignoreCertificateErrors: true } : undefined;
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "StoryVideo",
      inputProps,
      browserExecutable: BROWSER_EXECUTABLE,
      chromeMode: BROWSER_EXECUTABLE ? "chrome-for-testing" : undefined,
      chromiumOptions,
    });
    const outputLocation = path.join(OUT_DIR, `${story.slug}.mp4`);
    const start = Date.now();
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation,
      inputProps,
      browserExecutable: BROWSER_EXECUTABLE,
      chromeMode: BROWSER_EXECUTABLE ? "chrome-for-testing" : undefined,
      chromiumOptions,
    });
    console.log(`  -> ${outputLocation} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
