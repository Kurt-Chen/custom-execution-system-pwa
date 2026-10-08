/**
 * 验证：同习惯两次打卡 + 中间插入其他任务，Done 时间线按各自 completedAt 排列；
 * repair / 模拟同步后仍保持。
 */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = "/opt/cursor/artifacts/audible-done-timeline-order";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mime(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
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
  const { server, origin } = await startServer();
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const report = { ok: false };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    await ctx.addInitScript(() => {
      localStorage.setItem("todo-app-cloud-room-v1", "verify-aud-tl-" + Date.now());
      localStorage.setItem("todo-app-aliyun-sync-primary-v1", "0");
      window.__ALIYUN_SYNC_PRIMARY_ENABLED = false;
    });
    const page = await ctx.newPage();
    await page.goto(origin + "?v=" + Date.now(), { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => typeof window.syncHabitMinutesToDone === "function", null, {
      timeout: 60000
    });
    await sleep(500);

    const snap = await page.evaluate(() => {
      const key = "audibleMeditation";
      const dateKey = formatDateInputValue(new Date());
      if (!state.habitCheckins) state.habitCheckins = {};
      if (!state.habitCheckins[dateKey]) state.habitCheckins[dateKey] = {};
      state.done = (state.done || []).filter(
        (d) => !(d && d.habitMeta && d.habitMeta.key === key && d.habitMeta.date === dateKey)
      );
      delete state.habitCheckins[dateKey][key];

      const tMorning = new Date();
      tMorning.setHours(9, 30, 0, 0);
      const tMid = new Date();
      tMid.setHours(12, 15, 0, 0);
      const tEve = new Date();
      tEve.setHours(18, 9, 0, 0);
      const morning = tMorning.getTime();
      const midday = tMid.getTime();
      const evening = tEve.getTime();

      const RealNow = Date.now;
      Date.now = () => morning;
      state.habitCheckins[dateKey][key] = stampHabitCheckinRevision({
        minutes: 30,
        times: 1,
        batches: [30],
        stamps: [morning],
        stampAt: morning
      });
      syncHabitMinutesToDone(key, dateKey, 30, 30, 1, morning);

      state.done.unshift({
        id: "mid-" + midday,
        text: "中间插入·其他任务",
        completedAt: midday,
        manualDone: true
      });

      Date.now = () => evening;
      const cur = state.habitCheckins[dateKey][key];
      const prevStamps = getHabitNumericPrevStampsForPunch(cur, key, dateKey);
      const nextStamps = prevStamps.concat([evening]);
      state.habitCheckins[dateKey][key] = stampHabitCheckinRevision({
        minutes: 60,
        times: 2,
        batches: [30, 30],
        stamps: nextStamps,
        stampAt: nextStamps[0]
      });
      syncHabitMinutesToDone(key, dateKey, 30, 60, 2, evening);
      Date.now = RealNow;

      /* 模拟 sync sanitize + repair */
      const sanitized = sanitizeHabitNumericCheckinValue(
        state.habitCheckins[dateKey][key],
        getHabitNumericSanitizeOpts(key)
      );
      state.habitCheckins[dateKey][key] = sanitized;
      repairDoneListCompletedAtFromHabitMeta();
      repairHabitDoneMirrorsAfterAliyunHabitPull([dateKey]);

      const aud = getHabitDoneRowsForDay(key, dateKey)
        .slice()
        .sort((a, b) => Number(a.completedAt) - Number(b.completedAt));
      const dayTasks = (state.done || [])
        .filter((d) => d && doneTaskMatchesFilterDate(d, dateKey))
        .sort((a, b) => Number(b.completedAt) - Number(a.completedAt));
      const orderedIds = dayTasks.map((d) => d.id);
      const midId = "mid-" + midday;
      const audIdsAsc = aud.map((r) => r.id);
      const idxEve = orderedIds.indexOf(audIdsAsc[1]);
      const idxMid = orderedIds.indexOf(midId);
      const idxMorn = orderedIds.indexOf(audIdsAsc[0]);

      return {
        morning,
        midday,
        evening,
        slot: state.habitCheckins[dateKey][key],
        aud: aud.map((r) => ({
          id: r.id,
          text: r.text,
          completedAt: r.completedAt,
          stampAt: r.habitMeta && r.habitMeta.stampAt
        })),
        timelineNewestFirst: dayTasks.map((d) => ({
          id: d.id,
          text: String(d.text || "").slice(0, 40),
          completedAt: d.completedAt
        })),
        orderOk: idxEve >= 0 && idxMid >= 0 && idxMorn >= 0 && idxEve < idxMid && idxMid < idxMorn
      };
    });

    const timesOk =
      snap.aud.length === 2 &&
      Math.abs(snap.aud[0].completedAt - snap.morning) < 2000 &&
      Math.abs(snap.aud[1].completedAt - snap.evening) < 2000 &&
      Array.isArray(snap.slot.stamps) &&
      snap.slot.stamps.length === 2;

    report.ok = timesOk && snap.orderOk;
    report.summary = {
      timesIndependent: timesOk ? "PASS" : "FAIL",
      timelineOrder: snap.orderOk ? "PASS" : "FAIL",
      morning: clock(snap.morning),
      midday: clock(snap.midday),
      evening: clock(snap.evening)
    };
    report.aud = snap.aud.map((r) => ({ ...r, clock: clock(r.completedAt) }));
    report.timeline = snap.timelineNewestFirst.map((r) => ({ ...r, clock: clock(r.completedAt) }));
    report.slotStamps = snap.slot.stamps;

    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.summary, null, 2));
    if (!report.ok) {
      console.log(JSON.stringify(report, null, 2));
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
