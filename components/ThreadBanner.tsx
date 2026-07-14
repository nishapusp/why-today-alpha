export default function ThreadBanner({
  themeTitle,
  themeDescription,
}: {
  themeTitle: string;
  themeDescription?: string;
}) {
  if (!themeTitle) return null;

  return (
    <div
      className="rounded-xl border pl-3.5 pr-4 py-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)", borderLeftColor: "var(--gold)", borderLeftWidth: 3 }}
    >
      <p className="font-mono text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--text-secondary)" }}>
        Today&apos;s thread
      </p>
      <p className="font-display text-[15px] leading-snug" style={{ color: "var(--text-primary)" }}>
        {themeTitle}
      </p>
      {themeDescription && (
        <p className="text-[13px] mt-1 leading-snug" style={{ color: "var(--text-secondary)" }}>
          {themeDescription}
        </p>
      )}
    </div>
  );
}
