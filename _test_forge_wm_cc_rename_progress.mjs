/**
 * 跪姿俯卧撑→膝盖俯卧撑：名称纠正 + 周最低进度吃到囚徒打卡量。
 * 运行：node _test_forge_wm_cc_rename_progress.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8773;
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

assert.ok(html.includes("normalizeForgeCcMinListNamesInState"), "always-on CC min rename");
assert.ok(/exec-system-pwa-v20261014z[h-j]/.test(html), "cache zh..zj");
assert.ok(html.includes("\\u200B-\\u200D\\uFEFF\\u00AD") || html.includes("200B"), "strip ZWSP in keys");
assert.ok(/第\s*\(\\d\+\)\s*式\s*\(\.\+\)/.test(html) || html.includes("式\\s*(.+)"), "optional space after 式");

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
    localStorage.setItem("todo-app-password-v1", "test-cc-rename");
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
  return typeof normalizeForgeCcMinListNamesInState === "function" && typeof renderForgeWeeklyMinRows === "function";
}, { timeout: 45000 });

const report = await page.evaluate(function () {
  const out = { ok: true, cases: [] };
  function note(name, pass, detail) {
    out.cases.push({ name: name, pass: !!pass, detail: detail || "" });
    if (!pass) out.ok = false;
  }

  const today =
    typeof formatDateInputValue === "function"
      ? formatDateInputValue(new Date())
      : new Date().toISOString().slice(0, 10);

  if (!state.forge || typeof state.forge !== "object") state.forge = {};
  state.forge.weeklyMinimums = [
    {
      id: "wm-kneel-test",
      realm: "body",
      label: "跪姿俯卧撑",
      weeklyMin: "100",
      unit: "reps",
      source: { kind: "forge", text: "Forge · Body" }
    }
  ];
  state.done = [
    {
      id: "done-cc-kneel",
      text: "【Forge·Body】第3式 膝盖俯卧撑 · 10",
      createdAt: Date.now(),
      completedAt: Date.now(),
      forgeBodyMeta: {
        dateKey: today,
        amount: "10",
        rowKey: "第3式 膝盖俯卧撑"
      }
    }
  ];

  const renamed = normalizeForgeCcMinListNamesInState();
  note("rename-dirty", renamed, String(state.forge.weeklyMinimums[0].label));
  note(
    "label-is-膝盖俯卧撑",
    state.forge.weeklyMinimums[0].label === "膝盖俯卧撑",
    state.forge.weeklyMinimums[0].label
  );
  note(
    "source-cc-step3",
    state.forge.weeklyMinimums[0].source &&
      state.forge.weeklyMinimums[0].source.kind === "cc" &&
      Number(state.forge.weeklyMinimums[0].source.step) === 3,
    JSON.stringify(state.forge.weeklyMinimums[0].source || null)
  );

  const weekKey =
    typeof forgeGetThisWeekSundayKeyFromSelectedOrToday === "function"
      ? forgeGetThisWeekSundayKeyFromSelectedOrToday()
      : today;
  const weekAgg = aggregateForgeCheckinsWeekByNormalizedLabel(weekKey, "body");
  const progLabel = "第3式 膝盖俯卧撑";
  const nKey = forgeWpResolveBodyAggregateKey(progLabel) || forgeWpResolveBodyAggregateKey("跪姿俯卧撑");
  const cur = nKey ? forgeLifetimeMapSumForPrimaryKey(weekAgg, nKey) : 0;
  note("progress-key", !!nKey, String(nKey));
  note("progress-cur-10", cur === 10, String(cur) + " keys=" + Object.keys(weekAgg).join(","));

  /* ZWSP 污染的口语名也必须改名 + 吃到进度 */
  state.forge.weeklyMinimums[0].label = "跪\u200b姿俯卧撑";
  state.forge.weeklyMinimums[0].source = { kind: "forge", text: "Forge · Body" };
  const zwspRenamed = normalizeForgeCcMinListNamesInState();
  note("zwsp-rename", zwspRenamed && state.forge.weeklyMinimums[0].label === "膝盖俯卧撑", state.forge.weeklyMinimums[0].label);
  const curViaAlias = forgeLifetimeMapSumForPrimaryKey(weekAgg, "跪姿俯卧撑");
  note("progress-via-alias-10", curViaAlias === 10, String(curViaAlias));

  /* 再故意写回旧名，渲染应再次纠正 */
  state.forge.weeklyMinimums[0].label = "跪姿俯卧撑";
  state.forge.weeklyMinimums[0].source = { kind: "forge", text: "Forge · Body" };
  if (typeof setPrimaryModuleFocus === "function") setPrimaryModuleFocus("forge");
  if (typeof activateForgeMainSubTab === "function") activateForgeMainSubTab("forge-body");
  renderForgeWeeklyMinRows();

  const rowEl = document.querySelector('#forgeWeeklyMinRowsBody .forge-weekly-min-row[data-forge-wm-id="wm-kneel-test"]');
  const nameDisp = rowEl ? rowEl.querySelector(".forge-wm-name-display") : null;
  const nums = rowEl ? rowEl.querySelector(".forge-wm-nums") : null;
  note("dom-label", !!(nameDisp && nameDisp.textContent.indexOf("膝盖俯卧撑") !== -1), nameDisp ? nameDisp.textContent : "no-el");
  note(
    "dom-progress",
    !!(nums && /10/.test(nums.textContent || "")),
    nums ? nums.textContent : "no-nums"
  );
  note(
    "state-after-render",
    state.forge.weeklyMinimums[0].label === "膝盖俯卧撑",
    state.forge.weeklyMinimums[0].label
  );

  return out;
});

await browser.close();
server.close();

if (!report.ok) {
  console.error("FAIL", JSON.stringify(report.cases, null, 2));
  process.exit(1);
}
console.log("PASS: forge wm cc rename + progress");
console.log(JSON.stringify(report.cases, null, 2));
