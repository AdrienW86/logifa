/* Served with a deployment-specific version prefix; never cache private app data. */
const CACHE = "logifa-public-" + VERSION;
const PUBLIC = [
  "/pwa/offline.html",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/maskable-512.png",
  "/pwa/apple-touch-icon.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const path of PUBLIC) {
        const response = await fetch(path, {
          credentials: "omit",
          cache: "reload",
          redirect: "error",
        });
        if (!response.ok) throw Error("PUBLIC_ASSET_UNAVAILABLE");
        await cache.put(path, response);
      }
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("logifa-public-") && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    request.method !== "GET" ||
    request.headers.has("authorization")
  )
    return;
  if (PUBLIC.includes(url.pathname) && !url.search) {
    event.respondWith(
      (async () =>
        (await caches.open(CACHE))
          .match(url.pathname)
          .then((cached) => cached ?? fetch(request)))(),
    );
    return;
  }
  // Authentication, API, RSC, Next chunks, PDFs and all other fetches are untouched.
  if (
    url.pathname.startsWith("/sign-in") ||
    url.pathname === "/access-denied" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/")
  )
    return;
  if (request.mode === "navigate")
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (await caches.open(CACHE)).match("/pwa/offline.html");
        }
      })(),
    );
});
