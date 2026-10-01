/**
 * Headless Chrome：显式编辑会话下经历多次 AMB paint + blur，DOM 节点身份不变。
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
      res.writeHead(200, {
        "Content-Type": mime[path.extname(filePath)] || "application/octet-stream"
      });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function runChromeEval() {
  const userData = fs.mkdtempSync(path.join("/tmp", "dw-session-chrome-"));
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
        if (!input && typeof renderList === "function") {
          renderList(dailyWinList, [], "dailyWin");
          input = document.querySelector("#dailyWinList .daily-win-modern-pending-input");
        }
        if (!input) {
          return { ok: false, error: "no-pending-input" };
        }
        input.focus();
        input.value = "显式会话测试文案ABC";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new CompositionEvent("compositionstart"));
        input.dispatchEvent(new CompositionEvent("compositionupdate", { data: "测" }));
        input.dispatchEvent(new CompositionEvent("compositionend", { data: "测试" }));
        const beforeNode = input;
        const beforeVal = input.value;
        const sessionBefore =
          typeof isDailyWinEditSessionActive === "function" && isDailyWinEditSessionActive();

        /* 模拟软键盘/IME blur：旧逻辑会在 480ms 后清盾；新逻辑必须仍保持会话 */
        input.blur();
        await sleep(700);
        const sessionAfterBlur =
          typeof isDailyWinEditSessionActive === "function" && isDailyWinEditSessionActive();

        const paintRounds = [];
        for (let i = 0; i < 6; i++) {
          if (typeof markUiPaintSlicesDirty === "function") {
            markUiPaintSlicesDirty(["dailyWin", "habit", "stopDoing", "notToDo", "done"]);
          }
          if (typeof aliyunAmbRealPaintLocalUiAfterMerge === "function") {
            aliyunAmbRealPaintLocalUiAfterMerge();
          } else if (typeof render === "function") {
            render();
          }
          /* 强制再撞一次 renderList 硬挡 */
          if (typeof renderList === "function") {
            renderList(dailyWinList, [], "dailyWin");
          }
          const stillSame = document.querySelector("#dailyWinList .daily-win-modern-pending-input") === beforeNode;
          paintRounds.push({
            i: i,
            sameNode: stillSame,
            session:
              typeof isDailyWinEditSessionActive === "function" && isDailyWinEditSessionActive(),
            value: beforeNode.value
          });
          await sleep(40);
        }

        const afterNode = document.querySelector("#dailyWinList .daily-win-modern-pending-input");
        const allSame = paintRounds.every((r) => r.sameNode && r.session && r.value === beforeVal);

        /* 明确结束后才允许重建 */
        if (typeof endDailyWinEditSession === "function") {
          endDailyWinEditSession("test-end");
        }
        if (typeof markUiPaintSlicesDirty === "function") {
          markUiPaintSlicesDirty(["dailyWin"]);
        }
        if (typeof render === "function") render(true);
        const rebuilt = document.querySelector("#dailyWinList .daily-win-modern-pending-input");
        const rebuiltDifferent = rebuilt !== beforeNode;

        return {
          ok: true,
          beforeVal: beforeVal,
          afterVal: afterNode && afterNode.value,
          sessionBefore: sessionBefore,
          sessionAfterBlur: sessionAfterBlur,
          paintRounds: paintRounds,
          allSame: allSame,
          sameNodeFinal: afterNode === beforeNode,
          rebuiltDifferent: rebuiltDifferent
        };
      } catch (err) {
        return { ok: false, error: String(err && err.stack || err) };
      }
    })()
  `;

  const debugPort = 9230;
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

  const listRes = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
  const targets = await listRes.json();
  let wsUrl = targets[0] && targets[0].webSocketDebuggerUrl;
  if (!wsUrl) {
    const newRes = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`);
    const created = await newRes.json();
    wsUrl = created.webSocketDebuggerUrl;
  }
  assert.ok(wsUrl, "cdp websocket");

  let WebSocketCtor = globalThis.WebSocket;
  try {
    const mod = await import("ws");
    WebSocketCtor = mod.default;
  } catch (_e) {}

  const ws = new WebSocketCtor(wsUrl);
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
      }, 30000);
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
  console.error(err);
  server.close();
  process.exit(1);
}
server.close();

console.log("browser-result", JSON.stringify(result, null, 2));
assert.ok(result && result.ok, "browser harness ok: " + JSON.stringify(result));
assert.equal(result.sessionBefore, true, "session begins on input");
assert.equal(result.sessionAfterBlur, true, "blur must NOT end session");
assert.equal(result.allSame, true, "6 paint rounds must keep same node/value/session");
assert.equal(result.sameNodeFinal, true, "node identity preserved through paints");
assert.equal(result.afterVal, "显式会话测试文案ABC");
assert.equal(result.rebuiltDifferent, true, "after explicit end, rebuild allowed");
console.log("OK dailywin-edit-session-browser");
