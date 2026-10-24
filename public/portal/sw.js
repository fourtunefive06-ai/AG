/* Absel Global client area service worker.
   The app shell is cached so the app opens instantly and works offline; account and money data
   (/api/) always go to the network and are never cached. */
const CACHE = "ag-portal-v2";
const SHELL = ["/portal/", "/portal/portal.js", "/portal/manifest.webmanifest", "/assets/absel-global-logo-white.png", "/assets/app-192.png", "/assets/app-512.png", "/assets/favicon-64.png"];

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("ag-portal-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.pathname.startsWith("/api/")) return;              // never cache account data
  const sameOrigin = url.origin === self.location.origin, font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !font) return;
  if (req.mode === "navigate") { // network first, cached shell when offline
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put("/portal/", copy)); return r; }).catch(() => caches.match("/portal/")));
    return;
  }
  if (font) { e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; }))); return; }
  // app files: network first so updates arrive at once, cache as fallback
  e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; }).catch(() => caches.match(req)));
});
