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

function heavyExtras(over) {
  return Object.assign(
    {
      calendarDay: "2026-09-01",
      selectedDoneDate: "2026-09-01",
      anniversaryTwArchiveViewKey: ""
    },
    over || {}
  );
}

function heavyBase(over) {
  return emptyState(
    Object.assign(
      {
        ruleOf100: { rule100A: { checkins: ["1"], name: "A" } },
        rule100DayProjectKeys: ["rule100A"],
        rule100UnitProjectKeys: [],
        life4000Weeks: { name: "", birthDate: "1990-01-01", birthLunarText: "", lastDoneTuesdayKey: "" },
        trash: [],
        forge: { dailyMinimums: [], weeklyMinimums: [] },
        anniversaryTw020: { weeks: { "1": [{ id: "t1", text: "keep", done: false }] } },
        habitCheckins: {}
      },
      over || {}
    )
  );
}

function heavyDirty(prevState, nextState, extras) {
  const prev = ctx.getHeavyModuleDependencySnapshot(prevState, extras || heavyExtras());
  const next = ctx.getHeavyModuleDependencySnapshot(nextState, extras || heavyExtras());
  return ctx.diffHeavyModuleDependencies(prev, next);
}

test("启动时无 prev 快照：全部 heavy 切片必须刷新", function () {
  const snap = ctx.getHeavyModuleDependencySnapshot(heavyBase(), heavyExtras());
  const dirty = ctx.diffHeavyModuleDependencies(null, snap);
  assertEq(dirty.rule100, true);
  assertEq(dirty.life4000, true);
  assertEq(dirty.trash, true);
  assertEq(dirty.anniversary, true);
  assertEq(dirty.forgeMins, true);
  assertEq(dirty.any, true);
});

test("planHeavyModuleRenders forceAll：即使指纹相同也全刷", function () {
  const snap = ctx.getHeavyModuleDependencySnapshot(heavyBase(), heavyExtras());
  const dirty = ctx.planHeavyModuleRenders(snap, snap, { forceAll: true });
  assertEq(dirty.any, true);
  assertEq(dirty.anniversary, true);
});

test("无关习惯勾选：十二周年 / Rule100 / 回收站 / 人生进度 / Forge 下限可跳过", function () {
  const prev = heavyBase();
  const next = heavyBase({
    habitCheckins: { "2026-09-01": { water: true } },
    done: [{ id: "h1", text: "喝水", habitMeta: { key: "water" }, completedAt: 1 }]
  });
  const dirty = heavyDirty(prev, next);
  assertEq(dirty.rule100, false);
  assertEq(dirty.life4000, false);
  assertEq(dirty.trash, false);
  assertEq(dirty.anniversary, false);
  assertEq(dirty.forgeMins, false);
  assertEq(dirty.any, false);
});

test("高频习惯勾选路径：10 次无关变化 heavy 全跳过（调用次数证明）", function () {
  const extras = heavyExtras();
  const base = heavyBase();
  let prev = ctx.getHeavyModuleDependencySnapshot(base, extras);
  let skipped = 0;
  let rendered = 0;
  for (let i = 0; i < 10; i++) {
    const st = heavyBase({
      habitCheckins: { "2026-09-01": { water: i + 1 } },
      done: [{ id: "h" + i, text: "喝水", habitMeta: { key: "water" }, completedAt: i }]
    });
    const next = ctx.getHeavyModuleDependencySnapshot(st, extras);
    const dirty = ctx.diffHeavyModuleDependencies(prev, next);
    if (dirty.any) rendered += 1;
    else skipped += 1;
    prev = next;
  }
  assertEq(rendered, 0);
  assertEq(skipped, 10);
});

test("相关 state 改变：Rule100 必须刷新，其它切片可跳过", function () {
  const prev = heavyBase();
  const next = heavyBase({
    ruleOf100: { rule100A: { checkins: ["1", "2"], name: "A" } }
  });
  const dirty = heavyDirty(prev, next);
  assertEq(dirty.rule100, true);
  assertEq(dirty.anniversary, false);
  assertEq(dirty.trash, false);
  assertEq(dirty.any, true);
});

test("相关 state 改变：十二周年周任务必须刷新", function () {
  const prev = heavyBase();
  const next = heavyBase({
    anniversaryTw020: { weeks: { "1": [{ id: "t1", text: "keep", done: true }] } }
  });
  const dirty = heavyDirty(prev, next);
  assertEq(dirty.anniversary, true);
  assertEq(dirty.rule100, false);
  assertEq(dirty.trash, false);
});

test("相关 state 改变：删除/恢复垃圾箱必须刷新 trash", function () {
  const prev = heavyBase({ trash: [] });
  const next = heavyBase({
    trash: [{ id: "x", deletedAt: 1, sourceList: "done", payload: {} }]
  });
  const dirty = heavyDirty(prev, next);
  assertEq(dirty.trash, true);
  assertEq(dirty.anniversary, false);
  assertEq(dirty.rule100, false);
});

test("相关 state 改变：Forge 打卡 Done 必须刷新 forgeMins", function () {
  const prev = heavyBase();
  const next = heavyBase({
    done: [
      {
        id: "f1",
        text: "【Forge】壶铃",
        forgeMindMeta: { dateKey: "2026-09-01", amount: 10 },
        completedAt: 1
      }
    ]
  });
  const dirty = heavyDirty(prev, next);
  assertEq(dirty.forgeMins, true);
  assertEq(dirty.anniversary, false);
  assertEq(dirty.rule100, false);
  assertEq(dirty.trash, false);
});

test("日期筛选变化：Forge 下限必须刷新（日/周聚合跟 selectedDoneDate）", function () {
  const st = heavyBase();
  const prev = ctx.getHeavyModuleDependencySnapshot(st, heavyExtras({ selectedDoneDate: "2026-09-01" }));
  const next = ctx.getHeavyModuleDependencySnapshot(st, heavyExtras({ selectedDoneDate: "2026-09-02" }));
  const dirty = ctx.diffHeavyModuleDependencies(prev, next);
  assertEq(dirty.forgeMins, true);
  assertEq(dirty.anniversary, false);
});

test("跨天：calendarDay 变化时所有 heavy 切片必须刷新", function () {
  const st = heavyBase();
  const prev = ctx.getHeavyModuleDependencySnapshot(st, heavyExtras({ calendarDay: "2026-09-01" }));
  const next = ctx.getHeavyModuleDependencySnapshot(st, heavyExtras({ calendarDay: "2026-09-02" }));
  const dirty = ctx.diffHeavyModuleDependencies(prev, next);
  assertEq(dirty.rule100, true);
  assertEq(dirty.life4000, true);
  assertEq(dirty.trash, true);
  assertEq(dirty.anniversary, true);
  assertEq(dirty.forgeMins, true);
  assertEq(dirty.any, true);
});

test("归档视图 UI 依赖变化：anniversary 必须刷新", function () {
  const st = heavyBase();
  const prev = ctx.getHeavyModuleDependencySnapshot(st, heavyExtras({ anniversaryTwArchiveViewKey: "" }));
  const next = ctx.getHeavyModuleDependencySnapshot(st, heavyExtras({ anniversaryTwArchiveViewKey: "tw020" }));
  const dirty = ctx.diffHeavyModuleDependencies(prev, next);
  assertEq(dirty.anniversary, true);
  assertEq(dirty.rule100, false);
});

test("待滚动十二周年：forceAnniversary 即使指纹相同也刷", function () {
  const snap = ctx.getHeavyModuleDependencySnapshot(heavyBase(), heavyExtras());
  const dirty = ctx.planHeavyModuleRenders(snap, snap, { forceAnniversary: true });
  assertEq(dirty.anniversary, true);
  assertEq(dirty.any, true);
  assertEq(dirty.rule100, false);
});

test("云端 merge 改了十二周年文案 → anniversary 必须刷新", function () {
  const extras = heavyExtras();
  const loc = heavyBase({
    anniversaryTw020: { weeks: { "1": [{ id: "t1", text: "local", done: false, updatedAt: 1 }] } }
  });
  const rem = heavyBase({
    anniversaryTw020: { weeks: { "1": [{ id: "t1", text: "remote", done: false, updatedAt: 99 }] } }
  });
  const prev = ctx.getHeavyModuleDependencySnapshot(loc, extras);
  const merged = fullMerge(loc, rem, 100, 0);
  const next = ctx.getHeavyModuleDependencySnapshot(merged, extras);
  const dirty = ctx.diffHeavyModuleDependencies(prev, next);
  assertEq(dirty.anniversary, true);
});

test("依赖指纹变化 ⇒ 对应切片 dirty（防止 state 已变而计划跳过）", function () {
  const slices = ["rule100", "life4000", "trash", "anniversary", "forgeMins"];
  const prev = ctx.getHeavyModuleDependencySnapshot(heavyBase(), heavyExtras());
  const variants = [
    ["rule100", heavyBase({ ruleOf100: { rule100A: { checkins: ["x"], name: "A" } } })],
    ["life4000", heavyBase({ life4000Weeks: { name: "n", birthDate: "1990-01-01", birthLunarText: "", lastDoneTuesdayKey: "" } })],
    ["trash", heavyBase({ trash: [{ id: "gone", deletedAt: 2 }] })],
    ["anniversary", heavyBase({ anniversaryTw021: { weeks: { "1": [{ id: "z", text: "new" }] } } })],
    [
      "forgeMins",
      heavyBase({ forge: { dailyMinimums: [{ id: "m", label: "x", dailyMin: "10" }], weeklyMinimums: [] } })
    ]
  ];
  variants.forEach(function (pair) {
    const slice = pair[0];
    const next = ctx.getHeavyModuleDependencySnapshot(pair[1], heavyExtras());
    const dirty = ctx.diffHeavyModuleDependencies(prev, next);
    assert(dirty[slice], slice + " should be dirty");
    slices.forEach(function (other) {
      if (other === slice) return;
      assertEq(dirty[other], false, slice + " change leaked to " + other);
    });
  });
});

function annDoneBase(over) {
  return emptyState(
    Object.assign(
      {
        anniversaryTw020: {
          anchor: "2026-01-04",
          weeks: {
            "1": [{ id: "t1", text: "keep", done: true, subs: [] }]
          },
          deepTime: { days: { "2026-09-01": { hours: 1.5, loggedAt: 10 } } }
        },
        anniversaryTw021: { weeks: {} },
        anniversaryTw022: { weeks: {} },
        anniversaryTwRegistry: { nextNumber: 23, dynamicKeys: [] },
        anniversaryDoneRef: {
          tw020: { items: { "main:1:t1": "done-t1" } },
          tw021: { items: {} },
          tw022: { items: {} }
        },
        done: [
          {
            id: "done-t1",
            text: "【十二周年】keep",
            completedAt: 10,
            anniversaryTwMeta: { module: "tw020", syncKey: "main:1:t1", weekNum: 1, taskId: "t1" }
          }
        ],
        habitCheckins: {}
      },
      over || {}
    )
  );
}

function annShouldRun(prevState, nextState, opts) {
  const prev = ctx.getAnniversaryDoneSyncDependencySnapshot(prevState);
  const next = ctx.getAnniversaryDoneSyncDependencySnapshot(nextState);
  return ctx.shouldRunAnniversaryDoneSync(prev, next, opts);
}

test("启动时无 prev 快照：周年 Done 扫描必须执行", function () {
  const snap = ctx.getAnniversaryDoneSyncDependencySnapshot(annDoneBase());
  assertEq(ctx.shouldRunAnniversaryDoneSync(null, snap), true);
});

test("forceAll：即使指纹相同也必须扫描", function () {
  const snap = ctx.getAnniversaryDoneSyncDependencySnapshot(annDoneBase());
  assertEq(ctx.shouldRunAnniversaryDoneSync(snap, snap, { forceAll: true }), true);
});

test("普通 habitCheckins 勾选：周年依赖未变化 → 跳过扫描", function () {
  const prev = annDoneBase();
  const next = annDoneBase({
    habitCheckins: { "2026-09-01": { water: true } },
    done: prev.done.concat([{ id: "h1", text: "喝水", habitMeta: { key: "water" }, completedAt: 1 }])
  });
  assertEq(annShouldRun(prev, next), false);
});

test("连续 10 次普通习惯勾选：周年扫描次数 10→0", function () {
  const base = annDoneBase();
  let prev = ctx.getAnniversaryDoneSyncDependencySnapshot(base);
  let runs = 0;
  for (let i = 0; i < 10; i++) {
    const st = annDoneBase({
      habitCheckins: { "2026-09-01": { water: i + 1 } },
      done: base.done.concat([{ id: "h" + i, text: "喝水", habitMeta: { key: "water" }, completedAt: i }])
    });
    const next = ctx.getAnniversaryDoneSyncDependencySnapshot(st);
    if (ctx.shouldRunAnniversaryDoneSync(prev, next)) runs += 1;
    prev = next;
  }
  assertEq(runs, 0);
});

test("周年任务 done 变化 → 必须扫描", function () {
  const prev = annDoneBase();
  const next = annDoneBase({
    anniversaryTw020: {
      anchor: "2026-01-04",
      weeks: { "1": [{ id: "t1", text: "keep", done: false, subs: [] }] },
      deepTime: { days: { "2026-09-01": { hours: 1.5, loggedAt: 10 } } }
    }
  });
  assertEq(annShouldRun(prev, next), true);
});

test("周年任务增删 → 必须扫描", function () {
  const prev = annDoneBase();
  const next = annDoneBase({
    anniversaryTw020: {
      anchor: "2026-01-04",
      weeks: {
        "1": [
          { id: "t1", text: "keep", done: true, subs: [] },
          { id: "t2", text: "new", done: false, subs: [] }
        ]
      },
      deepTime: { days: { "2026-09-01": { hours: 1.5, loggedAt: 10 } } }
    }
  });
  assertEq(annShouldRun(prev, next), true);
});

test("删除周年任务 → 必须扫描（Done 镜像应对账）", function () {
  const prev = annDoneBase();
  const next = annDoneBase({
    anniversaryTw020: {
      anchor: "2026-01-04",
      weeks: { "1": [] },
      deepTime: { days: { "2026-09-01": { hours: 1.5, loggedAt: 10 } } }
    }
  });
  assertEq(annShouldRun(prev, next), true);
});

test("恢复周年任务 → 必须扫描", function () {
  const emptyWeeks = annDoneBase({
    anniversaryTw020: {
      anchor: "2026-01-04",
      weeks: { "1": [] },
      deepTime: { days: { "2026-09-01": { hours: 1.5, loggedAt: 10 } } }
    }
  });
  const restored = annDoneBase();
  assertEq(annShouldRun(emptyWeeks, restored), true);
});

test("周年 Done 源变化（镜像行删除）→ 必须扫描", function () {
  const prev = annDoneBase();
  const next = annDoneBase({ done: [] });
  assertEq(annShouldRun(prev, next), true);
});

test("anniversaryDoneRef 变化 → 必须扫描", function () {
  const prev = annDoneBase();
  const next = annDoneBase({
    anniversaryDoneRef: {
      tw020: { items: {} },
      tw021: { items: {} },
      tw022: { items: {} }
    }
  });
  assertEq(annShouldRun(prev, next), true);
});

test("深度时间 hours 变化 → 必须扫描", function () {
  const prev = annDoneBase();
  const next = annDoneBase({
    anniversaryTw020: {
      anchor: "2026-01-04",
      weeks: { "1": [{ id: "t1", text: "keep", done: true, subs: [] }] },
      deepTime: { days: { "2026-09-01": { hours: 3, loggedAt: 10 } } }
    }
  });
  assertEq(annShouldRun(prev, next), true);
});

test("子任务 done 变化 → 必须扫描", function () {
  const prev = annDoneBase({
    anniversaryTw020: {
      anchor: "2026-01-04",
      weeks: {
        "1": [{ id: "t1", text: "keep", done: true, subs: [{ id: "s1", text: "sub", done: false }] }]
      },
      deepTime: { days: { "2026-09-01": { hours: 1.5, loggedAt: 10 } } }
    }
  });
  const next = annDoneBase({
    anniversaryTw020: {
      anchor: "2026-01-04",
      weeks: {
        "1": [{ id: "t1", text: "keep", done: true, subs: [{ id: "s1", text: "sub", done: true }] }]
      },
      deepTime: { days: { "2026-09-01": { hours: 1.5, loggedAt: 10 } } }
    }
  });
  assertEq(annShouldRun(prev, next), true);
});

test("跨天 / selectedDoneDate / 归档视图 不在周年 Done 扫描依赖内", function () {
  const st = annDoneBase();
  const snap = ctx.getAnniversaryDoneSyncDependencySnapshot(st);
  const withUi = annDoneBase({
    anniversaryTw020: Object.assign({}, st.anniversaryTw020, {
      ui: { weekExpanded: { "1": true } },
      futureStory: "changed story"
    })
  });
  assertEq(ctx.shouldRunAnniversaryDoneSync(snap, ctx.getAnniversaryDoneSyncDependencySnapshot(withUi)), false);
});

test("registry 动态周期新增 → 必须扫描", function () {
  const prev = annDoneBase();
  const next = annDoneBase({
    anniversaryTwRegistry: { nextNumber: 24, dynamicKeys: ["tw023"] },
    anniversaryTw023: { weeks: { "1": [{ id: "n1", text: "dyn", done: false, subs: [] }] } }
  });
  assertEq(annShouldRun(prev, next), true);
});

test("云端 merge 改了十二周年文案 → 周年 Done 扫描必须执行", function () {
  const loc = annDoneBase({
    anniversaryTw020: {
      anchor: "2026-01-04",
      weeks: { "1": [{ id: "t1", text: "local", done: true, subs: [], updatedAt: 1 }] },
      deepTime: { days: {} }
    }
  });
  const rem = annDoneBase({
    anniversaryTw020: {
      anchor: "2026-01-04",
      weeks: { "1": [{ id: "t1", text: "remote", done: true, subs: [], updatedAt: 99 }] },
      deepTime: { days: {} }
    }
  });
  const prev = ctx.getAnniversaryDoneSyncDependencySnapshot(loc);
  const merged = fullMerge(loc, rem, 100, 0);
  const next = ctx.getAnniversaryDoneSyncDependencySnapshot(merged);
  assertEq(ctx.shouldRunAnniversaryDoneSync(prev, next), true);
});

test("周年 Done 依赖快照不得漏掉真实依赖（投影含 id/text/done/subs/deepTime/ref）", function () {
  const payload = ctx.collectAnniversaryDoneSyncDepPayload(annDoneBase());
  assert(payload.modules.anniversaryTw020, "missing tw020 module projection");
  assertEq(payload.modules.anniversaryTw020.weeks["1"][0].id, "t1");
  assertEq(payload.modules.anniversaryTw020.weeks["1"][0].done, true);
  assertEq(payload.modules.anniversaryTw020.deepTime.days["2026-09-01"].hours, 1.5);
  assertEq(payload.doneRef.tw020.items["main:1:t1"], "done-t1");
  assertEq(payload.anniversaryDone[0].id, "done-t1");
  assert(payload.anniversaryDone[0].anniversaryTwMeta, "missing anniversaryTwMeta on done dep");
});

function wpExtras(over) {
  return Object.assign({ currentSprintKey: "2026-08-31" }, over || {});
}

function wpDoneBase(over) {
  return emptyState(
    Object.assign(
      {
        weeklyPlan: {
          "2026-08-31": [
            {
              id: "w1",
              text: "主任务",
              lane: "life",
              mainDone: true,
              completedAt: 100,
              microTasks: [],
              updatedAt: 10
            }
          ]
        },
        weeklyPlanDoneRef: {
          "2026-08-31": { items: { "main:w1": "done-w1" } }
        },
        weeklyPlanDoneSuppress: {},
        done: [
          {
            id: "done-w1",
            text: "【周计划】8/31 → 9/2 · 主任务",
            completedAt: 100,
            weeklyPlanMeta: { weekKey: "2026-08-31", syncKey: "main:w1", kind: "main", taskId: "w1" }
          }
        ],
        habitCheckins: {}
      },
      over || {}
    )
  );
}

function wpShouldRun(prevState, nextState, extras, opts) {
  const ex = extras || wpExtras();
  const prev = ctx.getWeeklyPlanDoneSyncDependencySnapshot(prevState, ex);
  const next = ctx.getWeeklyPlanDoneSyncDependencySnapshot(nextState, ex);
  return ctx.shouldRunWeeklyPlanDoneSync(prev, next, opts);
}

test("启动时无 prev 快照：周计划 Done 扫描必须执行", function () {
  const snap = ctx.getWeeklyPlanDoneSyncDependencySnapshot(wpDoneBase(), wpExtras());
  assertEq(ctx.shouldRunWeeklyPlanDoneSync(null, snap), true);
});

test("forceAll：即使周计划指纹相同也必须扫描", function () {
  const snap = ctx.getWeeklyPlanDoneSyncDependencySnapshot(wpDoneBase(), wpExtras());
  assertEq(ctx.shouldRunWeeklyPlanDoneSync(snap, snap, { forceAll: true }), true);
});

test("普通 habitCheckins 勾选：周计划依赖未变化 → 跳过扫描", function () {
  const prev = wpDoneBase();
  const next = wpDoneBase({
    habitCheckins: { "2026-09-01": { water: true } },
    done: prev.done.concat([{ id: "h1", text: "喝水", habitMeta: { key: "water" }, completedAt: 1 }])
  });
  assertEq(wpShouldRun(prev, next), false);
});

test("连续 10 次普通习惯勾选：周计划 Done 扫描次数 10→0", function () {
  const base = wpDoneBase();
  const extras = wpExtras();
  let prev = ctx.getWeeklyPlanDoneSyncDependencySnapshot(base, extras);
  let runs = 0;
  for (let i = 0; i < 10; i++) {
    const st = wpDoneBase({
      habitCheckins: { "2026-09-01": { water: i + 1 } },
      done: base.done.concat([{ id: "h" + i, text: "喝水", habitMeta: { key: "water" }, completedAt: i }])
    });
    const next = ctx.getWeeklyPlanDoneSyncDependencySnapshot(st, extras);
    if (ctx.shouldRunWeeklyPlanDoneSync(prev, next)) runs += 1;
    prev = next;
  }
  assertEq(runs, 0);
});

test("当前周任务新增 → 必须扫描", function () {
  const prev = wpDoneBase();
  const next = wpDoneBase({
    weeklyPlan: {
      "2026-08-31": [
        prev.weeklyPlan["2026-08-31"][0],
        { id: "w2", text: "新任务", lane: "life", mainDone: false, microTasks: [], updatedAt: 11 }
      ]
    }
  });
  assertEq(wpShouldRun(prev, next), true);
});

test("当前周任务删除 → 必须扫描", function () {
  const prev = wpDoneBase();
  const next = wpDoneBase({
    weeklyPlan: { "2026-08-31": [] }
  });
  assertEq(wpShouldRun(prev, next), true);
});

test("当前周任务完成态变化 → 必须扫描", function () {
  const prev = wpDoneBase();
  const next = wpDoneBase({
    weeklyPlan: {
      "2026-08-31": [
        {
          id: "w1",
          text: "主任务",
          lane: "life",
          mainDone: false,
          completedAt: null,
          microTasks: [],
          updatedAt: 10
        }
      ]
    }
  });
  assertEq(wpShouldRun(prev, next), true);
});

test("子任务 / 微任务 done 变化 → 必须扫描", function () {
  const withMicro = function (doneFlag) {
    return wpDoneBase({
      weeklyPlan: {
        "2026-08-31": [
          {
            id: "w1",
            text: "主任务",
            lane: "life",
            mainDone: false,
            microTasks: [{ id: "m1", text: "微", done: doneFlag, completedAt: doneFlag ? 50 : null }],
            updatedAt: 10
          }
        ]
      }
    });
  };
  assertEq(wpShouldRun(withMicro(false), withMicro(true)), true);
});

test("weekKey 新增桶 → 必须扫描", function () {
  const prev = wpDoneBase();
  const next = wpDoneBase({
    weeklyPlan: Object.assign({}, prev.weeklyPlan, {
      "2026-09-03": [{ id: "w3", text: "下期", lane: "work", mainDone: false, microTasks: [] }]
    })
  });
  assertEq(wpShouldRun(prev, next), true);
});

test("跨周 currentSprintKey 变化 → 必须扫描", function () {
  const st = wpDoneBase();
  const prev = ctx.getWeeklyPlanDoneSyncDependencySnapshot(st, wpExtras({ currentSprintKey: "2026-08-31" }));
  const next = ctx.getWeeklyPlanDoneSyncDependencySnapshot(st, wpExtras({ currentSprintKey: "2026-09-03" }));
  assertEq(ctx.shouldRunWeeklyPlanDoneSync(prev, next), true);
});

test("Done 镜像被删除 → 必须扫描", function () {
  const prev = wpDoneBase();
  const next = wpDoneBase({ done: [] });
  assertEq(wpShouldRun(prev, next), true);
});

test("恢复周计划任务 → 必须扫描", function () {
  const empty = wpDoneBase({ weeklyPlan: { "2026-08-31": [] } });
  const restored = wpDoneBase();
  assertEq(wpShouldRun(empty, restored), true);
});

test("weeklyPlanDoneRef / suppress 变化 → 必须扫描", function () {
  const prev = wpDoneBase();
  const nextRef = wpDoneBase({
    weeklyPlanDoneRef: { "2026-08-31": { items: {} } }
  });
  const nextSup = wpDoneBase({
    weeklyPlanDoneSuppress: { w1: true }
  });
  assertEq(wpShouldRun(prev, nextRef), true);
  assertEq(wpShouldRun(prev, nextSup), true);
});

test("selectedDoneDate / 封闭清单无关变化不触发周计划 Done 扫描", function () {
  const prev = wpDoneBase();
  const next = wpDoneBase({
    closedList: [{ id: "c1", text: "x", completed: false }],
    memo: [{ id: "m1", text: "note" }]
  });
  assertEq(wpShouldRun(prev, next), false);
});

test("云端 merge 改变 weeklyPlan → 周计划 Done 扫描必须执行", function () {
  const extras = wpExtras();
  const loc = wpDoneBase({
    weeklyPlan: {
      "2026-08-31": [
        {
          id: "w1",
          text: "local",
          lane: "life",
          mainDone: true,
          completedAt: 100,
          microTasks: [],
          updatedAt: 1
        }
      ]
    }
  });
  const rem = wpDoneBase({
    weeklyPlan: {
      "2026-08-31": [
        {
          id: "w1",
          text: "remote",
          lane: "life",
          mainDone: true,
          completedAt: 100,
          microTasks: [],
          updatedAt: 99
        }
      ]
    }
  });
  const prev = ctx.getWeeklyPlanDoneSyncDependencySnapshot(loc, extras);
  const merged = fullMerge(loc, rem, 100, 0);
  const next = ctx.getWeeklyPlanDoneSyncDependencySnapshot(merged, extras);
  assertEq(ctx.shouldRunWeeklyPlanDoneSync(prev, next), true);
});

test("周计划 Done 依赖快照不得漏掉真实字段", function () {
  const payload = ctx.collectWeeklyPlanDoneSyncDepPayload(wpDoneBase(), wpExtras());
  assertEq(payload.currentSprintKey, "2026-08-31");
  assert(payload.weeks["2026-08-31"], "missing week bucket");
  assertEq(payload.weeks["2026-08-31"][0].id, "w1");
  assertEq(payload.weeks["2026-08-31"][0].mainDone, true);
  assertEq(payload.weeks["2026-08-31"][0].text, "主任务");
  assertEq(payload.doneRef["2026-08-31"].items["main:w1"], "done-w1");
  assertEq(payload.weeklyPlanDone[0].id, "done-w1");
  assert(payload.weeklyPlanDone[0].weeklyPlanMeta, "missing weeklyPlanMeta");
});

function roExtras(over) {
  return Object.assign({ currentSprintKey: "2026-09-03" }, over || {});
}

function roBase(over) {
  return emptyState(
    Object.assign(
      {
        weeklyPlan: {
          "2026-08-31": [
            {
              id: "old-done",
              text: "上期已完成",
              lane: "life",
              mainDone: true,
              completedAt: 50,
              microTasks: [],
              updatedAt: 10
            }
          ],
          "2026-09-03": [
            {
              id: "cur",
              text: "本期任务",
              lane: "life",
              mainDone: false,
              microTasks: [],
              updatedAt: 11
            }
          ]
        },
        weeklyPlanDoneRef: {
          "2026-08-31": { items: { "main:old-done": "d-old" } }
        },
        weeklyPlanDoneSuppress: {},
        closedList: [],
        done: [
          {
            id: "d-old",
            text: "【周计划】上期已完成",
            completedAt: 50,
            weeklyPlanMeta: { weekKey: "2026-08-31", syncKey: "main:old-done", kind: "main", taskId: "old-done" }
          }
        ],
        habitCheckins: {}
      },
      over || {}
    )
  );
}

function roShouldRun(prevState, nextState, extras, opts) {
  const ex = extras || roExtras();
  const prev = ctx.getWeeklyPlanRolloverDependencySnapshot(prevState, ex);
  const next = ctx.getWeeklyPlanRolloverDependencySnapshot(nextState, ex);
  return ctx.shouldRunWeeklyPlanRollover(prev, next, opts);
}

test("启动时无 prev 快照：周计划 rollover 必须执行", function () {
  const snap = ctx.getWeeklyPlanRolloverDependencySnapshot(roBase(), roExtras());
  assertEq(ctx.shouldRunWeeklyPlanRollover(null, snap), true);
});

test("forceAll：即使 rollover 指纹相同也必须执行", function () {
  const snap = ctx.getWeeklyPlanRolloverDependencySnapshot(roBase(), roExtras());
  assertEq(ctx.shouldRunWeeklyPlanRollover(snap, snap, { forceAll: true }), true);
});

test("普通 habitCheckins 勾选：rollover 可跳过", function () {
  const prev = roBase();
  const next = roBase({
    habitCheckins: { "2026-09-01": { water: true } },
    done: prev.done.concat([{ id: "h1", text: "喝水", habitMeta: { key: "water" }, completedAt: 1 }])
  });
  assertEq(roShouldRun(prev, next), false);
});

test("连续 10 次普通习惯勾选：rollover 次数 10→0", function () {
  const base = roBase();
  const extras = roExtras();
  let prev = ctx.getWeeklyPlanRolloverDependencySnapshot(base, extras);
  let runs = 0;
  for (let i = 0; i < 10; i++) {
    const st = roBase({
      habitCheckins: { "2026-09-01": { water: i + 1 } },
      done: base.done.concat([{ id: "h" + i, text: "喝水", habitMeta: { key: "water" }, completedAt: i }])
    });
    const next = ctx.getWeeklyPlanRolloverDependencySnapshot(st, extras);
    if (ctx.shouldRunWeeklyPlanRollover(prev, next)) runs += 1;
    prev = next;
  }
  assertEq(runs, 0);
});

test("当前周文案等无关字段变化：rollover 可跳过", function () {
  const prev = roBase();
  const next = roBase({
    weeklyPlan: {
      "2026-08-31": prev.weeklyPlan["2026-08-31"],
      "2026-09-03": [
        {
          id: "cur",
          text: "本期任务改了标题",
          lane: "work",
          mainDone: false,
          microTasks: [],
          updatedAt: 99
        }
      ]
    }
  });
  assertEq(roShouldRun(prev, next), false);
});

test("currentSprintKey 改变 → rollover 必须执行", function () {
  const st = roBase();
  const prev = ctx.getWeeklyPlanRolloverDependencySnapshot(st, roExtras({ currentSprintKey: "2026-08-31" }));
  const next = ctx.getWeeklyPlanRolloverDependencySnapshot(st, roExtras({ currentSprintKey: "2026-09-03" }));
  assertEq(ctx.shouldRunWeeklyPlanRollover(prev, next), true);
});

test("weekKey 改变（新增过去桶）→ rollover 必须执行", function () {
  const prev = roBase();
  const next = roBase({
    weeklyPlan: Object.assign({}, prev.weeklyPlan, {
      "2026-08-28": [{ id: "older", text: "更早", mainDone: false, microTasks: [] }]
    })
  });
  assertEq(roShouldRun(prev, next), true);
});

test("跨 Sprint：过去桶出现未完成任务 → 必须执行（应迁移）", function () {
  const prev = roBase();
  const next = roBase({
    weeklyPlan: {
      "2026-08-31": [
        {
          id: "old-open",
          text: "上期未完成",
          lane: "life",
          mainDone: false,
          microTasks: [],
          updatedAt: 10
        }
      ],
      "2026-09-03": prev.weeklyPlan["2026-09-03"]
    }
  });
  assertEq(roShouldRun(prev, next), true);
  const payload = ctx.collectWeeklyPlanRolloverDepPayload(next, roExtras());
  assertEq(payload.pastWeeks["2026-08-31"][0].mainDone, false);
  assertEq(payload.pastWeeks["2026-08-31"][0].id, "old-open");
});

test("已完成过去任务不进入迁移候选（指纹含 mainDone true）", function () {
  const payload = ctx.collectWeeklyPlanRolloverDepPayload(roBase(), roExtras());
  assertEq(payload.pastWeeks["2026-08-31"][0].mainDone, true);
  assertEq(payload.pastWeeks["2026-08-31"][0].id, "old-done");
  assert(!payload.pastWeeks["2026-09-03"], "current sprint must not be in pastWeeks");
});

test("微任务未完成的过去任务 → 必须执行", function () {
  const prev = roBase();
  const next = roBase({
    weeklyPlan: {
      "2026-08-31": [
        {
          id: "old-micro",
          text: "带子任务",
          mainDone: false,
          microTasks: [{ id: "m1", text: "微", done: false, completedAt: null }]
        }
      ],
      "2026-09-03": prev.weeklyPlan["2026-09-03"]
    }
  });
  assertEq(roShouldRun(prev, next), true);
});

test("Done 镜像 / 封闭清单完成证据变化 → rollover 必须执行", function () {
  const prev = roBase();
  const nextDone = roBase({ done: [] });
  const nextCl = roBase({
    closedList: [
      {
        id: "cl1",
        text: "镜",
        completed: true,
        mirrorOf: { kind: "weeklyPlan", id: "old-done", weekKey: "2026-08-31" }
      }
    ]
  });
  assertEq(roShouldRun(prev, nextDone), true);
  assertEq(roShouldRun(prev, nextCl), true);
});

test("restore 把未完成任务放回过去桶 → 必须执行", function () {
  const emptyPast = roBase({
    weeklyPlan: { "2026-09-03": roBase().weeklyPlan["2026-09-03"] }
  });
  const restored = roBase({
    weeklyPlan: {
      "2026-08-31": [{ id: "restored", text: "恢复", mainDone: false, microTasks: [] }],
      "2026-09-03": roBase().weeklyPlan["2026-09-03"]
    }
  });
  assertEq(roShouldRun(emptyPast, restored), true);
});

test("云端 merge 改变过去周未完成任务 → rollover 必须执行", function () {
  const extras = roExtras();
  const loc = roBase({
    weeklyPlan: {
      "2026-08-31": [
        { id: "w1", text: "keep", lane: "life", mainDone: false, microTasks: [], updatedAt: 1 }
      ],
      "2026-09-03": roBase().weeklyPlan["2026-09-03"]
    }
  });
  const rem = roBase({
    weeklyPlan: {
      "2026-08-31": [
        { id: "w1", text: "keep", lane: "life", mainDone: true, completedAt: 99, microTasks: [], updatedAt: 99 }
      ],
      "2026-09-03": roBase().weeklyPlan["2026-09-03"]
    }
  });
  const prev = ctx.getWeeklyPlanRolloverDependencySnapshot(loc, extras);
  const merged = fullMerge(loc, rem, 100, 0);
  const next = ctx.getWeeklyPlanRolloverDependencySnapshot(merged, extras);
  assertEq(ctx.shouldRunWeeklyPlanRollover(prev, next), true);
});

test("rollover 依赖快照不得漏真实依赖", function () {
  const payload = ctx.collectWeeklyPlanRolloverDepPayload(roBase(), roExtras());
  assertEq(payload.currentSprintKey, "2026-09-03");
  assert(payload.weekKeys.indexOf("2026-08-31") !== -1);
  assert(payload.weekKeys.indexOf("2026-09-03") !== -1);
  assert(payload.pastWeeks["2026-08-31"], "past week missing");
  assertEq(payload.doneRef["2026-08-31"].items["main:old-done"], "d-old");
  assertEq(payload.weeklyPlanDone[0].weeklyPlanMeta.taskId, "old-done");
  assertEq(ctx.isWeeklyPlanSprintKeyPastCurrent("2026-08-31", "2026-09-03"), true);
  assertEq(ctx.isWeeklyPlanSprintKeyPastCurrent("2026-09-03", "2026-09-03"), false);
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
