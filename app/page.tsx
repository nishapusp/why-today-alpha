import { getLatestEdition } from "@/lib/getData";
import Hero from "@/components/Hero";
import Top10List from "@/components/Top10List";


export const revalidate = 300; // re-check Airtable at most every 5 minutes

export default async function Home() {
  const edition = await getLatestEdition();

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Hero edition={edition} streakDays={12} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg text-[var(--text-primary)]">
            Today's top {Math.min(edition.stories.length, 10)}
          </h2>
          <span className="text-xs text-[var(--text-secondary)]">
            {edition.numberValue} · {edition.themeTitle}
          </span>
        </div>
        <Top10List stories={edition.stories} />
      </div>

    </main>
  );
}
