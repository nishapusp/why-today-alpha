#!/usr/bin/env node
/**
 * Notifies subscribers about major NEW Quick Reads stories — run as a
 * follow-up step after generate-quick-reads.js, but deliberately does
 * NOT notify on every run (that runs hourly; a notification every hour
 * would be exactly the kind of over-notifying that gets push permission
 * revoked). Only sends when the top-ranked item (already sorted by
 * corroboration then recency — see generate-quick-reads.js) is BOTH new
 * since the last notification AND meets the same "major" bar used
 * elsewhere in the app (2+ independently corroborating outlets).
 *
 * Tracks the last-notified item's id in the same Blobs store Quick Reads
 * itself uses, under a separate key — so this is stateful across runs
 * without needing its own new store.
 *
 * Env required: same as generate-quick-reads.js/send-push-notification.js
 * (NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN, VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL).
 */

const { getStore } = require("@netlify/blobs");
const webpush = require("web-push");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function creds() {
  return { siteID: requireEnv("NETLIFY_SITE_ID"), token: requireEnv("NETLIFY_AUTH_TOKEN") };
}

async function main() {
  const quickReadsStore = getStore({ name: "why-today-quick-reads", ...creds() });
  const raw = await quickReadsStore.get("feed", { type: "text" });
  const feed = raw ? JSON.parse(raw) : { items: [] };

  if (!feed.items || feed.items.length === 0) {
    console.log("No Quick Reads items — nothing to notify about.");
    return;
  }

  // Items are already sorted by corroboration then recency at write time.
  const top = feed.items[0];
  const isMajor = (top.corroboratedBy || []).length >= 2;

  if (!isMajor) {
    console.log(`Top item ("${top.headline}") isn't corroborated by 2+ outlets yet — not notification-worthy.`);
    return;
  }

  const lastNotifiedId = await quickReadsStore.get("last-notified-id", { type: "text" }).catch(() => null);
  if (lastNotifiedId === top.id) {
    console.log("Top item hasn't changed since the last notification — skipping.");
    return;
  }

  console.log(`New major story: "${top.headline}" (${top.corroboratedBy.length} outlets) — notifying.`);

  webpush.setVapidDetails(
    `mailto:${requireEnv("VAPID_CONTACT_EMAIL")}`,
    requireEnv("VAPID_PUBLIC_KEY"),
    requireEnv("VAPID_PRIVATE_KEY")
  );

  const subStore = getStore({ name: "why-today-push-subscriptions", ...creds() });
  const { blobs } = await subStore.list();
  const payload = JSON.stringify({
    title: "Why Today — Quick Read",
    body: top.headline,
    url: "/quick-reads",
  });

  let sent = 0;
  let pruned = 0;
  for (const { key } of blobs) {
    try {
      const subRaw = await subStore.get(key, { type: "text" });
      if (!subRaw) continue;
      await webpush.sendNotification(JSON.parse(subRaw), payload);
      sent++;
    } catch (err) {
      const statusCode = err && err.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        try {
          await subStore.delete(key);
          pruned++;
        } catch {
          // Non-fatal — will just get retried/pruned next send.
        }
      } else {
        console.warn(`Send failed for ${key}: ${err.message || err}`);
      }
    }
  }

  await quickReadsStore.set("last-notified-id", top.id);
  console.log(`Sent: ${sent} | Pruned dead subscriptions: ${pruned}`);
}

main().catch((err) => {
  console.error("Quick Reads notification failed:", err.message);
  process.exit(1);
});
