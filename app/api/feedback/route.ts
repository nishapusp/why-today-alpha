import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

/**
 * Story-level feedback: 👍 "helped my understanding", 👎 "needs improvement"
 * (with an optional comment), stored per-slug so it's shared across all
 * readers, not per-user. Read back later via scripts/review-feedback.js —
 * this is meant to feed directly into scripts/regenerate-story.js.
 */

interface FeedbackRecord {
  up: number;
  down: number;
  comments: string[];
}

export async function POST(req: NextRequest) {
  let body: { slug?: string; reaction?: "up" | "down"; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.slug || (body.reaction !== "up" && body.reaction !== "down")) {
    return NextResponse.json({ error: "slug and reaction ('up'|'down') are required." }, { status: 400 });
  }

  const store = getStore({ name: "why-today-feedback", consistency: "strong" });
  const key = body.slug;

  let record: FeedbackRecord = { up: 0, down: 0, comments: [] };
  try {
    const existing = await store.get(key, { type: "text" });
    if (existing) record = JSON.parse(existing);
  } catch {
    // No existing record — start fresh.
  }

  if (body.reaction === "up") record.up += 1;
  if (body.reaction === "down") {
    record.down += 1;
    if (body.comment?.trim()) record.comments.push(body.comment.trim());
  }

  try {
    await store.set(key, JSON.stringify(record));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not save feedback: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, record });
}
