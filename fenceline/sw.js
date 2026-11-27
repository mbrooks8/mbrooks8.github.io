// Offline support: keeps the whole game cached so it plays without a connection.
// Bump VERSION whenever any file changes, so phones pick up the new one.
const VERSION = 'fenceline-web-8';
const FILES = [
  './', './index.html', './style.css', './app.js', './ui.js', './board.js', './sketch.js', './store.js',
  './compat.js', './core.js', './worker.js', './room.js', './net.js', './native.js', './sound.js', './nearby.js', './manifest.webmanifest', './fonts/coming-soon.woff2',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('fenceline-web-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.endsWith('.apk')) return;
  // Pages (including ?p=CODE share links) get the cached app shell.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
});
