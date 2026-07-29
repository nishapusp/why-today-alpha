"use client";

import { usePathname } from "next/navigation";

// Routes that manage their own full-bleed, edge-to-edge layout and opt out
// of the global site chrome entirely — same spirit as BottomNav.tsx's and
// PageBody.tsx's existing /quick-reads opt-out, extended to also hide the
// sticky top header (which /quick-reads works around instead, but
// /visual-preview needs the WHY TODAY brand header to be the first thing
// on screen, not stacked under the site's own header).
const HIDDEN_PREFIXES = ["/visual-preview"];

export default function ChromeVisibility({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return <>{children}</>;
}
