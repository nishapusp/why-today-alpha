import { currentUser } from "@clerk/nextjs/server";

/**
 * The whole admin system is scoped to exactly one person (explicit
 * decision, not a placeholder for later) — so this checks the signed-in
 * user's email against a single ADMIN_EMAIL env var rather than building
 * out Clerk role/metadata management for a one-person system. Add
 * ADMIN_EMAIL as a Netlify environment variable set to your account's
 * email (the one you sign in to Why Today with).
 *
 * Returns the Clerk user if they're the admin, null otherwise. Every
 * admin page and API route must call this and bail out on null — this
 * is the only gate, so it needs to be checked everywhere, not just at
 * the page level (a page-level-only check doesn't protect the API
 * routes themselves from being called directly).
 */
export async function requireAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return null; // fail closed if misconfigured, not open
  const user = await currentUser();
  if (!user) return null;
  const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress;
  if (!email || email.toLowerCase() !== adminEmail.toLowerCase()) return null;
  return user;
}
