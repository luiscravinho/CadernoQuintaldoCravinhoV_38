/* Quintal do Cravinho — offline e atualizações PWA v1.0.38 */
const CACHE_PREFIX = 'qc-bio-shell-';
const CACHE_VERSION = 'v1.0.38';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const ROOT = new URL('./', self.registration.scope);
const PAGE_URL = new URL('index.html', ROOT).href;
const APP_URL = new URL('app.js', ROOT).href;
const MANIFEST_URL = new URL('manifest.webmanifest', ROOT).href;
const REQUIRED = [PAGE_URL, APP_URL, MANIFEST_URL,
  new URL('icon-192.png', ROOT).href,
  new URL('icon-512.png', ROOT).href,
  new URL('logo_quintal.png', ROOT).href,
  new URL('ajudas-avelino-pragas.webp', ROOT).href,
  new URL('ajudas-avelino-compostagem.webp', ROOT).href];


// Biblioteca ilustrada Ajudas Avelino: cache no primeiro acesso (best-effort).
// Não impede a instalação caso falhe alguma imagem auxiliar.
const REFERENCE_ASSETS = Array.from({length:20},(_,i)=>
  new URL(`ajudas-avelino-${String(i+1).padStart(2,'0')}.webp`,ROOT).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(REQUIRED);
    await Promise.allSettled(REFERENCE_ASSETS.map(url=>cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Elimina apenas versões antigas deste caderno; nunca caches de outras aplicações.
    await Promise.all(keys.filter(k =>
      (k.startsWith(CACHE_PREFIX) || k.startsWith('caderno-qc-pwa-v')) && k !== CACHE_NAME
    ).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallback) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    return (await cache.match(request)) || (fallback ? await cache.match(fallback) : null)
      || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(ROOT.href)) return;
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, PAGE_URL));
    return;
  }
  if ([PAGE_URL, APP_URL, MANIFEST_URL].includes(url.href)) {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const response = await fetch(req);
      if (response.ok) await cache.put(req, response.clone());
      return response;
    } catch (err) {
      return Response.error();
    }
  })());
});
