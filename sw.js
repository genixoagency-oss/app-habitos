// sw.js — service worker. Lo justo para que la app abra sin conexión.
//
// Estrategia: "red primero con caída a caché". La app es pequeña y cambia a
// menudo mientras se construye; servir caché primero haría que se quedara
// atascada en una versión vieja. Si no hay red, se sirve lo guardado.

const CACHE = 'hoy-v1';

const RECURSOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/modelo.js',
  './js/repeticion.js',
  './js/progreso.js',
  './js/db.js',
  './js/dom.js',
  './js/estado.js',
  './js/iconos.js',
  './js/editor.js',
  './js/resumen.js',
  './js/vista-hoy.js',
  './js/vista-habitos.js',
  './js/ajustes.js',
  './icono-180.png',
  './icono-192.png',
  './icono-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(RECURSOS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;

  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE).then((cache) => cache.put(peticion, copia)).catch(() => {});
        return respuesta;
      })
      .catch(() => caches.match(peticion).then((guardada) => guardada ?? caches.match('./index.html'))),
  );
});
