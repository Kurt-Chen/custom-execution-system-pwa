/**
 * 周最低 → 囚徒跳转：不得临时揭开导致多式同显；只显示当前在练式。
 * 运行：node _test_forge_wm_jump_cc_step.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8774;
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function extractCcJumpBranch() {
  const start = html.indexOf('if (target.kind === "cc")');
  assert.ok(start > 0, "cc jump branch missing");
  const forge = html.indexOf('if (target.kind === "forge")', start + 1);
  assert.ok(forge > start, "forge branch after cc missing");
  return html.slice(start, forge);
}

const ccBranch = extractCcJumpBranch();
assert.ok(
  ccBranch.includes("syncForgeCcProgressUi") || ccBranch.includes("applyForgeCcStepVisibility"),
  "cc jump must re-apply step visibility"
);
assert.ok(ccBranch.includes("ccProgressStep"), "cc jump must align selected step");
assert.equal(
  /removeAttribute\(["']hidden["']\)/.test(ccBranch),
  false,
  "cc jump must NOT temporarily removeAttribute(hidden)"
);
assert.ok(/exec-system-pwa-v20261014z[i-j]/.test(html), "cache zi/zj");

function contentType(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".webmanifest")) return "application/manifest+json";
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
    localStorage.setItem("todo-app-password-v1", "test-cc-jump");
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

await page.waitForFunction(function () {
  return typeof jumpFromForgeWeeklyMinRow === "function" && typeof syncForgeCcProgressUi === "function";
}, { timeout: 45000 });

const report = await page.evaluate(function () {
  const out = { ok: true, cases: [] };
  function note(name, pass, detail) {
    out.cases.push({ name: name, pass: !!pass, detail: detail || "" });
    if (!pass) out.ok = false;
  }

  if (typeof setPrimaryModuleFocus === "function") setPrimaryModuleFocus("forge");
  if (typeof activateForgeMainSubTab === "function") activateForgeMainSubTab("forge-body");
  if (typeof selectForgeBodyTab === "function") selectForgeBodyTab("cc", { persist: false });

  ensureForgeCcProgressState();
  state.forge.ccProgressStep.leg = "1";
  syncForgeCcProgressUi();

  const details = document.querySelector(
    '#forgeModule details.forge-cc-art-details[data-forge-cc-art="leg"]'
  );
  if (details) details.open = true;

  function visibleSteps() {
    const d = document.querySelector(
      '#forgeModule details.forge-cc-art-details[data-forge-cc-art="leg"]'
    );
    if (!d) return [];
    return Array.from(d.querySelectorAll(".forge-cc-art-steps .forge-task-row[data-forge-cc-step]"))
      .filter(function (r) {
        return !r.hasAttribute("hidden");
      })
      .map(function (r) {
        return r.getAttribute("data-forge-cc-step");
      });
  }

  note("before-only-1", JSON.stringify(visibleSteps()) === JSON.stringify(["1"]), JSON.stringify(visibleSteps()));

  /* 模拟旧 bug：临时揭开第2式 */
  const row2 = details && details.querySelector('.forge-task-row[data-forge-cc-step="2"]');
  if (row2) row2.removeAttribute("hidden");
  note("precondition-both", visibleSteps().length >= 2, JSON.stringify(visibleSteps()));

  jumpFromForgeWeeklyMinRow({
    realm: "body",
    label: "平卧抬膝",
    source: { kind: "cc", art: "leg", step: 2, text: "囚徒健身 · 举腿" }
  });

  note("after-jump-only-2", JSON.stringify(visibleSteps()) === JSON.stringify(["2"]), JSON.stringify(visibleSteps()));
  note(
    "select-is-2",
    String(state.forge.ccProgressStep.leg) === "2",
    String(state.forge.ccProgressStep.leg)
  );

  const sel = details && details.querySelector('select[data-forge-cc-art-std="leg"]');
  note("dropdown-2", !!(sel && sel.value === "2"), sel ? sel.value : "no-sel");

  jumpFromForgeWeeklyMinRow({
    realm: "body",
    label: "坐姿屈膝",
    source: { kind: "cc", art: "leg", step: 1, text: "囚徒健身 · 举腿" }
  });
  note("jump-back-only-1", JSON.stringify(visibleSteps()) === JSON.stringify(["1"]), JSON.stringify(visibleSteps()));

  return out;
});

await browser.close();
server.close();

if (!report.ok) {
  console.error("FAIL", JSON.stringify(report.cases, null, 2));
  process.exit(1);
}
console.log("PASS: forge wm jump cc step visibility");
console.log(JSON.stringify(report.cases, null, 2));
