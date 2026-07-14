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

function GlossaryIcon({ active }: { active: boolean }) {
  const c = active ? "var(--navy)" : "var(--text-secondary)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 6.5V19" stroke={c} strokeWidth={STROKE} strokeLinecap="round" />
      <path
        d="M12 6.5C10 5.2 6.8 4.7 4 5.2v12.3c2.8-.5 6 0 8 1.3"
        stroke={c}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 6.5c2-1.3 5.2-1.8 8-1.3v12.3c-2.8-.5-6 0-8 1.3"
        stroke={c}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProgressIcon({ active }: { active: boolean }) {
  const c = active ? "var(--navy)" : "var(--text-secondary)";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 4v16.5h16" stroke={c} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6.5 15.5l4-3 3.2 2.4L18 8.5"
        stroke={c}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14.5 8.5H18v3.5" stroke={c} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const TABS: Tab[] = [
  { href: "/", label: "Home", match: (p) => p === "/", icon: (a) => <HomeIcon active={a} /> },
  { href: "/archive", label: "Archive", match: (p) => p.startsWith("/archive"), icon: (a) => <ArchiveIcon active={a} /> },
  { href: "/search", label: "Search", match: (p) => p.startsWith("/search"), icon: (a) => <SearchIcon active={a} /> },
  { href: "/glossary", label: "Glossary", match: (p) => p.startsWith("/glossary"), icon: (a) => <GlossaryIcon active={a} /> },
  { href: "/progress", label: "Progress", match: (p) => p.startsWith("/progress"), icon: (a) => <ProgressIcon active={a} /> },
];

export default function BottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t"
      style={{ borderColor: "var(--border)", background: "white" }}
      aria-label="Primary"
    >
      <div className="max-w-2xl mx-auto grid grid-cols-5">
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
