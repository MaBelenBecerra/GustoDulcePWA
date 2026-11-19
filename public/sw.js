










const VERSION = 'gustodulce-v1';
const PRECARGA = ['/', '/manifest.webmanifest', '/iconos/icono-192.png', '/iconos/icono-512.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECARGA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    evento.respondWith(
      fetch(request)
        .then((r) => {
          const copia = r.clone();
          caches.open(VERSION).then((c) => c.put('/', copia));
          return r;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  evento.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const guardada = await cache.match(request);
      const red = fetch(request)
        .then((r) => {
          if (r.ok) cache.put(request, r.clone());
          return r;
        })
        .catch(() => guardada);
      return guardada ?? red;
    }),
  );
});
