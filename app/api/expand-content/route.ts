import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";
import { generateWithGemini } from "@/lib/gemini";
import { ON_DEMAND_SECTION_SYSTEM_PROMPT } from "@/lib/prompts";

/**
 * Server-side relay for on-demand story sections (Deep Dive, Knowledge
 * Chain node explanations). Previously called a Copilot Studio agent via
 * Direct Line; now calls Gemini directly — one HTTP request, no
 * conversation/polling state needed.
 *
 * CACHING: content for a given story+field (+node) is the same for every
 * reader, so we cache the first successful generation and serve it to
 * everyone after that, keeping usage roughly fixed regardless of traffic.
 */

interface ExpandRequestBody {
  field: "deepDiveRead" | "knowledgeChainNode" | "whatHappened" | "whyToday" | "whyCare" | "whatNext" | "quickRead";
  headline: string;
  summary: string;
  category: string;
  slug: string;
  node?: string;
}

function cacheKey(body: ExpandRequestBody): string {
  return body.field === "knowledgeChainNode"
    ? `${body.slug}:${body.field}:${body.node ?? ""}`
    : `${body.slug}:${body.field}`;
}

function buildUserPrompt(body: ExpandRequestBody): string {
  const parts = [
    `field=${body.field}`,
    `headline="${body.headline}"`,
    `summary="${body.summary}"`,
    `category=${body.category}`,
  ];
  if (body.field === "knowledgeChainNode" && body.node) {
    parts.splice(1, 0, `node="${body.node}"`);
  }
  return parts.join(" | ");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
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

  try {
    const cached = await store.get(key, { type: "text" });
    if (cached) {
      return NextResponse.json({ content: cached, cached: true });
    }
  } catch {
    // Cache read failures shouldn't block generation — fall through.
  }

  try {
    const content = await generateWithGemini(
      ON_DEMAND_SECTION_SYSTEM_PROMPT,
      buildUserPrompt(body),
      apiKey,
      { maxOutputTokens: 4096 }
    );

    try {
      await store.set(key, content.trim());
    } catch {
      // Non-fatal — this request still succeeds even if caching fails.
    }

    return NextResponse.json({ content: content.trim(), cached: false });
  } catch (err) {
    return NextResponse.json(
      { error: `Generation failed: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 }
    );
  }
}
