/* bump 时请同步修改 index.html 内 APP_CACHE_NAME_FOR_BADGE */
const CACHE_NAME = "exec-system-pwa-v20261126n";
/**
 * 导航/HTML：网络超时后回退「当前 CACHE_NAME」壳。
 * index.html ~8–9MB：7s 在弱网/GitHub Pages 上易超时，旧逻辑再经 caches.match 跨桶
 * 命中更旧壳 → 角标停在旧版、白屏修复 JS 不生效。超时放宽；回退禁止跨版本桶。
 */
const HTML_FETCH_TIMEOUT_MS = 45000;
/** 普通资源超时 */
const ASSET_FETCH_TIMEOUT_MS = 15000;
/** install 预缓存其余资源最多等这么久，超时仍 skipWaiting，避免新 SW 永远装不上 */
const PRECACHE_BUDGET_MS = 12000;

const APP_SHELL = [
  "./",
  "./index.html",
  "./index - 2026.3.31.html",
  "./manifest.webmanifest",
  "./fx-proto-gold-burst.html",
  "./icons/fx/_proto_gold_burst/gold-burst-canvas.js",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
  "./icons/forge-heaven-hell.png",
  "./icons/silva-mind-control-7-practices.png",
  "./icons/psycho-cybernetics-core-practices.png",
  "./icons/psycho-cybernetics-core-practices-full.png",
  "./icons/done-focus-badge.png",
  "./assets/obsession-reminder-card.png",
  "./assets/start-reminder-card.png",
  "./assets/problem-driven-life-reminder.png",
  "./assets/choose-hard-live-easy-reminder.jpg",
  "./assets/triple-package-success-drive-card.png",
  "./assets/tenx-seize-every-second-card.png",
  "./assets/present-alive-100-reminder-01.png",
  "./assets/attention-calibrate-card.png",
  "./assets/maniacal-urgency-card.png",
  "./assets/today-plan-win-banner.png",
  "./fonts/barlow-condensed-700-italic-latin.woff2",
  /*
   * MANIFESTO / RESULTS：仅预缓存 WebP（优先首图），去掉大体积 PNG 以免安卓安装预算内抢带宽。
   * PNG 仍保留在仓库作 fallback；首次命中后由 runtime cache 写入。
   */
  "./assets/hour-day-manifesto-card.webp",
  "./assets/results-isg-wormhole-card@2x-edsr-test.webp",
  "./assets/manifesto-genuine-desire-card.webp",
  "./assets/manifesto-life-winner-card.webp",
  "./assets/manifesto-maniacal-urgency-card.webp",
  "./assets/manifesto-focus-manage-card@2x-edsr-test.webp",
  "./assets/manifesto-carpe-momentum-card.webp",
  "./assets/manifesto-extreme-agency-card.webp",
  "./assets/manifesto-power-law-thinking-card.webp",
  "./assets/manifesto-money-solution-card.webp",
  "./assets/manifesto-money-freedom-card.webp",
  "./assets/results-oriented-learning-card.webp",
  "./assets/results-do-most-important-card.webp",
  "./assets/results-input-output-equation-card.webp",
  "./assets/results-power-law-path-card@2x-edsr-test.webp",
  "./assets/results-pathways-thinking-card@2x-edsr-test.webp",
  "./assets/results-extreme-agency-action-default-card.webp",
  "./assets/results-ship-then-polish-card.webp",
  "./assets/results-execution-rhythm-four-steps-card.webp",
  "./icons/fx/fx-power-fireworks.webp",
  "./icons/fx/fx-power-hearts.webp",
  "./icons/fx/fx-power-trophy.webp",
  "./icons/fx/fx-power-stars.webp",
  "./icons/fx/fx-power-done.webp",
  "./icons/fx/fx-power-ring.webp",
  "./icons/fx/fx-power-blossoms.webp",
  "./icons/fx/fx-power-burst.webp",
  "./icons/fx/fx-power-meteor.webp",
  "./icons/fx/fx-power-phoenix.webp",
  "./icons/fx/fx-power-galaxy.webp",
  "./icons/fx/fx-power-thunder.webp",
  "./icons/fx/fx-power-crystal.webp",
  "./icons/fx/fx-power-wings.webp",
  "./icons/fx/fx-power-prism.webp",
  "./icons/fx/fx-power-sigil.webp",
  "./icons/fx/fx-power-solar-flare.webp",
  "./icons/fx/fx-warning-minus1.webp",
  "./icons/fx/fx-warning-minus2.webp",
  "./icons/fx/fx-warning-minus10.webp"
];

function fetchWithTimeout(request, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () {
    try {
      ctrl.abort();
    } catch (_e) {}
  }, ms);
  return fetch(request, { signal: ctrl.signal }).finally(function () {
    clearTimeout(timer);
  });
}

function offlineShellResponse() {
  return new Response(
    "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>加载失败</title><body style=\"font-family:system-ui,sans-serif;padding:28px;line-height:1.55;background:#f4f6fb;color:#0f172a\"><h1 style=\"font-size:18px;margin:0 0 12px\">页面暂时无法加载</h1><p style=\"margin:0 0 10px\">网络超时或离线缓存未就绪。请打开 <a href=\"./recover.html\">recover.html</a> 清除卡住的缓存，或强制刷新后重试。</p><p style=\"color:#64748b;font-size:13px;margin:16px 0 0\">" +
      CACHE_NAME +
      "</p></body></html>",
    {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

/** 仅回退当前 CACHE_NAME 桶，避免超时后命中仍存活的旧版 exec-system-pwa-* 壳 */
function matchCachedShell(req) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(req).then(function (cached) {
      if (cached) return cached;
      return cache.match("./index.html").then(function (shell) {
        if (shell) return shell;
        return cache.match("./");
      });
    });
  });
}

/** 静态图片：cache-first，安卓弱网下避免每次展开都等网络 */
function isCacheFirstImageRequest(url) {
  if (/\.(?:woff2)$/i.test(url.pathname) && url.pathname.indexOf("/fonts/") !== -1) {
    return true;
  }
  if (!/\.(?:webp|png|jpe?g|gif|svg)$/i.test(url.pathname)) return false;
  return (
    url.pathname.indexOf("/assets/") !== -1 ||
    url.pathname.indexOf("/icons/") !== -1
  );
}

function putInCache(req, res) {
  if (!res || !(res.ok || res.type === "opaque")) return;
  const cloned = res.clone();
  caches.open(CACHE_NAME).then(function (cache) {
    cache.put(req, cloned);
  });
}

self.addEventListener("install", (event) => {
  /* 先缓存 index，其余预缓存有时间上限，避免安装阶段永久卡住 */
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache
          .add("./index.html")
          .catch(function (err) {
            console.warn("[sw] critical precache fail index.html", err);
          })
          .then(function () {
            const rest = Promise.all(
              APP_SHELL.map(function (url) {
                return cache.add(url).catch(function (err) {
                  console.warn("[sw] precache skip", url, err);
                });
              })
            );
            const budget = new Promise(function (resolve) {
              setTimeout(resolve, PRECACHE_BUDGET_MS);
            });
            return Promise.race([rest, budget]);
          });
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

  /* sw.js / recover 始终网络优先，并带超时，避免自救路径也一直转圈 */
  if (/\/sw\.js$/i.test(url.pathname) || /\/recover\.html$/i.test(url.pathname)) {
    event.respondWith(
      fetchWithTimeout(new Request(req, { cache: "reload" }), HTML_FETCH_TIMEOUT_MS).catch(
        function () {
          if (/\/recover\.html$/i.test(url.pathname)) {
            return offlineShellResponse();
          }
          return fetch(req);
        }
      )
    );
    return;
  }

  const isHtmlShell =
    req.mode === "navigate" ||
    req.destination === "document" ||
    url.pathname === "/" ||
    url.pathname.endsWith("/") ||
    /\/index\.html$/i.test(url.pathname);

  /* 静态图 cache-first：MANIFESTO/RESULTS WebP 二次打开与弱网安卓首屏友好；版本 bump 清旧缓存防回流 */
  if (!isHtmlShell && isCacheFirstImageRequest(url)) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        if (cached) return cached;
        return fetchWithTimeout(req, ASSET_FETCH_TIMEOUT_MS)
          .then(function (res) {
            putInCache(req, res);
            return res;
          })
          .catch(function () {
            return Response.error();
          });
      })
    );
    return;
  }

  const netReq = isHtmlShell ? new Request(req, { cache: "reload" }) : req;
  const timeoutMs = isHtmlShell ? HTML_FETCH_TIMEOUT_MS : ASSET_FETCH_TIMEOUT_MS;

  event.respondWith(
    fetchWithTimeout(netReq, timeoutMs)
      .then(function (res) {
        putInCache(req, res);
        return res;
      })
      .catch(function () {
        return matchCachedShell(req).then(function (cached) {
          if (cached) return cached;
          if (isHtmlShell) return offlineShellResponse();
          return Response.error();
        });
      })
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "SKIP_WAITING") return;
  self.skipWaiting();
});
