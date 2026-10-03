/**
 * 诊断：空本机电脑端拉取 default-room Habit 后，Audible Done 镜像是否出现、条数是否=batches。
 */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const BASE = "https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run";
const LIVE_ROOM = "default-room";
const DATE = "2026-10-03";
const OUT = "/opt/cursor/artifacts/audible-done-diag";
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
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}/` });
    });
  });
}

async function cloudGet(docId) {
  const res = await fetch(BASE + "/smoke/" + encodeURIComponent(docId));
  const data = await res.json().catch(() => ({}));
  const row = data && data.data;
  const attrs = (row && (row.attrs || row)) || {};
  let payload = attrs.payload != null ? attrs.payload : attrs;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }
  return { status: res.status, payload };
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

function summarize(local, dateKey) {
  const day = (local.habitCheckins && local.habitCheckins[dateKey]) || {};
  const audRows = (local.done || []).filter(
    (d) => d && d.habitMeta && d.habitMeta.key === "audibleMeditation" && d.habitMeta.date === dateKey
  );
  const h5Rows = (local.done || []).filter(
    (d) => d && d.habitMeta && d.habitMeta.key === "highFiveHabit" && d.habitMeta.date === dateKey
  );
  const miraaRows = (local.done || []).filter(
    (d) => d && d.habitMeta && d.habitMeta.key === "miraaShadowing" && d.habitMeta.date === dateKey
  );
  return {
    audCheckin: day.audibleMeditation || null,
    h5Checkin: day.highFiveHabit || null,
    miraaCheckin: day.miraaShadowing || null,
    audDone: audRows.map((r) => ({
      id: r.id,
      text: r.text,
      completedAt: r.completedAt,
      completedAtIso: r.completedAt
        ? new Date(r.completedAt).toLocaleString("en-US", { hour12: false, timeZone: "Asia/Shanghai" })
        : null,
      outcomeKind: r.outcomeKind ?? null,
      outcomeScore: r.outcomeScore ?? null,
      habitMeta: r.habitMeta
    })),
    h5Done: h5Rows.map((r) => ({ id: r.id, text: r.text, completedAt: r.completedAt })),
    miraaDone: miraaRows.map((r) => ({ id: r.id, text: r.text, completedAt: r.completedAt }))
  };
}

async function main() {
  const liveHabit = await cloudGet("aliyun-habit-real-v1-" + LIVE_ROOM);
  const liveHabitMeta = await cloudGet("aliyun-meta-v1-habit-" + LIVE_ROOM);
  const liveDomains = await cloudGet("aliyun-meta-v1-domains-" + LIVE_ROOM);
  const audCloud = liveHabit.payload?.items?.[DATE + "|audibleMeditation"];
  const h5Cloud = liveHabit.payload?.items?.[DATE + "|highFiveHabit"];
  const miraaCloud = liveHabit.payload?.items?.[DATE + "|miraaShadowing"];

  const report = {
    cloud: {
      audible: audCloud,
      highFive: h5Cloud,
      miraa: miraaCloud,
      habitMetaV: liveHabitMeta.payload?.v,
      domainsHabitV: liveDomains.payload?.versions?.habit,
      envelopeUpdatedAt: liveHabit.payload?.envelopeUpdatedAt
    },
    steps: {},
    logs: []
  };

  const { server, origin } = await startServer();
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript((room) => {
      localStorage.setItem("todo-app-cloud-room-v1", room);
      localStorage.setItem("todo-app-aliyun-sync-primary-v1", "1");
      localStorage.setItem("todo-app-aliyun-sync-primary-dual-write-v1", "0");
      window.__ALIYUN_SYNC_PRIMARY_ENABLED = true;
      window.__ALIYUN_HABIT_REAL_SYNC_ENABLED = true;
      window.__ALIYUN_DONE_REAL_SYNC_ENABLED = true;
    }, LIVE_ROOM);

    const page = await ctx.newPage();
    page.on("console", (msg) => {
      const t = msg.text();
      if (/aliyun-habit|habit-done-chain|meta-gate|aliyun-sync-primary/i.test(t)) {
        report.logs.push(t.slice(0, 400));
      }
    });

    await page.goto(origin + "?diag=" + Date.now(), { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => typeof window.runAliyunHabitRealPullAndMerge === "function", null, {
      timeout: 60000
    });
    await sleep(2000);

    const before = summarize(await idbGet(page), DATE);
    report.steps.before = before;

    /* 关 meta gate，强制拉 Habit 正文（模拟电脑端应收到的完整 envelope） */
    const pull = await page.evaluate(async () => {
      if (typeof window.setAliyunSyncMetaGateEnabled === "function") {
        window.setAliyunSyncMetaGateEnabled(false);
      }
      return await window.runAliyunHabitRealPullAndMerge();
    });
    report.steps.pull = pull;
    await sleep(1500);

    const after = summarize(await idbGet(page), DATE);
    report.steps.afterPull = after;

    /* 第二次 pull：模拟 fingerprint unchanged + repair */
    const pull2 = await page.evaluate(async () => {
      return await window.runAliyunHabitRealPullAndMerge();
    });
    report.steps.pull2 = pull2;
    await sleep(800);
    report.steps.afterPull2 = summarize(await idbGet(page), DATE);

    /* 分类 */
    const doneN = (after.audDone || []).length;
    const expectN = Array.isArray(audCloud?.batches) ? audCloud.batches.length : audCloud?.times || 0;
    let category = "?";
    if (!audCloud) category = "A_cloud_missing";
    else if (!after.audCheckin) category = "B_pull_missed_checkin";
    else if (doneN === 0) category = "C_merge_or_repair_lost_done";
    else if (doneN < expectN) category = "C_repair_underfill_batches";
    else category = "ok_or_D_if_ui_hides";

    report.verdict = {
      category,
      cloudHasAudible: !!audCloud,
      localHasCheckin: !!after.audCheckin,
      localDoneCount: doneN,
      expectFromBatches: expectN,
      highFiveDoneCount: (after.h5Done || []).length,
      miraaDoneCount: (after.miraaDone || []).length,
      domainsHabitLag:
        Number(liveHabitMeta.payload?.v || 0) - Number(liveDomains.payload?.versions?.habit || 0)
    };

    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.verdict, null, 2));
    console.log("audDone", JSON.stringify(after.audDone, null, 2));
    console.log("logs", report.logs.filter((l) => /habit-done-chain|audible|FOCUS|repair/i.test(l)).slice(-20));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
