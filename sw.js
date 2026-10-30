// Service worker «ЭлектроПлан»: офлайн-запуск и кэширование оболочки.
// Стратегия network-first: при наличии сети всегда отдаются свежие файлы,
// без сети — последняя сохранённая копия. Так обновления не «залипают».

const CACHE_PREFIX = "electroplan-";
const CACHE_NAME = `${CACHE_PREFIX}v1.0.1`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/model.js",
  "./js/geometry.js",
  "./js/calc.js",
  "./js/store.js",
  "./js/storage.js",
  "./js/editor.js",
  "./js/render.js",
  "./js/ui.js",
  "./js/summary.js",
  "./js/report.js",
  "./js/icons.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request, fallbackUrl = null) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // no-store: не отдавать устаревшие CSS/JS из HTTP-кэша браузера.
    // Свежая копия всегда кладётся в Cache Storage для офлайн-работы.
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response(
      "<!doctype html><html lang=\"ru\"><meta charset=\"utf-8\"><title>ЭлектроПлан</title><body style=\"font-family:system-ui;padding:40px;text-align:center;color:#334155\"><h1>Нет соединения</h1><p>Откройте приложение при подключённой сети, чтобы сохранить его для офлайн-работы.</p></body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigation") {
    event.respondWith(networkFirst(request, "./index.html"));
    return;
  }

  event.respondWith(networkFirst(request));
});
