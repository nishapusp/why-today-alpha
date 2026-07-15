import { getLatestEdition, getArchiveIndex, getHomeStories } from "@/lib/getData";
import { getTermOfTheDay } from "@/lib/termOfDay";
import { auth, currentUser } from "@clerk/nextjs/server";
import { recordVisitAndGetStreak, getPreferences } from "@/lib/preferences";
import JourneyStrip from "@/components/JourneyStrip";
import ThreadBanner from "@/components/ThreadBanner";
import ContinueLearning from "@/components/ContinueLearning";
import ListenNow from "@/components/ListenNow";
import TermOfTheDay from "@/components/TermOfTheDay";
import Top10List from "@/components/Top10List";
import ArchiveDrawer from "@/components/ArchiveDrawer";

export const revalidate = 300; // re-check Airtable at most every 5 minutes

function greeting(): string {
  const hour = new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" });
  const h = parseInt(hour, 10);
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function Home() {
  const edition = await getLatestEdition();
  const archiveIndex = await getArchiveIndex();
  const homeStories = await getHomeStories();
  const termOfDay = getTermOfTheDay();

  const { userId } = await auth();
  let userName: string | undefined;
  let readSlugs: string[] = [];

  if (userId) {
    await recordVisitAndGetStreak(userId); // side effect: updates streak — JourneyStrip reads the result independently
    const user = await currentUser();
    userName = user?.firstName ?? undefined;
    const prefs = await getPreferences(userId);
    readSlugs = prefs.readSlugs;
  }

  const dateLabel = new Date(edition.date).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const storiesBySlug = Object.fromEntries(
    homeStories.map((s) => [s.slug, { headline: s.headline, slug: s.slug }])
  );

  return (
    <>
      <JourneyStrip />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 overflow-x-hidden">
        <div>
          <p className="text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>
            {greeting()}
            {userName ? `, ${userName}` : ""}
          </p>
          <p className="font-mono text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {dateLabel}
          </p>
        </div>

        <ThreadBanner themeTitle={edition.themeTitle} themeDescription={edition.themeDescription} />

        <div>
          <div className="flex flex-col gap-1 mb-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display text-lg text-[var(--text-primary)]">
              Today&apos;s stories ({homeStories.length})
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-[var(--text-secondary)] truncate">
                {edition.numberValue} · {edition.themeTitle}
              </span>
              <ArchiveDrawer recentDays={archiveIndex.slice(0, 10)} />
            </div>
          </div>
          <Top10List stories={homeStories} readSlugs={readSlugs} />
        </div>

        {(termOfDay || homeStories.length > 0) && (
          <div className="space-y-3">
            {termOfDay && <TermOfTheDay entry={termOfDay} />}
            {homeStories.length > 0 && (
              <>
                <ContinueLearning storiesBySlug={storiesBySlug} />
                <ListenNow slug={homeStories[0].slug} />
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}
