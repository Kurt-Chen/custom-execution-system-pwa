/**
 * 验证：封闭清单 / 其他任务 ↔ 十二周年子任务双向打卡。
 * 经典脚本 let state 不在 window：经全局函数 + IDB 快照断言。
 */
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

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

async function main() {
  const { server, origin } = await startServer();
  const browser = await chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"]
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const results = [];
  const pass = (name, ok, detail) => {
    results.push({ name, ok: !!ok, detail: detail || "" });
    console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
  };

  async function flushAndReadState() {
    await page.evaluate(() => {
      try {
        if (typeof saveState === "function") saveState({ skipUiPaintDirty: true });
      } catch (_s) {}
      try {
        if (typeof flushLocalPersistedState === "function") flushLocalPersistedState("force");
      } catch (_f) {}
    });
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

  function findAnnTask(st, moduleKey, parentId, weekNum) {
    const sk =
      moduleKey === "tw020"
        ? "anniversaryTw020"
        : moduleKey === "tw021"
          ? "anniversaryTw021"
          : moduleKey === "tw022"
            ? "anniversaryTw022"
            : null;
    const mod = sk ? st[sk] : null;
    const weeks = mod && mod.weeks;
    const arr = weeks && weeks[String(weekNum)];
    if (!Array.isArray(arr)) return null;
    return arr.find((t) => t && String(t.id) === String(parentId)) || null;
  }

  function findClMirror(st, parentId, subId) {
    return (st.closedList || []).find(
      (it) =>
        it &&
        it.mirrorOf &&
        it.mirrorOf.kind === "anniversaryTw" &&
        String(it.mirrorOf.taskId) === String(parentId) &&
        String(it.mirrorOf.subId || "") === String(subId)
    );
  }

  function findOtherMirror(st, parentId, subId) {
    const plan = st.weeklyPlan || {};
    for (const wk of Object.keys(plan)) {
      const arr = plan[wk];
      if (!Array.isArray(arr)) continue;
      for (const t of arr) {
        const mo = t && t.mirrorOf;
        if (
          mo &&
          mo.kind === "anniversaryTw" &&
          String(mo.taskId) === String(parentId) &&
          String(mo.subId || "") === String(subId)
        ) {
          return { task: t, weekKey: wk };
        }
      }
    }
    return null;
  }

  try {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(
      () =>
        typeof window.promoteAnniversaryTaskToClosedList === "function" &&
        typeof window.toggleClosedListComplete === "function" &&
        typeof window.findAnniversaryTaskInStorage === "function" &&
        typeof window.applyAnniversaryCompletionFromMirror === "function" &&
        typeof window.afterAnniversaryCompletionAppliedFromMirror === "function",
      { timeout: 90000 }
    );

    const parentId = await page.evaluate(() => {
      try {
        if (typeof setAliyunSyncPrimaryEnabled === "function") setAliyunSyncPrimaryEnabled(false);
      } catch (_e) {}
      const moduleKey = "tw022";
      normalizeAnniversaryTwModuleStateByKey(moduleKey);
      const weekNum = 2;
      const parent = {
        id: "t-parent-" + Date.now().toString(36),
        text: "轻断食三次 (跳过午餐)",
        done: false,
        updatedAt: Date.now(),
        subs: [
          { id: "sub-1", text: "跳过午餐 (1)", done: true, updatedAt: 1 },
          { id: "sub-2", text: "跳过午餐 (2)", done: true, updatedAt: 1 },
          { id: "sub-3", text: "跳过午餐 (3)", done: false, updatedAt: 1 }
        ]
      };
      const mod = getAnniversaryTwStateModule(moduleKey);
      const key = String(weekNum);
      const next = (Array.isArray(mod.weeks[key]) ? mod.weeks[key].slice() : []).filter(
        (t) => !(t && String(t.text || "").indexOf("轻断食三次") === 0)
      );
      next.push(parent);
      mod.weeks[key] = next;

      promoteAnniversaryTaskToClosedList(moduleKey, weekNum, parent.id, "sub-3");
      promoteAnniversaryTaskToOtherTasks(moduleKey, weekNum, parent.id, "sub-3");
      if (typeof saveState === "function") {
        saveState({ lists: ["closedList", "done", "weeklyPlan"], skipUiPaintDirty: true });
      }
      try {
        flushLocalPersistedState("force");
      } catch (_f) {}
      return parent.id;
    });

    let st = await flushAndReadState();
    let cl = findClMirror(st, parentId, "sub-3");
    let other = findOtherMirror(st, parentId, "sub-3");
    let task = findAnnTask(st, "tw022", parentId, 2);

    pass(
      "封闭清单 mirrorOf 含 module/taskId/subId",
      !!(cl && cl.mirrorOf && cl.mirrorOf.module === "tw022" && String(cl.mirrorOf.subId) === "sub-3"),
      JSON.stringify(cl && cl.mirrorOf)
    );
    pass(
      "其他任务 mirrorOf 含 subId",
      !!(other && other.task && other.task.mirrorOf && String(other.task.mirrorOf.subId) === "sub-3"),
      JSON.stringify(other && other.task && other.task.mirrorOf)
    );
    pass("来源父任务 初始进度 2/3", !!(task && task.subs && task.subs.filter((s) => s.done).length === 2), "");

    const closedListId = cl && cl.id;
    const otherTaskId = other && other.task && other.task.id;

    /* A: 封闭清单打卡 */
    await page.evaluate((id) => {
      toggleClosedListComplete(id, true);
      try {
        flushLocalPersistedState("force");
      } catch (_f) {}
    }, closedListId);
    st = await flushAndReadState();
    cl = findClMirror(st, parentId, "sub-3");
    other = findOtherMirror(st, parentId, "sub-3");
    task = findAnnTask(st, "tw022", parentId, 2);
    const sub3A = task && (task.subs || []).find((s) => s.id === "sub-3");
    const progA = task ? (task.subs || []).filter((s) => s && s.done).length : -1;
    const doneCopiesA = (st.done || []).filter(
      (d) => d && d.closedListMeta && String(d.closedListMeta.sourceId) === String(closedListId)
    );

    pass(
      "封闭清单打卡 → 子任务3 done，进度 3/3",
      !!(sub3A && sub3A.done && progA === 3),
      "prog=" + progA + " sub3=" + !!(sub3A && sub3A.done)
    );
    pass("封闭清单打卡 → 不误标父任务 done", !!(task && task.done === false), "parentDone=" + (task && task.done));
    pass(
      "封闭清单打卡 → 其他任务 mainDone 同步",
      !!(other && other.task && other.task.mainDone === true),
      "mainDone=" + (other && other.task && other.task.mainDone)
    );
    pass("封闭清单打卡 → Done 副本不重复", doneCopiesA.length === 1, "copies=" + doneCopiesA.length);
    pass(
      "封闭清单打卡 → 抬高 sub updatedAt",
      !!(sub3A && Number(sub3A.updatedAt) > 1),
      "updatedAt=" + (sub3A && sub3A.updatedAt)
    );

    /* B: 撤销 */
    await page.evaluate((id) => {
      toggleClosedListComplete(id, false);
      try {
        flushLocalPersistedState("force");
      } catch (_f) {}
    }, closedListId);
    st = await flushAndReadState();
    cl = findClMirror(st, parentId, "sub-3");
    other = findOtherMirror(st, parentId, "sub-3");
    task = findAnnTask(st, "tw022", parentId, 2);
    const sub3B = task && (task.subs || []).find((s) => s.id === "sub-3");
    const progB = task ? (task.subs || []).filter((s) => s && s.done).length : -1;
    const doneCopiesB = (st.done || []).filter(
      (d) => d && d.closedListMeta && String(d.closedListMeta.sourceId) === String(closedListId)
    );

    pass(
      "封闭清单撤销 → 进度 2/3",
      !!(sub3B && sub3B.done === false && progB === 2 && cl && cl.completed === false),
      "prog=" + progB
    );
    pass(
      "封闭清单撤销 → 其他任务同步撤销",
      !!(other && other.task && other.task.mainDone === false),
      "mainDone=" + (other && other.task && other.task.mainDone)
    );
    pass("封闭清单撤销 → Done 副本清除", doneCopiesB.length === 0, "copies=" + doneCopiesB.length);

    /* C: 其他任务打卡 */
    await page.evaluate((id) => {
      toggleTodayPlanOtherTaskDone(id, true);
      try {
        flushLocalPersistedState("force");
      } catch (_f) {}
    }, otherTaskId);
    st = await flushAndReadState();
    cl = findClMirror(st, parentId, "sub-3");
    other = findOtherMirror(st, parentId, "sub-3");
    task = findAnnTask(st, "tw022", parentId, 2);
    const sub3C = task && (task.subs || []).find((s) => s.id === "sub-3");
    const progC = task ? (task.subs || []).filter((s) => s && s.done).length : -1;

    pass(
      "其他任务打卡 → 子任务3 done，进度 3/3，父未整标完成",
      !!(sub3C && sub3C.done && progC === 3 && task.done === false),
      "prog=" + progC + " parentDone=" + (task && task.done)
    );
    pass("其他任务打卡 → 封闭清单同步完成", !!(cl && cl.completed === true), "cl.completed=" + (cl && cl.completed));

    /* D: 来源端撤销 */
    await page.evaluate((pid) => {
      applyAnniversaryTwSubDoneWithLocalPatch("tw022", 2, pid, "sub-3", false);
      try {
        flushLocalPersistedState("force");
      } catch (_f) {}
    }, parentId);
    st = await flushAndReadState();
    cl = findClMirror(st, parentId, "sub-3");
    other = findOtherMirror(st, parentId, "sub-3");
    task = findAnnTask(st, "tw022", parentId, 2);
    const sub3D = task && (task.subs || []).find((s) => s.id === "sub-3");
    const progD = task ? (task.subs || []).filter((s) => s && s.done).length : -1;

    pass(
      "来源端撤销 → 进度 2/3，封闭清单与其他任务均撤销",
      !!(
        sub3D &&
        sub3D.done === false &&
        progD === 2 &&
        cl &&
        cl.completed === false &&
        other &&
        other.task.mainDone === false
      ),
      "prog=" + progD
    );

    /* E: merge LWW */
    const mergeLww = await page.evaluate(() => {
      const rem = [{ id: "sub-3", text: "跳过午餐 (3)", done: true, updatedAt: 100 }];
      const loc = [{ id: "sub-3", text: "跳过午餐 (3)", done: false, updatedAt: 200 }];
      const merged = mergeTwSubsForSync(rem, loc, true, { moduleKey: "tw022", taskId: "p" });
      const s = merged.find((x) => x.id === "sub-3");
      return { done: !!(s && s.done), updatedAt: s && s.updatedAt };
    });
    pass(
      "云合并子任务 done 按 updatedAt LWW（新撤销胜出）",
      mergeLww.done === false && mergeLww.updatedAt === 200,
      JSON.stringify(mergeLww)
    );

    /* F: 模拟刷新：loadState 后再读 */
    await page.evaluate(() => {
      if (typeof loadState === "function") loadState();
    });
    const live = await page.evaluate((pid) => {
      const located = findAnniversaryTaskInStorage("tw022", pid, 2);
      const task = located && located.task;
      const sub3 = task && (task.subs || []).find((s) => s.id === "sub-3");
      const other = findWeeklyPlanAnniversaryOtherMirror("tw022", pid, "sub-3");
      return {
        prog: task ? (task.subs || []).filter((s) => s && s.done).length : -1,
        sub3Done: !!(sub3 && sub3.done),
        otherMainDone: !!(other && other.task && other.task.mainDone),
        hasSubIdOnOther: !!(other && other.task && other.task.mirrorOf && other.task.mirrorOf.subId)
      };
    }, parentId);
    pass(
      "loadState 刷新后状态仍为撤销后的 2/3",
      live.prog === 2 && live.sub3Done === false && live.hasSubIdOnOther,
      JSON.stringify(live)
    );

    const failed = results.filter((r) => !r.ok);
    console.log("\nSummary: " + (results.length - failed.length) + "/" + results.length + " passed");
    if (failed.length) {
      failed.forEach((f) => console.log("FAIL detail: " + f.name + " — " + f.detail));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
