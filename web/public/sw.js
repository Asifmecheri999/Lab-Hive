// LabSynch service worker — install ("Add to Home Screen") + fast static caching.
const CACHE = "labsynch-v3";
// Immutable, content-hashed assets (Next chunks, fonts, images) — safe to serve cache-first.
const isStatic = (url) => url.pathname.startsWith("/_next/static/") || /\.(?:js|css|woff2?|png|jpe?g|svg|gif|ico|webmanifest)$/.test(url.pathname);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Web Push — show notifications + focus the app on click.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text ? event.data.text() : "" }; }
  const title = data.title || "LabSynch";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png?v=3",
    badge: "/icon-192.png?v=3",
    data: { url: data.url || "/dashboard" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) { if ("focus" in c) { try { c.navigate(url); } catch (e) {} return c.focus(); } }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Only handle our own origin — let API/auth calls go straight to the network.
  if (url.origin !== self.location.origin) return;

  // Cache-first (stale-while-revalidate) for immutable static assets → instant repeat loads.
  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Network-first for HTML / navigations / everything else; fall back to cache when offline.
  // Must ALWAYS resolve to a Response — a bare caches.match() miss returns undefined,
  // which makes respondWith throw "Failed to convert value to 'Response'" and hard-breaks
  // the page during any transient network blip (e.g. an API/worker redeploy window).
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        // Navigations: fall back to the cached app shell so the SPA can recover.
        if (req.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        // Last resort — a valid Response so respondWith never receives undefined.
        return new Response("", { status: 504, statusText: "Gateway Timeout" });
      })
  );
});
