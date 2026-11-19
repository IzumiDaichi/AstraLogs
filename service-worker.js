const CACHE_NAME = "astralogs-shell-v7";
const SUPABASE_CLIENT_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
const APP_SHELL = [
  "./index.html",
  "./ios-install.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./css/install-guide.css",
  "./js/supabase-config.js",
  "./js/helpers.js",
  "./js/state.js",
  "./js/offline.js",
  "./js/backend.js",
  "./js/setup.js",
  "./js/people.js",
  "./js/report_templates.js",
  "./js/ai_reports.js",
  "./js/report.js",
  "./js/time_records.js",
  "./js/dashboard.js",
  "./js/main.js",
  "./js/integrations.js",
  "./js/pwa.js",
  "./icons/astralogs.svg",
  "./icons/ios-safari.svg",
  "./icons/ios-share.svg",
  "./icons/ios-share-sheet.svg",
  "./icons/ios-add-screen.svg",
  "./icons/ios-home-screen.svg",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
      .then(function () {
        return caches.open(CACHE_NAME).then(function (cache) {
          return cache.add(SUPABASE_CLIENT_URL).catch(function (error) {
            console.error("Could not cache the Supabase browser library for offline use.", error);
          });
        });
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (cacheNames) {
        return Promise.all(cacheNames
          .filter(function (cacheName) {
            return cacheName.indexOf("astralogs-shell-") === 0 && cacheName !== CACHE_NAME;
          })
          .map(function (cacheName) { return caches.delete(cacheName); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var requestUrl = new URL(request.url);
  if (request.method !== "GET") return;

  if (requestUrl.href === SUPABASE_CLIENT_URL) {
    event.respondWith(
      caches.match(request).then(function (cachedResponse) {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then(function (response) {
          if (response.ok) {
            var responseCopy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
              return cache.put(request, responseCopy);
            }));
          }
          return response;
        });
      })
    );
    return;
  }

  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(function (response) {
        if (response.ok) {
          var responseCopy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
            return cache.put(request, responseCopy);
          }));
        }
        return response;
      }).catch(function () {
        return caches.match(request).then(function (cachedPage) {
          if (cachedPage) return cachedPage;
          return caches.match(new URL("./index.html", self.registration.scope).href)
            .then(function (appPage) { return appPage || Response.error(); });
        });
      })
    );
    return;
  }

  var isAppShellRequest = APP_SHELL.some(function (path) {
    return new URL(path, self.registration.scope).href === requestUrl.href;
  });
  if (!isAppShellRequest) return;

  event.respondWith(
    caches.match(request).then(function (cachedResponse) {
      return cachedResponse || fetch(request).then(function (response) {
        if (response.ok) {
          var responseCopy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
            return cache.put(request, responseCopy);
          }));
        }
        return response;
      });
    })
  );
});
