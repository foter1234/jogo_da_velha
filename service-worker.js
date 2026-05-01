const CACHE_NAME = 'corrida-jogos-v2';

// Todos os assets locais críticos para o app funcionar offline
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './jogo_da_memoria/index.html',
  './img/ARTE CORRIDA_20260430_134648_0000.png',
  './img/ARTE CORRIDA.png',
  './img/360.PNG',
  './img/360.jpg',
  './img/teora.png',
  './img/qrsiliga.jpeg',
  './img/qrteora.jpeg',
  './icons/icon-192.svg',
];

// Domínios externos que também queremos cachear após o primeiro acesso
const CACHEABLE_HOSTS = [
  'res.cloudinary.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// ── INSTALL: pre-cacheia todos os assets locais ──────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: apaga caches antigas, assume controle imediato ─────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── FETCH: Cache-First para assets locais e externos conhecidos ──────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isLocal = url.origin === self.location.origin;
  const isExternal = CACHEABLE_HOSTS.some(host => url.hostname.includes(host));

  if (!isLocal && !isExternal) return;

  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Cacheia respostas válidas (200 OK) e respostas opacas (cross-origin sem CORS)
    if (response && (response.status === 200 || response.type === 'opaque')) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    // Sem conexão — tenta servir fallback HTML ou resposta vazia
    const accept = request.headers.get('Accept') || '';
    if (accept.includes('text/html')) {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('Sem conexão com a internet.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
