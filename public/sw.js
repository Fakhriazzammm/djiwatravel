/**
 * Minimal service worker for local eSIM notifications.
 *
 * It deliberately has NO fetch/caching handler: the app must keep loading every asset from the
 * network exactly as before, so this cannot serve a stale bundle. Its only job is to show a
 * notification when the page asks for one — which works on Android Chrome as well, where the
 * Notification constructor alone does not.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/my-esim";
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
