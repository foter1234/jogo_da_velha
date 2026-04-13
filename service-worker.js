const CACHE = 'velha-v3';
const ASSETS = ['./','./index.html','./style.css','./script.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(cacheFirst(e.request)); return;
  }
  if (url.origin === self.location.origin) { e.respondWith(cacheFirst(e.request)); return; }
});

async function cacheFirst(req) {
  const c = await caches.match(req); if (c) return c;
  try { const r = await fetch(req); if (r && r.status === 200) { const cache = await caches.open(CACHE); cache.put(req, r.clone()); } return r; }
  catch(_) { return new Response('<p style="font-family:sans-serif;color:#e8e8f0;text-align:center;padding:40px">Sem conexão</p>', { headers: { 'Content-Type':'text/html' } }); }
}
