// Offline support. Nothing here needs editing when the game changes:
// - Online, every file comes fresh from the network (and the copy in the cache is refreshed).
// - Offline, or if the network takes too long, the cached copy is used.
// - On install, the files the game needs are found by following index.html's links and the
//   JS imports, so there is no hand-kept file list.
const CACHE = 'fenceline-web';
const SLOW_MS = 4000;

const LINK_RE = /(?:href|src)\s*=\s*"(\.?\/?[^":?#]+)"/g;
const IMPORT_RE = /(?:import|from)\s*\(?\s*['"](\.\/[^'"]+)['"]|new Worker\(\s*new URL\(\s*['"](\.\/[^'"]+)['"]|new Worker\(\s*['"](\.\/[^'"]+)['"]|url\(\s*['"]?(\.?\/?[^'")]+\.(?:woff2|png))['"]?\s*\)/g;

async function crawl() {
  const seen = new Set(['./', './index.html']);
  const queue = ['./index.html'];
  while (queue.length) {
    const path = queue.shift();
    if (!/\.(html|js|css|webmanifest)$/.test(path)) continue;
    let body;
    try { body = await (await fetch(path, { cache: 'no-cache' })).text(); } catch (e) { continue; }
    const re = path.endsWith('.html') ? LINK_RE : IMPORT_RE;
    for (const m of body.matchAll(re)) {
      const ref = m.slice(1).find(Boolean);
      if (!ref || /^(https?:|data:|mailto:)/.test(ref) || ref.endsWith('.apk')) continue;
      const clean = './' + ref.replace(/^\.?\//, '');
      if (!seen.has(clean)) { seen.add(clean); queue.push(clean); }
    }
  }
  return [...seen];
}

self.addEventListener('install', e => {
  e.waitUntil(crawl()
    .then(files => caches.open(CACHE).then(c => Promise.all(files.map(f => c.add(new Request(f, { cache: 'no-cache' })).catch(() => {})))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // Older builds used one cache per version (fenceline-web-1, -2, ...); clear them out.
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('fenceline-web-')).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.endsWith('.apk')) return;
  // Pages (including ?p=CODE share links) all use the one app shell.
  const key = req.mode === 'navigate' ? new Request(new URL('./index.html', location.href)) : req;
  e.respondWith(networkFirst(req, key));
});

async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  const net = fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  });
  const slow = new Promise(resolve => setTimeout(resolve, SLOW_MS));
  const hit = () => cache.match(key, { ignoreSearch: true });
  try {
    const first = await Promise.race([net, slow.then(hit)]);
    if (first) return first;
    return await net; // slow network and nothing cached: keep waiting
  } catch (err) {
    return (await hit()) || Response.error();
  }
}
