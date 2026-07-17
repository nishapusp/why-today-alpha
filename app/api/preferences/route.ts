import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getPreferences,
  savePreferences,
  markStoryRead,
  recordReadingLevel,
  recordQuizResult,
  computeLearningScoreBreakdown,
  recordVisitAndGetStreak,
} from "@/lib/preferences";

// 2026-07-17: now also records the visit/streak here, piggybacking on
// JourneyStrip's ALREADY-EXISTING unconditional client-side fetch (runs
// on mount, every page load, since JourneyStrip lives in the root
// layout via the hamburger menu) — this used to be a separate await
// auth() + recordVisitAndGetStreak() call directly in app/page.tsx's
// server render, which is what was forcing the ENTIRE home page into
// fully dynamic (uncached) rendering on every visit: Clerk's auth() is
// a Next.js "Dynamic API," and using one anywhere in a page's render
// path silently overrides `export const revalidate` for that whole
// route. Real PageSpeed data showed ~2s of "Document request latency"
// consistent with this. Moving it here means the home page's server
// render no longer touches auth() at all, restoring ISR caching, while
// streak tracking still happens on every page load exactly as before.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  await recordVisitAndGetStreak(userId);
  const prefs = await getPreferences(userId);
  return NextResponse.json({ ...prefs, scoreBreakdown: computeLearningScoreBreakdown(prefs) });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const body = await req.json();

  if (body.markRead) {
    const updated = await markStoryRead(userId, body.markRead, body.terms);
    return NextResponse.json(updated);
  }

  if (body.readingLevel?.slug && body.readingLevel?.level) {
    const updated = await recordReadingLevel(userId, body.readingLevel.slug, body.readingLevel.level);
    return NextResponse.json(updated);
  }

  if (body.quizResult && typeof body.quizResult.correct === "number" && typeof body.quizResult.total === "number") {
    const updated = await recordQuizResult(userId, body.quizResult.correct, body.quizResult.total);
    return NextResponse.json(updated);
  }

  const updated = await savePreferences(userId, body);
  return NextResponse.json(updated);
}
