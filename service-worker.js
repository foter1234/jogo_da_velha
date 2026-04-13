/**
 * ╔══════════════════════════════════════════════╗
 * ║  JOGO DA VELHA — service-worker.js           ║
 * ║  Estratégia: Cache-first para assets estáticos║
 * ╚══════════════════════════════════════════════╝
 */

const CACHE_NAME = 'velha-v1';

/* Arquivos que serão pré-cacheados na instalação */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  /* Fontes do Google (serão cacheadas na primeira visita via runtime caching) */
];

/* ── INSTALL: pré-cache dos assets essenciais ── */
self.addEventListener('install', event => {
  console.log('[SW] instalando…');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] pré-cacheando assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())  // ativa imediatamente
  );
});

/* ── ACTIVATE: remove caches antigas ── */
self.addEventListener('activate', event => {
  console.log('[SW] ativando…');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] removendo cache antiga:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())  // controla clientes imediatamente
  );
});

/* ── FETCH: estratégia por tipo de recurso ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requisições não-GET
  if (request.method !== 'GET') return;

  // Ignora requisições ao Supabase (sempre rede)
  if (url.hostname.includes('supabase.co')) return;

  // Para fontes do Google: Cache-first com fallback em rede
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Para assets locais: Cache-first (funciona offline)
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }
});

/**
 * Cache-first: tenta servir do cache; se não houver, busca na rede e atualiza o cache.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    // Só faz cache de respostas válidas
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_) {
    // Sem rede e sem cache: retorna página offline genérica
    return new Response(
      '<html><body style="font-family:sans-serif;background:#0a0a0f;color:#e8e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p style="text-align:center">📡 Sem conexão.<br>Verifique sua internet.</p></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}
