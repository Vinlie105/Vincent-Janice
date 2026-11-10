// sw.js: lets the site install as an app and open even with a weak connection.
// Network first, so every open picks up the newest files. The cache is only a fallback.
var CACHE = 'vj-shell-v1';
var SHELL = [
  './', 'index.html', 'config.js', 'questions.js', 'games.js', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Supabase, fonts and the CDN go straight to the network.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req.url, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req.url, { ignoreSearch: true })
          .then(function (hit) { return hit || caches.match('index.html'); });
      })
  );
});
