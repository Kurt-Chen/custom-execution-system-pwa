/**
 * 回归：dailyWin 脏但 habit paint 被跳过时，不得 clear habit 脏位（否则 ×累计停更）。
 */
import { spawn } from "child_process";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = 8768;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function startStatic() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const rel = urlPath === "/" ? "/index.html" : urlPath;
      const file = join(ROOT, rel.replace(/^\//, ""));
      if (!file.startsWith(ROOT) || !existsSync(file)) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  const server = await startStatic();
  const chrome = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--user-data-dir=/tmp/habit-dirty-${Date.now()}`,
      "--remote-debugging-port=9224",
      "about:blank"
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  let endpoint = null;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch("http://127.0.0.1:9224/json/version");
      if (r.ok) {
        endpoint = await r.json();
        break;
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!endpoint) throw new Error("devtools missing");
  const require = createRequire("/tmp/habit-ws/package.json");
  const WebSocket = require("ws");
  const ws = new WebSocket(endpoint.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.once("open", r);
    ws.once("error", j);
  });
  let id = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}, sessionId) => {
    const msgId = ++id;
    const payload = { id: msgId, method, params };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => pending.set(msgId, { resolve, reject }));
  };
  const { targetId } = await send("Target.createTarget", {
    url: `http://127.0.0.1:${PORT}/index.html`
  });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Runtime.enable", {}, sessionId);
  await new Promise((r) => setTimeout(r, 2500));
  const evalExpr = async (expression) => {
    const res = await send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true, userGesture: true },
      sessionId
    );
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result && res.result.value;
  };

  const result = await evalExpr(`(async function () {
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    const out = {};

    setPrimaryModuleFocus("habit");
    activateHabitRoutineSubTab("habit-group-habits");
    setActiveHabitDesktopCategory("learning");
    await sleep(200);

    // Seed history so lifetime is visible
    if (!state.habitCheckins) state.habitCheckins = {};
    const today = formatDateInputValue(new Date());
    for (let i = 1; i <= 74; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dk = formatDateInputValue(d);
      if (!state.habitCheckins[dk]) state.habitCheckins[dk] = {};
      state.habitCheckins[dk].notebookLm = { times: 1, revisedAt: d.getTime() };
    }
    if (state.habitCheckins[today]) delete state.habitCheckins[today].notebookLm;
    markHabitCheckinsSubTabDirty();
    markUiPaintSlicesDirty(["habit"]);
    render();
    await sleep(200);

    const card = document.querySelector('#habitRoutineModule [data-habit-key="notebookLm"]');
    const read = function () {
      const el = card.querySelector(".habit-title-lifetime-num");
      return {
        dom: parseInt(String(el && el.textContent || "").replace(/\\D/g, ""), 10) || 0,
        computed: getHabitLifetimeDisplayNumber("notebookLm"),
        habitDirty: isUiPaintSliceDirty("habit"),
        subDirty: habitCheckinsSubTabNeedsPaint()
      };
    };
    out.before = read();

    // Natural punch
    toggleHabitCheckin("notebookLm");
    await sleep(500);
    out.afterPunch = read();

    // String times coercion
    const dk2 = formatDateInputValue(new Date(Date.now() - 86400000 * 80));
    if (!state.habitCheckins[dk2]) state.habitCheckins[dk2] = {};
    state.habitCheckins[dk2].notebookLm = { times: "3", remark: "" };
    out.stringTimesCounted = getOptionalRemarkStampTimes(state.habitCheckins[dk2].notebookLm);
    out.lifetimeWithString = getHabitLifetimeDisplayNumber("notebookLm");

    // Simulate old bug path: habit+dailyWin dirty, force skip habit paint via open numeric dialog mock
    // Instead: verify that if paintHabitDom fails, dirty remains — call render after marking both
    markUiPaintSlicesDirty(["habit", "dailyWin"]);
    const beforeClear = { habit: isUiPaintSliceDirty("habit"), dailyWin: isUiPaintSliceDirty("dailyWin") };
    // Monkey-patch renderHabitCheckins to throw once
    const orig = renderHabitCheckins;
    let threw = false;
    renderHabitCheckins = function () {
      threw = true;
      throw new Error("inject-fail");
    };
    try {
      render(true);
    } catch (_) {}
    await sleep(100);
    const afterFail = {
      habit: isUiPaintSliceDirty("habit"),
      dailyWin: isUiPaintSliceDirty("dailyWin"),
      threw: threw
    };
    renderHabitCheckins = orig;
    // Recover
    markUiPaintSlicesDirty(["habit"]);
    markHabitCheckinsSubTabDirty();
    render();
    await sleep(200);
    out.dirtyClearGuard = { beforeClear, afterFail, recovered: read() };

    // Second punch should bump again
    const before2 = read();
    toggleHabitCheckin("notebookLm");
    await sleep(500);
    out.secondPunch = { before: before2, after: read() };

    out.ok =
      out.afterPunch.computed === out.before.computed + 1 &&
      out.afterPunch.dom === out.afterPunch.computed &&
      out.stringTimesCounted === 3 &&
      out.dirtyClearGuard.afterFail.habit === true &&
      out.dirtyClearGuard.afterFail.threw === true &&
      out.secondPunch.after.dom === out.secondPunch.before.dom + 1 &&
      out.secondPunch.after.dom === out.secondPunch.after.computed;

    return out;
  })()`);

  console.log(JSON.stringify(result, null, 2));
  ws.close();
  chrome.kill();
  server.close();
  if (!result.ok) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
