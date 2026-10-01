// POS KeyFácil - Service Worker (modo offline)
const CACHE = 'pos-keyfacil-v1';
const APP_SHELL = ['/', '/login', '/static/css/style.css', '/static/js/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // API: network first, no cache (los datos siempre van al servidor cuando hay red)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(request).catch(() =>
      new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Navegación / HTML: network first, fallback a caché
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/login') {
    e.respondWith(fetch(request).then((r) => {
      const clone = r.clone();
      caches.open(CACHE).then((c) => c.put(request, clone));
      return r;
    }).catch(() => caches.match(request).then((r) => r || caches.match('/'))));
    return;
  }

  // Recursos estáticos (CSS/JS/imágenes): cache first, luego red
  e.respondWith(caches.match(request).then((r) => r || fetch(request).then((resp) => {
    if (resp && resp.status === 200) {
      const clone = resp.clone();
      caches.open(CACHE).then((c) => c.put(request, clone));
    }
    return resp;
  }).catch(() => r)));
});
