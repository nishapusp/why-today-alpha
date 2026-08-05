#!/usr/bin/env node
/**
 * Sends a Web Push notification to every stored subscription — run after
 * generate-edition.js successfully publishes new stories (wired into
 * generate-edition.yml as a follow-up step, not a separate schedule).
 *
 * Dead subscriptions (expired/unsubscribed browsers return 404/410 from
 * the push service) are pruned automatically — otherwise the subscriber
 * list would only ever grow, wasting sends on addresses that can never
 * receive them again.
 *
 * Env required:
 *   NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN — same Netlify credentials used
 *     elsewhere in this repo's scripts.
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY — from the pair generated for
 *     this feature; public key is also embedded client-side via
 *     NEXT_PUBLIC_VAPID_PUBLIC_KEY (a Netlify env var, not a GH secret —
 *     it needs to be present at Next.js build time).
 *   VAPID_CONTACT_EMAIL — required by the Web Push protocol as a contact
 *     point for push services to reach the sender if needed; any real
 *     mailto: address works.
 */

const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");
const webpush = require("web-push");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function subscriptionStore() {
  return getStore({
    name: "why-today-push-subscriptions",
    siteID: requireEnv("NETLIFY_SITE_ID"),
    token: requireEnv("NETLIFY_AUTH_TOKEN"),
  });
}

// 2026-08-05: generate-edition.yml can now legitimately succeed more than
// once in a day — a scheduled run followed by a manual (or automated
// top-up) re-dispatch — and each success used to call this script again,
// sending the exact "today's edition is live" push a second time for the
// same day's edition. A separate tiny Blobs store (not the subscription
// list itself, so this marker is never mistaken for a subscription and
// sent push data) records whether THIS EXACT message already went out
// today; only a genuine repeat of the same message on the same IST day
// gets skipped, so a real future different notification is never
// wrongly suppressed.
function notificationStateStore() {
  return getStore({
    name: "why-today-notification-state",
    siteID: requireEnv("NETLIFY_SITE_ID"),
    token: requireEnv("NETLIFY_AUTH_TOKEN"),
  });
}

async function main() {
  const title = process.argv[2] || "Why Today";
  const body = process.argv[3] || "A new story just went live.";
  const url = process.argv[4] || "/";

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const dedupeKey = crypto.createHash("sha256").update(`${today}|${title}|${body}|${url}`).digest("hex").slice(0, 24);
  const stateStore = notificationStateStore();
  try {
    const alreadySent = await stateStore.get(dedupeKey, { type: "text" });
    if (alreadySent) {
      console.log(`This exact notification already went out today (${today}) — skipping duplicate send.`);
      return;
    }
  } catch (err) {
    console.warn(`Could not check notification dedupe state (${err.message}) — sending anyway.`);
  }

  webpush.setVapidDetails(
    `mailto:${requireEnv("VAPID_CONTACT_EMAIL")}`,
    requireEnv("VAPID_PUBLIC_KEY"),
    requireEnv("VAPID_PRIVATE_KEY")
  );

  const store = subscriptionStore();
  const { blobs } = await store.list();
  console.log(`Found ${blobs.length} subscription(s).`);

  if (blobs.length === 0) {
    console.log("No subscribers yet — nothing to send.");
    return;
  }

  const payload = JSON.stringify({ title, body, url });
  let sent = 0;
  let pruned = 0;

  for (const { key } of blobs) {
    try {
      const raw = await store.get(key, { type: "text" });
      if (!raw) continue;
      const subscription = JSON.parse(raw);
      await webpush.sendNotification(subscription, payload);
      sent++;
    } catch (err) {
      // 404/410 means the push service itself says this subscription is
      // gone (browser unsubscribed, cleared data, etc.) — prune it so
      // future sends don't keep trying a dead endpoint.
      const statusCode = err && err.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        try {
          await store.delete(key);
          pruned++;
        } catch {
          // Non-fatal — will just get retried/pruned next send.
        }
      } else {
        console.warn(`Send failed for ${key}: ${err.message || err}`);
      }
    }
  }

  console.log(`Sent: ${sent} | Pruned dead subscriptions: ${pruned} | Total on file: ${blobs.length}`);

  try {
    // One key per distinct (date, message) combo — a handful of keys a
    // day at most, not worth adding expiry logic for.
    await stateStore.set(dedupeKey, "1", { metadata: { sentAt: new Date().toISOString() } });
  } catch (err) {
    console.warn(`Could not record notification dedupe state (${err.message}) — a same-day re-run may send this again.`);
  }
}

main().catch((err) => {
  console.error("Push notification send failed:", err.message);
  process.exit(1);
});
