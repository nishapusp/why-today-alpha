import Link from "next/link";
import { getSearchIndex } from "@/lib/searchIndex";
import SearchClient from "@/components/SearchClient";

export const revalidate = 300;

export const metadata = {
  title: "Search — Why Today",
  description: "Search Why Today's stories and glossary of financial terms.",
};

export default async function SearchPage() {
  const index = await getSearchIndex();

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-5"
      >
        ← Back to today
      </Link>

      <h1 className="font-display text-2xl text-[var(--text-primary)] mb-5">Search</h1>

      <SearchClient index={index} />
    </main>
  );
}
