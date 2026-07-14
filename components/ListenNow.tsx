import Link from "next/link";

export default function ListenNow({ slug }: { slug: string }) {
  return (
    <Link
      href={`/story/${slug}`}
      className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:border-[var(--navy)]"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <span
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "var(--navy)" }}
        aria-hidden
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 4.5v15l14-7.5-14-7.5z" fill="white" />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--text-secondary)" }}>
          Listen now
        </p>
        <p className="text-[13.5px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
          Today&apos;s top story, read aloud
        </p>
      </div>
    </Link>
  );
}
