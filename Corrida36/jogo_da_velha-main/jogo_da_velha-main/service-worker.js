const CACHE_NAME = 'costelao-jogos-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './img/logoCostelao.png',
  './img/360.jpg',
  './img/teora.png',
  './jogo_da_velha/index.html',
  './jogo_da_velha/css/style.css',
  './jogo_da_velha/js/script.js',
  './jogo_da_memoria/index.html',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Cache-first para assets locais e CDNs
  if (url.origin === self.location.origin || url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com') || url.hostname.includes('cdnjs.cloudflare.com')) {
    e.respondWith(cacheFirst(e.request));
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
    }
    return res;
  } catch(_) {
    return new Response('<p style="font-family:Georgia,serif;text-align:center;padding:40px;color:#3e1f08">Sem conexão. Verifique sua internet.</p>', { headers: { 'Content-Type': 'text/html' } });
  }
}
