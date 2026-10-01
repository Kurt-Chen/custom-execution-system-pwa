/**
 * Headless Chrome：编辑盾在模拟 AMB paint 后仍保留输入与焦点。
 * 运行：node _test_dailywin_edit_shield_browser.mjs
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8766;
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome-stable"].find((p) =>
    fs.existsSync(p)
  );

assert.ok(CHROME, "chrome binary required");

function startStaticServer() {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  };
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function runChromeEval() {
  const userData = fs.mkdtempSync(path.join("/tmp", "dw-shield-chrome-"));
  const outFile = path.join(userData, "result.json");
  const evalJs = `
    (async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      try {
        if (typeof unlockApp === "function") {
          try { unlockApp(); } catch (e) {}
        }
        await sleep(400);
        if (typeof bootstrapPrimaryModuleShell === "function") {
          bootstrapPrimaryModuleShell("habit");
        }
        document.body.classList.add("primary-module-fullscreen");
        const habit = document.getElementById("habitRoutineModule");
        if (habit) {
          habit.classList.add("module-focus-active");
          habit.hidden = false;
          habit.style.display = "";
        }
        const dyn = document.getElementById("dynamicModule");
        if (dyn) dyn.classList.remove("module-focus-active");
        if (typeof activateHabitRoutineSubTab === "function") {
          try { activateHabitRoutineSubTab("habit-group-measure"); } catch (e) {}
        }
        if (typeof markUiPaintSlicesDirty === "function") {
          markUiPaintSlicesDirty(["dailyWin", "habit", "done"]);
        }
        if (typeof render === "function") render(true);
        await sleep(300);
        let input = document.querySelector("#dailyWinList .daily-win-modern-pending-input");
        if (!input) {
          // force modern list rebuild
          if (typeof renderList === "function" && typeof dailyWinList !== "undefined") {
            renderList(dailyWinList, [], "dailyWin");
          }
          input = document.querySelector("#dailyWinList .daily-win-modern-pending-input");
        }
        if (!input) {
          return { ok: false, error: "no-pending-input", htmlSnippet: (document.getElementById("dailyWinList")||{}).innerHTML || "" };
        }
        input.focus();
        input.value = "盾测试文案ABC123";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        const beforeNode = input;
        const beforeVal = input.value;
        const shieldBefore = typeof isDailyWinEditorShieldActive === "function" && isDailyWinEditorShieldActive();
        if (typeof markUiPaintSlicesDirty === "function") {
          markUiPaintSlicesDirty(["dailyWin", "habit", "stopDoing", "notToDo", "done"]);
        }
        if (typeof aliyunAmbRealPaintLocalUiAfterMerge === "function") {
          aliyunAmbRealPaintLocalUiAfterMerge();
        } else {
          render();
        }
        await sleep(50);
        const afterNode = document.activeElement;
        const afterVal = afterNode && afterNode.classList && afterNode.classList.contains("daily-win-modern-pending-input")
          ? afterNode.value
          : (document.querySelector("#dailyWinList .daily-win-modern-pending-input") || {}).value;
        const shieldAfter = typeof isDailyWinEditorShieldActive === "function" && isDailyWinEditorShieldActive();
        const sameNode = afterNode === beforeNode;
        return {
          ok: true,
          beforeVal,
          afterVal,
          shieldBefore,
          shieldAfter,
          sameNode,
          valueKept: beforeVal === afterVal,
          stillPendingFocused: !!(afterNode && afterNode.classList && afterNode.classList.contains("daily-win-modern-pending-input"))
        };
      } catch (err) {
        return { ok: false, error: String(err && err.stack || err) };
      }
    })()
  `;

  const debugPort = 9229;
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--user-data-dir=${userData}`,
      `--remote-debugging-port=${debugPort}`,
      "about:blank"
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  await new Promise((r) => setTimeout(r, 800));

  async function cdp(method, params, sessionId) {
    // minimal fetch to /json/new then Runtime.evaluate via websocket would be heavy.
    // Use chrome's HTTP /json endpoint + websockets from node.
    return { method, params, sessionId };
  }

  // Prefer websocket CDP
  const listRes = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
  const targets = await listRes.json();
  let wsUrl = targets[0] && targets[0].webSocketDebuggerUrl;
  if (!wsUrl) {
    const newRes = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`);
    const created = await newRes.json();
    wsUrl = created.webSocketDebuggerUrl;
  }
  assert.ok(wsUrl, "cdp websocket");

  const { default: WebSocket } = await import("node:ws").catch(async () => {
    // node 22 may not have ws; use raw undici websocket if available
    return { default: globalThis.WebSocket };
  });

  let ws;
  if (WebSocket && WebSocket !== globalThis.WebSocket) {
    ws = new WebSocket(wsUrl);
  } else if (globalThis.WebSocket) {
    ws = new globalThis.WebSocket(wsUrl);
  } else {
    // fallback: install no dependency — use chrome --run-all-compositor-modes with page that posts result
    chrome.kill("SIGKILL");
    throw new Error("no WebSocket client available");
  }

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
    setTimeout(() => reject(new Error("ws open timeout")), 5000);
  });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };

  function send(method, params) {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error("cdp timeout " + method));
        }
      }, 20000);
    });
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });
  await new Promise((r) => setTimeout(r, 2500));
  const evaluated = await send("Runtime.evaluate", {
    expression: evalJs,
    awaitPromise: true,
    returnByValue: true
  });

  ws.close();
  chrome.kill("SIGKILL");

  const result = evaluated && evaluated.result && evaluated.result.value;
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  return result;
}

const server = await startStaticServer();
let result;
try {
  result = await runChromeEval();
} catch (err) {
  // If ws module missing, skip browser test with clear message but don't fail CI hard?
  console.error(err);
  server.close();
  process.exit(1);
}
server.close();

console.log("browser-result", result);
assert.ok(result && result.ok, "browser harness ok: " + JSON.stringify(result));
assert.equal(result.beforeVal, "盾测试文案ABC123");
assert.equal(result.afterVal, "盾测试文案ABC123", "value must survive AMB paint");
assert.equal(result.shieldAfter, true, "shield should stay active while focused/dirty");
assert.ok(result.sameNode || result.stillPendingFocused, "editor node or focus should survive");
console.log("OK dailywin-edit-shield-browser");
