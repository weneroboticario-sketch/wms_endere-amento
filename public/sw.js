const STATIC_CACHE = "wms-static-v6";
const RUNTIME_CACHE = "wms-runtime-v6";
const STATIC_ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(function (cache) { return cache.addAll(STATIC_ASSETS); })
      .catch(function () { return undefined; })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(async function (keys) {
      const hadPreviousVersion = keys.some(function (key) {
        return (key.startsWith("wms-static-") || key.startsWith("wms-runtime-")) && key !== STATIC_CACHE && key !== RUNTIME_CACHE;
      });
      await Promise.all(keys.map(function (key) {
        if (key !== STATIC_CACHE && key !== RUNTIME_CACHE) return caches.delete(key);
        return undefined;
      }));
      await self.clients.claim();
      if (!hadPreviousVersion) return;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.all(windows.map(function (client) {
        return client.navigate(client.url).catch(function () { return undefined; });
      }));
    })
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname.endsWith(".supabase.co") || url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then(function (cache) { cache.put("/", copy); });
          return response;
        })
        .catch(function () { return caches.match("/") || caches.match("/index.html"); })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).then(function (response) {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        return caches.match(request);
      })
    );
    return;
  }

  if (url.hostname === "cdn.jsdelivr.net") {
    event.respondWith(
      caches.match(request).then(function (cached) {
        return fetch(request).then(function (response) {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        }).catch(function () { return cached; });
      })
    );
  }
});
