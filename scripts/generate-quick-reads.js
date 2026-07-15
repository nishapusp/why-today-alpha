#!/usr/bin/env node
/**
 * Writes to Netlify Blobs (store "why-today-quick-reads", key "feed") —
 * the Quick Reads swipe feed: a much larger pool of near-1-minute-read
 * cards, distinct from the 10-12 flagship deep-dive stories in
 * data/edition.json.
 *
 * REDESIGNED 2026-07-15 from an earlier git-committed-JSON version: that
 * approach meant every refresh was a full Netlify deploy (15 credits
 * each), competing directly with the flagship pipeline for the same
 * ~1,000 credit/month Personal-tier budget the flagship 2x/day schedule
 * already spends ~900 of. Blobs decouples this feed's refresh cadence
 * entirely from deploy credits. Served to the site via
 * app/api/quick-reads/route.ts, which reads from the SAME store using
 * Netlify's auto-injected runtime context (no explicit siteID/token
 * needed there, unlike here).
 *
 * ENRICHMENT (added 2026-07-15, second pass): the original version was
 * purely extractive — headline + raw RSS snippet, no LLM call — to avoid
 * competing with the flagship pipeline for Gemini's scarce free-tier
 * daily REQUEST quota. Real-world testing showed RSS snippets are too
 * thin/duplicate-of-headline too often to give genuine "quick read"
 * value (Inshorts-style — a real few-sentence summary, not just a
 * retitled headline). Added ONE batched, ungrounded Gemini call per run
 * (enrichWithSummaries below) that writes a short blurb AND a smarter
 * image-search query for the whole selected batch together — same
 * per-batch-not-per-story cost reasoning already established for the
 * flagship pipeline's RSS-seeded search mode. This DOES reopen shared
 * quota exposure that the original zero-LLM design avoided, which is
 * why the workflow's run frequency was reduced from every 20 min to
 * every 60 min in the same change (see generate-quick-reads.yml) —
 * bounds it to a modest, predictable daily add rather than an unbounded
 * one. Fails open: if this call fails for any reason (quota, network),
 * the run still publishes using the plain extractive snippet and the
 * keyword-based image query exactly as before, rather than blocking.
 *
 * DESIGN PRINCIPLE (unchanged): reuses fetchRssHeadlines() from
 * generate-edition.js — the SAME cross-outlet-deduped pool already built
 * for RSS-seeding. corroboratedBy (how many outlets independently
 * covered it) is the ranking signal for "major", reusing data that's
 * already computed for free rather than needing a new heuristic.
 *
 * Deliberately excludes anything already covered by today's flagship
 * edition (via isSameEvent) — a reader shouldn't see the same event once
 * as a shallow card and once as a deep dive; if it's flagship-covered,
 * the deep version is strictly better and the shallow one adds nothing.
 *
 * Usage: node scripts/generate-quick-reads.js
 * Env: PEXELS_API_KEY (optional — items without a fetchable image still
 *      publish, just without a picture), GEMINI_API_KEY (optional — items
 *      still publish with the plain extractive snippet if unset or the
 *      call fails), QUICK_READS_LIMIT (default 40), NETLIFY_SITE_ID +
 *      NETLIFY_AUTH_TOKEN (required — this script runs in GitHub Actions,
 *      not on Netlify's own infra, so Blobs needs explicit credentials
 *      here; see the Netlify docs on getStore() outside a Function/Edge
 *      Function context for why).
 */

const fs = require("fs");
const path = require("path");
const { getStore } = require("@netlify/blobs");
const {
  fetchRssHeadlines,
  fetchPexelsImage,
  isSameEvent,
  extractJson,
  GEMINI_API_BASE,
  MODEL,
  FALLBACK_MODEL,
  API_KEY,
} = require("./generate-edition.js");

// Batched enrichment: one ungrounded Gemini call per run writes a short
// Inshorts-style blurb (2-3 plain sentences, not a repeated headline) and
// a smarter 2-4 word image-search query for EVERY selected item together
// — same per-batch cost as one item, not per-item cost. No search tool
// needed (all context is already in hand from RSS), so responseMimeType
// JSON mode is available directly, unlike the flagship pipeline's
// search-grounded calls.
async function enrichWithSummaries(items) {
  if (!API_KEY) throw new Error("GEMINI_API_KEY not set");

  const numbered = items
    .map((it, i) => `${i}. HEADLINE: ${it.title}\n   EXISTING SNIPPET: ${it.snippet || "(none)"}`)
    .join("\n");

  const prompt = `For each of the ${items.length} Indian financial/economic news items below, write:
1. "blurb": a genuine 4-6 sentence summary, approximately 85 words (no fewer than 65, no more than 120) — Inshorts-style: crisp, factual, plain English, NOT a repeat or rewording of the headline. Give enough real substance to stand alone as a complete quick read — who/what/how much/why it matters/what happens next — not just a single thin restatement. Base it on the headline and existing snippet; if the existing snippet is thin, use your knowledge of the topic and typical context to write a sensible, cautious summary — do not invent specific numbers/figures not implied by the headline or snippet.
2. "imageQuery": 2-4 words for a stock-photo search that will find a photo genuinely relevant to the STORY'S SUBJECT (a company, an industry, a place, a financial concept) — never pick words that are literally true of the headline's phrasing but would mislead an image search (e.g. avoid "toll" from "death toll", "baker" from a company named "Baker Hughes", "live" from "Live updates"). When the headline doesn't suggest a clear concrete visual, use a safe generic financial term (e.g. "stock market india", "indian rupee currency", "bank building finance").

Items:
${numbered}

Return ONLY a JSON object of the exact shape {"items": [...]}, where "items" is an array of ${items.length} objects in the same order as the items above, each with exactly "blurb" and "imageQuery" string fields. No other text, no markdown fences.`;

  const models = [MODEL, FALLBACK_MODEL];
  let lastErr;
  for (const model of models) {
    try {
      const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: Math.min(65536, items.length * 300 + 2000), responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const candidate = data.candidates?.[0];
      // Same thought-part filter as the flagship pipeline — gemini-3.5-flash
      // can return a "thought": true part alongside the real JSON answer.
      const text = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || "").join("") ?? "";
      const parsedRaw = JSON.parse(extractJson(text));
      // extractJson (shared with the flagship pipeline) finds the first
      // "{" and balance-matches to its "}" — it's built for object-shaped
      // responses. A bare top-level array's first "{" is actually inside
      // its first element, so extractJson would silently return just that
      // one item, not the whole array (confirmed by reproducing this
      // exact failure against the real function before fixing it) — that
      // is why the prompt above asks for {"items": [...]} instead of a
      // bare array. Still handles a bare array leniently here in case a
      // model ignores the wrapping instruction anyway.
      const parsed = Array.isArray(parsedRaw) ? parsedRaw : parsedRaw?.items;
      if (!Array.isArray(parsed) || parsed.length !== items.length) {
        throw new Error(`Expected ${items.length} items, got ${Array.isArray(parsed) ? parsed.length : typeof parsed}`);
      }
      return parsed;
    } catch (e) {
      lastErr = e;
      console.warn(`enrichWithSummaries failed on ${model}: ${e.message}`);
    }
  }
  throw lastErr;
}

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
  console.log(`Selected top ${selected.length} (by corroboration, then recency) for enrichment + image-fetch + publish.`);

  // One batched call for the whole selection — same per-batch-not-per-
  // item cost reasoning as the flagship pipeline's RSS-seeded search.
  // Fails open: enrichment is a quality improvement, not a hard
  // dependency, so any failure here (missing key, quota, network, a
  // malformed response) falls back to the plain extractive snippet and
  // keyword-based image query for every item, exactly as before this
  // enrichment step existed — never blocks the run.
  let enrichment = null;
  if (process.env.GEMINI_API_KEY && selected.length > 0) {
    try {
      enrichment = await enrichWithSummaries(selected);
      console.log(`Enrichment succeeded: ${enrichment.length} blurbs + image queries.`);
    } catch (e) {
      console.warn(`Enrichment unavailable this run (${e.message}) — falling back to plain extractive snippets and keyword-based image queries.`);
    }
  } else {
    console.log("GEMINI_API_KEY not set — skipping enrichment, using plain extractive snippets.");
  }

  const pexelsKey = process.env.PEXELS_API_KEY;
  const existing = await loadExistingQuickReads(store);
  const existingById = new Map((existing.items || []).map((it) => [it.id, it]));

  const items = [];
  for (let idx = 0; idx < selected.length; idx++) {
    const item = selected[idx];
    const id = slugify(item.title, item.link || item.title);
    const category = item.category;
    const enriched = enrichment?.[idx];

    // Skip re-fetching an image for an item we already have from a
    // previous run (same id = same link) — keeps repeat runs cheap on
    // the Pexels quota, only new items cost a fetch.
    let image = existingById.get(id)?.image ?? null;
    if (!image && pexelsKey) {
      image = await fetchPexelsImage(
        { headline: item.title, category, imageQueryOverride: enriched?.imageQuery },
        pexelsKey
      );
    }

    const headline = stripSourceSuffix(item.title, item.source);
    let snippet;
    if (enriched?.blurb) {
      // The model was explicitly instructed not to repeat the headline,
      // so a genuine LLM-written blurb is trusted directly — no need for
      // the extractive path's redundancy check below.
      snippet = String(enriched.blurb).trim();
    } else {
      snippet = stripSourceSuffix(cleanSnippet(item.snippet), item.source);
      // Google News RSS descriptions are frequently just the title again,
      // sometimes with a trailing source name or fragment tacked on (e.g.
      // headline + " Outlook..." from an incompletely-stripped suffix) —
      // showing that as a "snippet" is redundant, not a real extra line.
      // Checks BOTH directions (previously only caught headline-starts-
      // with-snippet, missing the more common snippet-starts-with-
      // headline-plus-junk case) via a substring/overlap check rather
      // than requiring an exact match.
      const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const normHeadline = normalize(headline);
      const normSnippet = normalize(snippet);
      const tooSimilar =
        !normSnippet ||
        normHeadline === normSnippet ||
        normHeadline.startsWith(normSnippet) ||
        normSnippet.startsWith(normHeadline) ||
        (normSnippet.length < normHeadline.length * 1.3 && normHeadline.includes(normSnippet.slice(0, Math.floor(normSnippet.length * 0.85))));
      if (tooSimilar) snippet = "";
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
