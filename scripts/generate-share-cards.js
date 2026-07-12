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

/**
 * QR code linking straight to the story — the one part of the card that
 * survives being forwarded without the share text. Rendered as an inline
 * SVG data URI; any failure returns null and the footer simply omits it.
 */
async function makeQrDataUri(storyUrl) {
  try {
    const QRCode = require("qrcode");
    const svg = await QRCode.toString(storyUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#0B1220", light: "#FFFFFF" },
    });
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    return null;
  }
}

// Shared footer for both card designs: brand on the left, scan-to-read QR
// on the right (falls back to the plain site URL when QR generation fails).
function footerRow(cat, qrUri) {
  return el(
    "div",
    {
      style: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        margin: "30px 0 0 0", padding: "26px 64px",
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
    el(
      "div",
      { style: { display: "flex", alignItems: "center" } },
      el(
        "div",
        { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", marginRight: qrUri ? "22px" : "0px" } },
        el("span", {
          style: { fontSize: "30px", fontWeight: 600, color: cat.accent, display: "flex" },
        }, SITE_URL),
        qrUri
          ? el("span", {
              style: { fontSize: "22px", color: "rgba(255,255,255,0.5)", marginTop: "4px", display: "flex" },
            }, "Scan to read the full story")
          : null
      ),
      qrUri
        ? el("img", {
            src: qrUri, width: 160, height: 160,
            style: {
              width: "160px", height: "160px", borderRadius: "16px",
              border: "6px solid #FFFFFF",
            },
          })
        : null
    )
  );
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

function buildCardTree(story, editionDate, photoUri, qrUri) {
  const cat = catStyle(story.category);
  const keyNum = pickKeyNumber(story);
  const dateLabel = formatDate(story.generatedAt || editionDate);
  // Share cards use the curiosity-engine WhatsApp variant when the story
  // has one (≤9 words, punchier) — older stories fall back to the headline.
  const headline = String(story.whatsappHeadline || story.headline || "").trim();
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
    footerRow(cat, qrUri)
  );
}

// ---------------------------------------------------------------------------
// Time Machine card — a SECOND card per story (<slug>-tm.png).
//
// Six timeline steps can't share a card with the photo + key number and stay
// readable at WhatsApp preview size, so the Time Machine gets its own
// dedicated dark card: headline up top, then the full spine from "10 years
// ago" to "What happens next?". ShareButton sends both cards together.
// ---------------------------------------------------------------------------

const TM_STEPS = [
  { key: "tenYearsAgo", label: "10 YEARS AGO" },
  { key: "lastYear", label: "LAST YEAR" },
  { key: "lastMonth", label: "LAST MONTH" },
  { key: "yesterday", label: "YESTERDAY" },
  { key: "today", label: "TODAY" },
  { key: "future", label: "WHAT HAPPENS NEXT?" },
];

// Clip to ~N chars at a word boundary so no step overflows its 2-line box.
function clipWords(str, max = 110) {
  const s = String(str || "").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + "…";
}

function tmStepRow(step, text, cat, isLast) {
  const isToday = step.key === "today";
  const isFuture = step.key === "future";
  const dotSize = isToday ? 26 : 18;
  return el(
    "div",
    { style: { display: "flex", flexDirection: "row" } },
    // spine column: dot + connector line
    el(
      "div",
      {
        style: {
          display: "flex", flexDirection: "column", alignItems: "center",
          width: "44px", marginRight: "26px",
        },
      },
      el("div", {
        style: {
          width: `${dotSize}px`, height: `${dotSize}px`, borderRadius: "999px",
          marginTop: isToday ? "2px" : "6px", display: "flex",
          backgroundColor: isFuture ? "transparent" : cat.accent,
          border: isFuture ? `3px solid ${cat.accent}` : "none",
          opacity: isToday || isFuture ? 1 : 0.55,
        },
      }),
      isLast
        ? null
        : el("div", {
            style: {
              width: "3px", flexGrow: 1, marginTop: "6px", marginBottom: "6px",
              backgroundColor: cat.accent, opacity: isToday ? 0.9 : 0.3,
              display: "flex",
            },
          })
    ),
    // text column
    el(
      "div",
      {
        style: {
          display: "flex", flexDirection: "column", flexGrow: 1,
          paddingBottom: isLast ? "0px" : "30px", width: "880px",
        },
      },
      el("span", {
        style: {
          fontSize: isToday ? "28px" : "24px", fontWeight: isToday ? 800 : 600,
          letterSpacing: "3px", display: "flex",
          color: isToday ? cat.accent : "rgba(255,255,255,0.55)",
        },
      }, step.label),
      el("span", {
        style: {
          marginTop: "8px", fontSize: isToday ? "31px" : "28px",
          fontWeight: isToday ? 600 : 400, lineHeight: 1.35,
          color: isToday ? "#FFFFFF" : "rgba(255,255,255,0.82)",
          display: "block", lineClamp: 2,
          fontStyle: isFuture ? "italic" : "normal",
        },
      }, clipWords(text, isToday ? 120 : 105))
    )
  );
}

function buildTimeMachineCardTree(story, editionDate, qrUri) {
  const cat = catStyle(story.category);
  const dateLabel = formatDate(story.generatedAt || editionDate);
  const headline = String(story.whatsappHeadline || story.headline || "").trim();
  const tm = story.timeMachine || {};
  const steps = TM_STEPS.filter((s) => String(tm[s.key] || "").trim());

  return el(
    "div",
    {
      style: {
        width: `${W}px`, height: `${H}px`,
        display: "flex", flexDirection: "column",
        backgroundImage: `linear-gradient(160deg, ${cat.dark} 0%, #0B1220 55%, #0B1220 100%)`,
        fontFamily: "Inter", color: "#FFFFFF", position: "relative",
      },
    },
    // thin accent line at the very top (matches the main card)
    el("div", {
      style: {
        position: "absolute", top: 0, left: 0, width: `${W}px`, height: "14px",
        backgroundColor: cat.accent, display: "flex",
      },
    }),

    headerRow(story, cat, dateLabel),

    // headline (compact — the main card already carries the big version).
    // Rendered as flex text, NOT display:block + lineClamp: satori mis-measures
    // block height when the text contains an emoji (e.g. a flag) and wraps,
    // which made the TIME MACHINE eyebrow overlap the headline's second line.
    // clipWords keeps it to ≤2 lines instead.
    el(
      "div",
      { style: { display: "flex", margin: "36px 64px 0 64px" } },
      el("span", {
        style: {
          fontSize: "46px", fontWeight: 800,
          lineHeight: 1.2, letterSpacing: "-0.5px", display: "flex",
        },
      }, clipWords(headline, 76))
    ),

    // Time Machine eyebrow
    el(
      "div",
      {
        style: {
          display: "flex", alignItems: "center",
          margin: "34px 64px 30px 64px", paddingBottom: "22px",
          borderBottom: "2px solid rgba(255,255,255,0.12)",
        },
      },
      el("span", {
        style: {
          fontSize: "30px", fontWeight: 800, letterSpacing: "4px",
          color: cat.accent, display: "flex",
        },
      }, "⏳ TIME MACHINE"),
      el("span", {
        style: {
          fontSize: "25px", color: "rgba(255,255,255,0.5)",
          marginLeft: "22px", display: "flex",
        },
      }, "How we got here")
    ),

    // the spine
    el(
      "div",
      {
        style: {
          display: "flex", flexDirection: "column", flexGrow: 1,
          padding: "0 64px",
        },
      },
      steps.map((s, i) => tmStepRow(s, tm[s.key], cat, i === steps.length - 1))
    ),

    // Footer (matches the main card)
    footerRow(cat, qrUri)
  );
}

// How many usable steps a story's timeMachine has — below 4 the card looks
// sparse and sad, so we skip rendering it.
function tmStepCount(story) {
  const tm = story && story.timeMachine;
  if (!tm || typeof tm !== "object") return 0;
  return TM_STEPS.filter((s) => String(tm[s.key] || "").trim()).length;
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

  let ok = 0, tmOk = 0, withPhoto = 0;
  const manifest = {};
  const tmManifest = {};

  const satoriOptions = {
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
  };

  const renderPng = async (tree, outName) => {
    const svg = await satori(tree, satoriOptions);
    const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
    fs.writeFileSync(path.join(OUT_DIR, outName), png);
  };

  for (const story of stories) {
    if (!story.slug) continue;
    try {
      const photoUri = await fetchImageDataUri(story.headlineImage && story.headlineImage.url);
      var qrUri = await makeQrDataUri(`https://${SITE_URL}/story/${story.slug}`);
      if (photoUri) withPhoto++;
      await renderPng(buildCardTree(story, edition.date, photoUri, qrUri), `${story.slug}.png`);
      manifest[story.slug] = `/cards/${story.slug}.png`;
      ok++;
    } catch (err) {
      console.warn(`Card failed for "${story.slug}": ${err.message} — skipping.`);
    }

    // Time Machine companion card — its failure never affects the main card.
    if (tmStepCount(story) >= 4) {
      try {
        await renderPng(buildTimeMachineCardTree(story, edition.date, qrUri), `${story.slug}-tm.png`);
        tmManifest[story.slug] = `/cards/${story.slug}-tm.png`;
        tmOk++;
      } catch (err) {
        console.warn(`Time Machine card failed for "${story.slug}": ${err.message} — main card still fine.`);
      }
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify({ date: edition.date, cards: manifest, timeMachineCards: tmManifest }, null, 2)
  );
  console.log(`Share cards: ${ok}/${stories.length} rendered (${withPhoto} with photos), ${tmOk} Time Machine cards, to public/cards/.`);
}

main().catch((err) => {
  console.warn(`Share card generation failed entirely: ${err.message}`);
  console.warn("Deploy continues without cards.");
  process.exit(0);
});
