"use client";

import { usePathname } from "next/navigation";

/**
 * Reserves bottom padding for BottomNav (which is `fixed`, so it sits on
 * top of whatever's at the bottom of the page unless something reserves
 * that space) — found 2026-07-16 from a real screenshot showing story
 * text clipped right where it met the nav bar.
 *
 * Matches BottomNav.tsx's own pathname check exactly: skips the padding
 * on /quick-reads, where BottomNav itself already renders nothing (that
 * page manages its own full-screen h-svh layout) — adding padding there
 * anyway would reintroduce the "blank space" issue that page's own
 * layout was specifically fixed to avoid. /visual-preview is the same
 * situation — ChromeVisibility.tsx hides BottomNav there too.
 */
export default function PageBody({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const needsNavSpace = !pathname.startsWith("/quick-reads") && !pathname.startsWith("/visual-preview");

  return <div className={needsNavSpace ? "pb-24" : ""}>{children}</div>;
}
