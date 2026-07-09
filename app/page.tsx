import { getLatestEdition, getArchiveIndex } from "@/lib/getData";
import { auth, currentUser } from "@clerk/nextjs/server";
import { recordVisitAndGetStreak, getPreferences } from "@/lib/preferences";
import Hero from "@/components/Hero";
import Top10List from "@/components/Top10List";
import ArchiveDrawer from "@/components/ArchiveDrawer";


export const revalidate = 300; // re-check Airtable at most every 5 minutes

export default async function Home() {
  const edition = await getLatestEdition();
  const archiveIndex = await getArchiveIndex();

  const { userId } = await auth();
  let streakDays: number | undefined;
  let userName: string | undefined;
  let readSlugs: string[] = [];

  if (userId) {
    streakDays = await recordVisitAndGetStreak(userId);
    const user = await currentUser();
    userName = user?.firstName ?? undefined;
    const prefs = await getPreferences(userId);
    readSlugs = prefs.readSlugs;
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 overflow-x-hidden">
      <Hero edition={edition} streakDays={streakDays} userName={userName} />

      <div>
        <div className="flex flex-col gap-1 mb-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-lg text-[var(--text-primary)]">
            Today&apos;s stories ({Math.min(edition.stories.length, 15)})
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-[var(--text-secondary)] truncate">
              {edition.numberValue} · {edition.themeTitle}
            </span>
            <ArchiveDrawer recentDays={archiveIndex.slice(0, 10)} />
          </div>
        </div>
        <Top10List stories={edition.stories} readSlugs={readSlugs} />
      </div>

    </main>
  );
}
