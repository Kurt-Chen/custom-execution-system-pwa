#!/usr/bin/env node
/**
 * 同步 invariants 回归：直接抽取 index.html 中的合并函数，锁定当前语义。
 * 运行：node _tests/cloud-sync-invariants.test.mjs
 */
import { loadSyncFns } from "./extract-index-functions.mjs";

const ctx = loadSyncFns();

function emptyState(extra) {
  return Object.assign(
    {
      done: [],
      memo: [],
      closedList: [],
      stopDoing: [],
      notToDo: [],
      dailyWin: [],
      kineticCountdowns: [],
      hatersDoubtersLog: [],
      successCriteria: [],
      habitCheckins: {},
      weeklyPlan: {},
      syncTombstones: {},
      readingPlan: { books: [] },
      trash: [],
      forge: {},
      anniversaryTw020: { weeks: {} },
      anniversaryTw021: { weeks: {} },
      anniversaryTw022: { weeks: {} }
    },
    extra || {}
  );
}

function ids(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map(function (x) {
      return x && x.id != null ? String(x.id) : "";
    })
    .filter(Boolean)
    .sort();
}

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("  ok  " + name);
  } catch (err) {
    failed += 1;
    failures.push({ name: name, err: err });
    console.log("  FAIL " + name);
    console.log("       " + (err && err.message ? err.message : String(err)));
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function assertEq(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || "not equal") + "\n    left:  " + sa + "\n    right: " + sb);
}

function fullMerge(local, remote, remoteAt, lastSeen) {
  ctx.state = local;
  return ctx.mergeLocalStateWithRemotePayloadBeforePush(remote, remoteAt, lastSeen);
}

console.log("\n[cloud-sync-invariants] 从 index.html 抽取合并函数后锁定当前语义\n");

test("coerceCloudUpdatedAt 解析 Firebase 字符串时间戳", function () {
  assertEq(ctx.coerceCloudUpdatedAt("1710000000000"), 1710000000000);
  assertEq(ctx.coerceCloudUpdatedAt(1710000000000), 1710000000000);
  assertEq(ctx.coerceCloudUpdatedAt(null), 0);
});

test("并集：两端独有 Done 都保留", function () {
  const merged = fullMerge(
    emptyState({ done: [{ id: "a", text: "A", createdAt: 1 }] }),
    emptyState({ done: [{ id: "b", text: "B", createdAt: 2 }] }),
    0,
    0
  );
  assertEq(ids(merged.done), ["a", "b"]);
});

test("并集：周计划不同 weekKey 的任务都保留", function () {
  const merged = fullMerge(
    emptyState({
      weeklyPlan: { "2026-01-05": [{ id: "w1", text: "one", lane: "life", updatedAt: 10 }] }
    }),
    emptyState({
      weeklyPlan: { "2026-01-12": [{ id: "w2", text: "two", lane: "work", updatedAt: 11 }] }
    }),
    0,
    0
  );
  assert(merged.weeklyPlan["2026-01-05"].some(function (t) { return t.id === "w1"; }));
  assert(merged.weeklyPlan["2026-01-12"].some(function (t) { return t.id === "w2"; }));
});

test("tombstone：全量合并后已删 Done 不能被远端旧副本复活", function () {
  const merged = fullMerge(
    emptyState({ done: [], syncTombstones: { gone: 500 } }),
    emptyState({ done: [{ id: "gone", text: "old", createdAt: 1 }] }),
    10,
    20
  );
  assertEq(ids(merged.done), []);
  assert(merged.syncTombstones.gone > 0);
});

test("tombstone：全量合并后已删 Closed List 不能被远端旧副本复活", function () {
  const merged = fullMerge(
    emptyState({ closedList: [], syncTombstones: { X: 1000 } }),
    emptyState({ closedList: [{ id: "X", text: "should die", createdAt: 1 }] }),
    10,
    20
  );
  assertEq(ids(merged.closedList), []);
  assertEq(merged.syncTombstones.X, 1000);
});

test("tombstone：全量合并后已删 weeklyPlan 任务不能复活", function () {
  const merged = fullMerge(
    emptyState({
      weeklyPlan: { "2026-01-05": [] },
      syncTombstones: { T: 100 }
    }),
    emptyState({
      weeklyPlan: { "2026-01-05": [{ id: "T", text: "old", lane: "life", updatedAt: 1 }] }
    }),
    10,
    20
  );
  const week = merged.weeklyPlan["2026-01-05"] || [];
  assertEq(ids(week), []);
});

test("tombstone：十二周年周任务删除后全量合并不能复活", function () {
  const merged = fullMerge(
    emptyState({
      anniversaryTw020: { weeks: { "1": [] } },
      syncTombstones: { twA: 9 }
    }),
    emptyState({
      anniversaryTw020: { weeks: { "1": [{ id: "twA", text: "old", done: false, subs: [] }] } }
    }),
    10,
    20
  );
  const week1 = (merged.anniversaryTw020.weeks && merged.anniversaryTw020.weeks["1"]) || [];
  assertEq(ids(week1), []);
});

test("tombstone map 并集取较大时间，旧 tombstone 不被抹掉", function () {
  const ts = ctx.mergeSyncTombstoneMaps({ X: 10, Y: 5 }, { X: 3, Z: 8 });
  assertEq(ts.X, 10);
  assertEq(ts.Y, 5);
  assertEq(ts.Z, 8);
});

test("completed OR：任一侧完成则结果为完成", function () {
  const merged = ctx.mergeDoneArraysForSync(
    [{ id: "t", text: "same", completed: true, completedAt: 50, updatedAt: 50 }],
    [{ id: "t", text: "same", completed: false, updatedAt: 80 }],
    true
  );
  assert(merged[0].completed === true);
  assert(Number(merged[0].completedAt) >= 50);
});

test("closedList completed OR + 子步骤文案并集", function () {
  const merged = ctx.mergeClosedListArraysForSync(
    [{ id: "c", text: "item", completed: true, completedAt: 2, subSteps: ["x"] }],
    [{ id: "c", text: "item", completed: false, updatedAt: 9, subSteps: [{ text: "y", completed: true }] }]
  );
  assert(merged[0].completed === true);
  const steps = ctx.mergeClosedListSubStepsForSync(merged[0].subSteps, merged[0].subSteps);
  assert(steps.length >= 1);
});

test("habit 数值 Math.max：分钟数取较大者", function () {
  const out = ctx.mergeHabitCheckinsForSync(
    { "2026-09-01": { english: { times: 1, minutes: 10 } } },
    { "2026-09-01": { english: { times: 1, minutes: 30 } } }
  );
  assertEq(out["2026-09-01"].english.minutes, 30);
});

test("habit 勾选 OR：一端已打卡则结果为已打卡", function () {
  const out = ctx.mergeHabitCheckinsForSync(
    { "2026-09-01": { sleep: { times: 1 } } },
    { "2026-09-01": { sleep: false } }
  );
  assert(ctx.isHabitCheckinValueChecked(out["2026-09-01"].sleep));
});

test("空云端 Done 不能覆盖本机", function () {
  ctx.cloudSyncLastErrorMsg = "";
  ctx.state = emptyState({ done: [{ id: "keep", text: "local", createdAt: 1 }] });
  const ok = ctx.applyCloudPayloadWithMerge({
    state: emptyState({ done: [] }),
    doneOmitted: false
  });
  assert(ok === false);
  assert(ctx.state.done.length === 1);
  assert(ctx.state.done[0].id === "keep");
  assert(String(ctx.cloudSyncLastErrorMsg).indexOf("云端 Done 为空") >= 0);
});

test("少记录不覆盖多记录：并集保留本机独有条", function () {
  const local = emptyState({
    done: [
      { id: "1", text: "a", createdAt: 1 },
      { id: "2", text: "b", createdAt: 2 },
      { id: "3", text: "c", createdAt: 3 }
    ]
  });
  const remote = emptyState({
    done: [{ id: "1", text: "a", createdAt: 1 }]
  });
  assert(ctx.countBusinessRecordsInState(local) > ctx.countBusinessRecordsInState(remote));
  const merged = fullMerge(local, remote, 10, 20);
  assertEq(ids(merged.done), ["1", "2", "3"]);
});

test("sticky pulse：他端未带周计划时不得丢掉上一份 pulse 的周计划", function () {
  const prev = {
    done: [],
    habitCheckins: {},
    weeklyPlan: { "2026-01-05": [{ id: "keepW", text: "stay", lane: "life", updatedAt: 1 }] }
  };
  const next = {
    done: [{ id: "d1", text: "today", completed: true, completedAt: 2 }],
    habitCheckins: { "2026-09-01": { english: { times: 1 } } }
  };
  const sticky = ctx.mergeStickyCloudSyncPulseState(prev, next);
  assert(sticky.weeklyPlan["2026-01-05"].some(function (t) { return t.id === "keepW"; }));
  assert(sticky.done.some(function (t) { return t.id === "d1"; }));
});

test("sticky pulse：他端空封闭清单不得覆盖本端非空封闭清单", function () {
  const prev = { closedList: [{ id: "c1", text: "keep", createdAt: 1 }], done: [], habitCheckins: {} };
  const next = { done: [], habitCheckins: { "2026-09-01": { sleep: { times: 1 } } } };
  const sticky = ctx.mergeStickyCloudSyncPulseState(prev, next);
  assertEq(ids(sticky.closedList), ["c1"]);
});

test("后续同步：设备 B 旧 pulse 含已删 Closed List X，全量合并后 X 仍删除", function () {
  const sticky = ctx.mergeStickyCloudSyncPulseState(
    { closedList: [], syncTombstones: { X: 2000 }, done: [], habitCheckins: {} },
    { closedList: [{ id: "X", text: "stale cache", createdAt: 1 }], done: [], habitCheckins: {} }
  );
  assert(sticky.syncTombstones.X === 2000, "sticky 必须并入 tombstone");
  const merged = fullMerge(
    emptyState({ closedList: [], syncTombstones: { X: 2000 }, done: [] }),
    emptyState({
      closedList: sticky.closedList,
      syncTombstones: sticky.syncTombstones,
      done: []
    }),
    50,
    80
  );
  assertEq(ids(merged.closedList), []);
});

test("后续同步：设备 B 旧 pulse 含已删 weeklyPlan 任务，全量合并后仍删除", function () {
  const sticky = ctx.mergeStickyCloudSyncPulseState(
    {
      weeklyPlan: { "2026-01-05": [] },
      syncTombstones: { T: 2000 },
      done: [],
      habitCheckins: {}
    },
    {
      weeklyPlan: { "2026-01-05": [{ id: "T", text: "stale", lane: "life", updatedAt: 1 }] },
      done: [],
      habitCheckins: {}
    }
  );
  const merged = fullMerge(
    emptyState({
      weeklyPlan: { "2026-01-05": [] },
      syncTombstones: { T: 2000 },
      done: []
    }),
    emptyState({
      weeklyPlan: sticky.weeklyPlan,
      syncTombstones: sticky.syncTombstones,
      done: []
    }),
    50,
    80
  );
  const week = merged.weeklyPlan["2026-01-05"] || [];
  assertEq(ids(week), []);
});

test("weeklyPlan pulse 合并会应用 tombstone（当前行为）", function () {
  ctx.state = emptyState({
    weeklyPlan: { "2026-01-05": [] },
    syncTombstones: { T: 100 },
    done: []
  });
  ctx.mergeCloudSyncPulseIntoState({
    weeklyPlan: { "2026-01-05": [{ id: "T", text: "old", lane: "life", updatedAt: 1 }] },
    done: []
  });
  const week = ctx.state.weeklyPlan["2026-01-05"] || [];
  assertEq(ids(week), []);
});

test("表征：closedList pulse-only 目前不会 omit tombstone（全量合并才会删）", function () {
  ctx.state = emptyState({ closedList: [], syncTombstones: { X: 100 }, done: [] });
  ctx.mergeCloudSyncPulseIntoState({
    closedList: [{ id: "X", text: "old", createdAt: 1 }],
    done: []
  });
  assertEq(ids(ctx.state.closedList), ["X"]);
  assert(ctx.state.syncTombstones.X === 100);
});

test("乱序：较旧远端 updatedAt 不能盖掉较新本机同 id 标题", function () {
  const merged = ctx.mergeIdRecordArraysPreferLocalOnTie(
    [{ id: "n", text: "new", updatedAt: 200 }],
    [{ id: "n", text: "old", updatedAt: 100 }]
  );
  assertEq(merged[0].text, "new");
});

test("乱序：条目级 LWW 取较大时间戳的标题，completed 仍为 OR", function () {
  const merged = fullMerge(
    emptyState({
      done: [{ id: "t", text: "local-title", completed: true, completedAt: 30, updatedAt: 30 }]
    }),
    emptyState({
      done: [{ id: "t", text: "remote-title", completed: false, updatedAt: 90 }]
    }),
    10,
    20
  );
  const row = merged.done.find(function (x) { return x.id === "t"; });
  assert(row.completed === true, "completed 必须 OR");
  assertEq(row.text, "remote-title");
});

test("乱序：较旧远端请求不能覆盖较新本机标题", function () {
  const merged = fullMerge(
    emptyState({
      done: [{ id: "t", text: "newer-local", completed: false, updatedAt: 500 }]
    }),
    emptyState({
      done: [{ id: "t", text: "older-remote", completed: false, updatedAt: 100 }]
    }),
    999,
    1
  );
  const row = merged.done.find(function (x) { return x.id === "t"; });
  assertEq(row.text, "newer-local");
});

test("多设备收敛：习惯分钟数双向合并结果与顺序无关（都是 max）", function () {
  const a = { "2026-09-01": { english: { minutes: 10, times: 1 } } };
  const b = { "2026-09-01": { english: { minutes: 40, times: 1 } } };
  const ab = ctx.mergeHabitCheckinsForSync(a, b);
  const ba = ctx.mergeHabitCheckinsForSync(b, a);
  assertEq(ab["2026-09-01"].english.minutes, 40);
  assertEq(ba["2026-09-01"].english.minutes, 40);
});

test("多设备 pulse 粘合后全量合并：两端独有任务都在", function () {
  const sticky = ctx.mergeStickyCloudSyncPulseState(
    {
      weeklyPlan: { "2026-01-05": [{ id: "fromA", text: "A", lane: "life", updatedAt: 1 }] },
      done: [{ id: "da", text: "A", createdAt: 1 }],
      habitCheckins: {}
    },
    {
      weeklyPlan: { "2026-01-05": [{ id: "fromB", text: "B", lane: "work", updatedAt: 2 }] },
      done: [{ id: "db", text: "B", createdAt: 2 }],
      habitCheckins: { "2026-09-01": { sleep: { times: 1 } } }
    }
  );
  const merged = fullMerge(
    emptyState({
      weeklyPlan: { "2026-01-05": [{ id: "fromA", text: "A", lane: "life", updatedAt: 1 }] },
      done: [{ id: "da", text: "A", createdAt: 1 }],
      habitCheckins: {}
    }),
    emptyState({
      weeklyPlan: sticky.weeklyPlan,
      done: sticky.done,
      habitCheckins: sticky.habitCheckins,
      syncTombstones: sticky.syncTombstones || {}
    }),
    5,
    1
  );
  assertEq(ids(merged.done), ["da", "db"]);
  assertEq(ids(merged.weeklyPlan["2026-01-05"]).sort(), ["fromA", "fromB"]);
});

test("重复合并幂等：同一对 Done 合并两次不产生重复 id", function () {
  const loc = [{ id: "a", text: "A", createdAt: 1 }];
  const rem = [{ id: "a", text: "A", createdAt: 1 }, { id: "b", text: "B", createdAt: 2 }];
  const once = ctx.mergeDoneArraysForSync(loc, rem, false);
  const twice = ctx.mergeDoneArraysForSync(once, rem, false);
  assertEq(ids(once), ["a", "b"]);
  assertEq(ids(twice), ["a", "b"]);
});

test("例行 retention 仍会跑 Done/封闭清单去重（render / 定时任务路径）", function () {
  ctx.hygieneDoneCalls = 0;
  ctx.hygieneClosedCalls = 0;
  ctx.state.trash = [];
  ctx.runDataRetentionPass({});
  assertEq(ctx.hygieneDoneCalls, 1);
  assertEq(ctx.hygieneClosedCalls, 1);
});

test("scheduled retention 仍会跑 Done/封闭清单去重（24h / visibility 路径）", function () {
  ctx.hygieneDoneCalls = 0;
  ctx.hygieneClosedCalls = 0;
  ctx.state.trash = [];
  ctx.runDataRetentionPass({ scheduled: true });
  assertEq(ctx.hygieneDoneCalls, 1);
  assertEq(ctx.hygieneClosedCalls, 1);
});

test("skipDoneHygiene：例行落盘不去扫全量 Done/封闭清单", function () {
  ctx.hygieneDoneCalls = 0;
  ctx.hygieneClosedCalls = 0;
  ctx.state.trash = [];
  ctx.runDataRetentionPass({ skipDoneHygiene: true });
  assertEq(ctx.hygieneDoneCalls, 0);
  assertEq(ctx.hygieneClosedCalls, 0);
});

test("skipDoneHygiene 仍会清掉过期垃圾箱（不丢 durability 所需的例行箱清理）", function () {
  const old = Date.now() - 8 * 24 * 60 * 60 * 1000;
  ctx.state.trash = [{ id: "old-trash", deletedAt: old, payload: {} }];
  ctx.hygieneDoneCalls = 0;
  ctx.runDataRetentionPass({ skipDoneHygiene: true });
  assertEq((ctx.state.trash || []).length, 0);
  assertEq(ctx.hygieneDoneCalls, 0);
});

test("compactStateForLocalStorage(false) 走 skipDoneHygiene（persist 热路径）", function () {
  ctx.hygieneDoneCalls = 0;
  ctx.hygieneClosedCalls = 0;
  ctx.state.trash = [];
  ctx.compactStateForLocalStorage(false);
  assertEq(ctx.hygieneDoneCalls, 0);
  assertEq(ctx.hygieneClosedCalls, 0);
});

test("compactStateForLocalStorage(true) 仍跑列表去重（配额紧急路径）", function () {
  ctx.hygieneDoneCalls = 0;
  ctx.hygieneClosedCalls = 0;
  ctx.state.trash = [];
  ctx.compactStateForLocalStorage(true);
  assertEq(ctx.hygieneDoneCalls, 1);
  assertEq(ctx.hygieneClosedCalls, 1);
});

test("skipDoneHygiene 不改变 merge 并集结果", function () {
  const merged = fullMerge(
    emptyState({ done: [{ id: "a", text: "A", createdAt: 1 }] }),
    emptyState({ done: [{ id: "b", text: "B", createdAt: 2 }] }),
    0,
    0
  );
  assertEq(ids(merged.done), ["a", "b"]);
});

console.log("");
if (failed) {
  console.log("失败 " + failed + " / " + (passed + failed));
  failures.forEach(function (f) {
    if (f.err && f.err.stack) console.log(f.err.stack.split("\n").slice(0, 6).join("\n"));
  });
  process.exit(1);
}
console.log("全部通过 " + passed + " / " + passed);
process.exit(0);
