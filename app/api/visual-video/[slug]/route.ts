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
 *
 * Two consumers, two different needs from the same bytes:
 * - Outro.tsx's "Download Video" link wants an actual save-to-device.
 * - VisualEngineViewer's embedded <audio> (narration+music playback in
 *   the web preview) wants inline streaming, not a forced download.
 * `Content-Disposition: inline` used to be hardcoded, which fought the
 * download link's own `download` attribute on several mobile browsers —
 * some open the video in a native in-browser player instead of saving
 * it, and that player's own close control doesn't lead back to the
 * site. `?download=1` switches to `attachment`, which is the more
 * reliably-honored, server-driven way to force a real download.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const wantsDownload = new URL(req.url).searchParams.get("download") === "1";

  try {
    const store = getStore("why-today-visual-videos");
    const buffer = await store.get(slug, { type: "arrayBuffer" });

    if (!buffer) {
      return NextResponse.json({ error: "Video not rendered yet for this story." }, { status: 404 });
    }

    const disposition = wantsDownload ? `attachment; filename="${slug}.mp4"` : `inline; filename="${slug}.mp4"`;
    const totalSize = buffer.byteLength;

    // Range support so the embedded <audio>/<video> element in the web
    // preview can start playing without waiting for the whole file, and
    // can seek — most mobile browsers expect this for media elements and
    // some refuse to play smoothly without it.
    const range = req.headers.get("range");
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? parseInt(match[1], 10) : 0;
      const end = match?.[2] ? parseInt(match[2], 10) : totalSize - 1;
      const chunk = buffer.slice(start, end + 1);

      return new NextResponse(chunk, {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": disposition,
          "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunk.byteLength),
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      });
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": disposition,
        "Accept-Ranges": "bytes",
        "Content-Length": String(totalSize),
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not load video." }, { status: 404 });
  }
}
