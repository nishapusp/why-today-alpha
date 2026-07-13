#!/usr/bin/env node
/**
 * scripts/poll-rss.js
 *
 * Runs frequently (every ~20 min via .github/workflows/poll-rss.yml) to
 * check RSS feeds for breaking stories, WITHOUT touching Gemini quota.
 * It does NOT generate anything itself — its only job is to decide WHEN
 * generate-edition.js should run, then trigger it via workflow_dispatch.
 *
 * Why this exists: generate-edition.js used to only run on a fixed
 * 6 AM / 1:15 PM schedule, so a story breaking at 9 AM sat unnoticed for
 * hours. This closes that gap — but deliberately does NOT trigger the
 * instant a headline appears. See MATURITY_MINUTES below for why.
 *
 * ROLLBACK: this script and its workflow are fully independent of
 * generate-edition.js — deleting/disabling .github/workflows/poll-rss.yml
 * reverts to the old fixed-schedule behavior with zero other changes.
 * generate-edition.js's story quality, schema, and length floors are
 * completely untouched by this file either way.
 *
 * Feed list is intentionally duplicated from generate-edition.js rather
 * than shared, on purpose: this script has no ability to affect story
 * generation, so a bug here can never touch the pipeline that actually
 * writes stories. Keep the two lists in sync manually if you add feeds.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const STATE_PATH = path.join(ROOT, "data", "rss-watch.json");
const EDITION_PATH = path.join(ROOT, "data", "edition.json");

// A story must have been seen for at least this long before it can trigger
// generation — gives follow-up reporting time to accumulate so Gemini has
// enough material for a genuine deep dive, not just a thin first wire brief.
const MATURITY_MINUTES = 45;

// Don't dispatch generation more than once per run of this script, and not
// again within this cooldown — protects the daily Gemini quota from being
// drained by a burst of simultaneously-maturing stories.
const COOLDOWN_MINUTES = 30;

const RSS_QUERIES = [
  '(RBI OR "monetary policy" OR "reserve bank") when:2d',
  "(India banking OR NPA OR lending) when:2d",
  "(India economy OR inflation OR GDP OR fiscal) when:2d",
  '(India "quarterly results" OR earnings OR listed) when:2d',
  "(India Sensex OR Nifty OR SEBI OR IPO) when:2d",
  "(India fintech OR UPI OR semiconductor OR technology policy) when:2d",
];

const DIRECT_FEEDS = [
  { source: "Business Standard", url: "https://www.business-standard.com/rss/economy-102.rss" },
  { source: "Business Standard", url: "https://www.business-standard.com/rss/finance-103.rss" },
  { source: "Business Standard", url: "https://www.business-standard.com/rss/markets-106.rss" },
  { source: "Business Standard", url: "https://www.business-standard.com/rss/external-affairs-defence-security-227.rss" },
  { source: "Business Standard", url: "https://www.business-standard.com/rss/world-news-221.rss" },
  { source: "LiveMint", url: "https://www.livemint.com/rss/news" },
  { source: "Economic Times", url: "https://economictimes.indiatimes.com/rssfeedsdefault.cms" },
  { source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
];

function decodeXml(s) {
  return (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim();
}
function pickTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeXml(m[1]) : "";
}

// Same normalization as generate-edition.js's isSameEvent()/dedup key, kept
// in sync manually — two headlines reworded slightly still map to one key.
const STOPWORDS = new Set("the a an of in on to for with and or as at by from into over after amid amidst its their this that is are was were will be has have new says said".split(" "));
function eventKey(headline) {
  return (headline || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map((w) => w.replace(/(ing|ed|es|s)$/, ""))
    .filter((w) => w.length > 2)
    .sort()
    .slice(0, 6) // top few significant tokens is enough to key on
    .join("-");
}

async function fetchFeed(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = m[1];
      const title = pickTag(block, "title");
      if (!title) continue;
      items.push({ title, pubDate: pickTag(block, "pubDate") });
    }
    return items;
  } catch (e) {
    console.warn(`poll-rss: feed failed (${url}): ${e.message}`);
    return [];
  }
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { seen: {}, promoted: {}, lastTriggerMs: 0 };
  }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

function todaysStoryCount() {
  try {
    const edition = JSON.parse(fs.readFileSync(EDITION_PATH, "utf8"));
    const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    if (edition.date !== todayISO) return 0; // yesterday's file hasn't rolled yet
    return (edition.stories || []).length;
  } catch {
    return 0;
  }
}

async function triggerGeneration() {
  const repo = process.env.GITHUB_REPOSITORY; // "owner/name", auto-set in Actions
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    console.warn("poll-rss: missing GITHUB_REPOSITORY or GITHUB_TOKEN — cannot dispatch. (Expected when run locally.)");
    return false;
  }
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/generate-edition.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!res.ok) {
    console.warn(`poll-rss: dispatch failed — HTTP ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

async function main() {
  const state = loadState();
  const now = Date.now();

  if (todaysStoryCount() >= 15) {
    console.log("poll-rss: today's edition is already full (15/15) — polling for tomorrow's queue but won't trigger.");
  }

  // 1. Fetch everything, note first-seen time for anything new.
  const allUrls = [
    ...RSS_QUERIES.map((q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`),
    ...DIRECT_FEEDS.map((f) => f.url),
  ];
  let newCount = 0;
  for (const url of allUrls) {
    const items = await fetchFeed(url);
    for (const item of items) {
      const key = eventKey(item.title);
      if (!key || state.seen[key]) continue;
      state.seen[key] = { firstSeenMs: now, title: item.title };
      newCount++;
    }
  }
  console.log(`poll-rss: ${newCount} newly-seen headlines this run (${Object.keys(state.seen).length} tracked total).`);

  // 2. Prune anything older than 24h — stale entries just bloat the file.
  for (const [key, v] of Object.entries(state.seen)) {
    if (now - v.firstSeenMs > 24 * 3600 * 1000) delete state.seen[key];
  }

  // 3. Maturity gate — anything seen long enough ago and not yet promoted?
  const matured = Object.entries(state.seen).filter(
    ([key, v]) => now - v.firstSeenMs >= MATURITY_MINUTES * 60 * 1000 && !state.promoted[key]
  );

  const cooldownOk = now - (state.lastTriggerMs || 0) >= COOLDOWN_MINUTES * 60 * 1000;
  const editionFull = todaysStoryCount() >= 15;

  if (matured.length > 0 && cooldownOk && !editionFull) {
    console.log(`poll-rss: ${matured.length} matured storie(s), triggering generate-edition.yml. First: "${matured[0][1].title}"`);
    const ok = await triggerGeneration();
    if (ok) {
      state.lastTriggerMs = now;
      for (const [key] of matured) state.promoted[key] = now;
    }
  } else if (matured.length > 0) {
    console.log(`poll-rss: ${matured.length} matured but not triggering (cooldownOk=${cooldownOk}, editionFull=${editionFull}).`);
  } else {
    console.log("poll-rss: nothing matured yet.");
  }

  saveState(state);
}

main().catch((e) => {
  console.error("poll-rss: fatal error:", e);
  process.exit(1);
});
