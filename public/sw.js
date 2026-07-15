// Why Today service worker
// Kept deliberately minimal: this site publishes fresh stories multiple
// times a day, so pages must always be network-first. This SW exists mainly
// to satisfy PWA installability requirements and provide a basic offline
// fallback — not to cache news content.

const CACHE_NAME = "why-today-shell-v1";
const OFFLINE_URL = "/offline.html";

const PRECACHE_ASSETS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests; let everything else (API calls, etc.) pass through.
  if (request.method !== "GET") return;

  // Page navigations: always go to network first so readers get fresh
  // stories. Fall back to a cached offline page only if the network fails.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Static assets (icons, Next.js build chunks): cache-first, since these
  // are fingerprinted/immutable, then fall back to network.
  if (
    request.destination === "image" ||
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font"
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
  }
});

// --- Web Push --------------------------------------------------------
// Kept minimal on purpose: shows whatever title/body/url the push payload
// carries (sent by scripts/send-push-notification.js), falls back to
// sensible defaults if the payload is missing or malformed so a
// malformed push never fails silently with no notification at all.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Not valid JSON — fall through to defaults below.
  }

  const title = data.title || "Why Today";
  const body = data.body || "A new story just went live.";
  const url = data.url || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab already on the site rather than opening a
      // new one, if one's open.
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
