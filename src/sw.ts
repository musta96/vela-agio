/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

// Allow page to trigger immediate activation when user clicks "Refresh".
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Precache build output + offline fallback shell.
precacheAndRoute(self.__WB_MANIFEST);

const OFFLINE_URL = "/offline.html";

// HTML navigations: network-first with offline fallback.
registerRoute(
  ({ request }) => request.mode === "navigate",
  new NetworkFirst({
    cacheName: "html-pages",
    networkTimeoutSeconds: 4,
    plugins: [new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 7 })],
  }),
);

// Static assets (js/css/woff2): stale-while-revalidate.
registerRoute(
  ({ request }) => ["style", "script", "worker", "font"].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: "assets" }),
);

// Images: cache-first, capped.
registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "images",
    plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

// Catch-all: when a navigation fails entirely, serve the offline page.
setCatchHandler(async ({ request }) => {
  if (request.destination === "document") {
    const cache = await caches.open("html-pages");
    const cached = await cache.match(OFFLINE_URL);
    if (cached) return cached;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
  return Response.error();
});

// ---------- Web Push ----------
self.addEventListener("push", (event: PushEvent) => {
  let data: any = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Vela.ai", body: event.data?.text() ?? "" };
  }
  const title = data.title || "Vela.ai";
  const options: NotificationOptions = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/dashboard", ...(data.data || {}) },
    requireInteraction: !!data.requireInteraction,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          (c as WindowClient).navigate(url).catch(() => {});
          return (c as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});

export {};