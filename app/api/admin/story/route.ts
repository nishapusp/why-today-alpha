import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { readRepoFile, writeRepoFile } from "@/lib/githubAdmin";

const EDITION_PATH = "data/edition.json";

interface StoryLike {
  slug: string;
  [key: string]: unknown;
}

/**
 * DELETE one or more stories from today's edition.
 *
 * 2026-08-11: accepts either the original single "slug" (unchanged
 * behavior, kept for backward compatibility) or a new "slugs" array —
 * added per explicit request so selecting several stories in the admin
 * UI and deleting them costs ONE commit (and therefore one Netlify
 * deploy) instead of one per story. The single-slug path already did
 * exactly one read + one write; this just generalizes that to N slugs
 * removed in that same one read + one write, rather than looping N
 * separate DELETE calls from the client.
 */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = await req.json();
  const slugs: string[] = Array.isArray(body.slugs)
    ? body.slugs
    : body.slug
      ? [body.slug]
      : [];
  if (slugs.length === 0) return NextResponse.json({ error: "slug or slugs is required" }, { status: 400 });

  try {
    const { content, sha } = await readRepoFile(EDITION_PATH);
    const edition = JSON.parse(content);
    const before = edition.stories.length;
    const slugSet = new Set(slugs);
    edition.stories = edition.stories.filter((s: StoryLike) => !slugSet.has(s.slug));
    const removedCount = before - edition.stories.length;
    if (removedCount === 0) {
      return NextResponse.json({ error: `None of the given slug(s) were found in today's edition.` }, { status: 404 });
    }
    await writeRepoFile(
      EDITION_PATH,
      JSON.stringify(edition, null, 2),
      sha,
      slugs.length === 1 ? `admin: remove story "${slugs[0]}"` : `admin: remove ${removedCount} stories (${slugs.join(", ")})`
    );
    return NextResponse.json({ ok: true, removed: slugs, removedCount, remaining: edition.stories.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

/**
 * PATCH edits specific fields on a story directly (headline, summary,
 * category, etc.) — a fast path for small corrections that don't need a
 * full regeneration. Only the fields present in the request body are
 * changed; everything else on the story is left untouched.
 */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { slug, fields } = await req.json();
  if (!slug || !fields || typeof fields !== "object") {
    return NextResponse.json({ error: "slug and fields are required" }, { status: 400 });
  }
  // Guard against accidentally overwriting structural fields with the
  // wrong shape from a simple text-field editing UI — those need the
  // full regenerate flow instead, not a raw field patch.
  const disallowed = ["timeMachine", "chart", "keyNumbers", "knowledgeChain", "officialSources"];
  const attemptedDisallowed = Object.keys(fields).filter((k) => disallowed.includes(k));
  if (attemptedDisallowed.length > 0) {
    return NextResponse.json(
      { error: `These fields need regeneration, not a direct edit: ${attemptedDisallowed.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const { content, sha } = await readRepoFile(EDITION_PATH);
    const edition = JSON.parse(content);
    const story = edition.stories.find((s: StoryLike) => s.slug === slug);
    if (!story) {
      return NextResponse.json({ error: `No story with slug "${slug}" found in today's edition.` }, { status: 404 });
    }
    Object.assign(story, fields);
    await writeRepoFile(
      EDITION_PATH,
      JSON.stringify(edition, null, 2),
      sha,
      `admin: edit story "${slug}" (${Object.keys(fields).join(", ")})`
    );
    return NextResponse.json({ ok: true, slug, updatedFields: Object.keys(fields) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
