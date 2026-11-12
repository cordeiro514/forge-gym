// Offline support. Bump CACHE whenever any file changes so phones pick up the new version.
const CACHE = 'forge-1.1.0';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'coach.js', 'exercises.js', 'store.js', 'activity.js', 'guide.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).catch(() => (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
