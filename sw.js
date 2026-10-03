/* KULZZY CELEBRATION STUDIO - OFFLINE SERVICE WORKER */
const CACHE_NAME = "kulzzy-celebration-studio-v3";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

/* These are the MP4 export engines used by the Studio.
   They are cached during the first online installation/opening so the
   Studio can use them later when there is no Internet/data connection. */
const ENGINE_URLS = [
  "https://cdn.jsdelivr.net/npm/mediabunny@1.61.0/dist/bundles/mediabunny.min.cjs",
  "https://cdn.jsdelivr.net/npm/@mediabunny/aac-encoder@1.61.0/dist/bundles/mediabunny-aac-encoder.min.js",
  "https://cdn.jsdelivr.net/npm/mediabunny@1.61.0/+esm",
  "https://cdn.jsdelivr.net/npm/@mediabunny/aac-encoder@1.61.0/+esm"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    await Promise.all(APP_SHELL.map(async url => {
      try {
        const response = await fetch(url, {cache:"no-cache"});
        if (response.ok) await cache.put(url, response.clone());
      } catch (_) {}
    }));

    /* Cache each external engine independently. One unavailable CDN file
       must not prevent the entire PWA service worker from installing. */
    await Promise.all(ENGINE_URLS.map(async url => {
      try {
        const response = await fetch(url, {
          mode: "cors",
          cache: "no-cache"
        });
        if (response.ok) await cache.put(url, response.clone());
      } catch (_) {}
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = request.url;
  const isEngine = ENGINE_URLS.includes(url);
  const isSameOrigin = url.startsWith(self.location.origin);

  /* MP4 engines: cache-first. This is what allows the finalizer to work
     after the phone has lost Internet/data access. */
  if (isEngine) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (_) {
        return new Response("Offline export engine is not cached yet.", {
          status: 503,
          headers: {"Content-Type":"text/plain"}
        });
      }
    })());
    return;
  }

  if (isSameOrigin) {
    /* Navigation: network first for updates, cached index as the offline
       fallback. */
    if (request.mode === "navigate") {
      event.respondWith((async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          if (response.ok) await cache.put("./index.html", response.clone());
          return response;
        } catch (_) {
          return (await caches.match(request)) ||
                 (await caches.match("./index.html"));
        }
      })());
      return;
    }

    /* Local Studio files: cache first, then network. */
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        return new Response("Offline resource unavailable.", {status:404});
      }
    })());
  }
});
