/**
 * generate-share-cards.js  (v2 — photo-hero design)
 *
 * Renders one 1080x1350 PNG share card per story in data/edition.json into
 * public/cards/<slug>.png. Runs during `npm run build` on Netlify — cards
 * are build output, never committed.
 *
 * v2 design: the story's own Pexels photo fills the top ~55% of the card
 * with a category-tinted gradient melting into a dark panel below, so every
 * card looks different. Chip + date sit on the photo; headline bridges the
 * seam; key number and branding fill the panel. Stories without a photo (or
 * when the fetch fails) get a category-colored gradient with a giant
 * translucent watermark icon — still visually distinct per category.
 *
 * Failure policy unchanged: bad story -> skip with warning; total failure
 * -> exit 0 so the site still deploys.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const EDITION_PATH = path.join(ROOT, "data", "edition.json");
const OUT_DIR = path.join(ROOT, "public", "cards");
const FONT_DIR = path.join(ROOT, "assets", "fonts");
const SITE_URL = process.env.SITE_URL || "whytoday.in";

const W = 1080;
const H = 1350;
const PHOTO_H = 740; // photo band height

// Mirrors lib/categoryStyle.ts (accents brightened for dark backgrounds).
const CATEGORY_STYLE = {
  Banking: { icon: "🏦", accent: "#E3B14E", deep: "#8A6420", dark: "#241A08" },
  Economy: { icon: "📊", accent: "#E8795B", deep: "#8A3826", dark: "#26100A" },
  Technology: { icon: "🔷", accent: "#3BB3A0", deep: "#154E45", dark: "#07201C" },
  World: { icon: "🌐", accent: "#6E99F0", deep: "#25489E", dark: "#0A1430" },
  Policy: { icon: "📋", accent: "#8C9BE0", deep: "#2E3A6B", dark: "#0D1226" },
  Corporate: { icon: "🏢", accent: "#C287AE", deep: "#5C3850", dark: "#1E1019" },
};

function catStyle(category) {
  return CATEGORY_STYLE[category] || CATEGORY_STYLE.Policy;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  });
}

function pickKeyNumber(story) {
  const nums = Array.isArray(story.keyNumbers) ? story.keyNumbers : [];
  const usable = nums.filter((n) => n && n.value && n.label);
  if (usable.length === 0) return null;
  return usable.find((n) => n.previousValue) || usable[0];
}

function el(type, props = {}, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined);
  return {
    type,
    props: { ...props, children: kids.length === 1 ? kids[0] : kids },
  };
}

/**
 * Fetch a photo and return it as a data URI, or null on any failure.
 * Pexels URLs get resized server-side to keep render fast. Data URIs
 * (used in tests) pass straight through.
 */
async function fetchImageDataUri(url) {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    let u = url;
    if (u.includes("images.pexels.com")) {
      // Ask Pexels for a card-sized crop instead of the original.
      u = u.split("?")[0] + "?auto=compress&cs=tinysrgb&w=1200&h=850&fit=crop";
    }
    const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!mime.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null; // fallback design takes over
  }
}

function headerRow(story, cat, dateLabel) {
  return el(
    "div",
    {
      style: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "44px 64px 0 64px",
      },
    },
    el(
      "div",
      {
        style: {
          display: "flex", alignItems: "center",
          backgroundColor: "rgba(10,14,24,0.55)",
          border: `2px solid ${cat.accent}`,
          borderRadius: "999px", padding: "12px 28px",
        },
      },
      el("span", {
        style: {
          fontSize: "30px", fontWeight: 600, letterSpacing: "3px",
          color: cat.accent, display: "flex",
        },
      }, `${cat.icon}  ${String(story.category || "").toUpperCase()}`)
    ),
    el("span", {
      style: {
        fontSize: "28px", color: "#FFFFFF", fontWeight: 600, display: "flex",
        backgroundColor: "rgba(10,14,24,0.55)", borderRadius: "999px",
        padding: "12px 24px",
      },
    }, dateLabel)
  );
}

function buildCardTree(story, editionDate, photoUri) {
  const cat = catStyle(story.category);
  const keyNum = pickKeyNumber(story);
  const dateLabel = formatDate(story.generatedAt || editionDate);
  const headline = String(story.headline || "").trim();
  const headlineSize = headline.length > 90 ? 54 : headline.length > 60 ? 62 : 72;

  return el(
    "div",
    {
      style: {
        width: `${W}px`, height: `${H}px`,
        display: "flex", flexDirection: "column",
        backgroundColor: "#0B1220",
        fontFamily: "Inter", color: "#FFFFFF",
        position: "relative",
      },
    },

    // ---- HERO BAND: photo, or category gradient + watermark icon ----
    photoUri
      ? el("img", {
          src: photoUri, width: W, height: PHOTO_H,
          style: {
            position: "absolute", top: 0, left: 0,
            width: `${W}px`, height: `${PHOTO_H}px`, objectFit: "cover",
          },
        })
      : el(
          "div",
          {
            style: {
              position: "absolute", top: 0, left: 0,
              width: `${W}px`, height: `${PHOTO_H}px`,
              display: "flex", alignItems: "center", justifyContent: "flex-end",
              backgroundImage: `linear-gradient(140deg, ${cat.deep} 0%, ${cat.dark} 70%, #0B1220 100%)`,
            },
          },
          // giant translucent watermark icon, bleeding off the right edge
          el("span", {
            style: {
              fontSize: "460px", opacity: 0.16,
              marginRight: "-90px", display: "flex",
            },
          }, cat.icon)
        ),

    // Category-tinted duotone + melt into the dark panel below
    el("div", {
      style: {
        position: "absolute", top: 0, left: 0,
        width: `${W}px`, height: `${PHOTO_H}px`, display: "flex",
        backgroundImage:
          `linear-gradient(180deg, ${cat.dark}55 0%, rgba(11,18,32,0.05) 34%, rgba(11,18,32,0.55) 68%, #0B1220 99%)`,
      },
    }),
    // thin accent line at the very top
    el("div", {
      style: {
        position: "absolute", top: 0, left: 0, width: `${W}px`, height: "14px",
        backgroundColor: cat.accent, display: "flex",
      },
    }),

    // ---- CONTENT (stacked over the backgrounds) ----
    headerRow(story, cat, dateLabel),

    // spacer pushing the headline down onto the photo/panel seam
    el("div", { style: { display: "flex", flexGrow: 1 } }),

    el(
      "div",
      { style: { display: "flex", flexDirection: "column", padding: "0 64px" } },
      el("span", {
        style: {
          fontSize: `${headlineSize}px`, fontWeight: 800, lineHeight: 1.16,
          letterSpacing: "-1px", display: "flex",
          textShadow: "0 2px 24px rgba(0,0,0,0.55)",
        },
      }, headline),
      story.summary
        ? el("span", {
            style: {
              marginTop: "30px", fontSize: "33px", lineHeight: 1.45,
              color: "rgba(255,255,255,0.78)", display: "block", lineClamp: 3,
            },
          }, String(story.summary).trim())
        : null
    ),

    keyNum
      ? el(
          "div",
          {
            style: {
              display: "flex", flexDirection: "column",
              margin: "40px 64px 0 64px", padding: "34px 44px",
              borderRadius: "28px",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderLeft: `12px solid ${cat.accent}`,
            },
          },
          el("span", {
            style: { fontSize: "72px", fontWeight: 800, color: cat.accent, display: "flex" },
          }, String(keyNum.value)),
          el("span", {
            style: {
              marginTop: "8px", fontSize: "31px",
              color: "rgba(255,255,255,0.8)", display: "block", lineClamp: 2,
            },
          },
            String(keyNum.label) +
            (keyNum.previousValue
              ? `  (was ${keyNum.previousValue}${keyNum.previousLabel ? ", " + keyNum.previousLabel : ""})`
              : "")
          )
        )
      : null,

    // Footer
    el(
      "div",
      {
        style: {
          display: "flex", alignItems: "center", justifyContent: "space-between",
          margin: "40px 0 0 0", padding: "32px 64px",
          borderTop: "2px solid rgba(255,255,255,0.12)",
        },
      },
      el(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        el("span", { style: { fontSize: "38px", fontWeight: 800, display: "flex" } }, "Why Today"),
        el("span", {
          style: { fontSize: "25px", color: "rgba(255,255,255,0.55)", marginTop: "4px", display: "flex" },
        }, "The why behind India's financial news")
      ),
      el("span", {
        style: { fontSize: "30px", fontWeight: 600, color: cat.accent, display: "flex" },
      }, SITE_URL)
    )
  );
}

async function main() {
  const satori = (await import("satori")).default;
  const { Resvg } = await import("@resvg/resvg-js");

  const edition = JSON.parse(fs.readFileSync(EDITION_PATH, "utf8"));
  const stories = Array.isArray(edition.stories) ? edition.stories : [];
  if (stories.length === 0) {
    console.log("No stories in edition.json — nothing to render.");
    return;
  }

  const fonts = [
    { name: "Inter", weight: 400, style: "normal", data: fs.readFileSync(path.join(FONT_DIR, "Inter-Regular.ttf")) },
    { name: "Inter", weight: 600, style: "normal", data: fs.readFileSync(path.join(FONT_DIR, "Inter-SemiBold.ttf")) },
    { name: "Inter", weight: 800, style: "normal", data: fs.readFileSync(path.join(FONT_DIR, "Inter-ExtraBold.ttf")) },
  ];

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let ok = 0, withPhoto = 0;
  const manifest = {};
  for (const story of stories) {
    if (!story.slug) continue;
    try {
      const photoUri = await fetchImageDataUri(story.headlineImage && story.headlineImage.url);
      if (photoUri) withPhoto++;
      const svg = await satori(buildCardTree(story, edition.date, photoUri), {
        width: W, height: H, fonts,
        loadAdditionalAsset: async (code, segment) => {
          if (code === "emoji") {
            try {
              const cp = [...segment].map((c) => c.codePointAt(0).toString(16)).join("-");
              const res = await fetch(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${cp}.svg`);
              if (res.ok) {
                const body = await res.text();
                return `data:image/svg+xml;base64,${Buffer.from(body).toString("base64")}`;
              }
            } catch { /* icon is optional */ }
          }
          return "";
        },
      });
      const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
      fs.writeFileSync(path.join(OUT_DIR, `${story.slug}.png`), png);
      manifest[story.slug] = `/cards/${story.slug}.png`;
      ok++;
    } catch (err) {
      console.warn(`Card failed for "${story.slug}": ${err.message} — skipping.`);
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify({ date: edition.date, cards: manifest }, null, 2)
  );
  console.log(`Share cards: ${ok}/${stories.length} rendered (${withPhoto} with photos) to public/cards/.`);
}

main().catch((err) => {
  console.warn(`Share card generation failed entirely: ${err.message}`);
  console.warn("Deploy continues without cards.");
  process.exit(0);
});
