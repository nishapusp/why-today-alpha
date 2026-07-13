import { getLatestEdition, getArchiveIndex, getHomeStories } from "@/lib/getData";
import { getTermOfTheDay } from "@/lib/termOfDay";
import { auth, currentUser } from "@clerk/nextjs/server";
import { recordVisitAndGetStreak, getPreferences } from "@/lib/preferences";
import Hero from "@/components/Hero";
import TermOfTheDay from "@/components/TermOfTheDay";
import Top10List from "@/components/Top10List";
import ArchiveDrawer from "@/components/ArchiveDrawer";
import Link from "next/link";


export const revalidate = 300; // re-check Airtable at most every 5 minutes

export default async function Home() {
  const edition = await getLatestEdition();
  const archiveIndex = await getArchiveIndex();
  const homeStories = await getHomeStories();
  const termOfDay = getTermOfTheDay();

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

      {termOfDay && <TermOfTheDay entry={termOfDay} />}

      <div>
        <div className="flex flex-col gap-1 mb-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-lg text-[var(--text-primary)]">
            Today&apos;s stories ({homeStories.length})
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-[var(--text-secondary)] truncate">
              {edition.numberValue} · {edition.themeTitle}
            </span>
            <Link
              href="/glossary"
              aria-label="Glossary"
              title="Glossary"
              className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[15px] hover:border-[var(--accent)] transition-colors"
            >
              📖
            </Link>
            <ArchiveDrawer recentDays={archiveIndex.slice(0, 10)} />
          </div>
        </div>
        <Top10List stories={homeStories} readSlugs={readSlugs} />
      </div>

    </main>
  );
}
