// Service Worker — cachea el "cascarón" de la app (HTML/CSS/JS/íconos) para que
// funcione incluso si el celular se queda sin señal DESPUÉS de haberla abierto
// una vez con conexión. Nunca cachea llamadas a GitHub (esas siempre van a la red).
//
// Estrategia: RED PRIMERO, caché como respaldo. Así, cuando el celular tiene
// conexión, siempre usa la versión más nueva que hayas subido — el caché solo
// entra en juego si en ese momento no hay señal. (La estrategia opuesta,
// "caché primero", puede dejar celulares pegados en una versión vieja durante
// días aunque haya conexión, que es justo lo que no queremos mientras se sigue
// mejorando la app.)
//
// IMPORTANTE: subí el número de CACHE_NAME cada vez que cambien estos archivos,
// para que los celulares descarten la versión vieja en vez de quedarse pegados.
const CACHE_NAME = 'camino-lujan-v7';

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
    fetch(event.request).then((respuestaRed) => {
      if(respuestaRed && respuestaRed.status === 200){
        const copia = respuestaRed.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
      }
      return respuestaRed;
    }).catch(() => caches.match(event.request)) // sin conexión de verdad: recién ahí usamos lo cacheado
  );
});

