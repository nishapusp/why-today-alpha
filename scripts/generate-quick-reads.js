#!/usr/bin/env node
/**
 * Writes to Netlify Blobs (store "why-today-quick-reads", key "feed") —
 * the "Pulse" swipe feed: a much larger pool of near-1-minute-read cards,
 * distinct from the 10-12 flagship deep-dive stories in data/edition.json.
 *
 * REDESIGNED 2026-07-15 from an earlier git-committed-JSON version: that
 * approach meant every refresh was a full Netlify deploy (15 credits
 * each), competing directly with the flagship pipeline for the same
 * ~1,000 credit/month Personal-tier budget the flagship 2x/day schedule
 * already spends ~900 of. Blobs decouples this feed's refresh cadence
 * entirely from deploy credits — it can run every 15-20 minutes for a
 * small compute cost instead, without touching the flagship budget at
 * all. Served to the site via app/api/quick-reads/route.ts, which reads
 * from the SAME store using Netlify's auto-injected runtime context (no
 * explicit siteID/token needed there, unlike here).
 *
 * DESIGN PRINCIPLE (per 2026-07-15 discussion): this must not compete with
 * the flagship stories for Gemini quota either. It reuses fetchRssHeadlines()
 * from generate-edition.js — the SAME cross-outlet-deduped pool already
 * built for RSS-seeding — and is extractive by default: headline + RSS
 * snippet, no LLM call at all. corroboratedBy (how many outlets
 * independently covered it) is the ranking signal for "major", reusing
 * data that's already computed for free rather than needing a new
 * heuristic.
 *
 * Deliberately excludes anything already covered by today's flagship
 * edition (via isSameEvent) — a reader shouldn't see the same event once
 * as a shallow card and once as a deep dive; if it's flagship-covered,
 * the deep version is strictly better and the shallow one adds nothing.
 *
 * Usage: node scripts/generate-quick-reads.js
 * Env: PEXELS_API_KEY (optional — items without a fetchable image still
 *      publish, just without a picture), QUICK_READS_LIMIT (default 40),
 *      NETLIFY_SITE_ID + NETLIFY_AUTH_TOKEN (required — this script runs
 *      in GitHub Actions, not on Netlify's own infra, so Blobs needs
 *      explicit credentials here; see the Netlify docs on getStore()
 *      outside a Function/Edge Function context for why).
 */

const fs = require("fs");
const path = require("path");
const { getStore } = require("@netlify/blobs");
const { fetchRssHeadlines, fetchPexelsImage, isSameEvent } = require("./generate-edition.js");

const EDITION_PATH = path.join(__dirname, "..", "data", "edition.json");
const LIMIT = parseInt(process.env.QUICK_READS_LIMIT || "40", 10);

function quickReadsStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) {
    throw new Error(
      "NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN must be set — Blobs needs explicit credentials when called from outside Netlify's own Functions/Edge runtime (e.g. from GitHub Actions, as this script does)."
    );
  }
  return getStore({ name: "why-today-quick-reads", siteID, token });
}

// Strict keyword classifier — REDESIGNED 2026-07-15 per explicit scope:
// "only geopolitical and very big news which can potentially affect
// economy/finance/banking, global as well as local." The original version
// had two problems, both found by auditing the first real run: (1) "World"
// matched on bare "global"/"world"/"us "/"china" with no requirement that
// the story actually be economically relevant, which is how a Bangkok bar
// fire and an Argentina-England World Cup match got in; (2) unmatched
// items fell through to a default "Economy" category rather than being
// dropped, which is how an Ebola outbreak and a CBSE exam-marking dispute
// ended up mislabeled as financial content rather than excluded outright.
// Both fixed here: every category now requires an actual, specific
// financial/economic/banking signal (no bare "world"/"government"), and
// there is NO default — an item matching nothing is dropped from the pool
// in main(), not waved through under a fallback label.
const CATEGORY_KEYWORDS = {
  Banking: ["bank", "rbi", "npa", "lending", "deposit", "loan", "credit", "nbfc", "cooperative bank"],
  IPO: ["ipo", "drhp", "public issue", "gmp", "listing gain", "listing premium", "subscri", "stock market debut"],
  Startups: ["startup", "funding round", "unicorn", "seed round", "series a", "series b", "venture capital", "venture funding"],
  AI: ["artificial intelligence funding", "ai startup", "ai investment", "ai regulation", "ai chip", "generative ai", "ai university", "sovereign ai"],
  Corporate: [
    "quarterly result", "q1 result", "q2 result", "q3 result", "q4 result", "earnings", "net profit", "revenue",
    "merger", "acquisition", "shares surge", "shares jump", "shares fall", "stock price",
    // Capital investment / expansion news — missed "Dalmia Bharat lays
    // foundation stone for ₹3100 cr second plant" in testing; a large
    // crore-denominated capex commitment is real corporate/economic news
    // even without a quarterly-earnings frame.
    "crore investment", "cr investment", "foundation stone", "capex", "expansion plan", "new plant",
  ],
  // Requires an actual economic-policy signal — bare "government" or
  // "bill" (which also matches e.g. a citizen-services bill) is too loose.
  Policy: ["monetary policy", "fiscal policy", "union budget", "gst", "tax reform", "trade policy", "rbi policy", "mpc decision", "divestment", "disinvestment", "sebi"],
  // Geopolitical ONLY when tied to a clear economic/market-impact signal
  // OR a major conflict/flashpoint region — wars and military escalation
  // are near-universally market-moving (oil, defense stocks, currency,
  // trade routes) even when a specific headline doesn't use financial
  // vocabulary itself. Testing against the real 07-15 run caught this:
  // a Trump/Iran bombing-threat story was wrongly dropped under the
  // original narrower list — exactly the "big geopolitical news that can
  // affect economy" case this whole redesign exists for.
  World: [
    "sanctions", "tariff", "trade war", "embargo", "oil price", "opec", "supply chain", "blockade",
    "central bank", "federal reserve", "interest rate decision", "global recession", "energy crisis",
    "currency crisis", "shipping route", "strait of hormuz",
    "iran", "israel", "gaza", "ukraine", "russia", "ceasefire", "military strike", "invasion",
    "conflict escalation", "diplomatic crisis", "missile strike",
  ],
  Economy: [
    "inflation", "gdp", "trade deficit", "forex", "rupee", "sensex", "nifty", "stock market", "stocks",
    "economic growth", "recession", "unemployment rate", "fiscal deficit", "current account",
    "repo rate", "wholesale price", "consumer price",
    // Stock-movement vocabulary — near-exclusively financial in headline
    // usage; missed "Glenmark Pharmaceuticals Ltd soars 0.08%" without
    // these. "buzzing stocks" already covered by "stocks" above.
    "soars", "surges", "rallies", "plunges", "tumbles", "slips",
  ],
};

function guessCategory(text) {
  const lower = ` ${text.toLowerCase()} `;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return null; // no confident match — dropped by the caller, not defaulted
}

// Google News RSS titles bake the publisher name onto the end (e.g.
// "SBI Funds IPO subscribed 1.25x - India Infoline") — redundant since
// `source` already carries that, and it looks broken in a headline. Only
// strips when the suffix matches the item's own `source` field (allowing
// for minor punctuation like a trailing ".com"), so a genuine title
// ending in " - Details" or similar (seen on direct-publisher feeds,
// which don't have this problem) is never touched.
function stripSourceSuffix(headline, source) {
  if (!source) return headline;
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\.com$/, "(\\.com)?");
  const re = new RegExp(`\\s*-\\s*${escaped}\\s*$`, "i");
  return headline.replace(re, "").trim();
}

function slugify(title, link) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  // Short hash suffix so two similarly-worded headlines on the same day
  // never collide on id — link is unique per item even when titles are
  // near-identical after slugification.
  let hash = 0;
  for (let i = 0; i < link.length; i++) hash = (hash * 31 + link.charCodeAt(i)) >>> 0;
  return `${base}-${hash.toString(36).slice(0, 6)}`;
}

function loadFlagshipHeadlines() {
  try {
    const edition = JSON.parse(fs.readFileSync(EDITION_PATH, "utf8"));
    return (edition.stories || []).map((s) => s.headline).filter(Boolean);
  } catch {
    return [];
  }
}

async function loadExistingQuickReads(store) {
  try {
    const raw = await store.get("feed", { type: "text" });
    return raw ? JSON.parse(raw) : { generatedAt: null, items: [] };
  } catch {
    return { generatedAt: null, items: [] };
  }
}

// Clean up an RSS <description> snippet: strip any leftover HTML entities/
// tags Google News sometimes includes, and trim to a true "1-minute read"
// length rather than the raw ~220-char RSS cut.
function cleanSnippet(raw) {
  return String(raw || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

async function main() {
  const store = quickReadsStore();

  console.log("Fetching RSS pool (reusing generate-edition.js's cross-outlet-deduped fetch)...");
  const pool = await fetchRssHeadlines();
  console.log(`Pool: ${pool.length} distinct events.`);

  const flagshipHeadlines = loadFlagshipHeadlines();
  console.log(`Excluding anything matching today's ${flagshipHeadlines.length} flagship stories.`);

  const filtered = pool.filter((item) => !flagshipHeadlines.some((h) => isSameEvent(item.title, h)));

  // Attach category now (not later per-item in the loop) so the
  // no-confident-match items can be dropped BEFORE the LIMIT cap — a
  // story that doesn't clearly affect economy/finance/banking shouldn't
  // occupy one of the 40 slots just because it happened to rank high on
  // corroboration; dropping it here lets a genuinely relevant item further
  // down the pool take that slot instead.
  const categorized = filtered
    .map((item) => ({ ...item, category: guessCategory(`${item.title} ${item.snippet || ""}`) }))
    .filter((item) => item.category !== null);
  console.log(`${filtered.length} events after flagship-dedup -> ${categorized.length} with a confident financial/economic/banking or market-relevant-geopolitical match (dropped ${filtered.length - categorized.length} with no clear relevance).`);

  // Rank: multi-outlet corroboration first (the "major" signal), then
  // recency as the tiebreaker within each corroboration tier.
  categorized.sort((a, b) => {
    const corrA = (a.sources || [a.source]).length;
    const corrB = (b.sources || [b.source]).length;
    if (corrB !== corrA) return corrB - corrA;
    return b.pubMs - a.pubMs;
  });

  const selected = categorized.slice(0, LIMIT);
  console.log(`Selected top ${selected.length} (by corroboration, then recency) for image-fetch + publish.`);

  const pexelsKey = process.env.PEXELS_API_KEY;
  const existing = await loadExistingQuickReads(store);
  const existingById = new Map((existing.items || []).map((it) => [it.id, it]));

  const items = [];
  for (const item of selected) {
    const id = slugify(item.title, item.link || item.title);
    const category = item.category;

    // Skip re-fetching an image for an item we already have from a
    // previous run (same id = same link) — keeps repeat runs cheap on
    // the Pexels quota, only new items cost a fetch.
    let image = existingById.get(id)?.image ?? null;
    if (!image && pexelsKey) {
      image = await fetchPexelsImage({ headline: item.title, category }, pexelsKey);
    }

    const headline = stripSourceSuffix(item.title, item.source);
    let snippet = stripSourceSuffix(cleanSnippet(item.snippet), item.source);
    // Google News RSS descriptions are frequently just the title again —
    // showing that as a "snippet" is redundant, not a real extra line.
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!snippet || normalize(snippet) === normalize(headline) || normalize(headline).startsWith(normalize(snippet))) {
      snippet = "";
    }

    items.push({
      id,
      headline,
      snippet,
      category,
      source: item.source || "News",
      corroboratedBy: (item.sources || [item.source]).filter((s, i, arr) => arr.indexOf(s) === i),
      link: item.link || null,
      publishedAt: item.pubDate || null,
      image,
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    items,
  };

  await store.set("feed", JSON.stringify(output));
  console.log(`Wrote ${items.length} Quick Reads to Netlify Blobs (store: why-today-quick-reads, key: feed).`);
  console.log(`Corroborated by 2+ outlets: ${items.filter((i) => i.corroboratedBy.length >= 2).length}/${items.length}`);
  console.log(`With image: ${items.filter((i) => i.image).length}/${items.length}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("\nQuick Reads generation failed:", err.message);
    process.exit(1);
  });
}

module.exports = { guessCategory, slugify, cleanSnippet };
