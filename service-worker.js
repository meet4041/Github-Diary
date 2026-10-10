const CACHE_NAME = "github-diary-v1";
const APP_SHELL = ["./", "./index.html", "./repo.html", "./styles.css", "./script.js", "./repo-page.js", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("fetch", (event) => {
  if (event.request.url.includes("api.github.com")) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
