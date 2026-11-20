const STATIC_CACHE = "wms-static-v60";
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

// Do not reload open operational forms when an updated shell activates.
self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    const current = await caches.open(STATIC_CACHE);
    // Retain the last offline shell if the new shell was not successfully cached.
    const shellReady = Boolean(await current.match("/index.html"));
    const keys = await caches.keys();
    await Promise.all(keys.map(function (key) {
      if (key === STATIC_CACHE || key === RUNTIME_CACHE) return undefined;
      if (!key.startsWith("wms-static-") && !key.startsWith("wms-runtime-")) return undefined;
      if (!shellReady && key.startsWith("wms-static-")) return undefined;
      return caches.delete(key);
    }));
    await self.clients.claim();
  })());
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
        .then(async function (response) {
          if (!response || !response.ok) {
            return (await caches.match("/")) || (await caches.match("/index.html")) || response;
          }
          const copy = response.clone();
          caches.open(STATIC_CACHE).then(function (cache) { return cache.put("/", copy); }).catch(function () {});
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
