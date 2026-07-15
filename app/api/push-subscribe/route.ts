import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

/**
 * Stores/removes a browser's Web Push subscription. One record per
 * subscription, keyed by a hash of the subscription endpoint (the
 * endpoint URL itself is unique per browser+device, so it's a natural
 * dedup key — subscribing twice from the same device overwrites rather
 * than duplicating). Read back by scripts/send-push-notification.js.
 */

function subscriptionKey(endpoint: string): string {
  // Endpoints are long opaque URLs — hash rather than using the raw
  // string as a Blobs key (keys have a length limit and the raw endpoint
  // can exceed it for some push services).
  let hash = 0;
  for (let i = 0; i < endpoint.length; i++) hash = (hash * 31 + endpoint.charCodeAt(i)) >>> 0;
  return `sub-${hash.toString(36)}`;
}

export async function POST(req: NextRequest) {
  let body: { subscription?: PushSubscriptionJSON };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "A valid push subscription is required." }, { status: 400 });
  }

  const store = getStore({ name: "why-today-push-subscriptions", consistency: "strong" });
  try {
    await store.set(subscriptionKey(sub.endpoint), JSON.stringify(sub));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not save subscription: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint is required." }, { status: 400 });
  }

  const store = getStore({ name: "why-today-push-subscriptions", consistency: "strong" });
  try {
    await store.delete(subscriptionKey(body.endpoint));
  } catch {
    // Not fatal — the subscription will just get pruned on the next send
    // if it turns out to be stale (send-push-notification.js drops dead
    // endpoints automatically).
  }

  return NextResponse.json({ ok: true });
}
