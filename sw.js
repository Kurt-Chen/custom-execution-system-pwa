/* bump 时请同步修改 index.html 内 APP_CACHE_NAME_FOR_BADGE */
const CACHE_NAME = "exec-system-pwa-v20260924j";
const APP_SHELL = [
  "./",
  "./index.html",
  "./index - 2026.3.31.html",
  "./manifest.webmanifest",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
  "./icons/forge-heaven-hell.png",
  "./icons/silva-mind-control-7-practices.png",
  "./icons/psycho-cybernetics-core-practices.png",
  "./icons/psycho-cybernetics-core-practices-full.png",
  "./icons/done-focus-badge.png"
];

self.addEventListener("install", (event) => {
  /* 单项 precache：避免 addAll 因某一资源失败导致整次 install 失败、手机永远装不上新 SW */
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return Promise.all(
          APP_SHELL.map(function (url) {
            return cache.add(url).catch(function (err) {
              console.warn("[sw] precache skip", url, err);
            });
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE_NAME;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* sw.js 永不进 Cache Storage，避免手机端长期命中旧脚本、装不上新版本 */
  if (/\/sw\.js$/i.test(url.pathname)) {
    event.respondWith(fetch(new Request(req, { cache: "reload" })));
    return;
  }

  /** HTML / 导航请求绕过 HTTP 缓存，避免线上长期看到旧版 index */
  const isHtmlShell =
    req.mode === "navigate" ||
    req.destination === "document" ||
    url.pathname === "/" ||
    url.pathname.endsWith("/") ||
    /\/index\.html$/i.test(url.pathname);
  const netReq = isHtmlShell ? new Request(req, { cache: "reload" }) : req;

  event.respondWith(
    fetch(netReq)
      .then((res) => {
        const cloned = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, cloned));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "SKIP_WAITING") return;
  self.skipWaiting();
});
