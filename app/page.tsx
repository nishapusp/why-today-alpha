import { getLatestEdition, getHomeStories } from "@/lib/getData";
import { getTermOfTheDay } from "@/lib/termOfDay";
import { auth, currentUser } from "@clerk/nextjs/server";
import { recordVisitAndGetStreak, getPreferences } from "@/lib/preferences";
import ThreadBanner from "@/components/ThreadBanner";
import ContinueLearning from "@/components/ContinueLearning";
import ListenNow from "@/components/ListenNow";
import TermOfTheDay from "@/components/TermOfTheDay";
import Top10List from "@/components/Top10List";

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
  const homeStories = await getHomeStories();
  const termOfDay = getTermOfTheDay();

  const { userId } = await auth();
  let userName: string | undefined;
  let readSlugs: string[] = [];

  if (userId) {
    await recordVisitAndGetStreak(userId); // side effect: updates streak — JourneyStrip (now in the hamburger menu) reads the result independently
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
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 overflow-x-hidden">
        <div
          className="relative overflow-hidden rounded-2xl px-5 py-5 -mx-1"
          style={{ background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-deep) 100%)" }}
        >
          {/* Single contained "bold" moment on the page — everything else
              stays on the light background per the locked design system;
              this hero banner is the deliberate exception, not a new
              pattern spreading elsewhere. Subtle gold glow, not a solid
              color block competing with it. */}
          <div
            className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20"
            style={{ background: "var(--gold)", filter: "blur(30px)" }}
          />
          <p className="relative font-display text-[22px] leading-tight text-white">
            {greeting()}
            {userName ? `, ${userName}` : ""}
          </p>
          <div className="relative flex items-center gap-2 mt-2">
            <span className="h-px w-5" style={{ background: "var(--gold)" }} />
            <p className="font-mono text-[11px] tracking-wide text-white/70">{dateLabel}</p>
          </div>
        </div>

        <div>
          <h2 className="font-display text-lg text-[var(--text-primary)] mb-3">
            Today&apos;s stories ({homeStories.length})
          </h2>
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

        {/* Theme line and archive access moved into the hamburger menu
            (per explicit request — home page now goes straight from
            greeting to today's stories, nothing else competing for top
            billing). ThreadBanner (the fuller theme writeup) stays here
            at the bottom, same placement as before. */}
        <ThreadBanner themeTitle={edition.themeTitle} themeDescription={edition.themeDescription} />
      </main>
    </>
  );
}
