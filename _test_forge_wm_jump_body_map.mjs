/**
 * 周最低 ↔ Forge 动作一一对应：徒手按中文主名定位；跪姿俯卧撑→膝盖俯卧撑 CC。
 * 运行：node _test_forge_wm_jump_body_map.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8772;
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

assert.ok(html.includes("跪姿俯卧撑: { art: \"push\", step: 3 }"), "missing 跪姿俯卧撑 alias");
assert.ok(html.includes("按 DOM 中文主名匹配"), "missing DOM name matcher comment");
assert.ok(html.includes("exec-system-pwa-v20261014zg"), "cache bump zg");
assert.ok(html.includes("function forgeCcMinListLabel"), "CC min-list short label helper");
assert.ok(
  html.includes("跪姿俯卧撑") && html.includes("displayNm"),
  "weekly-min display should prefer CC canonical name"
);
assert.equal(
  /if \(stored && stored\.kind === "forge"\) \{[\s\S]{0,500}?if \(!rowKey \|\| !findForgeTaskRowByWpKey\(rowKey\)\) return null;/.test(
    html
  ),
  false,
  "stale forge source must not hard-fail jump"
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
    localStorage.setItem("todo-app-password-v1", "test-wm-body-map");
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
await page.waitForFunction(function () {
  return (
    typeof findForgeTaskRowByWpKey === "function" &&
    typeof resolveForgeWmJumpTarget === "function" &&
    typeof forgeResolveCcStepFromLabel === "function"
  );
}, { timeout: 45000 }).catch(function () {
  /* functions may be script-scoped; probe via jump UI path instead */
});

const report = await page.evaluate(function () {
  const out = { ok: true, cases: [] };
  function note(name, pass, detail) {
    out.cases.push({ name: name, pass: !!pass, detail: detail || "" });
    if (!pass) out.ok = false;
  }

  /* 若函数不在全局，用 DOM + 内联等价探测 */
  const hasFind = typeof findForgeTaskRowByWpKey === "function";
  const hasResolve = typeof resolveForgeWmJumpTarget === "function";
  const hasCc = typeof forgeResolveCcStepFromLabel === "function";

  if (hasCc) {
    const cc = forgeResolveCcStepFromLabel("跪姿俯卧撑");
    const primary =
      cc && typeof forgeWmSplitLabelSubtitle === "function"
        ? forgeWmSplitLabelSubtitle(cc.label).primary
        : "";
    const minLabel =
      typeof forgeCcMinListLabel === "function" ? forgeCcMinListLabel(cc) : primary;
    note(
      "跪姿俯卧撑→膝盖俯卧撑",
      cc &&
        cc.art === "push" &&
        Number(cc.step) === 3 &&
        primary === "膝盖俯卧撑" &&
        minLabel === "膝盖俯卧撑",
      cc
        ? JSON.stringify({
            art: cc.art,
            step: cc.step,
            label: cc.label,
            primary: primary,
            minLabel: minLabel
          })
        : "null"
    );
    const flat = forgeResolveCcStepFromLabel("平卧抬膝");
    note(
      "平卧抬膝→CC",
      flat && flat.art === "leg" && Number(flat.step) === 2,
      flat ? JSON.stringify({ art: flat.art, step: flat.step, label: flat.label }) : "null"
    );
  } else {
    note("跪姿俯卧撑→CC", false, "forgeResolveCcStepFromLabel not global");
  }

  const bodyNames = ["箭步蹲", "慢跑", "单杠垂悬", "双杠支撑（静态）", "双杠支撑 (静态)"];
  if (hasFind) {
    bodyNames.forEach(function (nm) {
      const row = findForgeTaskRowByWpKey(nm);
      const text = row
        ? (row.querySelector(".forge-task-text") && row.querySelector(".forge-task-text").textContent) || ""
        : "";
      note("find:" + nm, !!row, text.slice(0, 40));
    });
  } else {
    /* 无全局 API 时：直接按中文主名在徒手面板找卡，证明 DOM 可一一对应 */
    const panel = document.getElementById("forgeBodyPanelBw");
    bodyNames.forEach(function (nm) {
      let hit = null;
      if (panel) {
        panel.querySelectorAll(".forge-task-row").forEach(function (row) {
          if (hit) return;
          const t = row.querySelector(".forge-task-text");
          const raw = t ? String(t.childNodes[0] && t.childNodes[0].textContent || t.textContent || "") : "";
          if (raw.indexOf(nm.replace(/\s+/g, "").slice(0, 4)) !== -1 || raw.indexOf("双杠支撑") !== -1 && nm.indexOf("双杠支撑") === 0) {
            if (nm.indexOf("双杠支撑") === 0) {
              if (raw.indexOf("双杠支撑") !== -1 && raw.indexOf("臂屈伸") === -1) hit = row;
            } else if (raw.indexOf(nm) !== -1) hit = row;
          }
        });
      }
      note("dom:" + nm, !!hit, hit ? "found" : "missing");
    });
  }

  if (hasResolve) {
    const staleForgeBody = [
      { label: "箭步蹲", realm: "body", source: { kind: "forge", text: "Forge · Body" } },
      { label: "慢跑", realm: "body", source: { kind: "forge", text: "Forge · Body" } },
      { label: "跪姿俯卧撑", realm: "body", source: { kind: "forge", text: "Forge · Body" } },
      { label: "平卧抬膝", realm: "body", source: { kind: "forge", text: "Forge · Body" } },
      { label: "单杠垂悬", realm: "body", source: { kind: "forge", text: "Forge · Body" } },
      { label: "双杠支撑（静态）", realm: "body", source: { kind: "forge", text: "Forge · Body" } }
    ];
    staleForgeBody.forEach(function (row) {
      const t = resolveForgeWmJumpTarget(row);
      const pass = !!t && (t.kind === "forge" || t.kind === "cc" || t.kind === "kb");
      note(
        "jump:" + row.label,
        pass,
        t ? JSON.stringify(t) : "null"
      );
    });
  } else {
    note("resolve API", false, "resolveForgeWmJumpTarget not global — skip runtime jump asserts");
  }

  return out;
});

await browser.close();
server.close();

if (!report.ok) {
  console.error("FAIL cases:", JSON.stringify(report.cases, null, 2));
  process.exit(1);
}
console.log("PASS: forge wm body/cc one-to-one map");
console.log(JSON.stringify(report.cases, null, 2));
