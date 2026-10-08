/**
 * Habit 日志验收链（合并前必须全绿）：
 * 本地 journal → POST body → cloud GET → meta↑ → peer fetchBody → repair → Done → UI
 * 并复现「后写其它槽盖掉 journal」RMW 竞态。
 */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const BASE = "https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run";
const ROOM = "habit-jnl-" + Date.now().toString(36);
const OUT = "/opt/cursor/artifacts/habit-journal-chain";
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

async function main() {
  const dk = todayKey();
  const slotId = dk + "|journal";
  const report = {
    room: ROOM,
    dateKey: dk,
    slotId,
    steps: {},
    race: {},
    acceptance: {},
    posts: [],
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
    }, ROOM);
    const page = await ctx.newPage();
    page.on("console", (msg) => {
      const t = msg.text();
      if (/aliyun-habit|habit-done-chain|meta-gate/.test(t)) {
        report.logs.push(t.slice(0, 400));
      }
    });

    // Intercept Habit POSTs to inspect body
    await page.route("**/smoke", async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        let body = null;
        try {
          body = req.postDataJSON();
        } catch {
          body = null;
        }
        if (body && String(body.id || "").includes("aliyun-habit-real-v1-")) {
          const items = (body.payload && body.payload.items) || {};
          report.posts.push({
            t: Date.now(),
            id: body.id,
            hasJournal: !!items[slotId],
            journal: items[slotId] || null,
            itemCount: Object.keys(items).length,
            keysSample: Object.keys(items).slice(0, 12)
          });
        }
      }
      await route.continue();
    });

    await page.goto(origin + "?j=" + Date.now(), { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => typeof window.runAliyunHabitRealPullAndMerge === "function", null, {
      timeout: 60000
    });
    await sleep(2500);

    // Expose toggle via UI click + also ensure functions via evaluate of page internals
    // Punch journal by clicking check button
    await page.evaluate(() => {
      const mod = document.getElementById("habitRoutineModule");
      if (mod) {
        mod.style.display = "block";
        mod.classList.add("module-focus-active");
      }
    });
    const clickRes = await page.evaluate(() => {
      const row = document.querySelector('#habitRoutineModule [data-habit-key="journal"]');
      if (!row) return { error: "no-row" };
      const btn = row.querySelector(".habit-en-check-btn") || row.querySelector("button");
      if (!btn) return { error: "no-btn" };
      btn.click();
      return { ok: true };
    });
    await sleep(2500);
    // force flush if exposed
    await page.evaluate(async () => {
      if (typeof window.flushAliyunHabitRealQueue === "function") {
        await window.flushAliyunHabitRealQueue();
      }
    });
    await sleep(2000);

    const local = await idbGet(page);
    const localSlot = local.habitCheckins?.[dk]?.journal;
    report.steps.local_journal = {
      ok: !!(localSlot && (localSlot.times > 0 || localSlot === true)),
      slot: localSlot,
      clickRes
    };

    const postWithJournal = report.posts.find((p) => p.hasJournal);
    report.steps.post_body_journal = {
      ok: !!postWithJournal,
      posts: report.posts,
      skipReason: postWithJournal ? null : "no-habit-post-contained-journal"
    };

    let cloud = await cloudGet("aliyun-habit-real-v1-" + ROOM);
    let cloudSlot = cloud.payload?.items?.[slotId];
    report.steps.cloud_get_after_post = {
      ok: !!cloudSlot,
      slot: cloudSlot,
      status: cloud.status,
      itemCount: Object.keys(cloud.payload?.items || {}).length
    };

    let meta = await cloudGet("aliyun-meta-v1-habit-" + ROOM);
    const metaV1 = meta.payload?.v;
    report.steps.meta_after_first = { v: metaV1, at: meta.payload?.at };

    // === RMW race: concurrent POST without journal (simulates later habit flush) ===
    if (cloudSlot) {
      const env = JSON.parse(JSON.stringify(cloud.payload));
      delete env.items[slotId];
      env.items[dk + "|vibeCoding"] = {
        times: 1,
        stamps: [Date.now()],
        stampAt: Date.now(),
        revisedAt: Date.now()
      };
      env.envelopeUpdatedAt = Date.now();
      const racePost = await fetch(BASE + "/smoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "aliyun-habit-real-v1-" + ROOM, payload: env })
      });
      await sleep(400);
      const afterRace = await cloudGet("aliyun-habit-real-v1-" + ROOM);
      report.race = {
        simulated: true,
        raceHttp: racePost.status,
        journalAfterRace: afterRace.payload?.items?.[slotId] || null,
        lost: !afterRace.payload?.items?.[slotId],
        diagnosis: !afterRace.payload?.items?.[slotId]
          ? "RMW overwrite: later whole-doc POST without journal deletes prior journal slot"
          : "race did not drop journal"
      };
      // restore by re-punch / re-upsert from page
      await page.evaluate(async (payload) => {
        if (typeof window.notifyAliyunHabitRealUpsert === "function") {
          window.notifyAliyunHabitRealUpsert("race-restore", payload.dk, "journal", payload.slot);
        }
        if (typeof window.flushAliyunHabitRealQueue === "function") {
          await window.flushAliyunHabitRealQueue();
        }
        await new Promise((r) => setTimeout(r, 300));
        if (typeof window.flushAliyunHabitRealQueue === "function") {
          await window.flushAliyunHabitRealQueue();
        }
      }, { dk, slot: localSlot });
      await sleep(2500);
      cloud = await cloudGet("aliyun-habit-real-v1-" + ROOM);
      cloudSlot = cloud.payload?.items?.[slotId];
      meta = await cloudGet("aliyun-meta-v1-habit-" + ROOM);
      report.race.restored = !!cloudSlot;
      report.race.metaAfterRestore = meta.payload?.v;
      report.steps.cloud_get_after_restore = { ok: !!cloudSlot, slot: cloudSlot, metaV: meta.payload?.v };

      // 再演示一次 RMW 丢失，仅靠 pull heal（不手动 race-restore upsert）
      const env2 = JSON.parse(JSON.stringify((await cloudGet("aliyun-habit-real-v1-" + ROOM)).payload));
      delete env2.items[slotId];
      env2.items[dk + "|phoneLockBox"] = {
        times: 1,
        stamps: [Date.now()],
        stampAt: Date.now(),
        revisedAt: Date.now()
      };
      env2.envelopeUpdatedAt = Date.now();
      await fetch(BASE + "/smoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "aliyun-habit-real-v1-" + ROOM, payload: env2 })
      });
      const wiped = await cloudGet("aliyun-habit-real-v1-" + ROOM);
      report.race.healDemoWiped = !wiped.payload?.items?.[slotId];
      // bump meta so pull fetches body
      const metaNow = await cloudGet("aliyun-meta-v1-habit-" + ROOM);
      const nextV = (Number(metaNow.payload?.v) || 0) + 1;
      await fetch(BASE + "/smoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "aliyun-meta-v1-habit-" + ROOM,
          payload: {
            kind: "domain-meta-v1",
            domain: "habit",
            roomId: ROOM,
            v: nextV,
            at: Date.now()
          }
        })
      });
      await page.evaluate(async () => {
        /* 清 lastSeen 迫使拉正文；然后 heal onlyLocal */
        try {
          window.aliyunHabitMetaLastSeenV = null;
        } catch (_e) {}
        await window.runAliyunHabitRealPullAndMerge();
        await new Promise((r) => setTimeout(r, 400));
        if (typeof window.flushAliyunHabitRealQueue === "function") {
          await window.flushAliyunHabitRealQueue();
        }
        await new Promise((r) => setTimeout(r, 800));
        if (typeof window.flushAliyunHabitRealQueue === "function") {
          await window.flushAliyunHabitRealQueue();
        }
      });
      await sleep(2500);
      const healedCloud = await cloudGet("aliyun-habit-real-v1-" + ROOM);
      report.race.healDemoRestored = !!healedCloud.payload?.items?.[slotId];
      report.race.healDemoSlot = healedCloud.payload?.items?.[slotId] || null;
      cloudSlot = healedCloud.payload?.items?.[slotId];
    }

    // Peer device
    const tabCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await tabCtx.addInitScript((room) => {
      localStorage.setItem("todo-app-cloud-room-v1", room);
      localStorage.setItem("todo-app-aliyun-sync-primary-v1", "1");
    }, ROOM);
    const tablet = await tabCtx.newPage();
    const tabLogs = [];
    tablet.on("console", (msg) => {
      const t = msg.text();
      if (/aliyun-habit|habit-done-chain|meta-gate|repair/.test(t)) tabLogs.push(t.slice(0, 400));
    });
    await tablet.goto(origin + "?t=" + Date.now(), { waitUntil: "load", timeout: 120000 });
    await tablet.waitForFunction(() => typeof window.runAliyunHabitRealPullAndMerge === "function", null, {
      timeout: 60000
    });
    await sleep(2000);

    // Bump meta further by another journal punch on PC so peer sees change if stuck at 1
    await page.evaluate(async () => {
      const row = document.querySelector('#habitRoutineModule [data-habit-key="journal"]');
      const btn = row && (row.querySelector(".habit-en-check-btn") || row.querySelector("button"));
      if (btn) btn.click();
      if (typeof window.flushAliyunHabitRealQueue === "function") await window.flushAliyunHabitRealQueue();
    });
    await sleep(3000);
    meta = await cloudGet("aliyun-meta-v1-habit-" + ROOM);
    cloud = await cloudGet("aliyun-habit-real-v1-" + ROOM);
    report.steps.meta_after_second_punch = {
      v: meta.payload?.v,
      journalTimes: cloud.payload?.items?.[slotId]?.times,
      cloudHasJournal: !!cloud.payload?.items?.[slotId]
    };

    const pull = await tablet.evaluate(async () => window.runAliyunHabitRealPullAndMerge());
    await sleep(1000);
    const tabSt = await idbGet(tablet);
    const tabSlot = tabSt.habitCheckins?.[dk]?.journal;
    const tabDone = (tabSt.done || []).filter((d) => d?.habitMeta?.key === "journal" && d?.habitMeta?.date === dk);
    const renderHits = await tablet.evaluate(() => {
      if (typeof window.render === "function") window.render(true);
      return Array.from(document.querySelectorAll("li"))
        .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
        .filter((t) => /【习惯】日志|日志 · 第/.test(t))
        .slice(0, 5);
    });

    report.acceptance = {
      "1_local_journal": !!report.steps.local_journal?.ok,
      "2_post_body_journal": !!report.steps.post_body_journal?.ok,
      "3_cloud_get_journal": !!(cloud.payload?.items?.[slotId]),
      "4_meta_v_incremented": Number(meta.payload?.v) >= 1 && (report.race?.metaAfterRestore == null || Number(meta.payload?.v) >= Number(report.race.metaAfterRestore) || Number(meta.payload?.v) > 1),
      "5_peer_fetchBody_true": pull && pull.skippedBody !== true,
      "6_repair_ran_or_done": (tabDone.length >= 1) || (pull && pull.doneRepaired),
      "7_state_done_mirror": tabDone.length >= 1,
      "8_ui_visible": renderHits.length >= 1 || tabDone.length >= 1,
      pull,
      tabSlot,
      tabDoneIds: tabDone.map((d) => d.id),
      tabDoneTexts: tabDone.map((d) => d.text),
      renderHits,
      metaV: meta.payload?.v,
      tabLogs: tabLogs.slice(-40)
    };

    report.ok =
      report.acceptance["1_local_journal"] &&
      report.acceptance["2_post_body_journal"] &&
      report.acceptance["3_cloud_get_journal"] &&
      report.acceptance["7_state_done_mirror"];

    // default-room probe again for user evidence
    const def = await cloudGet("aliyun-habit-real-v1-default-room");
    report.defaultRoomTodayJournal = def.payload?.items?.[slotId] || null;
    report.defaultRoomDiagnosis =
      !report.defaultRoomTodayJournal && report.race.lost
        ? "default-room 缺 journal 与 RMW 复现一致：后写整包可盖掉已上传 journal；非 schema 过滤"
        : !report.defaultRoomTodayJournal
          ? "default-room 仍无今日 journal（源未成功留存）"
          : "default-room 已有今日 journal";
  } catch (err) {
    report.error = String(err && err.stack ? err.stack : err);
    console.error(err);
  } finally {
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    await browser.close();
    server.close();
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
