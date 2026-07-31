// Service Worker — cachea el "cascarón" de la app (HTML/CSS/JS/íconos) para que
// funcione incluso si el celular se queda sin señal DESPUÉS de haberla abierto
// una vez con conexión. Nunca cachea llamadas a GitHub (esas siempre van a la red).
//
// IMPORTANTE: subí el número de CACHE_NAME cada vez que cambien estos archivos,
// para que los celulares descarten la versión vieja en vez de quedarse pegados.
const CACHE_NAME = 'camino-lujan-v2';

const ARCHIVOS_CASCARON = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/styles.css',
  './assets/css/dark.css',
  './assets/js/app.js',
  './assets/js/ui.js',
  './assets/js/storage.js',
  './assets/js/utils.js',
  './assets/js/camera.js',
  './assets/js/vendor/jsqr.js',
  './assets/js/vendor/qrcode.js',
  './assets/js/vendor/xlsx.js',
  './modules/registro.js',
  './modules/scanner.js',
  './modules/estadisticas.js',
  './modules/mochilas.js',
  './modules/github.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_CASCARON)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // nunca interceptar llamadas cruzadas (GitHub API, imágenes raw, etc.):
  // esas siempre tienen que ir a la red para traer datos actualizados.
  if(url.origin !== self.location.origin){
    return;
  }
  // solo cachear GET
  if(event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((respuestaRed) => {
        if(respuestaRed && respuestaRed.status === 200){
          const copia = respuestaRed.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        }
        return respuestaRed;
      }).catch(() => cached); // sin conexión: usamos lo cacheado si existe
      return cached || fetchPromise;
    })
  );
});
