import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

/**
 * Serves a story's rendered Visual Story video, uploaded by
 * scripts/upload-visual-videos.js into Netlify Blobs (store
 * "why-today-visual-videos", one blob per slug). Same getStore()-inside-
 * a-Function pattern as app/api/quick-reads/route.ts — see that route's
 * comment for why force-dynamic matters here too (a GET route with no
 * request-specific data would otherwise risk Next.js statically executing
 * it at build time, before any Blobs Function context exists).
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const store = getStore("why-today-visual-videos");
    const buffer = await store.get(slug, { type: "arrayBuffer" });

    if (!buffer) {
      return NextResponse.json({ error: "Video not rendered yet for this story." }, { status: 404 });
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `inline; filename="${slug}.mp4"`,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not load video." }, { status: 404 });
  }
}
