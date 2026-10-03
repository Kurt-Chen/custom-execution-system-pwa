/**
 * 最小跨设备验证（隔离 room，不碰 default-room）：
 * 1) Habit 分钟打卡（Audible 同类）
 * 2) 普通 manual Done
 * 3) Power 决策分值
 * 手机页 push → 电脑页 pull → 断言出现且不重复。
 */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const BASE = "https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run";
const ROOM = "aud-fix-" + Date.now().toString(36);
const OUT = "/opt/cursor/artifacts/audible-cross-device-verify";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mime(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".webmanifest")) return "application/manifest+json";
  return "application/octet-stream";
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url || "/", "http://127.0.0.1");
      let rel = u.pathname === "/" ? "/index.html" : u.pathname;
      const fp = path.join(ROOT, decodeURIComponent(rel));
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      res.writeHead(200, { "content-type": mime(fp), "cache-control": "no-store" });
      fs.createReadStream(fp).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

async function idbGet(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("exec-system-app-db", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const raw = await new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readonly");
      const g = tx.objectStore("kv").get("todo-app-data-v1");
      g.onsuccess = () => resolve(g.result);
      g.onerror = () => reject(g.error);
    });
    return typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
  });
}

async function openPeer(browser, origin, room, label) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript((rid) => {
    localStorage.setItem("todo-app-cloud-room-v1", rid);
    localStorage.setItem("todo-app-aliyun-sync-primary-v1", "1");
    localStorage.setItem("todo-app-aliyun-sync-primary-dual-write-v1", "0");
    window.__ALIYUN_SYNC_PRIMARY_ENABLED = true;
    window.__ALIYUN_HABIT_REAL_SYNC_ENABLED = true;
    window.__ALIYUN_DONE_REAL_SYNC_ENABLED = true;
  }, room);
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (/aliyun-habit|habit-done-chain|aliyun-done/i.test(t)) logs.push(t.slice(0, 240));
  });
  await page.goto(origin + "?" + label + "=" + Date.now(), { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => typeof window.runAliyunHabitRealPullAndMerge === "function", null, {
    timeout: 60000
  });
  await sleep(1200);
  return { ctx, page, logs };
}

async function main() {
  const dk = todayKey();
  const report = { room: ROOM, dateKey: dk, cases: {}, ok: false };
  const { server, origin } = await startServer();
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });

  try {
    const phone = await openPeer(browser, origin, ROOM, "phone");
    const desk = await openPeer(browser, origin, ROOM, "desk");

    /* 1) Habit 分钟打卡 ×2（Audible 同类） */
    const habitWrite = await phone.page.evaluate(async (dateKey) => {
      if (typeof setAliyunSyncMetaGateEnabled === "function") setAliyunSyncMetaGateEnabled(false);
      const key = "audibleMeditation";
      if (!state.habitCheckins) state.habitCheckins = {};
      if (!state.habitCheckins[dateKey]) state.habitCheckins[dateKey] = {};
      if (!Array.isArray(state.done)) state.done = [];
      const t1 = Date.now() - 60000;
      const t2 = Date.now();
      /* 清空旧镜像后按真实打卡路径写两轮分钟批次 */
      state.done = state.done.filter(
        (d) => !(d && d.habitMeta && d.habitMeta.key === key && d.habitMeta.date === dateKey)
      );
      state.habitCheckins[dateKey][key] = stampHabitCheckinRevision({
        minutes: 30,
        times: 1,
        batches: [30],
        stamps: [t1],
        stampAt: t1
      });
      syncHabitMinutesToDone(key, dateKey, 30, 30, 1, t1);
      state.habitCheckins[dateKey][key] = stampHabitCheckinRevision({
        minutes: 60,
        times: 2,
        batches: [30, 30],
        stamps: [t1, t2],
        stampAt: t1
      });
      syncHabitMinutesToDone(key, dateKey, 30, 60, 2, t2);
      notifyAliyunHabitRealUpsert("verify-audible", dateKey, key, state.habitCheckins[dateKey][key]);
      saveState({ lists: ["habit", "done"] });
      if (typeof flushAliyunHabitRealQueue === "function") await flushAliyunHabitRealQueue();
      return {
        ok: true,
        t1,
        t2,
        localDone: getHabitDoneRowsForDay(key, dateKey).length,
        slot: state.habitCheckins[dateKey][key]
      };
    }, dk);
    await sleep(2000);

    /* 2) 普通 manual Done */
    const manualWrite = await phone.page.evaluate(async () => {
      const item = {
        id: "p-manual-" + Date.now().toString(36),
        text: "跨设备验证·普通Done",
        completedAt: Date.now(),
        updatedAt: Date.now(),
        manualDone: true,
        outcomeKind: "neutral",
        outcomeScore: 0
      };
      state.done.unshift(item);
      notifyAliyunDoneRealUpsert("verify-manual", item);
      saveState({ lists: ["done"] });
      if (typeof flushAliyunDoneRealQueue === "function") await flushAliyunDoneRealQueue();
      return { id: item.id, text: item.text };
    });
    await sleep(1500);

    /* 3) Power 决策 */
    const powerWrite = await phone.page.evaluate(async () => {
      const item = {
        id: "p-power-" + Date.now().toString(36),
        text: "跨设备验证·Power决策",
        completedAt: Date.now(),
        updatedAt: Date.now(),
        manualDone: true,
        outcomeKind: "power",
        outcomeScore: 1
      };
      state.done.unshift(item);
      notifyAliyunDoneRealUpsert("verify-power", item);
      saveState({ lists: ["done"] });
      if (typeof flushAliyunDoneRealQueue === "function") await flushAliyunDoneRealQueue();
      return { id: item.id, text: item.text, outcomeKind: item.outcomeKind, outcomeScore: item.outcomeScore };
    });
    await sleep(1500);

    report.cases.phoneWrite = { habitWrite, manualWrite, powerWrite };

    /* 电脑端：空镜像后 pull Habit + Done */
    await desk.page.evaluate(async () => {
      if (typeof setAliyunSyncMetaGateEnabled === "function") setAliyunSyncMetaGateEnabled(false);
      await runAliyunHabitRealPullAndMerge();
      if (typeof runAliyunDoneRealPullAndMerge === "function") await runAliyunDoneRealPullAndMerge();
    });
    await sleep(2000);

    const deskSnap = await desk.page.evaluate((dateKey) => {
      const audRows = getHabitDoneRowsForDay("audibleMeditation", dateKey);
      return {
        audCheckin: state.habitCheckins?.[dateKey]?.audibleMeditation || null,
        audDoneCount: audRows.length,
        audTexts: audRows.map((r) => r.text),
        audIds: audRows.map((r) => r.id),
        doneIds: (state.done || []).map((d) => d && d.id)
      };
    }, dk);
    const deskLocal = await idbGet(desk.page);
    const manualRows = (deskLocal.done || []).filter((d) => d && d.id === manualWrite.id);
    const powerRows = (deskLocal.done || []).filter((d) => d && d.id === powerWrite.id);

    report.cases.deskAfterPull = {
      ...deskSnap,
      manualCount: manualRows.length,
      powerCount: powerRows.length,
      power: powerRows[0]
        ? { outcomeKind: powerRows[0].outcomeKind, outcomeScore: powerRows[0].outcomeScore }
        : null
    };

    /* 再 pull 一次：不重复 */
    await desk.page.evaluate(async () => {
      await runAliyunHabitRealPullAndMerge();
      if (typeof runAliyunDoneRealPullAndMerge === "function") await runAliyunDoneRealPullAndMerge();
    });
    await sleep(1000);
    const desk2 = await desk.page.evaluate((dateKey) => {
      const audRows = getHabitDoneRowsForDay("audibleMeditation", dateKey);
      return { audDoneCount: audRows.length, audIds: audRows.map((r) => r.id) };
    }, dk);
    report.cases.deskSecondPull = {
      ...desk2,
      idsStable:
        JSON.stringify((deskSnap.audIds || []).slice().sort()) ===
        JSON.stringify((desk2.audIds || []).slice().sort())
    };

    const habitOk = !!deskSnap.audCheckin && deskSnap.audDoneCount === 2;
    const manualOk = manualRows.length === 1;
    const powerOk =
      powerRows.length === 1 &&
      powerRows[0].outcomeKind === "power" &&
      Number(powerRows[0].outcomeScore) === 1;
    const noDup = report.cases.deskSecondPull.idsStable && desk2.audDoneCount === 2;

    report.ok = habitOk && manualOk && powerOk && noDup;
    report.summary = {
      "1_habit_audible_batches": habitOk ? "PASS" : "FAIL",
      "2_manual_done": manualOk ? "PASS" : "FAIL",
      "3_power_outcome": powerOk ? "PASS" : "FAIL",
      no_duplicate_after_repull: noDup ? "PASS" : "FAIL"
    };

    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.summary, null, 2));
    console.log("room", ROOM, "ok", report.ok);
    if (!report.ok) {
      console.log(JSON.stringify(report.cases, null, 2));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
