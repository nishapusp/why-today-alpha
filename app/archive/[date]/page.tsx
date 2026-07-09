import Link from "next/link";
import { notFound } from "next/navigation";
import { getArchiveIndex, getArchivedEdition } from "@/lib/getData";
import Top10List from "@/components/Top10List";

export async function generateStaticParams() {
  const index = await getArchiveIndex();
  return index.map((entry) => ({ date: entry.date }));
}

export default async function ArchivedDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const edition = await getArchivedEdition(date);

  if (!edition) {
    notFound();
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 overflow-x-hidden">
      <Link
        href="/archive"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors w-fit"
      >
        ← All archived days
      </Link>

      <div>
        <h1 className="font-display text-xl text-[var(--text-primary)] mb-1">
          {date}
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          {edition.numberValue} · {edition.themeTitle}
        </p>
        <Top10List stories={edition.stories} linkBase={`/archive/${date}`} trackReads={false} />
      </div>
    </main>
  );
}
