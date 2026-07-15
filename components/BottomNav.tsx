"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  href: string;
  label: string;
  match: (path: string) => boolean;
  icon: (active: boolean) => React.ReactNode;
};

const STROKE = 1.6;

function HomeIcon({ active }: { active: boolean }) {
  const c = active ? "var(--navy)" : "var(--text-secondary)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 11l9-7 9 7" stroke={c} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M5 10v9.5a1 1 0 001 1h12a1 1 0 001-1V10"
        stroke={c}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.3 20V14.3a0.7 0.7 0 01.7-.7h2a0.7 0.7 0 01.7.7V20" stroke={c} strokeWidth={STROKE * 0.85} />
    </svg>
  );
}

function ArchiveIcon({ active }: { active: boolean }) {
  const c = active ? "var(--navy)" : "var(--text-secondary)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="13" r="8" stroke={c} strokeWidth={STROKE} />
      <path d="M12 13V8.5" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      <path d="M12 13l3.6 1.6" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon({ active }: { active: boolean }) {
  const c = active ? "var(--navy)" : "var(--text-secondary)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="10.5" cy="10.5" r="6.5" stroke={c} strokeWidth={STROKE} />
      <line x1="15.3" y1="15.3" x2="20.5" y2="20.5" stroke={c} strokeWidth={STROKE * 1.15} strokeLinecap="round" />
    </svg>
  );
}

function PulseIcon({ active }: { active: boolean }) {
  // Deliberately filled, not a plain stroke icon like the other three tabs
  // — this is the "premium/stands out" treatment requested, executed by
  // reusing the app's existing gold accent as a solid badge rather than
  // introducing new colors (stays inside the locked "gold sparingly, one
  // accent per section" design system instead of going multi-color).
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-full"
      style={{
        background: active
          ? "linear-gradient(135deg, var(--gold-light), var(--gold))"
          : "linear-gradient(135deg, var(--gold-light), var(--gold))",
        opacity: active ? 1 : 0.85,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="white" />
      </svg>
    </span>
  );
}

const TABS: Tab[] = [
  { href: "/", label: "Home", match: (p) => p === "/", icon: (a) => <HomeIcon active={a} /> },
  { href: "/archive", label: "Archive", match: (p) => p.startsWith("/archive"), icon: (a) => <ArchiveIcon active={a} /> },
  { href: "/search", label: "Search", match: (p) => p.startsWith("/search"), icon: (a) => <SearchIcon active={a} /> },
  { href: "/pulse", label: "Pulse", match: (p) => p.startsWith("/pulse"), icon: (a) => <PulseIcon active={a} /> },
];

export default function BottomNav() {
  const pathname = usePathname() || "/";

  // /pulse is a full-screen immersive swipe experience (its own in-page
  // navigation via swipe/scroll, plus a ✕ close button back to home) — a
  // persistent overlay nav here is exactly what caused headlines to be
  // hidden behind it. Every other route keeps the nav as before.
  if (pathname.startsWith("/pulse")) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t"
      style={{ borderColor: "var(--border)", background: "white" }}
      aria-label="Primary"
    >
      <div className="max-w-2xl mx-auto grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative flex flex-col items-center justify-center gap-1 py-2.5"
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <span
                  className="absolute top-0 h-[3px] w-7 rounded-full"
                  style={{ background: "var(--gold)" }}
                />
              )}
              {tab.icon(active)}
              <span
                className="text-[10.5px] leading-none"
                style={{
                  fontWeight: active ? 700 : 600,
                  color: active ? "var(--navy)" : "var(--text-secondary)",
                }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
      {/* Safe-area padding for iOS/Android gesture bar */}
      <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
    </nav>
  );
}
