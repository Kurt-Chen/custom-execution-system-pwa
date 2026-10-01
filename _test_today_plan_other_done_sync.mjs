/**
 * 其他任务完成态同步回归（纯 Node，无浏览器）。
 * 验证：weekUpsert clone 不再 Date.now 抬兄弟时间戳盖掉完成态；
 * 拉取侧 mainDone 按 statusAt 字段级 LWW，即使 local.updatedAt 更新也能合入远程完成。
 * 运行：node _test_today_plan_other_done_sync.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function itemTs(item) {
  if (!item || typeof item !== "object") return 0;
  return Math.max(
    Number(item.updatedAt) || 0,
    Number(item.completedAt) || 0,
    Number(item.statusAt) || 0,
    Number(item.deletedAt) || 0
  );
}

/** 与 index.html aliyunSprintRealCloneTaskForCloud 修复后语义一致 */
function cloneFixed(weekKey, task) {
  const cloned = {
    id: String(task.id),
    weekKey,
    text: String(task.text || ""),
    lane: task.lane || "open",
    mainDone: Boolean(task.mainDone),
    microTasks: [],
    statusAt: Number(task.statusAt) || 0,
    completedAt: Number(task.completedAt) || 0,
    updatedAt: Number(task.updatedAt) || 0,
    todayPlanDate: task.todayPlanDate || ""
  };
  const ts = Math.max(itemTs(cloned), itemTs(task));
  cloned.updatedAt = ts > 0 ? ts : Date.now();
  cloned.deleted = false;
  return cloned;
}

function applyUpsert(env, item) {
  const id = String(item.id);
  const ts = itemTs(item) || Date.now();
  item.updatedAt = ts;
  const prev = env.items[id];
  const prevTs = itemTs(prev);
  if (ts < prevTs) return { kept: prev, applied: false };
  env.items[id] = item;
  return { kept: item, applied: true };
}

function mergeMainDone(loc, rem, preferRemote) {
  const lDone = Boolean(loc && loc.mainDone);
  const rDone = Boolean(rem && rem.mainDone);
  if (lDone === rDone) return lDone;
  const lt = Number(loc && (loc.statusAt || loc.completedAt)) || 0;
  const rt = Number(rem && (rem.statusAt || rem.completedAt)) || 0;
  if (rt > lt) return rDone;
  if (lt > rt) return lDone;
  return preferRemote ? rDone : lDone;
}

const t0 = 1_700_000_000_000;
const deskDone = {
  id: "other-1",
  text: "每日健身",
  lane: "open",
  mainDone: true,
  statusAt: t0 + 5000,
  completedAt: t0 + 5000,
  updatedAt: t0 + 5000,
  todayPlanDate: "2026-10-01"
};
const phoneIncomplete = {
  id: "other-1",
  text: "每日健身",
  lane: "open",
  mainDone: false,
  statusAt: t0,
  updatedAt: t0,
  todayPlanDate: "2026-10-01"
};

const env = { items: { "other-1": { ...deskDone, weekKey: "2026-09-29" } } };
const fixedPush = cloneFixed("2026-09-29", phoneIncomplete);
const fixedResult = applyUpsert(env, { ...fixedPush });
assert.equal(fixedResult.applied, false, "未完成旧时间戳不得覆盖云端完成");
assert.equal(fixedResult.kept.mainDone, true, "云端 mainDone 应保留");
assert.equal(cloneFixed("2026-09-29", phoneIncomplete).updatedAt, t0, "clone 保留原 updatedAt");

const localHighTs = { ...phoneIncomplete, updatedAt: t0 + 9000, statusAt: t0 };
assert.equal(
  mergeMainDone(localHighTs, deskDone, false),
  true,
  "statusAt 字段级 LWW 应合入远程完成（即使 preferRemote=false）"
);

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
assert.match(html, /勿强刷 Date\.now/);
assert.match(html, /勿因 local\.updatedAt 更新就整项跳过/);
assert.match(html, /today-plan-other-done/);
assert.match(html, /paintTodayPlanPanel\(\);\s*\n\s*\}\s*\n\s*\} catch \(_rf\)/);
assert.doesNotMatch(
  html,
  /Math\.max\(aliyunSprintRealItemTs\(cloned\), aliyunSprintRealItemTs\(task\), Date\.now\(\)\)/
);
assert.match(sw, /exec-system-pwa-v20261001eg/);
assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261001eg"/);

console.log("OK today-plan-other-done-sync");
