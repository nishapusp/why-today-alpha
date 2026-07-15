import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";
import type { QuickReadsFeed } from "@/lib/types";

/**
 * Serves the Quick Reads / Pulse feed, written by
 * scripts/generate-quick-reads.js into Netlify Blobs (store
 * "why-today-quick-reads", key "feed"). Running inside a Netlify
 * Function/route, getStore() picks up siteID/token automatically from
 * the runtime context — no explicit credentials needed here, unlike the
 * generator script (which runs in GitHub Actions and does need them).
 *
 * Cache-Control: short edge cache (2 min) + stale-while-revalidate (5 min)
 * so this doesn't hit Blobs on every single page view — decoupling
 * refresh cadence from deploy credits was the whole point of moving off
 * a committed JSON file, but every read still costs a little compute, so
 * this keeps that cost bounded regardless of traffic.
 */
export async function GET() {
  try {
    const store = getStore("why-today-quick-reads");
    const raw = await store.get("feed", { type: "text" });

    const feed: QuickReadsFeed = raw
      ? (JSON.parse(raw) as QuickReadsFeed)
      : { generatedAt: "", items: [] };

    return NextResponse.json(feed, {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    });
  } catch {
    // Blobs read failure (or no feed written yet) — degrade to an empty
    // feed rather than a 500, so the swipe UI can show a graceful empty
    // state instead of crashing.
    return NextResponse.json(
      { generatedAt: "", items: [] } satisfies QuickReadsFeed,
      { status: 200 }
    );
  }
}
