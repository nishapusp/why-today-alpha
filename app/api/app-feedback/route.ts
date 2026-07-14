import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

/**
 * App-level content/style feedback (distinct from the per-story 👍/👎 in
 * app/api/feedback — this is the 5-question survey covering writing
 * level, content mix, length, recommend-to-a-friend, and free text).
 * One record per submission, listed under a timestamp key so nothing
 * overwrites — read back later via a review script the same way
 * scripts/review-feedback.js does for story feedback.
 */

interface AppFeedbackSubmission {
  writingLevel: "too_simple" | "too_technical" | "about_right";
  wantMore: string[]; // subset of Markets/Banking & Policy/Corporate/Geopolitics/Personal finance
  length: "too_short" | "too_long" | "right";
  wouldRecommend: "yes" | "maybe" | "no";
  comment?: string;
  submittedAt: string;
}

const VALID_WRITING_LEVEL = new Set(["too_simple", "too_technical", "about_right"]);
const VALID_LENGTH = new Set(["too_short", "too_long", "right"]);
const VALID_RECOMMEND = new Set(["yes", "maybe", "no"]);
const VALID_CATEGORIES = new Set(["Markets", "Banking & Policy", "Corporate", "Geopolitics", "Personal finance"]);

export async function POST(req: NextRequest) {
  let body: Partial<AppFeedbackSubmission>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.writingLevel || !VALID_WRITING_LEVEL.has(body.writingLevel)) {
    return NextResponse.json({ error: "writingLevel is required and must be valid." }, { status: 400 });
  }
  if (!body.length || !VALID_LENGTH.has(body.length)) {
    return NextResponse.json({ error: "length is required and must be valid." }, { status: 400 });
  }
  if (!body.wouldRecommend || !VALID_RECOMMEND.has(body.wouldRecommend)) {
    return NextResponse.json({ error: "wouldRecommend is required and must be valid." }, { status: 400 });
  }
  const wantMore = Array.isArray(body.wantMore) ? body.wantMore.filter((c) => VALID_CATEGORIES.has(c)) : [];

  const record: AppFeedbackSubmission = {
    writingLevel: body.writingLevel,
    wantMore,
    length: body.length,
    wouldRecommend: body.wouldRecommend,
    comment: body.comment?.trim()?.slice(0, 1000) || undefined,
    submittedAt: new Date().toISOString(),
  };

  const store = getStore({ name: "why-today-app-feedback", consistency: "strong" });
  const key = `${record.submittedAt}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    await store.set(key, JSON.stringify(record));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not save feedback: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
