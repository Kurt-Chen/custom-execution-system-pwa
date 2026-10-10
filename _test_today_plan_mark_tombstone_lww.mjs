/**
 * 今日挂牌 tombstone LWW（纯 Node）。
 * T1–T8 + 同刻删除优先 / 离线编辑打卡 / 主动重新加入。
 *
 * 运行：
 *   node _test_today_plan_mark_tombstone_lww.mjs --legacy   # 对照当前漏洞语义（应失败）
 *   node _test_today_plan_mark_tombstone_lww.mjs            # 修复后语义（应通过）
 *   node _test_today_plan_mark_tombstone_lww.mjs --check-html  # 额外检查 index.html 已合入关键字
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USE_LEGACY = process.argv.includes("--legacy");
const CHECK_HTML = process.argv.includes("--check-html");

function normalizeWeeklyPlanTodayPlanDate(value) {
  if (typeof value !== "string") return "";
  const s = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function getTodayPlanDateUpdatedAt(task) {
  return Number(task && task.todayPlanDateUpdatedAt) || 0;
}

/* —— 漏洞语义（修复前）：用 task.updatedAt 解封；无 local 整项灌入 —— */
function pickDateLegacy(locTask, remTask, tombAt) {
  const lHas = !!(locTask && Object.prototype.hasOwnProperty.call(locTask, "todayPlanDate"));
  const rHas = !!(remTask && Object.prototype.hasOwnProperty.call(remTask, "todayPlanDate"));
  const lVal = lHas ? normalizeWeeklyPlanTodayPlanDate(locTask.todayPlanDate) : "";
  const rVal = rHas ? normalizeWeeklyPlanTodayPlanDate(remTask.todayPlanDate) : "";
  const lU = Number(locTask && locTask.updatedAt) || 0;
  const rU = Number(remTask && remTask.updatedAt) || 0;
  let cleared = false;
  if (tombAt > 0) {
    if (rVal && rU > tombAt) {
      cleared = true;
      return { date: rVal, tombCleared: cleared };
    }
    if (lHas) return { date: lVal, tombCleared: false };
    return { date: "", tombCleared: false };
  }
  if (lHas && !rHas) return { date: lVal, tombCleared: false };
  if (rHas && !lHas) return { date: rVal, tombCleared: false };
  if (!lHas && !rHas) return { date: "", tombCleared: false };
  if (rU > lU) return { date: rVal, tombCleared: false };
  return { date: lVal, tombCleared: false };
}

function mergeSprintImportLegacy(local, remote, tombAt) {
  if (!local || !local.id) {
    return {
      task: Object.assign({}, remote),
      tombCleared: false,
      bypassedPick: true
    };
  }
  const picked = pickDateLegacy(local, remote, tombAt);
  return {
    task: Object.assign({}, local, remote, { todayPlanDate: picked.date }),
    tombCleared: picked.tombCleared,
    bypassedPick: false
  };
}

function mergeMarksLegacy(localTask, remDate, remU, tombAt) {
  const locDate = normalizeWeeklyPlanTodayPlanDate(localTask.todayPlanDate);
  const locU = Number(localTask.updatedAt) || 0;
  let tombCleared = false;
  if (tombAt > 0 && remDate && remU <= tombAt) {
    return { date: locDate, applied: false, tombCleared: false };
  }
  if (tombAt > 0 && remDate && remU > tombAt) tombCleared = true;
  if (remU <= locU) return { date: locDate, applied: false, tombCleared };
  if (remDate === locDate) return { date: locDate, applied: false, tombCleared };
  return { date: remDate, applied: true, tombCleared };
}

/* —— 修复后语义 —— */
function pickDateFixed(locTask, remTask, tombAt) {
  const lHas = !!(locTask && Object.prototype.hasOwnProperty.call(locTask, "todayPlanDate"));
  const rHas = !!(remTask && Object.prototype.hasOwnProperty.call(remTask, "todayPlanDate"));
  const lVal = lHas ? normalizeWeeklyPlanTodayPlanDate(locTask.todayPlanDate) : "";
  const rVal = rHas ? normalizeWeeklyPlanTodayPlanDate(remTask.todayPlanDate) : "";
  const lMark = getTodayPlanDateUpdatedAt(locTask);
  const rMark = getTodayPlanDateUpdatedAt(remTask);
  let tombCleared = false;
  if (tombAt > 0) {
    /* joinTime > tombstoneTime 才解封；相等删除优先 */
    if (rVal && rMark > tombAt) {
      tombCleared = true;
      return { date: rVal, markAt: rMark, tombCleared };
    }
    if (lHas) return { date: lVal, markAt: lMark, tombCleared: false };
    return { date: "", markAt: 0, tombCleared: false };
  }
  if (lHas && !rHas) return { date: lVal, markAt: lMark, tombCleared: false };
  if (rHas && !lHas) return { date: rVal, markAt: rMark, tombCleared: false };
  if (!lHas && !rHas) return { date: "", markAt: 0, tombCleared: false };
  if (rMark > lMark) return { date: rVal, markAt: rMark, tombCleared: false };
  if (lMark > rMark) return { date: lVal, markAt: lMark, tombCleared: false };
  return { date: lVal, markAt: lMark, tombCleared: false };
}

function stripHangIfTombstoned(task, tombAt) {
  if (!task || tombAt <= 0) return { task, stripped: false };
  const date = normalizeWeeklyPlanTodayPlanDate(task.todayPlanDate);
  if (!date) return { task, stripped: false };
  const markAt = getTodayPlanDateUpdatedAt(task);
  if (markAt > tombAt) return { task, stripped: false };
  const next = Object.assign({}, task, { todayPlanDate: "" });
  return { task: next, stripped: true };
}

function mergeSprintImportFixed(local, remote, tombAt) {
  if (!local || !local.id) {
    const normalized = Object.assign({}, remote);
    const guarded = stripHangIfTombstoned(normalized, tombAt);
    return {
      task: guarded.task,
      tombCleared: false,
      bypassedPick: true,
      stripped: guarded.stripped
    };
  }
  const picked = pickDateFixed(local, remote, tombAt);
  const merged = Object.assign({}, local, remote, {
    todayPlanDate: picked.date
  });
  if (picked.markAt > 0) merged.todayPlanDateUpdatedAt = picked.markAt;
  else if (Object.prototype.hasOwnProperty.call(local, "todayPlanDateUpdatedAt")) {
    merged.todayPlanDateUpdatedAt = local.todayPlanDateUpdatedAt;
  }
  return {
    task: merged,
    tombCleared: picked.tombCleared,
    bypassedPick: false,
    stripped: false
  };
}

function mergeMarksFixed(localTask, remDate, remU, tombAt) {
  const locDate = normalizeWeeklyPlanTodayPlanDate(localTask.todayPlanDate);
  const locMark = getTodayPlanDateUpdatedAt(localTask);
  let tombCleared = false;
  if (tombAt > 0 && remDate && remU <= tombAt) {
    return { date: locDate, markAt: locMark, applied: false, tombCleared: false };
  }
  if (tombAt > 0 && remDate && remU > tombAt) tombCleared = true;
  if (remU <= locMark) return { date: locDate, markAt: locMark, applied: false, tombCleared };
  if (remDate === locDate) {
    return { date: locDate, markAt: locMark, applied: false, tombCleared };
  }
  return { date: remDate, markAt: remU, applied: true, tombCleared };
}

function cloneMarkFixed(task) {
  const date = Object.prototype.hasOwnProperty.call(task, "todayPlanDate")
    ? normalizeWeeklyPlanTodayPlanDate(task.todayPlanDate)
    : "";
  const updatedAt = getTodayPlanDateUpdatedAt(task);
  return { id: String(task.id), date, updatedAt, source: "weeklyPlan" };
}

function cloneMarkLegacy(task) {
  const date = Object.prototype.hasOwnProperty.call(task, "todayPlanDate")
    ? normalizeWeeklyPlanTodayPlanDate(task.todayPlanDate)
    : "";
  let updatedAt = Number(task.updatedAt) || 0;
  updatedAt = Math.max(updatedAt, Date.now());
  return { id: String(task.id), date, updatedAt, source: "weeklyPlan" };
}

const pickDate = USE_LEGACY ? pickDateLegacy : pickDateFixed;
const mergeSprint = USE_LEGACY ? mergeSprintImportLegacy : mergeSprintImportFixed;
const mergeMarks = USE_LEGACY ? mergeMarksLegacy : mergeMarksFixed;
const cloneMark = USE_LEGACY ? cloneMarkLegacy : cloneMarkFixed;

const t0 = 1_700_000_000_000;
const TODAY = "2026-10-10";
let failed = [];
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("PASS " + name);
  } catch (err) {
    failed.push(name);
    console.log("FAIL " + name);
    console.log("  " + (err && err.message ? err.message : String(err)));
  }
}

/* T1: A 删除挂单，B 编辑旧任务，A 不得复活 */
test("T1 A摘牌后 B 仅改字抬 updatedAt 不得复活", function () {
  const tombAt = t0 + 1000;
  const local = {
    id: "t1",
    text: "70天计划",
    todayPlanDate: "",
    todayPlanDateUpdatedAt: tombAt,
    updatedAt: tombAt
  };
  const remote = {
    id: "t1",
    text: "70天计划·改",
    todayPlanDate: TODAY,
    todayPlanDateUpdatedAt: t0,
    updatedAt: t0 + 5000
  };
  const out = mergeSprint(local, remote, tombAt);
  assert.equal(normalizeWeeklyPlanTodayPlanDate(out.task.todayPlanDate), "");
  assert.equal(out.tombCleared, false);
});

/* T2: A 删除，B 打卡 */
test("T2 A摘牌后 B 打卡抬 statusAt/updatedAt 不得复活", function () {
  const tombAt = t0 + 1000;
  const local = {
    id: "t2",
    todayPlanDate: "",
    todayPlanDateUpdatedAt: tombAt,
    updatedAt: tombAt,
    mainDone: false
  };
  const remote = {
    id: "t2",
    todayPlanDate: TODAY,
    todayPlanDateUpdatedAt: t0,
    updatedAt: t0 + 9000,
    mainDone: true,
    statusAt: t0 + 9000,
    completedAt: t0 + 9000
  };
  const out = mergeSprint(local, remote, tombAt);
  assert.equal(normalizeWeeklyPlanTodayPlanDate(out.task.todayPlanDate), "");
  assert.equal(out.tombCleared, false);
});

/* T3: 旧同步请求延迟返回 */
test("T3 迟到旧 Sprint/marks 非空挂牌不得覆盖", function () {
  const tombAt = t0 + 2000;
  const local = {
    id: "t3",
    todayPlanDate: "",
    todayPlanDateUpdatedAt: tombAt,
    updatedAt: tombAt
  };
  const lateRemote = {
    id: "t3",
    todayPlanDate: TODAY,
    todayPlanDateUpdatedAt: t0 + 500,
    updatedAt: t0 + 500
  };
  const sprint = mergeSprint(local, lateRemote, tombAt);
  assert.equal(normalizeWeeklyPlanTodayPlanDate(sprint.task.todayPlanDate), "");
  const marks = mergeMarks(local, TODAY, t0 + 500, tombAt);
  assert.equal(marks.applied, false);
  assert.equal(normalizeWeeklyPlanTodayPlanDate(marks.date), "");
});

/* T4: 主动重新加入 */
test("T4 远端显式 join（挂牌时钟 > tomb）允许恢复", function () {
  const tombAt = t0 + 1000;
  const local = {
    id: "t4",
    todayPlanDate: "",
    todayPlanDateUpdatedAt: tombAt,
    updatedAt: tombAt
  };
  const remote = {
    id: "t4",
    todayPlanDate: TODAY,
    todayPlanDateUpdatedAt: tombAt + 50,
    updatedAt: tombAt + 50
  };
  const out = mergeSprint(local, remote, tombAt);
  assert.equal(normalizeWeeklyPlanTodayPlanDate(out.task.todayPlanDate), TODAY);
  assert.equal(out.tombCleared, true);
});

/* T5: 旧数据缺 todayPlanDateUpdatedAt */
test("T5 缺挂牌时钟 + 有 tomb + 远端非空 → 不复活", function () {
  const tombAt = t0 + 3000;
  const local = { id: "t5", todayPlanDate: "", updatedAt: tombAt };
  const remote = {
    id: "t5",
    todayPlanDate: TODAY,
    updatedAt: tombAt + 99999
  };
  const out = mergeSprint(local, remote, tombAt);
  assert.equal(normalizeWeeklyPlanTodayPlanDate(out.task.todayPlanDate), "");
  assert.equal(out.tombCleared, false);
  const marks = mergeMarks(local, TODAY, 0, tombAt);
  assert.equal(marks.applied, false);
});

/* T6: 无 tomb 的旧挂牌缺新字段不批量变空 */
test("T6 无 tomb 旧非空挂牌缺新字段 → 保留本机挂牌", function () {
  const local = { id: "t6", todayPlanDate: TODAY, updatedAt: t0 };
  const remote = { id: "t6", todayPlanDate: TODAY, updatedAt: t0 + 1 };
  const out = mergeSprint(local, remote, 0);
  assert.equal(normalizeWeeklyPlanTodayPlanDate(out.task.todayPlanDate), TODAY);
});

/* T7: 重复同步稳定 */
test("T7 摘牌状态重复 merge 10 次仍为空", function () {
  const tombAt = t0 + 4000;
  let local = {
    id: "t7",
    todayPlanDate: "",
    todayPlanDateUpdatedAt: tombAt,
    updatedAt: tombAt
  };
  const remote = {
    id: "t7",
    todayPlanDate: TODAY,
    todayPlanDateUpdatedAt: t0,
    updatedAt: t0 + 8000
  };
  for (let i = 0; i < 10; i++) {
    const out = mergeSprint(local, remote, tombAt);
    assert.equal(normalizeWeeklyPlanTodayPlanDate(out.task.todayPlanDate), "");
    local = out.task;
  }
});

/* T8: Sprint local==null / 跨周整项灌入 */
test("T8 无 local 整项灌入时有 tomb 须剥掉非空挂牌", function () {
  const tombAt = t0 + 5000;
  const remote = {
    id: "t8",
    weekKey: "2026-09-01",
    todayPlanDate: TODAY,
    todayPlanDateUpdatedAt: t0,
    updatedAt: t0 + 100
  };
  const out = mergeSprint(null, remote, tombAt);
  assert.equal(normalizeWeeklyPlanTodayPlanDate(out.task.todayPlanDate), "");
});

/* 特别验证：同刻删除优先 */
test("EQ 同时间戳冲突删除优先（joinTime === tomb → 不解封）", function () {
  const tombAt = t0 + 6000;
  const local = {
    id: "eq",
    todayPlanDate: "",
    todayPlanDateUpdatedAt: tombAt,
    updatedAt: tombAt
  };
  const remote = {
    id: "eq",
    todayPlanDate: TODAY,
    todayPlanDateUpdatedAt: tombAt,
    updatedAt: tombAt
  };
  const out = mergeSprint(local, remote, tombAt);
  assert.equal(normalizeWeeklyPlanTodayPlanDate(out.task.todayPlanDate), "");
  assert.equal(out.tombCleared, false);
  const marks = mergeMarks(local, TODAY, tombAt, tombAt);
  assert.equal(marks.applied, false);
  assert.equal(marks.tombCleared, false);
});

/* 特别验证：离线编辑/打卡再联网 */
test("OFFLINE 旧设备离线编辑+打卡后联网不得复活", function () {
  const tombAt = t0 + 7000;
  const localA = {
    id: "off",
    todayPlanDate: "",
    todayPlanDateUpdatedAt: tombAt,
    updatedAt: tombAt
  };
  const offlineB = {
    id: "off",
    text: "粤鹏7月凭证·改",
    todayPlanDate: TODAY,
    todayPlanDateUpdatedAt: t0 + 100,
    updatedAt: tombAt + 20000,
    mainDone: true,
    statusAt: tombAt + 20000
  };
  const out = mergeSprint(localA, offlineB, tombAt);
  assert.equal(normalizeWeeklyPlanTodayPlanDate(out.task.todayPlanDate), "");
});

/* 特别验证：主动重新加入可跨端 */
test("REJOIN 主动重新加入挂牌时钟推进后可同步", function () {
  const tombAt = t0 + 8000;
  const localA = {
    id: "rj",
    todayPlanDate: "",
    todayPlanDateUpdatedAt: tombAt,
    updatedAt: tombAt
  };
  const joinB = {
    id: "rj",
    todayPlanDate: TODAY,
    todayPlanDateUpdatedAt: tombAt + 1,
    updatedAt: tombAt + 1
  };
  const out = mergeSprint(localA, joinB, tombAt);
  assert.equal(normalizeWeeklyPlanTodayPlanDate(out.task.todayPlanDate), TODAY);
  assert.equal(out.tombCleared, true);
  const mark = cloneMark(joinB);
  if (!USE_LEGACY) {
    assert.equal(mark.updatedAt, tombAt + 1);
    assert.ok(mark.updatedAt < Date.now() - 1000 || mark.updatedAt === tombAt + 1);
  }
});

/* marks 空日期持久化：摘牌 mark 时钟不被任务 updatedAt/Date.now 抬高 */
test("MARKS 摘牌空 date 使用挂牌时钟且不强制 Date.now", function () {
  const leaveAt = t0 + 9000;
  const task = {
    id: "mk",
    todayPlanDate: "",
    todayPlanDateUpdatedAt: leaveAt,
    updatedAt: leaveAt + 50000
  };
  const mark = cloneMark(task);
  assert.equal(mark.date, "");
  if (USE_LEGACY) {
    assert.ok(mark.updatedAt >= Date.now() - 2000, "legacy 会 Date.now 抬高");
  } else {
    assert.equal(mark.updatedAt, leaveAt);
  }
});

if (CHECK_HTML && !USE_LEGACY) {
  test("HTML 含 todayPlanDateUpdatedAt 与挂牌时钟解封", function () {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.match(html, /todayPlanDateUpdatedAt/);
    assert.match(html, /stampTodayPlanDateRevision|getTodayPlanDateUpdatedAt/);
    assert.match(html, /rMark > tombAt|joinTime|todayPlanDateUpdatedAt/);
    assert.doesNotMatch(
      html,
      /aliyunTodayPlanRealCloneMarkForCloud[\s\S]{0,400}Math\.max\(updatedAt,\s*Date\.now\(\)\)/
    );
  });
}

console.log("");
console.log(
  "mode=" +
    (USE_LEGACY ? "legacy" : "fixed") +
    " passed=" +
    passed +
    " failed=" +
    failed.length +
    (failed.length ? " [" + failed.join(", ") + "]" : "")
);

if (failed.length) process.exit(1);
