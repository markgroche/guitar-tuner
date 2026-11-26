const CACHE_PREFIX = "portfolio-guitar-tuner-";
const CACHE_NAME = CACHE_PREFIX + "v2-audio.2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./tuner.js",
  "./tuning-data.js",
  "./pitch-core.js",
  "./pitch-tracker.js",
  "./pitch-detector.js",
  "./pitch-worker.js",
  "./tone-player.js",
  "./vendor/pitchy.js",
  "./manifest.json",
  "./sample-manifest.json",
  "./CREDITS.txt",
  "./sample-calibration.json",
  "./vendor/pitchy-LICENSE.txt",
  "./vendor/fft-LICENSE.txt",
  "./samples/UPSTREAM-LICENSE.txt",
  "./samples/sample-source-info.txt",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const base = self.registration.scope,
        cache = await caches.open(CACHE_NAME);
      const response = await fetch(new URL("./sample-manifest.json", base));
      if (!response.ok) throw new Error("Sound manifest unavailable");
      const manifest = await response.json();
      const samples = Object.values(manifest.banks)
        .flat()
        .map((sample) => sample.file);
      await cache.addAll(
        [...ASSETS, ...samples].map((path) => new URL(path, base).href),
      );
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    !event.request.url.startsWith(self.registration.scope)
  )
    return;
  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.match(event.request))
      .then((cached) => cached || fetch(event.request)),
  );
});
