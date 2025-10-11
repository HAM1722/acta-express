const CACHE = 'acta-express-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './dashboard.html',
  './dashboard.js',
  './styles.css',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

// CDNs se cachean bajo demanda
const CDN_URLS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/signature_pad@4.2.0/dist/signature_pad.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(
    caches.open(CACHE).then(c => {
      // Cachear assets locales primero
      return c.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.map(k => k !== CACHE && caches.delete(k)))
    )
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (e)=>{
  const url = e.request.url;
  
  // Cache-first para assets locales
  if(url.includes(self.location.origin)){
    e.respondWith(
      caches.match(e.request).then(res => 
        res || fetch(e.request).then(fetchRes => {
          return caches.open(CACHE).then(cache => {
            cache.put(e.request, fetchRes.clone());
            return fetchRes;
          });
        }).catch(() => caches.match('./index.html'))
      )
    );
  }
  // Network-first para CDNs
  else {
    e.respondWith(
      fetch(e.request).then(fetchRes => {
        return caches.open(CACHE).then(cache => {
          cache.put(e.request, fetchRes.clone());
          return fetchRes;
        });
      }).catch(() => caches.match(e.request))
    );
  }
});

