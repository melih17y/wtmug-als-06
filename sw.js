/* ============================================================
   Sesli & Kriptografik QR Yoklama — Service Worker
   ============================================================ */

const CACHE_VERSION = 'v5';
const CACHE_STATIC  = `yoklama-static-${CACHE_VERSION}`;
const CACHE_RUNTIME = `yoklama-runtime-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  './',
  './index.html',
  './student.html',
  './lecturer.html',
  './report.html',
  './students.json',
  './courses.json',
  './icon.svg',
  './manifest-student.json',
  './manifest-lecturer.json'
];

// ✅ FIX #8: cdnjs eklendi
const CDN_ORIGINS = [
  'https://cdn.jsdelivr.net',
  'https://cdnjs.cloudflare.com'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    await Promise.all(
      STATIC_ASSETS.map(url =>
        cache.add(new Request(url, { cache: 'reload' })).catch(err => {
          console.warn('[SW] Cache eklenemedi:', url, err);
        })
      )
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== CACHE_STATIC && k !== CACHE_RUNTIME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  if (req.mode === 'navigate' ||
      (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirst(req, CACHE_STATIC, './index.html'));
    return;
  }

  if (url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(req, CACHE_STATIC));
    return;
  }

  if (CDN_ORIGINS.some(o => url.origin === o)) {
    event.respondWith(cacheFirst(req, CACHE_RUNTIME));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req, CACHE_STATIC));
    return;
  }

  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const resp = await fetch(req);
    if (resp && resp.status === 200 && (resp.type === 'basic' || resp.type === 'cors')) {
      const cache = await caches.open(cacheName);
      cache.put(req, resp.clone()).catch(() => {});
    }
    return resp;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function networkFirst(req, cacheName, fallbackUrl) {
  try {
    const resp = await fetch(req);
    if (resp && resp.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(req, resp.clone()).catch(() => {});
    }
    return resp;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    if (fallbackUrl) {
      const fb = await caches.match(fallbackUrl);
      if (fb) return fb;
    }
    return new Response('Çevrimdışısınız ve bu sayfa önbellekte yok.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      if (event.source && event.source.postMessage) {
        event.source.postMessage({ type: 'CACHE_CLEARED' });
      }
    })());
  }
});