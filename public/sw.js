/* Service Worker: App-Hülle offline, Schriften im Cache, Wetter und Webcams immer live. */
const VERSION = 'v5';
const SHELL = `shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;
const FILES = [
  './', './index.html', './app.css', './app.js', './data.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Seitenaufrufe: zuerst Netz, offline die gespeicherte App
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // API und Login nie aus dem Cache
  if (url.origin === location.origin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/'))) return;

  // Eigene Dateien: Cache zuerst, im Hintergrund aktualisieren
  if (url.origin === location.origin) {
    e.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }

  // Google Fonts: einmal laden, dann offline verfügbar
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req, RUNTIME));
  }
  // Alles andere (meteoblue, Webcams) geht direkt ans Netz
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || net;
}
