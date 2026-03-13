// Nexus Service Worker — Offline App Shell
// Caches the app shell so the UI loads even when the server is unreachable.

const SHELL_CACHE = 'nexus-shell-v1';
const STATIC_CACHE = 'nexus-static-v1';

const SHELL_URLS = ['./', './fonts.css'];

// Install: pre-cache shell resources, then activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches, claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('nexus-') && key !== SHELL_CACHE && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Listen for skipWaiting message from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch: route requests to the appropriate caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip: non-GET, API calls, Socket.IO, external URLs, source maps
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/socket.io/')) return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('.map')) return;

  // Navigation requests & shell files: network-first
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('fonts.css')) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // Hashed static assets (JS, CSS, fonts, icons, WASM): cache-first
  if (
    url.pathname.startsWith('/static/') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.svg')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
});

// Network-first: try network, fall back to cache.
// For navigation failures, serve cached index.html (SPA fallback).
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // SPA fallback: serve cached index.html for any failed navigation
    if (request.mode === 'navigate') {
      const shell = await caches.match('./');
      if (shell) return shell;
    }

    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Cache-first: serve from cache if available, otherwise fetch and cache.
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}
