const APP_VERSION = self.__APP_VERSION__ || '1.0.0';
const CACHE_NAME = `fm-shell-${APP_VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/offline.html',
];

// Explicit allowlist of PUBLIC API endpoints that are safe to cache.
// Anything else under /api/ (auth, wallet, orders, messages, addresses,
// admin, ...) must never be stored in Cache Storage.
const PUBLIC_API_ALLOWLIST = [
  /^\/api\/v1\/products(\/|$)/,
  /^\/api\/v1\/categories(\/|$)/,
  /^\/api\/v1\/rates(\/|$)/,
];

const PRODUCT_CACHE = 'fm-products';
const IMAGE_CACHE = 'fm-images';
const MAX_PRODUCT_PAGES = 20;
const MAX_IMAGES = 200;

// Authenticated responses are sent with Cache-Control: private, no-store
// and must never be written to Cache Storage.
function isStorable(response) {
  if (!response || !response.ok || response.status !== 200) return false;
  const cc = (response.headers.get('Cache-Control') || '').toLowerCase();
  return !cc.includes('no-store') && !cc.includes('private');
}

async function trimCache(name, max, filter = () => true) {
  const cache = await caches.open(name);
  const keys = (await cache.keys()).filter(filter);
  // Cache keys are returned in insertion order, so drop the oldest first.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

const isProductDetail = (req) => /^\/api\/v1\/products\/[^/]+$/.test(new URL(req.url).pathname);

function staleWhileRevalidate(event, cacheName, onStored) {
  const { request } = event;
  return (async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const network = fetch(request).then(async (response) => {
      if (isStorable(response)) {
        // Re-insert so the entry moves to the end (most recently viewed).
        await cache.delete(request);
        await cache.put(request, response.clone());
        if (onStored) await onStored();
      }
      return response;
    }).catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    const fresh = await network;
    return fresh || new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  })();
}

function isCacheableApiRequest(request, url) {
  if (request.method !== 'GET') return false;
  // Never cache anything that carries credentials/authorization.
  if (request.headers.get('Authorization')) return false;
  return PUBLIC_API_ALLOWLIST.some((pattern) => pattern.test(url.pathname));
}

// Install: pre-cache the offline fallback only. index.html is intentionally
// NOT pre-cached so navigation always goes to the network when online.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Do NOT call skipWaiting() here — activation is controlled via the
  // SKIP_WAITING message so the user gets a chance to see the update prompt.
});

// Activate: clean up old caches, then notify clients of the update
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => ![CACHE_NAME, PRODUCT_CACHE, IMAGE_CACHE].includes(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) =>
          clients.forEach((c) => c.postMessage({ type: 'SW_UPDATED' }))
        )
      )
  );
});

// Delete every cached API response. Used on logout and on login as a
// different user so a previous session's data can never be served.
async function clearUserCache() {
  const keys = await caches.keys();
  await Promise.all(
    keys.map(async (key) => {
      const cache = await caches.open(key);
      const requests = await cache.keys();
      await Promise.all(
        requests
          .filter((req) => new URL(req.url).pathname.startsWith('/api/'))
          .map((req) => cache.delete(req))
      );
    })
  );
}

// Controlled activation: the UpdatePrompt component sends SKIP_WAITING
// so we only take over after the user has acknowledged the update.
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'CLEAR_USER_CACHE') {
    event.waitUntil(clearUserCache());
  }
});

// Fetch strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Navigation requests: network-first so a fresh deploy always serves the
  // new index.html (and its hashed chunks). Fall back to the cached shell
  // only when the network is unavailable.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Products API (marketplace list + last 20 viewed product pages):
  // stale-while-revalidate, gated by the public allowlist.
  if (isCacheableApiRequest(request, url) && url.pathname.startsWith('/api/v1/products')) {
    event.respondWith(staleWhileRevalidate(event, PRODUCT_CACHE, () =>
      isProductDetail(request) ? trimCache(PRODUCT_CACHE, MAX_PRODUCT_PAGES, isProductDetail) : null));
    return;
  }

  // Product images: stale-while-revalidate with a bounded cache.
  if (request.method === 'GET' && (request.destination === 'image' || url.pathname.startsWith('/uploads/'))) {
    event.respondWith(staleWhileRevalidate(event, IMAGE_CACHE, () => trimCache(IMAGE_CACHE, MAX_IMAGES)));
    return;
  }

  // Other API requests: network-first. Only public allowlisted endpoints
  // (and requests without an Authorization header) may be cached; every
  // other /api/ response is passed through and never stored.
  if (url.pathname.startsWith('/api/')) {
    const cacheable = isCacheableApiRequest(request, url);
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (cacheable && isStorable(response)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          if (!cacheable) {
            return new Response(JSON.stringify({ error: 'offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return caches.match(request).then((cached) => cached || new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }));
        })
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // For navigation requests, serve offline page (shouldn't reach here)
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
        });
    })
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Farmers Marketplace';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: data.url || '/',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || '/';
  event.waitUntil(clients.openWindow(targetUrl));
});
