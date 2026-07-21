import { redirect } from "next/navigation";
import { getStore } from "@netlify/blobs";
import { requireAdmin } from "@/lib/adminAuth";
import { getLatestEdition } from "@/lib/getData";
import AdminDashboard from "@/components/AdminDashboard";
import type { QuickReadsFeed } from "@/lib/types";

// Always fresh — an admin reviewing content needs to see the current
// state, not a cached snapshot from up to 5 minutes ago (the flagship
// page's own revalidate window). This route is never linked from
// anywhere public and does its own auth check, so there's no caching
// upside worth trading freshness for here.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requireAdmin();
  // Deliberately a plain redirect to home, not a 403/permission-denied
  // page — this route isn't linked anywhere in the public UI, so a
  // non-admin landing here is either the admin signed into the wrong
  // account or someone guessing URLs; either way, a quiet redirect gives
  // away less than an explicit "you're not allowed" page would.
  if (!admin) redirect("/");

  const edition = await getLatestEdition();

  let quickReads: QuickReadsFeed = { generatedAt: "", items: [] };
  try {
    const store = getStore("why-today-quick-reads");
    const raw = await store.get("feed", { type: "text" });
    if (raw) quickReads = JSON.parse(raw) as QuickReadsFeed;
  } catch {
    // Blobs read failure — dashboard still renders with an empty Quick
    // Reads section rather than crashing the whole admin page over it.
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <h1 className="font-display text-2xl text-[var(--text-primary)] mb-1">Admin</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        {edition.stories.length} stories today ({edition.date}) &middot; {quickReads.items.length} Quick Reads
      </p>
      <AdminDashboard stories={edition.stories} quickReads={quickReads.items} />
    </main>
  );
}
