import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getPreferences,
  savePreferences,
  markStoryRead,
  recordReadingLevel,
  recordQuizResult,
} from "@/lib/preferences";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const prefs = await getPreferences(userId);
  return NextResponse.json(prefs);
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
