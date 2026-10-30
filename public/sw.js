/* Cache only this deployment's public shell, never conversations, recordings or API responses. */
const CACHE_VERSION = 'v1';
const APP_ROOT = new URL('./', self.location.href);
const BASE_PATH = APP_ROOT.pathname;
const CACHE_PREFIX = `speckyg-shell:${BASE_PATH}:`;
const CACHE = CACHE_PREFIX + CACHE_VERSION;
const SHELL_ASSETS = ['./', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL_ASSETS.map(asset => new URL(asset, APP_ROOT).href))));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key =>
    (key.startsWith(CACHE_PREFIX) && key !== CACHE) ||
    // Migrate the former root-only cache without deleting another project app's shell.
    (BASE_PATH === '/' && key.startsWith('speckyg-shell-'))
  ).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== APP_ROOT.origin || !url.pathname.startsWith(BASE_PATH)) return;
  const localPath = url.pathname.slice(BASE_PATH.length);
  if (localPath.startsWith('api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then(cache => cache.put(APP_ROOT.href, copy)); }
      return response;
    }).catch(() => caches.match(APP_ROOT.href)));
    return;
  }
  if (localPath.startsWith('assets/') || localPath.startsWith('models/') || localPath.startsWith('icons/') || localPath === 'icon.svg' || localPath === 'manifest.webmanifest') {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
      return response;
    })));
  }
});
