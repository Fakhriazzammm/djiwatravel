/**
 * Djiwa Travel service worker (single worker for the whole app).
 *
 * Safety contract — a stale response must never be served:
 *  - Navigations are ALWAYS network-first; the cached /offline.html is used only when the network
 *    itself fails (never for HTTP errors).
 *  - Only content-hashed build assets (/assets/<name>-<hash>.js|css|woff2) are cached, cache-first.
 *    API, auth, checkout, wallet, webhooks and everything else bypass the worker entirely.
 *  - Admin kill switch: the page posts {type:"djiwa-config", offlineCache:false}; the worker then
 *    deletes its caches and stops intercepting fetches until it is switched back on.
 *  - A new worker waits until the page asks it to take over ({type:"SKIP_WAITING"}), so an update
 *    never swaps assets underneath an open checkout.
 */
const VERSION = "v2";
const OFFLINE_URL = "/offline.html";
const STATIC_CACHE = `djiwa-static-${VERSION}`;
const FLAGS_CACHE = "djiwa-flags";
const FLAG_URL = "/__djiwa-flags";
const HASHED_ASSET = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?)$/;

let offlineCacheEnabled = null; // null = not yet read from storage

async function cacheEnabled() {
  if (offlineCacheEnabled !== null) return offlineCacheEnabled;
  try {
    const cache = await caches.open(FLAGS_CACHE);
    const hit = await cache.match(FLAG_URL);
    offlineCacheEnabled = hit ? (await hit.text()) !== "off" : true;
  } catch {
    offlineCacheEnabled = true;
  }
  return offlineCacheEnabled;
}

async function setCacheEnabled(enabled) {
  offlineCacheEnabled = enabled;
  const flags = await caches.open(FLAGS_CACHE);
  await flags.put(FLAG_URL, new Response(enabled ? "on" : "off"));
  if (!enabled) {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== FLAGS_CACHE).map((name) => caches.delete(name)));
  } else {
    const cache = await caches.open(STATIC_CACHE);
    await cache.add(new Request(OFFLINE_URL, { cache: "reload" })).catch(() => undefined);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== STATIC_CACHE && name !== FLAGS_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (error) {
          if (await cacheEnabled()) {
            const fallback = await caches.match(OFFLINE_URL);
            if (fallback) return fallback;
          }
          throw error;
        }
      })(),
    );
    return;
  }

  if (HASHED_ASSET.test(url.pathname)) {
    event.respondWith(
      (async () => {
        if (!(await cacheEnabled())) return fetch(request);
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type === "djiwa-config" && typeof data.offlineCache === "boolean") {
    event.waitUntil(setCacheEnabled(data.offlineCache));
    return;
  }
  if (data.type !== "djiwa-notify") return;
  event.waitUntil(
    self.registration.showNotification(data.title || "Djiwa Travel", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "djiwa-esim",
      data: { url: data.url || "/my-esim" },
    }),
  );
});

// Web Push: payload is {title, body, url, tag}. Always show something (required by browsers).
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title || "Djiwa Travel", {
        body: payload.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: payload.tag || "djiwa-push",
        data: { url: payload.url || "/notifications" },
      }),
      self.navigator && self.navigator.setAppBadge
        ? self.navigator.setAppBadge().catch(() => undefined)
        : Promise.resolve(),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/my-esim";
  // Only same-origin paths: a push payload must never navigate the app elsewhere.
  const url = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/my-esim";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
