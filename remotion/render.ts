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
import { buildNarrationScript } from "../lib/visualEngine/narration";
import type { Edition } from "../lib/types";
import { HERO_SECONDS } from "./src/StoryVideo";
import type { StoryVideoProps } from "./src/StoryVideo";

const ROOT = path.join(__dirname, "..");
const EDITION_PATH = path.join(ROOT, "data", "edition.json");
const OUT_DIR = path.join(__dirname, "out");
// See public/audio/README.md — optional, videos render silently if absent.
// Passed as a plain public/-relative path, not resolved via staticFile()
// here: that helper reads `window.remotion_staticBase`, which only exists
// once the composition is running inside the rendered browser bundle, not
// in this plain Node driver script. StoryVideo.tsx resolves it instead.
// A real licensed track takes priority if one's ever added; falls back to
// the synthesized placeholder (scripts/generate-ambient-bg-music.js) so
// exports never go fully silent by default.
const MUSIC_CANDIDATES = ["bg-music.mp3", "bg-music.wav"];
const musicFileName = MUSIC_CANDIDATES.find((name) => fs.existsSync(path.join(__dirname, "public", "audio", name)));
const musicFile = musicFileName ? `audio/${musicFileName}` : undefined;
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

// Chosen after comparing Neural2/News/Studio/Chirp3-HD samples — Studio-Q
// read as the heaviest, most authentic/professional of the set. Optional:
// videos render without narration if the key isn't set (same graceful
// degradation as background music).
const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;
const NARRATION_VOICE = "en-US-Studio-Q";

/**
 * Google's TTS response already returns base64 audio, so this is passed
 * straight through as a data: URI — same pattern as makeQrDataUri, no
 * public/ file needed (unlike bg-music.mp3/.wav, which are static assets
 * shared across every render; narration is generated fresh per story).
 */
async function synthesizeNarration(text: string): Promise<string | undefined> {
  if (!GOOGLE_TTS_API_KEY) return undefined;
  try {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "en-US", name: NARRATION_VOICE },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });
    if (!res.ok) {
      console.error(`Google TTS error ${res.status}: ${await res.text()}`);
      return undefined;
    }
    const data = (await res.json()) as { audioContent: string };
    return `data:audio/mp3;base64,${data.audioContent}`;
  } catch (err) {
    console.error("Narration synthesis failed:", err);
    return undefined;
  }
}

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
  console.log(GOOGLE_TTS_API_KEY ? "GOOGLE_TTS_API_KEY set — will generate narration." : "GOOGLE_TTS_API_KEY not set — rendering without narration.");
  console.log("Bundling Remotion composition...");
  const bundleLocation = await bundle({ entryPoint: path.join(__dirname, "src", "index.ts") });

  for (const story of stories) {
    const classification = classifyStory(story);
    const theme = getVisualTheme(story);
    // No neighbors passed here (unlike the web preview) — the resulting
    // "Keep Reading" WatchNext slide has no click target in a rendered
    // video and reads as confusing filler for someone watching a shared
    // clip with no site context, right before the actual closing Outro
    // slide. Omitting neighbors means buildVisualBlueprint never adds
    // that section for video exports at all.
    const blueprint = buildVisualBlueprint(story, classification, theme);
    const outroSection = blueprint.sections.find((s) => s.component === "Outro");
    const qrDataUri = outroSection ? ((await makeQrDataUri(outroSection.visual_data.url as string)) ?? undefined) : undefined;

    const headlineImageUrl = noHero ? undefined : story.headlineImage?.url;
    const totalSeconds = blueprint.sections.reduce((t, s) => t + s.duration, 0) + (headlineImageUrl ? HERO_SECONDS : 0);
    const narrationUrl = await synthesizeNarration(buildNarrationScript(story, totalSeconds));

    const inputProps: StoryVideoProps = {
      blueprint,
      headlineImageUrl,
      qrDataUri,
      musicFile,
      narrationUrl,
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
