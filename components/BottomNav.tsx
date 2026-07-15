"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

/**
 * Bottom nav — reduced from 4 tabs to 2 (2026-07-15, per explicit
 * request): Home, and a deliberately oversized, raised Quick Read
 * button — the "very prominent and catchy... so people get engage"
 * treatment. Archive and Search moved into the hamburger menu (see
 * HamburgerMenu.tsx); Glossary already lived there from the previous
 * pass. A subtle pulsing ring (animate-ping, one soft cycle of
 * attention, not a flashing/looping distraction) is the one deliberate
 * bit of motion in the whole nav — reused nowhere else, so it stays
 * meaningful rather than decorative noise.
 */
export default function BottomNav() {
  const pathname = usePathname() || "/";

  // /quick-reads is a full-screen immersive swipe experience (its own
  // in-page navigation via swipe/scroll, plus a ✕ close button back to
  // home) — a persistent overlay nav here is what caused headlines to be
  // hidden behind it in the first version. Every other route keeps the
  // nav as below.
  if (pathname.startsWith("/quick-reads")) return null;

  const homeActive = pathname === "/";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50" aria-label="Primary">
      <div
        className="max-w-2xl mx-auto grid grid-cols-2 border-t"
        style={{ borderColor: "var(--border)", background: "white" }}
      >
        <Link
          href="/"
          className="relative flex flex-col items-center justify-center gap-1 py-2.5"
          aria-current={homeActive ? "page" : undefined}
        >
          {homeActive && (
            <span className="absolute top-0 h-[3px] w-7 rounded-full" style={{ background: "var(--gold)" }} />
          )}
          <HomeIcon active={homeActive} />
          <span
            className="text-[10.5px] leading-none"
            style={{ fontWeight: homeActive ? 700 : 600, color: homeActive ? "var(--navy)" : "var(--text-secondary)" }}
          >
            Home
          </span>
        </Link>

        <Link href="/quick-reads" className="relative flex flex-col items-center justify-center py-1.5" aria-label="Quick Reads">
          <span className="relative inline-flex items-center justify-center">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-40 animate-ping"
              style={{ background: "var(--gold)" }}
            />
            <span
              className="relative inline-flex items-center justify-center w-12 h-12 rounded-full shadow-lg"
              style={{ background: "linear-gradient(135deg, var(--gold-light), var(--gold))" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="white" />
              </svg>
            </span>
          </span>
          <span className="text-[10.5px] font-bold mt-1" style={{ color: "var(--navy)" }}>
            Quick Reads
          </span>
        </Link>
      </div>
      {/* Safe-area padding for iOS/Android gesture bar */}
      <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
    </nav>
  );
}
