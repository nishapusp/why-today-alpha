/**
 * upload-visual-videos.js
 *
 * Uploads every .mp4 in remotion/out/ (written by remotion/render.ts) to
 * Netlify Blobs, one blob per story slug — same store-per-content-type
 * pattern as scripts/generate-quick-reads.js's "why-today-quick-reads"
 * store, since these videos (like quick reads) update independently of
 * deploys and shouldn't be committed to the repo.
 *
 * Runs in GitHub Actions (.github/workflows/generate-visual-videos.yml),
 * after remotion/render.ts has produced the day's videos. Requires
 * NETLIFY_SITE_ID + NETLIFY_AUTH_TOKEN, same as generate-quick-reads.js —
 * see that script's quickReadsStore() for why explicit credentials are
 * needed outside a Netlify Function/Edge runtime.
 */
const fs = require("fs");
const path = require("path");
const { getStore } = require("@netlify/blobs");

const OUT_DIR = path.join(__dirname, "..", "remotion", "out");

function visualVideosStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) {
    throw new Error(
      "NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN must be set — Blobs needs explicit credentials when called from outside Netlify's own Functions/Edge runtime."
    );
  }
  return getStore({ name: "why-today-visual-videos", siteID, token });
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.log(`No ${OUT_DIR} directory — nothing to upload (did the render step run?).`);
    return;
  }
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".mp4"));
  if (!files.length) {
    console.log("No rendered videos found — nothing to upload.");
    return;
  }

  const store = visualVideosStore();
  for (const file of files) {
    const slug = file.replace(/\.mp4$/, "");
    const buffer = fs.readFileSync(path.join(OUT_DIR, file));
    await store.set(slug, buffer, { metadata: { contentType: "video/mp4", uploadedAt: new Date().toISOString() } });
    console.log(`Uploaded ${slug} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
