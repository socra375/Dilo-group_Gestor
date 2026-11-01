// Service worker: la app abre sin internet.
// - Archivos propios: se sirven desde caché y se actualizan en segundo plano (la versión nueva llega en la siguiente apertura).
// - Fuentes de Google: caché en tiempo de ejecución.
// Al publicar cambios, sube VERSION para limpiar cachés viejas. tests/sw.test.js verifica que ARCHIVOS esté completo.
const VERSION = 'v7';
const CACHE = `ct-app-${VERSION}`;
const CACHE_FUENTES = 'ct-fuentes';

const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './src/app.js',
  './src/config.js',
  './src/core/agregados.js',
  './src/core/avisos.js',
  './src/core/crud.js',
  './src/core/esquemas.js',
  './src/core/form.js',
  './src/core/format.js',
  './src/core/fotos.js',
  './src/core/grafica.js',
  './src/core/prefs.js',
  './src/core/router.js',
  './src/core/share.js',
  './src/core/time.js',
  './src/core/ui.js',
  './src/data/seed.js',
  './src/data/store.js',
  './src/modules/ajustes.js',
  './src/modules/choferes.js',
  './src/modules/combustible.js',
  './src/modules/inicio.js',
  './src/modules/mas.js',
  './src/modules/reportes.js',
  './src/modules/rutas.js',
  './src/modules/vehiculos.js',
  './src/modules/viajes.js',
  './src/styles/animations.css',
  './src/styles/base.css',
  './src/styles/components.css',
  './src/styles/tokens.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('ct-app-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheYRed(req, nombreCache, clave = req) {
  const cache = await caches.open(nombreCache);
  const guardado = await cache.match(clave, { ignoreSearch: true });
  const red = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(clave, res.clone());
      return res;
    })
    .catch(() => guardado);
  return guardado || red;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // Navegación: cualquier ruta del sitio abre index.html (las pantallas van en el hash).
    if (req.mode === 'navigate') e.respondWith(cacheYRed(req, CACHE, new URL('./index.html', self.location).href));
    else e.respondWith(cacheYRed(req, CACHE));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheYRed(req, CACHE_FUENTES));
  }
});
