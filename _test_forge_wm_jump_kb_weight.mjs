/**
 * 周最低 → Forge 壶铃跳转：不得临时 unhide 导致双重量卡同显；
 * 卡片显隐必须与当前在练重量一致。
 * 运行：node _test_forge_wm_jump_kb_weight.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8771;
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/** 从 jumpFromForgeWeeklyMinRow 中截取 kb 分支源码 */
function extractKbJumpBranch() {
  const start = html.indexOf('if (target.kind === "kb")');
  assert.ok(start > 0, "kb jump branch missing");
  const cc = html.indexOf('if (target.kind === "cc")', start + 1);
  assert.ok(cc > start, "cc branch after kb missing");
  return html.slice(start, cc);
}

const kbBranch = extractKbJumpBranch();
assert.ok(
  kbBranch.includes("syncForgeKbWeightUi") || kbBranch.includes("applyForgeKbWeightVisibility"),
  "kb jump must re-apply weight visibility"
);
assert.ok(
  kbBranch.includes("kbWeightKg"),
  "kb jump must align selected weight before show"
);
assert.equal(
  /removeAttribute\(["']hidden["']\)/.test(kbBranch),
  false,
  "kb jump must NOT temporarily removeAttribute(hidden)"
);
assert.ok(
  /exec-system-pwa-v20261014z[d-j]/.test(html),
  "cache badge should bump with fix"
);

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".webmanifest")) return "application/manifest+json";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

const server = http.createServer(function (req, res) {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.join(ROOT, urlPath.replace(/^\//, ""));
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise(function (resolve) {
  server.listen(PORT, "127.0.0.1", resolve);
});

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,900"]
});

const page = await browser.newPage();
page.setDefaultTimeout(45000);
await page.setViewport({ width: 1280, height: 900 });
await page.evaluateOnNewDocument(function () {
  try {
    localStorage.setItem("todo-app-password-v1", "test-kb-jump");
    localStorage.setItem("todo-app-auth-trust-device-v1", "1");
    sessionStorage.removeItem("todo-app-auth-session-lock-v1");
  } catch (_e) {}
});

await page.goto("http://127.0.0.1:" + PORT + "/index.html", {
  waitUntil: "domcontentloaded",
  timeout: 90000
});

await page.waitForFunction(function () {
  const gate = document.getElementById("loginGate");
  return !gate || gate.classList.contains("hidden") || gate.style.display === "none" || !gate.offsetParent;
}, { timeout: 20000 }).catch(function () {});

await page.waitForSelector("#forgeModule", { timeout: 45000 });

/** 打开 Forge → Body → 壶铃 → 深蹲 details */
await page.evaluate(function () {
  const forgeBtn = document.querySelector(
    '#primaryModuleBottomNav button[data-module-key="forge"]'
  );
  if (forgeBtn) forgeBtn.click();
  const bodyTab = document.querySelector(
    '#forgeModule .forge-main-tab-btn[data-module-sub-tab="forge-body"], #moduleSubTabBtn-forge-body'
  );
  if (bodyTab) bodyTab.click();
  const kbTab = document.querySelector('#forgeModule .forge-body-tab[data-forge-body-tab="kb"]');
  if (kbTab) kbTab.click();
  const squat = document.querySelector(
    '#forgeModule details.forge-kb-art-details[data-forge-kb-art="squat"]'
  );
  if (squat) squat.open = true;
});

await page.waitForSelector(
  '#forgeModule details.forge-kb-art-details[data-forge-kb-art="squat"] select[data-forge-kb-std="squat"]',
  { timeout: 15000 }
);

async function setSquatKg(kg) {
  await page.evaluate(function (want) {
    const sel = document.querySelector(
      '#forgeModule details.forge-kb-art-details[data-forge-kb-art="squat"] select[data-forge-kb-std="squat"]'
    );
    if (!sel) throw new Error("squat weight select missing");
    sel.value = want;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }, kg);
}

async function visibleSquatCards() {
  return page.evaluate(function () {
    const details = document.querySelector(
      '#forgeModule details.forge-kb-art-details[data-forge-kb-art="squat"]'
    );
    const rows = Array.from(
      details.querySelectorAll(".forge-kb-art-weights .forge-kb-task-row[data-forge-kb]")
    );
    return rows
      .filter(function (r) {
        return !r.hasAttribute("hidden");
      })
      .map(function (r) {
        return r.getAttribute("data-forge-kb");
      });
  });
}

await setSquatKg("24");
assert.deepEqual(await visibleSquatCards(), ["squat24"], "manual 24kg → only squat24");

await setSquatKg("16");
assert.deepEqual(await visibleSquatCards(), ["squat16"], "manual 16kg → only squat16");

/** 模拟旧跳转临时 unhide：应能被再次统一显隐纠正 */
await page.evaluate(function () {
  const row16 = document.querySelector('#forgeModule .forge-task-row[data-forge-kb="squat16"]');
  const row24 = document.querySelector('#forgeModule .forge-task-row[data-forge-kb="squat24"]');
  if (row16) row16.removeAttribute("hidden");
  if (row24) row24.removeAttribute("hidden");
});
assert.equal((await visibleSquatCards()).length, 2, "precondition: both unhidden");

/** 再走一次在练重量 change → syncForgeKbWeightUi，应只留选中重量 */
await setSquatKg("24");
assert.deepEqual(await visibleSquatCards(), ["squat24"], "after resync 24kg → only squat24");

/**
 * 模拟跳转对齐：先选 16，再把在练切到 24 并 sync（与 jump 内 kbWeightKg+sync 等价），
 * 确认不会留下双卡。
 */
await setSquatKg("16");
await page.evaluate(function () {
  const row24 = document.querySelector('#forgeModule .forge-task-row[data-forge-kb="squat24"]');
  if (row24) row24.removeAttribute("hidden");
});
assert.ok((await visibleSquatCards()).includes("squat16"));
assert.ok((await visibleSquatCards()).includes("squat24"));
await setSquatKg("24");
assert.deepEqual(
  await visibleSquatCards(),
  ["squat24"],
  "jump-equivalent weight align → only squat24"
);

await setSquatKg("16");
assert.deepEqual(await visibleSquatCards(), ["squat16"], "switch back → only squat16");

await browser.close();
server.close();
console.log("PASS: forge wm jump kb weight visibility");
