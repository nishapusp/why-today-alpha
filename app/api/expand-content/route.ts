import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

/**
 * Server-side relay to the "Why Today" Copilot Studio agent's on-demand
 * section Topic (see why-today-on-demand-topic.md for the Topic's own
 * instructions). The Direct Line secret lives only here, as a server env
 * var (DIRECT_LINE_SECRET in Netlify) — it never reaches the browser.
 *
 * CACHING: content for a given story+field (+node) is the same for every
 * reader. Rather than calling the agent once per user click — which would
 * multiply Copilot Studio's per-environment generative-message quota by
 * concurrent readers — we cache the first successful generation and serve
 * it to everyone after that. This keeps daily agent usage roughly fixed
 * (~10 stories x a few sections) regardless of traffic.
 */

const DIRECT_LINE_BASE = "https://directline.botframework.com/v3/directline";
const MAX_WAIT_MS = 25000;
const POLL_INTERVAL_MS = 1500;

interface ExpandRequestBody {
  field: "deepDiveRead" | "knowledgeChainNode" | "whatHappened" | "whyToday" | "whyCare" | "whatNext" | "quickRead";
  headline: string;
  summary: string;
  category: string;
  slug: string; // required for cache key
  node?: string; // only used when field === "knowledgeChainNode"
}

function cacheKey(body: ExpandRequestBody): string {
  return body.field === "knowledgeChainNode"
    ? `${body.slug}:${body.field}:${body.node ?? ""}`
    : `${body.slug}:${body.field}`;
}

export async function POST(req: NextRequest) {
  const secret = process.env.DIRECT_LINE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "DIRECT_LINE_SECRET is not configured on the server." },
      { status: 500 }
    );
  }

  let body: ExpandRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.field || !body.headline || !body.summary || !body.category || !body.slug) {
    return NextResponse.json({ error: "Missing required fields (including slug)." }, { status: 400 });
  }

  const store = getStore("why-today-generated-content");
  const key = cacheKey(body);

  // 1. Serve from cache if we've generated this exact section before.
  try {
    const cached = await store.get(key);
    if (cached) {
      return NextResponse.json({ content: cached, cached: true });
    }
  } catch {
    // Blob store read failures shouldn't block generation — fall through.
  }

  const message = buildExpandMessage(body);

  try {
    // 2. Start a conversation
    const startRes = await fetch(`${DIRECT_LINE_BASE}/conversations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!startRes.ok) {
      return NextResponse.json(
        { error: `Could not start conversation with agent (status ${startRes.status}).` },
        { status: 502 }
      );
    }
    const { conversationId, token } = await startRes.json();
    const authToken = token || secret;

    // 3. Send the EXPAND message
    const sendRes = await fetch(`${DIRECT_LINE_BASE}/conversations/${conversationId}/activities`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "message",
        from: { id: "why-today-web" },
        text: message,
      }),
    });
    if (!sendRes.ok) {
      return NextResponse.json(
        { error: `Could not send message to agent (status ${sendRes.status}).` },
        { status: 502 }
      );
    }

    // 4. Poll for the reply
    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const getRes = await fetch(`${DIRECT_LINE_BASE}/conversations/${conversationId}/activities`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!getRes.ok) continue;
      const data = await getRes.json();
      const reply = data.activities?.find(
        (a: { from?: { id?: string }; type?: string; text?: string }) =>
          a.from?.id !== "why-today-web" && a.type === "message" && a.text
      );
      if (reply) {
        const content = reply.text.trim();
        // 5. Cache for every subsequent reader.
        try {
          await store.set(key, content);
        } catch {
          // Non-fatal — this request still succeeds even if caching fails.
        }
        return NextResponse.json({ content, cached: false });
      }
    }

    return NextResponse.json(
      { error: "Agent did not respond in time. Try again." },
      { status: 504 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Relay failed: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 500 }
    );
  }
}

function buildExpandMessage(body: ExpandRequestBody): string {
  const parts = [
    `field=${body.field}`,
    `headline="${body.headline}"`,
    `summary="${body.summary}"`,
    `category=${body.category}`,
  ];
  if (body.field === "knowledgeChainNode" && body.node) {
    parts.splice(1, 0, `node="${body.node}"`);
  }
  return `EXPAND: ${parts.join(" | ")}`;
}
