const CACHE_NAME = 'rv-admin-v1';

// Archivos a cachear para que funcionen offline
const PRECACHE_URLS = [
  '/login',
  '/admin',
  '/admin.html',
  '/admin.js',
  '/manifest.json'
];

// ── Instalación: precachear los archivos clave ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('[SW] Algunos archivos no se pudieron cachear:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activación: eliminar caches viejos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Network first, fallback a cache ──
self.addEventListener('fetch', event => {
  // Solo interceptar requests GET
  if (event.request.method !== 'GET') return;

  // No interceptar requests a APIs externas (Firebase, Cloudinary)
  const url = new URL(event.request.url);
  const isExternal =
    url.hostname.includes('firebase') ||
    url.hostname.includes('cloudinary') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('tailwindcss') ||
    url.hostname.includes('cdnjs') ||
    url.hostname.includes('fonts');

  if (isExternal) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Guardar copia fresca en cache
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Sin red: servir desde cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback: si piden /admin sin cache, intentar admin.html
          if (url.pathname.startsWith('/admin')) {
            return caches.match('/admin.html');
          }
          if (url.pathname.startsWith('/login')) {
            return caches.match('/login');
          }
        });
      })
  );
});