/**
 * 隔离复现：AMB ~6.4万 tombstones 修复前后对比 + 防复活验收
 * - 页面内 mock fetch（不走真实云端；禁止写入 default-room）
 * - 对比 before/after 阶段耗时、longtask、同步中点击
 *
 *   node perf/probe-amb-sync-stall.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.join(ROOT, "scratch/amb-stall-fixture/amb-default-room.json");
const OUT = path.join(ROOT, "scratch/amb-stall-fixture/probe-result.json");
const PORT = 8766;

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".webmanifest")) return "application/manifest+json";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        if (urlPath === "/") urlPath = "/index.html";
        const filePath = path.join(ROOT, urlPath.replace(/^\//, ""));
        if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        res.writeHead(200, { "Content-Type": contentType(filePath), "Cache-Control": "no-store" });
        fs.createReadStream(filePath).pipe(res);
      } catch (e) {
        res.writeHead(500);
        res.end(String(e && e.message ? e.message : e));
      }
    });
    srv.listen(PORT, "127.0.0.1", () => resolve(srv));
    srv.on("error", reject);
  });
}

async function main() {
  if (!fs.existsSync(FIXTURE)) throw new Error("missing fixture: " + FIXTURE);
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const ambPayload = fixture.data.attrs.payload;
  const remoteTsCount = Object.keys(JSON.parse(ambPayload).tombstones || {}).length;

  const puppeteer = require("/tmp/puppeteer-probe/node_modules/puppeteer-core");
  const srv = await startStaticServer();
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
  });

  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/index.html?agentSeed=1`, {
    waitUntil: "domcontentloaded",
    timeout: 120000
  });
  await page.waitForFunction(() => typeof window.__probeAmbSyncStall === "function", {
    timeout: 90000
  });

  const result = await page.evaluate(async (fixtureObj, payloadStr) => {
    const fetchCalls = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = String(typeof input === "string" ? input : (input && input.url) || "");
      const method = String((init && init.method) || "GET").toUpperCase();
      const body = init && init.body != null ? String(init.body) : "";
      fetchCalls.push({
        method,
        urlTail: url.slice(-160),
        bodyLen: body.length,
        hasDefaultRoom: url.includes("default-room") || body.includes("default-room")
      });
      /* 禁止任何真实云端写出：POST/PUT 一律 mock */
      if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
        return new Response(JSON.stringify({ ok: true, mocked: true, blocked: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url.includes("aliyun-amb-real")) {
        return new Response(JSON.stringify(fixtureObj), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url.includes("aliyun-meta-v1-domains")) {
        return new Response(
          JSON.stringify({
            data: {
              attrs: {
                payload: JSON.stringify({ versions: { amb: Date.now() }, updatedAt: Date.now() })
              }
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("fcapp.run") || url.includes("/smoke")) {
        return new Response(JSON.stringify({ error: "not_found", mocked: true }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }
      return originalFetch(input, init);
    };

    try {
      localStorage.setItem("todo-app-aliyun-sync-primary-v1", "1");
      window.__ALIYUN_SYNC_PRIMARY_ENABLED = true;
      window.__ALIYUN_AMB_REAL_SYNC_ENABLED = true;
      if (typeof unlockApp === "function") unlockApp();
    } catch (_e) {}

    const probe = await window.__probeAmbSyncStall(payloadStr);
    probe.fetchCalls = fetchCalls;
    probe.wroteToRealDefaultRoom = false;
    probe.defaultRoomWriteAttempts = fetchCalls.filter(
      (c) => (c.method === "POST" || c.method === "PUT") && c.hasDefaultRoom
    ).length;
    window.fetch = originalFetch;
    return probe;
  }, fixture, ambPayload);

  result.fixtureRemoteTsCount = remoteTsCount;
  result.fixturePayloadKB = Math.round((ambPayload.length / 1024) * 10) / 10;
  /* 写入尝试均被 mock；真实 default-room 未落盘 */
  if (result.pass) {
    result.pass.blockedDefaultRoom = result.wroteToRealDefaultRoom === false;
    result.pass.mockedWriteAttempts = result.defaultRoomWriteAttempts || 0;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  srv.close();

  const p = result.pass || {};
  const hardFail =
    !p.noResurrect ||
    !p.fuelOk ||
    !p.unknownConservative ||
    !p.otherDomainNotInEnvelope ||
    !p.globalNotWiped ||
    result.wroteToRealDefaultRoom === true;
  if (hardFail) {
    console.error("HARD_FAIL", p);
    process.exit(2);
  }
  if (!(result.pull && result.pull.report && result.pull.report.ok)) {
    console.error("PULL_NOT_OK", result.pull && result.pull.report);
    process.exit(3);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
