import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPreferences, savePreferences, markStoryRead } from "@/lib/preferences";

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
    const updated = await markStoryRead(userId, body.markRead);
    return NextResponse.json(updated);
  }

  const updated = await savePreferences(userId, body);
  return NextResponse.json(updated);
}
