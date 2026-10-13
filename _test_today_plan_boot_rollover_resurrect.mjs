/**
 * 回归：旧设备启动结转不得把已删「其他任务」写回云端复活。
 *
 * 根因：rolloverIncompleteTodayPlanOtherTasksToToday 曾 stampTodayPlanDateRevision(Date.now())，
 * 且在阿里云首拉完成前 flush marks/Sprint，用未核对本机快照盖掉对端摘牌。
 *
 * 运行：node _test_today_plan_boot_rollover_resurrect.mjs
 *       node _test_today_plan_boot_rollover_resurrect.mjs --check-html
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHECK_HTML = process.argv.includes("--check-html");

function normalizeWeeklyPlanTodayPlanDate(value) {
  if (typeof value !== "string") return "";
  const s = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function getTodayPlanDateUpdatedAt(task) {
  return Number(task && task.todayPlanDateUpdatedAt) || 0;
}

function aliyunTodayPlanRealMarkTs(mark) {
  if (!mark || typeof mark !== "object") return 0;
  return Math.max(Number(mark.updatedAt) || 0, Number(mark.deletedAt) || 0);
}

function aliyunTodayPlanRealTombAt(entry) {
  if (entry == null) return 0;
  if (typeof entry === "number") return Number(entry) || 0;
  if (typeof entry === "object") {
    return Math.max(Number(entry.deletedAt) || 0, Number(entry.updatedAt) || 0);
  }
  return 0;
}

/** 修复后结转：只改日期，不抬挂牌时钟、不 bump updatedAt */
function rolloverFixed(task, todayKey) {
  const next = Object.assign({}, task);
  const date = normalizeWeeklyPlanTodayPlanDate(next.todayPlanDate);
  if (date && date < todayKey) {
    next.todayPlanDate = todayKey;
  }
  return next;
}

/** 漏洞结转：抬 Date.now 挂牌时钟 */
function rolloverLegacy(task, todayKey, now) {
  const next = Object.assign({}, task);
  const date = normalizeWeeklyPlanTodayPlanDate(next.todayPlanDate);
  if (date && date < todayKey) {
    next.todayPlanDate = todayKey;
    next.todayPlanDateUpdatedAt = now;
    next.updatedAt = now;
  }
  return next;
}

function applyMutationFixed(env, mutation) {
  const id = String(mutation.id || "");
  if (!id) return env;
  const now = Date.now();
  if (!env.tombstones) env.tombstones = {};
  if (!env.marks) env.marks = {};
  if (mutation.op === "tombstone") {
    const deletedAt = Math.max(Number(mutation.deletedAt) || 0, now);
    const prevTombAt = aliyunTodayPlanRealTombAt(env.tombstones[id]);
    if (deletedAt < prevTombAt) return env;
    env.tombstones[id] = { deletedAt: deletedAt, reason: mutation.reason || "remove" };
    const prevMarkTs = aliyunTodayPlanRealMarkTs(env.marks[id]);
    if (deletedAt >= prevMarkTs) {
      env.marks[id] = {
        id: id,
        date: "",
        updatedAt: deletedAt,
        deletedAt: deletedAt,
        source: "weeklyPlan"
      };
    }
    return env;
  }
  if (mutation.op === "upsert" && mutation.mark) {
    const mark = Object.assign({}, mutation.mark);
    const ts = aliyunTodayPlanRealMarkTs(mark) || now;
    mark.updatedAt = ts;
    mark.id = id;
    mark.date = normalizeWeeklyPlanTodayPlanDate(mark.date);
    const tombAt = aliyunTodayPlanRealTombAt(env.tombstones[id]);
    if (mark.date && tombAt > 0 && ts <= tombAt) return env;
    const prevTs = aliyunTodayPlanRealMarkTs(env.marks[id]);
    if (ts < prevTs) return env;
    if (mark.date && tombAt > 0 && ts > tombAt) {
      delete env.tombstones[id];
    } else if (!mark.date) {
      const leaveAt = Math.max(tombAt, ts);
      env.tombstones[id] = { deletedAt: leaveAt, reason: "leave-mark" };
      mark.deletedAt = leaveAt;
    }
    env.marks[id] = mark;
  }
  return env;
}

function applyMutationLegacy(env, mutation) {
  const id = String(mutation.id || "");
  if (!id || mutation.op !== "upsert" || !mutation.mark) return env;
  if (!env.marks) env.marks = {};
  const mark = Object.assign({}, mutation.mark);
  const ts = aliyunTodayPlanRealMarkTs(mark) || Date.now();
  mark.updatedAt = ts;
  const prevTs = aliyunTodayPlanRealMarkTs(env.marks[id]);
  if (ts < prevTs) return env;
  env.marks[id] = mark;
  return env;
}

function mergeMarksIntoLocal(localTask, remDate, remU, tombAt) {
  const locDate = normalizeWeeklyPlanTodayPlanDate(localTask.todayPlanDate);
  const locMark = getTodayPlanDateUpdatedAt(localTask);
  if (tombAt > 0 && remDate && remU <= tombAt) {
    if (locDate) {
      return {
        todayPlanDate: "",
        todayPlanDateUpdatedAt: Math.max(locMark, tombAt),
        blocked: true
      };
    }
    return {
      todayPlanDate: locDate,
      todayPlanDateUpdatedAt: locMark,
      blocked: true
    };
  }
  if (tombAt > 0 && remDate && remU > tombAt) {
    return { todayPlanDate: remDate, todayPlanDateUpdatedAt: remU, tombCleared: true };
  }
  if (remU <= locMark) {
    return { todayPlanDate: locDate, todayPlanDateUpdatedAt: locMark, applied: false };
  }
  if (remDate === locDate) {
    return { todayPlanDate: locDate, todayPlanDateUpdatedAt: locMark, applied: false };
  }
  return { todayPlanDate: remDate, todayPlanDateUpdatedAt: remU, applied: true };
}

const t0 = 1_700_000_000_000;
const YESTERDAY = "2026-10-12";
const TODAY = "2026-10-13";
let passed = 0;
let failed = [];

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

test("ROOT 漏洞：结转抬时钟 + 无 tomb 门闩 → 旧挂牌盖掉对端空 mark", function () {
  const leaveAt = t0 + 1000;
  const bootNow = t0 + 50000;
  const cloud = {
    marks: {
      t1: { id: "t1", date: "", updatedAt: leaveAt, deletedAt: leaveAt }
    },
    tombstones: {}
  };
  const localOld = {
    id: "t1",
    todayPlanDate: YESTERDAY,
    todayPlanDateUpdatedAt: t0,
    updatedAt: t0
  };
  const rolled = rolloverLegacy(localOld, TODAY, bootNow);
  const env = applyMutationLegacy(
    { marks: Object.assign({}, cloud.marks) },
    {
      op: "upsert",
      id: "t1",
      mark: {
        id: "t1",
        date: rolled.todayPlanDate,
        updatedAt: getTodayPlanDateUpdatedAt(rolled)
      }
    }
  );
  assert.equal(normalizeWeeklyPlanTodayPlanDate(env.marks.t1.date), TODAY);
});

test("FIX 结转不抬时钟：旧 mark 无法盖过对端 leave", function () {
  const leaveAt = t0 + 1000;
  const cloud = {
    marks: {
      t1: { id: "t1", date: "", updatedAt: leaveAt, deletedAt: leaveAt }
    },
    tombstones: { t1: { deletedAt: leaveAt } }
  };
  const localOld = {
    id: "t1",
    todayPlanDate: YESTERDAY,
    todayPlanDateUpdatedAt: t0,
    updatedAt: t0
  };
  const rolled = rolloverFixed(localOld, TODAY);
  assert.equal(normalizeWeeklyPlanTodayPlanDate(rolled.todayPlanDate), TODAY);
  assert.equal(getTodayPlanDateUpdatedAt(rolled), t0);
  const env = applyMutationFixed(
    {
      marks: Object.assign({}, cloud.marks),
      tombstones: Object.assign({}, cloud.tombstones)
    },
    {
      op: "upsert",
      id: "t1",
      mark: {
        id: "t1",
        date: rolled.todayPlanDate,
        updatedAt: getTodayPlanDateUpdatedAt(rolled)
      }
    }
  );
  assert.equal(normalizeWeeklyPlanTodayPlanDate(env.marks.t1.date), "");
  assert.ok(aliyunTodayPlanRealTombAt(env.tombstones.t1) >= leaveAt);
});

test("FIX 云端 tomb 挡住旧端 Date.now 非空 upsert", function () {
  const leaveAt = t0 + 2000;
  const env0 = {
    marks: { t2: { id: "t2", date: "", updatedAt: leaveAt, deletedAt: leaveAt } },
    tombstones: { t2: { deletedAt: leaveAt } }
  };
  const env = applyMutationFixed(env0, {
    op: "upsert",
    id: "t2",
    mark: { id: "t2", date: TODAY, updatedAt: leaveAt + 999999 }
  });
  /* leaveAt+999999 > tomb → 视为合法重新加入，允许；再测 <= tomb */
  const envBlocked = applyMutationFixed(
    {
      marks: { t2: { id: "t2", date: "", updatedAt: leaveAt, deletedAt: leaveAt } },
      tombstones: { t2: { deletedAt: leaveAt } }
    },
    {
      op: "upsert",
      id: "t2",
      mark: { id: "t2", date: TODAY, updatedAt: leaveAt }
    }
  );
  assert.equal(normalizeWeeklyPlanTodayPlanDate(envBlocked.marks.t2.date), "");
  assert.equal(normalizeWeeklyPlanTodayPlanDate(env.marks.t2.date), TODAY);
});

test("A/B 场景：A 摘牌 tomb → B 旧缓存结转 → 首拉剥牌 → 两端不复活", function () {
  const leaveAt = t0 + 3000;
  const tombAt = leaveAt;
  let localB = {
    id: "ab",
    todayPlanDate: YESTERDAY,
    todayPlanDateUpdatedAt: t0,
    updatedAt: t0
  };
  localB = rolloverFixed(localB, TODAY);
  const remDate = "";
  const remU = leaveAt;
  const merged = mergeMarksIntoLocal(localB, remDate, remU, tombAt);
  /* rem 空日期且 remU>locMark → 采纳空 */
  assert.equal(normalizeWeeklyPlanTodayPlanDate(merged.todayPlanDate), "");
  assert.equal(wouldAppear(merged.todayPlanDate, TODAY), false);
});

function wouldAppear(date, todayKey) {
  return normalizeWeeklyPlanTodayPlanDate(date) === todayKey;
}

test("B 离线合法结转：无 tomb 时日期推进但时钟不变，重连后仍可被 A 删除盖过", function () {
  const localB = rolloverFixed(
    { id: "off", todayPlanDate: YESTERDAY, todayPlanDateUpdatedAt: t0 },
    TODAY
  );
  assert.equal(localB.todayPlanDate, TODAY);
  assert.equal(getTodayPlanDateUpdatedAt(localB), t0);
  const leaveAt = t0 + 8000;
  const merged = mergeMarksIntoLocal(localB, "", leaveAt, leaveAt);
  assert.equal(normalizeWeeklyPlanTodayPlanDate(merged.todayPlanDate), "");
});

test("合法离线新增挂牌（新 join 时钟）在无 tomb 时保留", function () {
  const joinAt = t0 + 9000;
  const localNew = {
    id: "new",
    todayPlanDate: TODAY,
    todayPlanDateUpdatedAt: joinAt
  };
  const cloudStale = { date: "", updatedAt: t0 };
  const merged = mergeMarksIntoLocal(
    localNew,
    cloudStale.date,
    cloudStale.updatedAt,
    0
  );
  assert.equal(merged.todayPlanDate, TODAY);
});

if (CHECK_HTML) {
  test("HTML：结转不再 stampTodayPlanDateRevision", function () {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const idx = html.indexOf("function rolloverIncompleteTodayPlanOtherTasksToToday");
    assert.ok(idx > 0);
    const slice = html.slice(idx, idx + 3500);
    assert.doesNotMatch(slice, /stampTodayPlanDateRevision\s*\(/);
    assert.doesNotMatch(slice, /touchWeeklyPlanTaskRevision\s*\(/);
    assert.doesNotMatch(slice, /notifyAliyunSprintRealWeekUpsert/);
    assert.match(slice, /禁止 stampTodayPlanDateRevision|不 stamp 挂牌时钟/);
  });

  test("HTML：首拉上传门闩 + todayPlan 信封 tombstones", function () {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.match(html, /aliyunSyncPrimaryInitialPullSettled/);
    assert.match(html, /aliyunSyncPrimaryDeferFlushUntilBootPull/);
    assert.match(html, /markAliyunSyncPrimaryInitialPullSettled/);
    assert.match(html, /notifyAliyunTodayPlanRealMarkTombstone/);
    assert.match(html, /stripLocalTodayPlanHangsBlockedByTombstones/);
    assert.match(
      html,
      /function aliyunTodayPlanRealEmptyEnvelope[\s\S]{0,400}tombstones:\s*\{\}/
    );
    assert.match(
      html,
      /async function flushAliyunTodayPlanRealQueue[\s\S]{0,500}aliyunSyncPrimaryDeferFlushUntilBootPull/
    );
    assert.match(
      html,
      /async function flushAliyunSprintRealQueue[\s\S]{0,500}aliyunSyncPrimaryDeferFlushUntilBootPull/
    );
  });

  test("HTML：缓存版本已 bump", function () {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
    assert.match(html, /exec-system-pwa-v20261013o/);
    assert.match(sw, /exec-system-pwa-v20261013o/);
  });
}

console.log("");
console.log(
  "passed=" + passed + " failed=" + failed.length + (failed.length ? " [" + failed.join(", ") + "]" : "")
);
if (failed.length) process.exit(1);
