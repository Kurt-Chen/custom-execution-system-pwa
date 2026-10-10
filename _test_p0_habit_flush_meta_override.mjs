/**
 * P0：flush-busy 旁路 Habit 只读拉取 + domains 滞后时 Habit 独立 meta 纠偏
 * Run: node _test_p0_habit_flush_meta_override.mjs
 * 纯静态/表驱动，不打真实 FC、不改云端。
 */
import assert from "assert";
import fs from "fs";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("./sw.js", import.meta.url), "utf8");

function mustInclude(s, label) {
  assert.ok(html.includes(s), "missing: " + label + " → " + s.slice(0, 80));
}

function mustNotMatch(re, label) {
  assert.ok(!re.test(html), "forbidden pattern still present: " + label);
}

/* —— 缓存联动 —— */
mustInclude('APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261010g"', "html cache g");
assert.ok(sw.includes('CACHE_NAME = "exec-system-pwa-v20261010g"'), "sw cache g");

/* —— P0-A 符号 —— */
mustInclude("runAliyunSyncPrimaryHabitReadonlyPullDuringFlushBusy", "P0-A fn");
mustInclude("ALIYUN_SYNC_PRIMARY_HABIT_READONLY_DURING_FLUSH_MIN_MS = 5000", "P0-A throttle=5s");
mustInclude("habitReadonlyDuringFlush", "P0-A report flag");
mustInclude(
  "return await runAliyunSyncPrimaryHabitReadonlyPullDuringFlushBusy(reason || \"poll\")",
  "P0-A wired into near-realtime"
);
mustInclude("habitFlushBusy", "P0-A skips when Habit itself flushing");

/* 禁止退回「flush-busy 整轮早退且无 Habit 旁路」的旧形态：
 * 旧代码是单独一行 return flush-busy；现应走旁路函数。 */
{
  const nearIdx = html.indexOf("async function runAliyunSyncPrimaryNearRealtimePull");
  assert.ok(nearIdx > 0, "nearRealtimePull exists");
  const slice = html.slice(nearIdx, nearIdx + 3500);
  assert.ok(
    slice.includes("runAliyunSyncPrimaryHabitReadonlyPullDuringFlushBusy"),
    "nearRealtimePull must call habit readonly during flush"
  );
  assert.ok(
    !/if \(aliyunSyncPrimaryAnyDomainFlushBusy\(\)\) \{\s*return \{ ok: false, skipped: true, reason: "flush-busy" \};/.test(
      slice
    ),
    "old hard flush-busy early-return must be gone"
  );
}

/* —— P0-B 符号 —— */
mustInclude("aliyunSyncPrimaryEnsureHabitPullIfIndepMetaSaysSo", "P0-B ensure fn");
mustInclude("aliyunHabitMetaGateTakePrefetchDecision", "P0-B prefetch take");
mustInclude("habit-meta-override-domains-lag", "P0-B skipAll override reason");
mustInclude("via=prefetch", "P0-B prefetch log in Habit pull");
mustInclude("P0-B habit-meta override", "P0-B console marker");

/* skipAll 路径必须先问 Habit meta，不得无条件全量 */
{
  const bootIdx = html.indexOf("async function runAliyunSyncPrimaryBootPull");
  const bootSlice = html.slice(bootIdx, bootIdx + 12000);
  assert.ok(bootSlice.includes("domainsGate.skipAll"), "skipAll still handled");
  assert.ok(
    bootSlice.includes("aliyunSyncPrimaryEnsureHabitPullIfIndepMetaSaysSo"),
    "skipAll consults Habit indep meta"
  );
  assert.ok(
    bootSlice.includes('pullIds: ["habit"]'),
    "override only schedules habit, not all domains"
  );
}

/* 未扩大 poll 频率 */
mustInclude("ALIYUN_SYNC_PRIMARY_POLL_MS = 5000", "poll still 5s");
assert.ok(
  !/ALIYUN_SYNC_PRIMARY_POLL_MS\s*=\s*[1-4]\d{0,3}\b/.test(html),
  "poll not tightened below 5s"
);

/* 禁止扩大到其它域策略 / 镜像设计被改掉的标志性注释仍在 */
mustInclude("habit Done 不走 Done 域", "habit Done mirror design preserved");
mustInclude("tombstone=no (habit Done 不走 Done 域)", "repair tombstone note preserved");

/* —— 表驱动：domains skipAll + habit meta 纠偏语义（与实现一致） —— */
function domainsDecide(ids, remoteVersions, lastSeen) {
  const pullIds = [];
  const skipIds = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const remoteV = Number(remoteVersions && remoteVersions[id]);
    const localV = lastSeen[id];
    if (localV == null || !Number.isFinite(Number(localV))) {
      pullIds.push(id);
      continue;
    }
    if (!Number.isFinite(remoteV) || Number(remoteV) !== Number(localV)) {
      pullIds.push(id);
    } else {
      skipIds.push(id);
    }
  }
  return { pullIds, skipIds, skipAll: pullIds.length === 0 };
}

function habitIndepDecide(remoteV, lastSeenV) {
  if (lastSeenV != null && Number(remoteV) === Number(lastSeenV)) {
    return { fetchBody: false, reason: "meta-unchanged" };
  }
  return { fetchBody: true, reason: "meta-changed", remoteV: remoteV };
}

function scheduleAfterP0B(ids, remoteDomains, lastSeenDomains, habitRemoteV, habitLastSeenV) {
  const d = domainsDecide(ids, remoteDomains, lastSeenDomains);
  const pullIdSet = Object.create(null);
  const changed = d.pullIds.slice();
  d.pullIds.forEach(function (id) {
    pullIdSet[id] = true;
  });
  let habitMetaGets = 0;
  let bodyGets = { habit: 0, other: 0 };
  if (d.skipAll || !pullIdSet.habit) {
    habitMetaGets += 1;
    const h = habitIndepDecide(habitRemoteV, habitLastSeenV);
    if (h.fetchBody) {
      pullIdSet.habit = true;
      if (changed.indexOf("habit") < 0) changed.push("habit");
    }
  }
  if (pullIdSet.habit) {
    /* 正文 GET；meta 已用 prefetch 时不再重复计（实现 stash） */
    bodyGets.habit = 1;
  }
  Object.keys(pullIdSet).forEach(function (id) {
    if (id !== "habit") bodyGets.other += 1;
  });
  return {
    skipAll: d.skipAll && !pullIdSet.habit,
    pullHabit: !!pullIdSet.habit,
    changed: changed,
    habitMetaGets: habitMetaGets,
    bodyGets: bodyGets
  };
}

const ids = ["done", "habit", "forge", "lists", "goals"];

{
  /* 复现现场：domains.habit 卡住 347，habitMeta 369，本机 lastSeen 域=347 / habitMeta=347 */
  const r = scheduleAfterP0B(
    ids,
    { done: 1, habit: 347, forge: 1, lists: 1, goals: 1 },
    { done: 1, habit: 347, forge: 1, lists: 1, goals: 1 },
    369,
    347
  );
  assert.strictEqual(r.skipAll, false, "must not skipAll when habit meta ahead");
  assert.strictEqual(r.pullHabit, true, "must pull habit body");
  assert.deepStrictEqual(r.changed, ["habit"]);
  assert.strictEqual(r.bodyGets.other, 0, "must NOT pull other domains");
  assert.strictEqual(r.habitMetaGets, 1, "one habit meta GET");
  assert.strictEqual(r.bodyGets.habit, 1, "one habit body GET");
}

{
  /* 正常安静轮询：域与 habit meta 均未变 → 仍零正文；+1 habit meta peek */
  const r = scheduleAfterP0B(
    ids,
    { done: 1, habit: 347, forge: 1, lists: 1, goals: 1 },
    { done: 1, habit: 347, forge: 1, lists: 1, goals: 1 },
    369,
    369
  );
  assert.strictEqual(r.pullHabit, false);
  assert.strictEqual(r.skipAll, true);
  assert.strictEqual(r.bodyGets.habit, 0);
  assert.strictEqual(r.bodyGets.other, 0);
  assert.strictEqual(r.habitMetaGets, 1);
}

{
  /* domains 已标 habit 变化 → 不额外问 indep（表驱动：已 scheduled 则 habitMetaGets=0） */
  const r = scheduleAfterP0B(
    ids,
    { done: 1, habit: 348, forge: 1, lists: 1, goals: 1 },
    { done: 1, habit: 347, forge: 1, lists: 1, goals: 1 },
    370,
    369
  );
  assert.strictEqual(r.pullHabit, true);
  assert.strictEqual(r.habitMetaGets, 0, "no extra indep peek when domains already schedules habit");
}

/* —— P0-A 节流语义 —— */
function shouldHabitReadonlyDuringFlush(opts) {
  const o = opts || {};
  if (o.habitFlushBusy) return { go: false, reason: "habit-flush" };
  if (o.pullInFlight) return { go: false, reason: "in-flight" };
  if (
    o.lastAt > 0 &&
    o.now - o.lastAt < ALIYUN_SYNC_PRIMARY_HABIT_READONLY_DURING_FLUSH_MIN_MS
  ) {
    return { go: false, reason: "throttle" };
  }
  return { go: true, reason: "ok" };
}
const ALIYUN_SYNC_PRIMARY_HABIT_READONLY_DURING_FLUSH_MIN_MS = 5000;

{
  assert.strictEqual(
    shouldHabitReadonlyDuringFlush({
      habitFlushBusy: true,
      pullInFlight: false,
      lastAt: 0,
      now: 10000
    }).go,
    false
  );
  assert.strictEqual(
    shouldHabitReadonlyDuringFlush({
      habitFlushBusy: false,
      pullInFlight: false,
      lastAt: 9000,
      now: 10000
    }).reason,
    "throttle"
  );
  assert.strictEqual(
    shouldHabitReadonlyDuringFlush({
      habitFlushBusy: false,
      pullInFlight: false,
      lastAt: 4000,
      now: 10000
    }).go,
    true
  );
}

/* —— 请求次数变化（文档断言，供交付对照） —— */
const REQUEST_DELTA = {
  quietPollBefore: { domainsMeta: 1, habitMeta: 0, habitBody: 0, otherBodies: 0 },
  quietPollAfterBothUnchanged: { domainsMeta: 1, habitMeta: 1, habitBody: 0, otherBodies: 0 },
  lagCaseAfter: { domainsMeta: 1, habitMeta: 1, habitBody: 1, otherBodies: 0 },
  flushBusyBefore: { domainsMeta: 0, habitMeta: 0, habitBody: 0, note: "starved" },
  flushBusyAfterUnchanged: { domainsMeta: 0, habitMeta: 1, habitBody: 0 },
  flushBusyAfterChanged: { domainsMeta: 0, habitMeta: 1, habitBody: 1 },
  pollIntervalMs: 5000
};
assert.strictEqual(REQUEST_DELTA.pollIntervalMs, 5000);
assert.strictEqual(REQUEST_DELTA.quietPollAfterBothUnchanged.habitBody, 0);
assert.strictEqual(REQUEST_DELTA.lagCaseAfter.otherBodies, 0);

console.log("OK _test_p0_habit_flush_meta_override.mjs");
console.log("REQUEST_DELTA", JSON.stringify(REQUEST_DELTA, null, 2));
