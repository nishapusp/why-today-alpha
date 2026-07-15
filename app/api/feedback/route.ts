import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

/**
 * Story-level feedback: 👍 "helped my understanding", 👎 "needs improvement"
 * (with an optional comment), stored per-slug so it's shared across all
 * readers, not per-user. Read back later via scripts/review-feedback.js —
 * this is meant to feed directly into scripts/regenerate-story.js.
 *
 * ALSO writes a timestamped event under events:{YYYY-MM-DD} (IST calendar
 * day, matching how edition dates are handled elsewhere) — added
 * 2026-07-15 for scripts/send-feedback-digest.js. The per-slug aggregate
 * above has no timestamp on individual reactions (just running up/down
 * counts), so "what came in today" isn't derivable from it alone; this
 * separate daily event log is additive, doesn't change the aggregate
 * shape, and doesn't touch the existing review-feedback.js/
 * regenerate-story.js workflow at all.
 */

interface FeedbackRecord {
  up: number;
  down: number;
  comments: string[];
}

function istDateKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
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

  // Best-effort daily event log — failure here doesn't fail the request,
  // since the aggregate record above (what regenerate-story.js relies on)
  // already saved successfully.
  try {
    const eventsKey = `events:${istDateKey()}`;
    const existingEvents = await store.get(eventsKey, { type: "text" });
    const events = existingEvents ? JSON.parse(existingEvents) : [];
    events.push({ slug: body.slug, reaction: body.reaction, comment: body.comment?.trim() || undefined, at: new Date().toISOString() });
    await store.set(eventsKey, JSON.stringify(events));
  } catch {
    // Non-fatal — the digest will just show one fewer event for the day.
  }

  return NextResponse.json({ ok: true, record });
}
