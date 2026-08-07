import { getLatestEdition, getHomeStories, getCategoryArchiveHighlights } from "@/lib/getData";
import { getTermOfTheDay } from "@/lib/termOfDay";
import ThreadBanner from "@/components/ThreadBanner";
import ContinueLearning from "@/components/ContinueLearning";
import ListenNow from "@/components/ListenNow";
import TermOfTheDay from "@/components/TermOfTheDay";
import Top10List from "@/components/Top10List";
import CategoryArchive from "@/components/CategoryArchive";
import PersonalizedName from "@/components/PersonalizedName";
import ShareWebsiteButton from "@/components/ShareWebsiteButton";

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
  const categoryArchive = await getCategoryArchiveHighlights(
    new Set(homeStories.map((s) => s.slug))
  );

  // 2026-07-17: removed the auth()/currentUser()/recordVisitAndGetStreak/
  // getPreferences block that used to be here — Clerk's auth() is a
  // Next.js "Dynamic API," and using one anywhere in this page's render
  // path was silently overriding `export const revalidate` above,
  // forcing the WHOLE page to skip ISR caching and render fresh (with a
  // database write + a profile fetch) on every single visit. Confirmed
  // via real PageSpeed data: ~2s of "Document request latency," directly
  // consistent with this. Personalization (the name, and read-story
  // state) now happens client-side after initial paint instead — see
  // PersonalizedName.tsx (uses Clerk's useUser(), no server round-trip
  // at all) and Top10List.tsx's own readSlugs fetch (reuses the exact
  // pattern JourneyStrip already had working). Streak recording moved
  // into /api/preferences's GET handler, piggybacking on JourneyStrip's
  // existing unconditional fetch-on-mount rather than needing its own
  // server-side call here.

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
          <div className="absolute top-4 right-4">
            <ShareWebsiteButton iconOnly />
          </div>
          <p className="relative font-display text-[22px] leading-tight text-white">
            {greeting()}
            <PersonalizedName />
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
          <Top10List stories={homeStories} />
        </div>

        <CategoryArchive byCategory={categoryArchive} />

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
