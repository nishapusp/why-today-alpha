import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { triggerWorkflow } from "@/lib/githubAdmin";

/**
 * Triggers regenerate-story.yml — the exact same workflow already used
 * manually via the Actions tab all through this project, just invoked
 * from the admin UI instead. Deliberately does NOT reimplement the
 * regeneration logic itself (model calls, retries, validation, JSON
 * normalization) — that logic is already built, tested, and proven in
 * scripts/regenerate-story.js; duplicating it here would mean maintaining
 * two versions of the same thing and risking them drifting apart. This
 * route's only job is the same one clicking "Run workflow" does: hand
 * off the slug + feedback and let the existing pipeline do the work.
 *
 * Note: this is fire-and-forget from the browser's perspective — GitHub
 * Actions runs are not synchronous. The admin UI should poll or just
 * tell the user to check back / check the Actions tab for the result,
 * same as manual triggering always required.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { slugOrMode, feedbackOrTopic } = await req.json();
  if (!slugOrMode) {
    return NextResponse.json({ error: "slugOrMode is required (a story slug, or --new for a fresh story)" }, { status: 400 });
  }

  try {
    await triggerWorkflow("regenerate-story.yml", {
      slug_or_mode: slugOrMode,
      feedback_or_topic: feedbackOrTopic || "",
    });
    return NextResponse.json({
      ok: true,
      message: "Regeneration triggered — check the Actions tab (\"Regenerate Story\") for progress, usually a minute or two.",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
