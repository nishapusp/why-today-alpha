/**
 * One-off comparison script — NOT part of the daily pipeline. Generates a
 * single narrated-sample clip via ElevenLabs so it can be compared against
 * the current synthesized background-music-only video export before
 * deciding whether narration is worth building into remotion/ properly.
 *
 * Requires ELEVENLABS_API_KEY. Only runs in CI (this sandbox's own network
 * policy blocks api.elevenlabs.io directly) — see
 * .github/workflows/tts-sample.yml.
 */
const fs = require("fs");
const path = require("path");

const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // "Rachel" — ElevenLabs' default library voice
const MODEL_ID = "eleven_turbo_v2_5";

function parseArgs() {
  const args = process.argv.slice(2);
  const slugIdx = args.indexOf("--slug");
  return { slug: slugIdx >= 0 ? args[slugIdx + 1] : undefined };
}

// Short and spoken-friendly — enough to voice over the ~20-30s video, not
// the full deep dive.
function narrationScript(story) {
  return `${story.headline}. ${story.whyCare}`;
}

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY is not set.");
    process.exit(1);
  }

  const { slug } = parseArgs();
  const editionPath = path.join(__dirname, "..", "data", "edition.json");
  const edition = JSON.parse(fs.readFileSync(editionPath, "utf8"));
  const story = slug ? edition.stories.find((s) => s.slug === slug) : edition.stories[0];
  if (!story) {
    console.error(`No story found${slug ? ` for slug "${slug}"` : ""}.`);
    process.exit(1);
  }

  const text = narrationScript(story);
  console.log(`Narrating "${story.slug}":\n${text}`);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`ElevenLabs API error ${response.status}: ${body}`);
    process.exit(1);
  }

  const outDir = path.join(__dirname, "..", "tts-sample-out");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${story.slug}-narration.mp3`);
  fs.writeFileSync(outPath, Buffer.from(await response.arrayBuffer()));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
