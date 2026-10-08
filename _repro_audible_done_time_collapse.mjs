/**
 * 复现：Audible 两次打卡后，上午记录是否被挪到第二次时间下。
 * 区分：原始 completedAt 被覆盖 vs 仅展示错误。
 */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = "/opt/cursor/artifacts/audible-done-time-collapse";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function clock(ms) {
  return new Date(ms).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

async function main() {
  const report = { steps: {}, ok: false };
  const { server, origin } = await startServer();
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    await ctx.addInitScript(() => {
      localStorage.setItem("todo-app-cloud-room-v1", "repro-aud-time-" + Date.now());
      localStorage.setItem("todo-app-aliyun-sync-primary-v1", "0");
      window.__ALIYUN_SYNC_PRIMARY_ENABLED = false;
      window.__ALIYUN_HABIT_REAL_SYNC_ENABLED = false;
      window.__ALIYUN_DONE_REAL_SYNC_ENABLED = false;
    });
    const page = await ctx.newPage();
    await page.goto(origin + "?repro=" + Date.now(), { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => typeof window.toggleHabitMinutesCheckin === "function" || typeof window.state === "object", null, {
      timeout: 60000
    });
    await sleep(800);

    const result = await page.evaluate(async () => {
      const key = "audibleMeditation";
      const dateKey = formatDateInputValue(new Date());
      if (!state.habitCheckins) state.habitCheckins = {};
      if (!state.habitCheckins[dateKey]) state.habitCheckins[dateKey] = {};
      if (!Array.isArray(state.done)) state.done = [];

      /* 清空当日 Audible */
      state.done = state.done.filter(
        (d) => !(d && d.habitMeta && d.habitMeta.key === key && d.habitMeta.date === dateKey)
      );
      delete state.habitCheckins[dateKey][key];

      const morning = Date.parse(dateKey + "T09:30:00");
      const midday = Date.parse(dateKey + "T12:15:00");
      const evening = Date.parse(dateKey + "T18:09:00");

      /* 1) 上午打卡：走与 toggle 相同的数据结构 */
      const RealDateNow = Date.now;
      Date.now = () => morning;
      state.habitCheckins[dateKey][key] = stampHabitCheckinRevision({
        minutes: 30,
        times: 1,
        batches: [30],
        stamps: [morning],
        stampAt: morning
      });
      syncHabitMinutesToDone(key, dateKey, 30, 30, 1, morning);
      Date.now = RealDateNow;

      const after1 = getHabitDoneRowsForDay(key, dateKey).map((r) => ({
        id: r.id,
        text: r.text,
        completedAt: r.completedAt,
        stampAt: r.habitMeta && r.habitMeta.stampAt
      }));
      const slot1 = JSON.parse(JSON.stringify(state.habitCheckins[dateKey][key]));

      /* 插入其他任务 */
      state.done.unshift({
        id: "other-" + midday,
        text: "中间插入任务",
        completedAt: midday,
        manualDone: true
      });

      /* 2) 晚间打卡 */
      Date.now = () => evening;
      const current = state.habitCheckins[dateKey][key];
      const prevBatches = (current.batches || []).slice();
      prevBatches.push(30);
      const prevStamps = Array.isArray(current.stamps)
        ? current.stamps.map(Number).filter((t) => Number.isFinite(t) && t > 0)
        : [];
      const nextStamps = prevStamps.concat([evening]);
      state.habitCheckins[dateKey][key] = stampHabitCheckinRevision({
        minutes: 60,
        times: 2,
        batches: prevBatches,
        stamps: nextStamps,
        stampAt: nextStamps[0] || evening
      });
      syncHabitMinutesToDone(key, dateKey, 30, 60, 2, evening);
      Date.now = RealDateNow;

      const after2raw = getHabitDoneRowsForDay(key, dateKey).map((r) => ({
        id: r.id,
        text: r.text,
        completedAt: r.completedAt,
        stampAt: r.habitMeta && r.habitMeta.stampAt
      }));
      const slot2 = JSON.parse(JSON.stringify(state.habitCheckins[dateKey][key]));

      /* 3) 跑会改写时间的卫生/repair */
      const repairA =
        typeof repairDoneListCompletedAtFromHabitMeta === "function"
          ? repairDoneListCompletedAtFromHabitMeta()
          : false;
      const afterRepairA = getHabitDoneRowsForDay(key, dateKey).map((r) => ({
        id: r.id,
        text: r.text,
        completedAt: r.completedAt
      }));

      const repairB =
        typeof repairHabitDoneMirrorsAfterAliyunHabitPull === "function"
          ? repairHabitDoneMirrorsAfterAliyunHabitPull([dateKey])
          : false;
      const afterRepairB = getHabitDoneRowsForDay(key, dateKey).map((r) => ({
        id: r.id,
        text: r.text,
        completedAt: r.completedAt
      }));
      const slotAfterB = JSON.parse(JSON.stringify(state.habitCheckins[dateKey][key]));

      /* 4) 模拟 sanitize 丢 stamps 后再第二次打卡的历史路径 */
      state.done = state.done.filter(
        (d) => !(d && d.habitMeta && d.habitMeta.key === key && d.habitMeta.date === dateKey)
      );
      delete state.habitCheckins[dateKey][key];
      Date.now = () => morning;
      state.habitCheckins[dateKey][key] = stampHabitCheckinRevision({
        minutes: 30,
        times: 1,
        batches: [30],
        stamps: [morning],
        stampAt: morning
      });
      syncHabitMinutesToDone(key, dateKey, 30, 30, 1, morning);
      Date.now = RealDateNow;

      /* sanitize：修复后应保留 stamps */
      const opts = getHabitNumericSanitizeOpts(key);
      const sanitized = sanitizeHabitNumericCheckinValue(state.habitCheckins[dateKey][key], opts);
      state.habitCheckins[dateKey][key] = sanitized;
      const slotSan = JSON.parse(JSON.stringify(state.habitCheckins[dateKey][key]));

      /* 模拟「旧 sanitize 已丢 stamps」后的第二次打卡：应走 Done 回填 prevStamps */
      const slotLost = Object.assign({}, state.habitCheckins[dateKey][key]);
      delete slotLost.stamps;
      state.habitCheckins[dateKey][key] = slotLost;
      Date.now = () => evening;
      const cur2 = state.habitCheckins[dateKey][key];
      const pb = (cur2.batches || []).slice();
      pb.push(30);
      const ps =
        typeof getHabitNumericPrevStampsForPunch === "function"
          ? getHabitNumericPrevStampsForPunch(cur2, key, dateKey)
          : [];
      const ns = ps.concat([evening]);
      state.habitCheckins[dateKey][key] = stampHabitCheckinRevision({
        minutes: 60,
        times: 2,
        batches: pb,
        stamps: ns,
        stampAt: ns[0] || evening
      });
      syncHabitMinutesToDone(key, dateKey, 30, 60, 2, evening);
      Date.now = RealDateNow;

      const afterSanPunch = getHabitDoneRowsForDay(key, dateKey).map((r) => ({
        id: r.id,
        text: r.text,
        completedAt: r.completedAt
      }));
      const slotSanPunch = JSON.parse(JSON.stringify(state.habitCheckins[dateKey][key]));

      const repairC = repairHabitDoneMirrorsAfterAliyunHabitPull([dateKey]);
      const afterSanRepair = getHabitDoneRowsForDay(key, dateKey).map((r) => ({
        id: r.id,
        text: r.text,
        completedAt: r.completedAt
      }));

      /* 5) 强制 count mismatch 触发删补 */
      state.done.push({
        id: "extra-dup",
        text: "【习惯】听Audible 本次 +1 分钟 · 今日累计 61 分钟 · 第 3 次打卡",
        completedAt: evening + 1000,
        habitMeta: { key, date: dateKey, batchAmount: 1 }
      });
      const beforeForce = getHabitDoneRowsForDay(key, dateKey).length;
      const repairD = repairHabitDoneMirrorsAfterAliyunHabitPull([dateKey]);
      const afterForce = getHabitDoneRowsForDay(key, dateKey).map((r) => ({
        id: r.id,
        text: r.text,
        completedAt: r.completedAt
      }));
      const slotForce = JSON.parse(JSON.stringify(state.habitCheckins[dateKey][key]));

      /* 6) mergeHabitCheckinValueForSync 是否丢 stamps */
      const left = {
        minutes: 60,
        times: 2,
        batches: [30, 30],
        stamps: [morning, evening],
        stampAt: morning,
        revisedAt: evening
      };
      const right = {
        minutes: 60,
        times: 2,
        batches: [30, 30],
        stampAt: morning,
        revisedAt: evening - 1
      };
      const merged = mergeHabitCheckinValueForSync(left, right);

      return {
        dateKey,
        morning,
        midday,
        evening,
        after1,
        slot1,
        after2raw,
        slot2,
        repairA,
        afterRepairA,
        repairB,
        afterRepairB,
        slotAfterB,
        slotSan,
        afterSanPunch,
        slotSanPunch,
        repairC,
        afterSanRepair,
        beforeForce,
        repairD,
        afterForce,
        slotForce,
        mergedStamps: merged && merged.stamps,
        merged
      };
    });

    const fmt = (rows) =>
      (rows || []).map((r) => ({
        ...r,
        clock: clock(r.completedAt)
      }));

    report.steps = {
      after1: fmt(result.after1),
      slot1: result.slot1,
      after2raw: fmt(result.after2raw),
      slot2: result.slot2,
      afterRepairA: fmt(result.afterRepairA),
      afterRepairB: fmt(result.afterRepairB),
      slotSan: result.slotSan,
      afterSanPunch: fmt(result.afterSanPunch),
      slotSanPunch: result.slotSanPunch,
      afterSanRepair: fmt(result.afterSanRepair),
      afterForce: fmt(result.afterForce),
      slotForce: result.slotForce,
      mergedStamps: result.mergedStamps,
      mergedHasStamps: Array.isArray(result.mergedStamps) && result.mergedStamps.length === 2
    };

    const times2 = (result.after2raw || []).map((r) => r.completedAt).sort();
    const localOk =
      times2.length === 2 &&
      Math.abs(times2[0] - result.morning) < 2000 &&
      Math.abs(times2[1] - result.evening) < 2000;

    const sanPunchTimes = (result.afterSanPunch || []).map((r) => r.completedAt).sort();
    const sanPunchStillOk =
      sanPunchTimes.length === 2 &&
      Math.abs(sanPunchTimes[0] - result.morning) < 2000 &&
      Math.abs(sanPunchTimes[1] - result.evening) < 2000;

    const forceTimes = (result.afterForce || []).map((r) => r.completedAt).sort();
    const forceCollapsed =
      forceTimes.length >= 1 && forceTimes.every((t) => Math.abs(t - result.evening) < 120000);

    report.verdict = {
      localTwoPunchPreservesTimes: localOk,
      afterSanitizeSecondPunchStillOk: sanPunchStillOk,
      sanitizeKeepsStamps:
        Array.isArray(result.slotSan && result.slotSan.stamps) &&
        result.slotSan.stamps.length >= 1 &&
        Math.abs(Number(result.slotSan.stamps[0]) - result.morning) < 2000,
      secondPunchRecoversMorningStampAt:
        result.slotSanPunch && Math.abs(Number(result.slotSanPunch.stampAt) - result.morning) < 2000,
      secondPunchHasBothStamps:
        Array.isArray(result.slotSanPunch && result.slotSanPunch.stamps) &&
        result.slotSanPunch.stamps.length === 2,
      forceRepairPreservesMorning:
        forceTimes.length === 2 &&
        Math.abs(forceTimes[0] - result.morning) < 2000 &&
        Math.abs(forceTimes[1] - result.evening) < 2000,
      forceRepairCollapsesToEvening: forceCollapsed,
      mergeDropsStamps: !report.steps.mergedHasStamps,
      morning: clock(result.morning),
      evening: clock(result.evening)
    };

    report.ok = true;
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.verdict, null, 2));
    console.log("after2raw", JSON.stringify(report.steps.after2raw, null, 2));
    console.log("afterForce", JSON.stringify(report.steps.afterForce, null, 2));
    console.log("slotSanPunch", JSON.stringify(result.slotSanPunch, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
