const STATIC_CACHE = "wms-static-v59";
const RUNTIME_CACHE = "wms-runtime-v24";
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

// Push is a notification only: delivery/read/ack receipts require authenticated client evidence.
self.addEventListener("push", function (event) {
  let payload;
  try { payload = event.data.json(); } catch { return; }
  if (!payload || !/^[a-f0-9-]{36}$/i.test(payload.conversation_id || "") || !/^[A-Z0-9_-]{1,30}$/.test(payload.warehouse || "") || !/^\d{1,20}$/.test(payload.message_id || "")) return;
  const target = new URL("/", self.location.origin);
  target.searchParams.set("comm", payload.conversation_id);
  target.searchParams.set("warehouse", payload.warehouse);
  event.waitUntil(self.registration.showNotification("WMS — Comunicação", {
    body: "Você recebeu uma nova mensagem.", icon: "/icon.svg", badge: "/icon.svg",
    tag: "wms-chat-" + payload.message_id, renotify: false, data: { url: target.href }
  }));
});
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  let target;
  try { target = new URL(event.notification.data.url); } catch { return; }
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async function (windows) {
    const existing = windows.find(client => new URL(client.url).origin === target.origin);
    if (existing) { await existing.navigate(target.href); return existing.focus(); }
    return self.clients.openWindow(target.href);
  }));
});
