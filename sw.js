const CACHE_PREFIX = "guitar-tuner-pages-" + self.registration.scope + "-";
const CACHE_NAME = CACHE_PREFIX + "v2.0.0";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./acoustic-studio.css",
  "./acoustic-studio.css?build=vinyl-4",
  "./skin.js",
  "./skin.js?build=vinyl-4",
  "./assets/walnut-headstock-v1.webp",
  "./assets/vinyl-room-v2.webp",
  "./assets/studio-display.woff2",
  "./assets/studio-body.woff2",
  "./assets/OFL-bricolagegrotesque.txt",
  "./assets/OFL-dmsans.txt",
  "./tuner.js",
  "./tuner.js?build=vinyl-4",
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
            .filter((k) =>
              (k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME) ||
              k === "guitar-tuner-v12",
            )
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
      .then(async (cache) => {
        const cached = await cache.match(event.request);
        const url = new URL(event.request.url);
        const base = new URL(self.registration.scope);
        const isHome = url.pathname === base.pathname || url.pathname === base.pathname + "index.html";
        return cached || (event.request.mode === "navigate" && isHome
          ? cache.match(new URL("./index.html", base).href) : undefined);
      })
      .then((cached) => cached || fetch(event.request)),
  );
});
