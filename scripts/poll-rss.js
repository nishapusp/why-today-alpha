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
// 2026-08-02: raised from 30 — a real Netlify credit-usage investigation
// found this was tight enough for two independently-maturing stories to
// both fire within the same hour, and (see MAX_TRIGGERS_PER_DAY below)
// too loose to prevent a specific feedback loop with generate-edition.yml's
// own auto-remove step.
const COOLDOWN_MINUTES = 120;

// 2026-08-02: added after the same investigation found a real, confirmed
// retrigger loop, not just occasional breaking-news top-ups. generate-
// edition.yml's own fact-check step auto-removes fabricated/unverifiable
// stories after every run, which can drop today's story count below the
// editionFull threshold below — and the MOMENT it does, the next 20-min
// poll here would see a pre-existing matured backlog item and fire
// AGAIN, whose own fact-check could remove more stories, clearing
// editionFull again, and so on. Real data: 36 "Daily edition" runs and
// 45 auto-remove commits in 3 days (expected: ~6 and ~0), spread across
// nearly every hour rather than clustered near breaking news. A hard
// daily cap bounds the worst case regardless of the exact mechanism —
// the two FIXED schedule runs (5 AM / 1:15 PM IST) are unaffected by
// this cap; it only limits how many EXTRA poll-triggered dispatches can
// happen on top of those.
const MAX_TRIGGERS_PER_DAY = 2;

const RSS_QUERIES = [
  '(RBI OR "monetary policy" OR "reserve bank") when:2d',
  "(India banking OR NPA OR lending) when:2d",
  "(India economy OR inflation OR GDP OR fiscal) when:2d",
  '(India "quarterly results" OR earnings OR listed) when:2d',
  "(India Sensex OR Nifty OR SEBI OR IPO) when:2d",
  "(India fintech OR UPI OR semiconductor OR technology policy) when:2d",
  '(India IPO OR "public issue" OR DRHP OR "stock market debut") when:2d',
  '(India startup OR fintech OR "funding round" OR unicorn) when:2d',
  '(India "artificial intelligence" OR AI OR "machine learning" OR chatbot) when:2d',
];

const DIRECT_FEEDS = [
  { source: "Business Standard", category: "Economy", url: "https://www.business-standard.com/rss/economy-102.rss" },
  { source: "Business Standard", category: "Economy", url: "https://www.business-standard.com/rss/finance-103.rss" },
  { source: "Business Standard", category: "Economy", url: "https://www.business-standard.com/rss/markets-106.rss" },
  { source: "Business Standard", category: "World", url: "https://www.business-standard.com/rss/external-affairs-defence-security-227.rss" },
  { source: "Business Standard", category: "World", url: "https://www.business-standard.com/rss/world-news-221.rss" },
  { source: "LiveMint", category: "Economy", url: "https://www.livemint.com/rss/news" },
  { source: "Economic Times", category: "Economy", url: "https://economictimes.indiatimes.com/rssfeedsdefault.cms" },
  { source: "BBC World", category: "World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "Moneycontrol", category: "Economy", url: "http://www.moneycontrol.com/rss/latestnews.xml" },
  { source: "Financial Express", category: "Economy", url: "https://www.financialexpress.com/feed/" },
  { source: "Hindu BusinessLine", category: "Economy", url: "https://www.thehindubusinessline.com/feeder/default.rss" },
  { source: "NDTV Business", category: "Economy", url: "https://feeds.feedburner.com/NDTV-Business?format=xml" },
  { source: "Zee Business", category: "Economy", url: "http://zeenews.india.com/rss/business.xml" },
];

// Minimum World/geopolitics stories we'd like in a day's 15 — see README
// note in generate-edition.js's buildUserPrompt() for how this is used.
// Purely a soft nudge: if a matured World candidate exists and today's
// edition has fewer than this many World stories, the triggered run asks
// Gemini to favor World stories for that batch specifically — it never
// forces a weak story in just to hit the number.
const MIN_WORLD_STORIES = 3;

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
      items.push({ title, pubDate: pickTag(block, "pubDate"), rssSource: pickTag(block, "source") });
    }
    return items;
  } catch (e) {
    console.warn(`poll-rss: feed failed (${url}): ${e.message}`);
    return [];
  }
}

function loadState() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    if (!state.triggersToday) state.triggersToday = { date: "", count: 0 };
    return state;
  } catch {
    return { seen: {}, promoted: {}, lastTriggerMs: 0, triggersToday: { date: "", count: 0 } };
  }
}

// Same IST-calendar-day convention as todaysEditionStats() below.
function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

function todaysEditionStats() {
  try {
    const edition = JSON.parse(fs.readFileSync(EDITION_PATH, "utf8"));
    if (edition.date !== todayIST()) return { total: 0, byCategory: {} }; // yesterday's file hasn't rolled yet
    const stories = edition.stories || [];
    const byCategory = {};
    for (const s of stories) byCategory[s.category] = (byCategory[s.category] || 0) + 1;
    return { total: stories.length, byCategory };
  } catch {
    return { total: 0, byCategory: {} };
  }
}

async function triggerGeneration(focusCategory) {
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
    body: JSON.stringify({ ref: "main", inputs: { focus_category: focusCategory || "" } }),
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

  const statsAtStart = todaysEditionStats();
  if (statsAtStart.total >= 15) {
    console.log("poll-rss: today's edition is already full (15/15) — polling for tomorrow's queue but won't trigger.");
  }

  // 1. Fetch everything. Google News queries are all finance-flavored by
  // construction; DIRECT_FEEDS carry their own category. Track EVERY
  // source that reports an event, not just the first — corroboration
  // across independent outlets is itself a signal a story is both real
  // and has enough material for a genuine deep dive.
  const feedsToFetch = [
    ...RSS_QUERIES.map((q) => ({
      url: `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`,
      source: "Google News",
      category: "Economy",
    })),
    ...DIRECT_FEEDS,
  ];
  let newCount = 0;
  for (const feed of feedsToFetch) {
    const items = await fetchFeed(feed.url);
    for (const item of items) {
      const key = eventKey(item.title);
      if (!key) continue;
      const label = item.rssSource || feed.source;
      if (!state.seen[key]) {
        state.seen[key] = { firstSeenMs: now, title: item.title, category: feed.category, sources: [label] };
        newCount++;
      } else if (!state.seen[key].sources.includes(label)) {
        state.seen[key].sources.push(label); // corroborated by another outlet
      }
    }
  }
  console.log(`poll-rss: ${newCount} newly-seen headlines this run (${Object.keys(state.seen).length} tracked total).`);

  // 2. Prune anything older than 24h — stale entries just bloat the file.
  for (const [key, v] of Object.entries(state.seen)) {
    if (now - v.firstSeenMs > 24 * 3600 * 1000) delete state.seen[key];
  }

  // 3. Maturity gate. A story corroborated by 2+ independent outlets has
  // already demonstrated it has real substance and isn't a single-source
  // rumor, so it doesn't need the full wait — but we still hold it for a
  // floor of 15 min so at least one round of follow-up reporting lands.
  const CORROBORATED_MATURITY_MINUTES = 15;
  function requiredMaturityMs(entry) {
    const minutes = entry.sources.length >= 2 ? CORROBORATED_MATURITY_MINUTES : MATURITY_MINUTES;
    return minutes * 60 * 1000;
  }
  const matured = Object.entries(state.seen).filter(
    ([key, v]) => now - v.firstSeenMs >= requiredMaturityMs(v) && !state.promoted[key]
  );

  const cooldownOk = now - (state.lastTriggerMs || 0) >= COOLDOWN_MINUTES * 60 * 1000;
  const stats = todaysEditionStats();
  const editionFull = stats.total >= 15;

  // Reset the counter on a new IST calendar day — see MAX_TRIGGERS_PER_DAY
  // above for why this exists. Deliberately independent of editionFull:
  // that gate can flip back to "not full" purely because generate-
  // edition.yml's own verification step removed a bad story, which isn't
  // a reason to fire off another full generation run on its own.
  const today = todayIST();
  if (state.triggersToday.date !== today) state.triggersToday = { date: today, count: 0 };
  const dailyCapOk = state.triggersToday.count < MAX_TRIGGERS_PER_DAY;

  if (matured.length > 0 && cooldownOk && !editionFull && dailyCapOk) {
    // Prefer a matured World candidate if today's edition is short on that
    // category — otherwise trigger normally (Gemini picks freely, same as
    // the fixed-schedule runs always have).
    const worldCount = stats.byCategory["World"] || 0;
    const worldCandidate = matured.find(([, v]) => v.category === "World");
    const useCandidate = worldCount < MIN_WORLD_STORIES && worldCandidate ? worldCandidate : matured[0];
    const focusCategory = useCandidate === worldCandidate && worldCandidate ? "World" : "";

    console.log(
      `poll-rss: ${matured.length} matured storie(s) (${matured.filter(([, v]) => v.sources.length >= 2).length} corroborated). ` +
        `Triggering${focusCategory ? ` with focus_category=${focusCategory}` : ""}: "${useCandidate[1].title}" ` +
        `[${useCandidate[1].sources.join(", ")}]`
    );
    const ok = await triggerGeneration(focusCategory);
    if (ok) {
      state.lastTriggerMs = now;
      state.triggersToday.count += 1;
      // Only the triggering story is marked promoted — others stay
      // eligible for the NEXT run rather than all being consumed at once,
      // since one generation run can't guarantee covering every matured
      // headline anyway (Gemini picks what's actually most significant).
      state.promoted[useCandidate[0]] = now;
    }
  } else if (matured.length > 0) {
    console.log(
      `poll-rss: ${matured.length} matured but not triggering ` +
        `(cooldownOk=${cooldownOk}, editionFull=${editionFull}, dailyCapOk=${dailyCapOk} [${state.triggersToday.count}/${MAX_TRIGGERS_PER_DAY} used today]).`
    );
  } else {
    console.log("poll-rss: nothing matured yet.");
  }

  saveState(state);
}

main().catch((e) => {
  console.error("poll-rss: fatal error:", e);
  process.exit(1);
});
