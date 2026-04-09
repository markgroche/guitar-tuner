// sw.js — Cache-first service worker for offline use
const CACHE_NAME = 'guitar-tuner-v12';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './tuner.js',
  './pitch-detector.js',
  './pitch-worker.js',
  './tone-player.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './samples/E2.mp3',
  './samples/A2.mp3',
  './samples/D3.mp3',
  './samples/G3.mp3',
  './samples/B3.mp3',
  './samples/E4.mp3',
].map(path => new URL(path, self.registration.scope).toString());

// Install: pre-cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first strategy
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
