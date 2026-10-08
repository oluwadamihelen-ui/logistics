/* Driver-app offline shell. Scope: "/". Only the driver area and static assets are cached.
 * - /_next/static, icons: cache-first (content-hashed, safe).
 * - /driver navigations: network-first; the last good copy is served when offline.
 * - Everything else (API, server actions, other areas) always goes to the network untouched.
 * Caches are wiped on sign-out (message "clear") so a shared phone never shows the previous driver's pages. */
const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const OFFLINE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font-family:system-ui;padding:2rem;background:#f8fafc"><h2>You're offline</h2><p>Open the Tasks screen once while online so it is available here. Actions you take offline are queued and sync automatically when you reconnect.</p><button onclick="location.reload()" style="padding:.6rem 1rem">Retry</button></body>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![STATIC, PAGES].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("message", (e) => {
  if (e.data === "clear") e.waitUntil(Promise.all([caches.delete(STATIC), caches.delete(PAGES)]));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon-192.png" || url.pathname === "/manifest.webmanifest") {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  if (req.mode === "navigate" && (url.pathname === "/driver" || url.pathname.startsWith("/driver/"))) {
    event.respondWith((async () => {
      const cache = await caches.open(PAGES);
      try {
        const res = await fetch(req);
        // Only cache real pages for a signed-in user (not redirects to /login or errors).
        if (res.ok && !res.redirected) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req)) || (await cache.match("/driver")) || new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
  }
});
