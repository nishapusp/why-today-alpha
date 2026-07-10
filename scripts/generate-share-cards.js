/**
 * generate-share-cards.js
 *
 * Renders one 1080x1350 PNG share card per story in data/edition.json into
 * public/cards/<slug>.png, plus a JSON manifest the ShareButton reads.
 *
 * Runs as part of `npm run build` (see package.json), i.e. on every Netlify
 * deploy — cards are BUILD OUTPUT, never committed to git, so the repo does
 * not bloat by a few MB per day.
 *
 * Design: dark navy canvas, category-colored accent band (colors mirror
 * lib/categoryStyle.ts), oversized headline, one highlighted key number,
 * date stamp, Why Today footer. 1080x1350 (4:5 portrait) fills a WhatsApp
 * preview nicely and is also Instagram-post safe.
 *
 * Failure policy: a broken story card logs a warning and is skipped; a total
 * failure exits 0 so the site itself still deploys. Cards are nice-to-have,
 * the edition is not.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const EDITION_PATH = path.join(ROOT, "data", "edition.json");
const OUT_DIR = path.join(ROOT, "public", "cards");
const FONT_DIR = path.join(ROOT, "assets", "fonts");
const SITE_URL = process.env.SITE_URL || "whytoday.in";

// Mirrors lib/categoryStyle.ts — keep in sync if categories change.
const CATEGORY_STYLE = {
  Banking: { icon: "🏦", accent: "#D9A544", deep: "#8A6420" },
  Economy: { icon: "📊", accent: "#D96B4F", deep: "#8A3826" },
  Technology: { icon: "🔷", accent: "#2E9C8B", deep: "#154E45" },
  World: { icon: "🌐", accent: "#5B8AE8", deep: "#25489E" },
  Policy: { icon: "📋", accent: "#7B8BD4", deep: "#2E3A6B" },
  Corporate: { icon: "🏢", accent: "#B278A0", deep: "#5C3850" },
};

function catStyle(category) {
  return CATEGORY_STYLE[category] || CATEGORY_STYLE.Policy;
}

function formatDate(iso) {
  // "2026-07-10" or full ISO timestamp -> "10 Jul 2026"
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

// Pick the most shareable key number: prefer one with a previousValue (shows
// change), else the first one. Returns null if none usable.
function pickKeyNumber(story) {
  const nums = Array.isArray(story.keyNumbers) ? story.keyNumbers : [];
  const usable = nums.filter((n) => n && n.value && n.label);
  if (usable.length === 0) return null;
  return usable.find((n) => n.previousValue) || usable[0];
}

// satori element helper — plain-JS equivalent of JSX.
function el(type, props = {}, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined);
  return {
    type,
    props: { ...props, children: kids.length === 1 ? kids[0] : kids },
  };
}

function buildCardTree(story, editionDate) {
  const cat = catStyle(story.category);
  const keyNum = pickKeyNumber(story);
  const dateLabel = formatDate(story.generatedAt || editionDate);
  const headline = String(story.headline || "").trim();
  // Very long headlines get a smaller size so they never collide with the
  // number block. Thresholds tuned by eye on real editions.
  const headlineSize = headline.length > 90 ? 56 : headline.length > 60 ? 64 : 74;

  return el(
    "div",
    {
      style: {
        width: "1080px",
        height: "1350px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#0B1220",
        backgroundImage:
          "radial-gradient(at 85% 12%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 45%)",
        fontFamily: "Inter",
        color: "#FFFFFF",
      },
    },
    // Top accent band
    el("div", {
      style: {
        height: "14px",
        width: "100%",
        backgroundColor: cat.accent,
        display: "flex",
      },
    }),
    // Header row: category chip + date
    el(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "44px 64px 0 64px",
        },
      },
      el(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "14px",
            backgroundColor: "rgba(255,255,255,0.08)",
            border: `2px solid ${cat.accent}`,
            borderRadius: "999px",
            padding: "12px 28px",
          },
        },
        el(
          "span",
          {
            style: {
              fontSize: "30px",
              fontWeight: 600,
              letterSpacing: "3px",
              color: cat.accent,
              display: "flex",
            },
          },
          `${cat.icon}  ${String(story.category || "").toUpperCase()}`
        )
      ),
      el(
        "span",
        {
          style: {
            fontSize: "30px",
            color: "rgba(255,255,255,0.65)",
            fontWeight: 600,
            display: "flex",
          },
        },
        dateLabel
      )
    ),
    // Headline — the hero of the card
    el(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          padding: "56px 64px 0 64px",
          flexGrow: 1,
        },
      },
      el(
        "span",
        {
          style: {
            fontSize: `${headlineSize}px`,
            fontWeight: 800,
            lineHeight: 1.18,
            letterSpacing: "-1px",
            display: "flex",
          },
        },
        headline
      ),
      // Summary — one supporting line, clamped
      story.summary
        ? el(
            "span",
            {
              style: {
                marginTop: "34px",
                fontSize: "34px",
                lineHeight: 1.45,
                color: "rgba(255,255,255,0.75)",
                display: "block",
                lineClamp: 3,
              },
            },
            String(story.summary).trim()
          )
        : null
    ),
    // Key number block
    keyNum
      ? el(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              margin: "0 64px 44px 64px",
              padding: "36px 44px",
              borderRadius: "28px",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderLeft: `12px solid ${cat.accent}`,
            },
          },
          el(
            "span",
            {
              style: {
                fontSize: "76px",
                fontWeight: 800,
                color: cat.accent,
                display: "flex",
              },
            },
            String(keyNum.value)
          ),
          el(
            "span",
            {
              style: {
                marginTop: "10px",
                fontSize: "32px",
                color: "rgba(255,255,255,0.8)",
                display: "block",
                lineClamp: 2,
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "34px 64px",
          borderTop: "2px solid rgba(255,255,255,0.12)",
        },
      },
      el(
        "div",
        { style: { display: "flex", flexDirection: "column" } },
        el(
          "span",
          { style: { fontSize: "40px", fontWeight: 800, display: "flex" } },
          "Why Today"
        ),
        el(
          "span",
          {
            style: {
              fontSize: "26px",
              color: "rgba(255,255,255,0.55)",
              marginTop: "4px",
              display: "flex",
            },
          },
          "The why behind India's financial news"
        )
      ),
      el(
        "span",
        {
          style: {
            fontSize: "30px",
            fontWeight: 600,
            color: cat.accent,
            display: "flex",
          },
        },
        SITE_URL
      )
    )
  );
}

async function main() {
  // Lazy imports so a missing dep fails inside the try/catch below.
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

  let ok = 0;
  const manifest = {};
  for (const story of stories) {
    if (!story.slug) continue;
    try {
      const svg = await satori(buildCardTree(story, edition.date), {
        width: 1080,
        height: 1350,
        fonts,
        // Emoji glyphs (category icons) fetched as SVGs at build time; if the
        // CDN is unreachable the card still renders, just without the icon.
        loadAdditionalAsset: async (code, segment) => {
          if (code === "emoji") {
            try {
              const cp = [...segment]
                .map((c) => c.codePointAt(0).toString(16))
                .join("-");
              const res = await fetch(
                `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${cp}.svg`
              );
              if (res.ok) {
                const body = await res.text();
                return `data:image/svg+xml;base64,${Buffer.from(body).toString("base64")}`;
              }
            } catch {
              /* icon is optional */
            }
          }
          return "";
        },
      });
      const png = new Resvg(svg, {
        fitTo: { mode: "width", value: 1080 },
      }).render().asPng();
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
  console.log(`Share cards: ${ok}/${stories.length} rendered to public/cards/.`);
}

main().catch((err) => {
  // Never block the deploy over share cards.
  console.warn(`Share card generation failed entirely: ${err.message}`);
  console.warn("Deploy continues without cards.");
  process.exit(0);
});
