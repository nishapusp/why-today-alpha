import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";
import { requireAdmin } from "@/lib/adminAuth";

interface QuickReadItem {
  id: string;
  [key: string]: unknown;
}

/**
 * Quick Reads lives in Netlify Blobs, not git — running inside this
 * Next.js API route (Netlify's own runtime), getStore() picks up
 * credentials automatically, same as app/api/quick-reads/route.ts
 * already does. No ADMIN_GITHUB_TOKEN needed for this one.
 */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const store = getStore("why-today-quick-reads");
    const raw = await store.get("feed", { type: "text" });
    if (!raw) return NextResponse.json({ error: "No Quick Reads feed found." }, { status: 404 });

    const feed = JSON.parse(raw);
    const before = feed.items.length;
    feed.items = feed.items.filter((it: QuickReadItem) => it.id !== id);
    if (feed.items.length === before) {
      return NextResponse.json({ error: `No Quick Reads item with id "${id}" found.` }, { status: 404 });
    }
    await store.set("feed", JSON.stringify(feed));
    return NextResponse.json({ ok: true, removed: id, remaining: feed.items.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

/** PATCH edits a Quick Reads item's fields (blurb, headline, etc.) directly. */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id, fields } = await req.json();
  if (!id || !fields || typeof fields !== "object") {
    return NextResponse.json({ error: "id and fields are required" }, { status: 400 });
  }

  try {
    const store = getStore("why-today-quick-reads");
    const raw = await store.get("feed", { type: "text" });
    if (!raw) return NextResponse.json({ error: "No Quick Reads feed found." }, { status: 404 });

    const feed = JSON.parse(raw);
    const item = feed.items.find((it: QuickReadItem) => it.id === id);
    if (!item) return NextResponse.json({ error: `No Quick Reads item with id "${id}" found.` }, { status: 404 });

    Object.assign(item, fields);
    await store.set("feed", JSON.stringify(feed));
    return NextResponse.json({ ok: true, id, updatedFields: Object.keys(fields) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
