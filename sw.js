// sw.js: lets the site install as an app and open even with a weak connection.
// Network first, so every open picks up the newest files. The cache is only a fallback.
var CACHE = 'vj-shell-v5';
var SHELL = [
  './', 'index.html', 'config.js', 'questions.js', 'games.js', 'app.js', 'manifest.webmanifest',
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

// Number on the app icon (Badging API). Works with the app closed, because it runs here in the push handler.
function setBadge(n) {
  try {
    var nav = self.navigator;
    if (n > 0 && nav && nav.setAppBadge) return Promise.resolve(nav.setAppBadge(n)).catch(function () {});
    if (nav && nav.clearAppBadge) return Promise.resolve(nav.clearAppBadge()).catch(function () {});
  } catch (e) { /* badges are a bonus, never break the notification */ }
  return Promise.resolve();
}

// Push notifications: show what the server sent, update the icon number, open the app when tapped.
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  var badge = (typeof data.badge === 'number' && data.badge >= 0) ? Math.floor(data.badge) : null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      var visible = list.filter(function (c) { return c.visibilityState === 'visible'; });
      var jobs = [self.registration.showNotification(data.title || 'Vincent & Janice', {
        body: data.body || '',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: data.tag || undefined,       // same tag = replaces the older one instead of stacking
        renotify: !!data.tag,
        data: { url: data.url || './' }
      })];
      if (visible.length) {
        // The app is open and being looked at: nothing is unread. Tell it to mark everything read.
        visible.forEach(function (c) { c.postMessage({ type: 'vj-read' }); });
        jobs.push(setBadge(0));
      } else if (badge !== null) {
        jobs.push(setBadge(badge));
      }
      return Promise.all(jobs);
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
