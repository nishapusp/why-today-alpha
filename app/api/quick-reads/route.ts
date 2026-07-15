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
 * force-dynamic is required, not optional: this GET handler takes no
 * params and reads no request-specific data, so Next.js's default
 * heuristics can try to statically execute it AT BUILD TIME to cache a
 * response. Netlify Blobs' own docs are explicit that getStore() only
 * works inside an actual invoked Function/request — calling it during a
 * build's static-generation pass throws MissingBlobsEnvironmentError,
 * which would fail the whole Netlify build, not just this route. Every
 * other API route in this app is POST-only (inherently dynamic, no
 * static-execution risk) — this is the first GET-only Blobs route, so
 * this is the first place that risk was actually live.
 *
 * Cache-Control: short edge cache (2 min) + stale-while-revalidate (5 min)
 * so this doesn't hit Blobs on every single page view — decoupling
 * refresh cadence from deploy credits was the whole point of moving off
 * a committed JSON file, but every read still costs a little compute, so
 * this keeps that cost bounded regardless of traffic.
 */
export const dynamic = "force-dynamic";

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
