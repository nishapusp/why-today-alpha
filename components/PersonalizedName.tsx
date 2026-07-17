"use client";

import { useUser } from "@clerk/nextjs";

/**
 * Renders ", FirstName" once Clerk's client-side session resolves, or
 * nothing if signed out — this used to be resolved server-side via
 * auth() + currentUser() directly in app/page.tsx, which was forcing
 * the ENTIRE home page to skip ISR caching (Clerk's auth() is a Next.js
 * "Dynamic API" — using one anywhere in a page's render path silently
 * overrides `export const revalidate` for that whole route). Clerk's
 * useUser() hook already has the session available client-side with no
 * server round-trip at all, so this is both faster AND removes the
 * blocking server call entirely.
 */
export default function PersonalizedName() {
  const { isLoaded, isSignedIn, user } = useUser();
  if (!isLoaded || !isSignedIn || !user?.firstName) return null;
  return <>, {user.firstName}</>;
}
