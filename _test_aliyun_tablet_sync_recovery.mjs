/**
 * 平板阿里云同步恢复 · 静态回归（不打真实 FC）
 * 覆盖：僵尸 inflight 代次、旧 finally 不误释新锁、过期轮次丢弃、
 *       safety-full 仅有效完成后推进水位、bump/AfterPullRound lastSeen 安全
 * Run: node _test_aliyun_tablet_sync_recovery.mjs
 */
import assert from "assert";
import fs from "fs";

const html = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function mustInclude(s, label) {
  assert.ok(html.includes(s), "missing: " + label + " → " + s.slice(0, 80));
}

mustInclude("ALIYUN_SYNC_PRIMARY_PULL_STALE_MS", "stale inflight threshold");
mustInclude("clearAliyunSyncPrimaryStalePullInFlight", "stale clear helper");
mustInclude("beginAliyunSyncPrimaryPullInFlight", "begin pull with generation");
mustInclude("endAliyunSyncPrimaryPullInFlight", "end pull generation-guarded");
mustInclude("isAliyunSyncPrimaryPullGenerationCurrent", "generation current check");
mustInclude("aliyunSyncPrimaryPullGen", "pull generation counter");
mustInclude('reason: "superseded"', "superseded reason");
mustInclude("aliyunSyncPrimaryResumeFromBackground", "resume helper");
mustInclude("restartAliyunSyncPrimaryPollIntervalOnly", "interval restart without killing schedule");
mustInclude('scheduleAliyunSyncPrimaryNearRealtimePull("visible")', "resume uses visible reason");
mustInclude("window.addEventListener(\"focus\", aliyunSyncPrimaryOnFocus)", "focus listener");
mustInclude("window.addEventListener(\"online\", aliyunSyncPrimaryOnOnline)", "online listener");
mustInclude("__aliyunSyncPrimaryDebugSnapshot", "tablet debug snapshot");
mustInclude("gateReason: domainsGate && domainsGate.reason", "pass gateReason to after-round");
mustInclude("禁止把 verify 里他域更高版本写进 lastSeen", "bump no cross-domain lastSeen");
mustInclude("packed.skippedMeta) continue", "after-round skip skippedMeta lastSeen");
mustInclude("aliyunDomainsMetaRoundEffectivelyComplete", "safety watermark effective-complete helper");
mustInclude("skip safety/boot watermark: round not effectively complete", "warn on failed safety");
mustInclude("pullGen: pullGen || undefined", "AfterPullRound receives pullGen");
mustInclude("afterRoundStillCurrent", "AfterPullRound gen guard");
mustInclude("AfterPullRound skip lastSeen after seed await", "seed await superseded guard");
mustInclude("AfterPullRound skip lastSeen after meta fetch await", "fetch await superseded guard");
mustInclude("if (local && lTs > rTs) continue", "Done LWW: skip older remote");
mustInclude("if (remTs < locTs) return false", "Forge settings LWW by settingsUpdatedAt");
mustInclude("function mergeNetWorthWanForSync", "netWorth LWW helper");
mustInclude("if (ra > la) return { netWorthWan: rv, netWorthWanUpdatedAt: ra }", "netWorth prefers newer remote only");
mustInclude("exec-system-pwa-v20261021f", "cache bump in html");
assert.ok(sw.includes("exec-system-pwa-v20261021f"), "cache bump in sw");

/* —— 纯逻辑：请求代次（旧 finally 不误释新锁）—— */
function makePullLock() {
  let inFlight = false;
  let startedAt = 0;
  let gen = 0;
  const STALE_MS = 60_000;
  return {
    begin() {
      gen += 1;
      inFlight = true;
      startedAt = Date.now();
      return gen;
    },
    end(g) {
      if (Number(g) !== Number(gen)) return false;
      inFlight = false;
      startedAt = 0;
      return true;
    },
    clearStale(now, why) {
      if (!inFlight) return false;
      const age = startedAt > 0 ? now - startedAt : STALE_MS + 1;
      if (age < STALE_MS) return false;
      gen += 1;
      inFlight = false;
      startedAt = 0;
      return true;
    },
    isCurrent(g) {
      return Number(g) > 0 && Number(g) === Number(gen);
    },
    snapshot() {
      return { inFlight, gen, startedAt };
    }
  };
}

{
  const lock = makePullLock();
  const g1 = lock.begin();
  assert.strictEqual(g1, 1);
  assert.strictEqual(lock.snapshot().inFlight, true);

  /* 模拟超过 60s 后清僵尸：代次递增，旧 finally 不得清新锁 */
  const cleared = lock.clearStale(Date.now() + 61_000, "test");
  assert.strictEqual(cleared, true);
  assert.strictEqual(lock.snapshot().inFlight, false);
  assert.strictEqual(lock.snapshot().gen, 2);
  assert.strictEqual(lock.end(g1), false, "old finally must not release after stale clear");

  const g2 = lock.begin();
  assert.strictEqual(g2, 3);
  assert.strictEqual(lock.snapshot().inFlight, true);
  assert.strictEqual(lock.end(g1), false, "old gen must not release new lock");
  assert.strictEqual(lock.snapshot().inFlight, true);
  assert.strictEqual(lock.end(g2), true);
  assert.strictEqual(lock.snapshot().inFlight, false);
}

/* 过期响应不得覆盖：superseded 轮次跳过 AfterPullRound / 角标副作用 */
function simulateBootPullRound({ pullGen, activeGen, domains, runDomain }) {
  const results = {};
  let afterRoundCalled = false;
  let badgePainted = false;
  let superseded = false;
  for (let i = 0; i < domains.length; i++) {
    if (pullGen && pullGen !== activeGen) {
      superseded = true;
      for (let j = i; j < domains.length; j++) {
        if (!results[domains[j]]) {
          results[domains[j]] = { ok: false, skipped: true, reason: "superseded" };
        }
      }
      break;
    }
    const id = domains[i];
    const r = runDomain(id);
    if (pullGen && pullGen !== activeGen) {
      superseded = true;
      results[id] = { ok: false, skipped: true, reason: "superseded" };
      break;
    }
    results[id] = r;
  }
  if (pullGen && pullGen !== activeGen) superseded = true;
  if (!superseded) {
    afterRoundCalled = true;
    badgePainted = true;
  }
  return {
    superseded,
    afterRoundCalled,
    badgePainted,
    results,
    report: superseded
      ? { ok: false, skipped: true, reason: "superseded", results }
      : { ok: true, results }
  };
}

{
  /* 旧轮 gen=1，清僵尸后 activeGen=2：旧轮不得 AfterPullRound / 角标 */
  let callCount = 0;
  const out = simulateBootPullRound({
    pullGen: 1,
    activeGen: 2,
    domains: ["done", "forge", "habit"],
    runDomain(id) {
      callCount += 1;
      return { ok: true, body: id + "-stale" };
    }
  });
  assert.strictEqual(out.superseded, true);
  assert.strictEqual(out.afterRoundCalled, false, "superseded must skip AfterPullRound");
  assert.strictEqual(out.badgePainted, false, "superseded must skip badge paint");
  assert.strictEqual(out.report.reason, "superseded");
  assert.strictEqual(callCount, 0, "must not start domain pulls when already superseded");
}

{
  /* 显式中途失效：await done 期间清僵尸 → 不 Mark 后续域、不 AfterPullRound */
  const results = {};
  const pullGen = 5;
  let activeGen = 5;
  let afterRound = false;
  const domains = ["done", "forge", "habit"];
  for (let i = 0; i < domains.length; i++) {
    if (pullGen !== activeGen) {
      for (let j = i; j < domains.length; j++) {
        if (!results[domains[j]]) {
          results[domains[j]] = { ok: false, skipped: true, reason: "superseded" };
        }
      }
      break;
    }
    const id = domains[i];
    /* 模拟 await 域拉取期间代次被清僵尸递增 */
    if (id === "done") activeGen = 6;
    if (pullGen !== activeGen) {
      results[id] = { ok: false, skipped: true, reason: "superseded" };
      for (let j = i + 1; j < domains.length; j++) {
        results[domains[j]] = { ok: false, skipped: true, reason: "superseded" };
      }
      break;
    }
    results[id] = { ok: true };
  }
  if (pullGen === activeGen) afterRound = true;
  assert.strictEqual(afterRound, false);
  assert.strictEqual(results.done.reason, "superseded");
  assert.strictEqual(results.forge.reason, "superseded");
  assert.strictEqual(results.habit.reason, "superseded");
}

/* —— bump verify 不得跨域推进 lastSeen —— */
function applyBumpVerifyLastSeen(lastSeen, bumpedId, verifyVersions) {
  const next = Object.assign({}, lastSeen);
  next[bumpedId] = Number(verifyVersions[bumpedId]) || 0;
  return next;
}

{
  const lastSeen = { done: 10, habit: 5, forge: 20 };
  const verify = { done: 11, habit: 9, forge: 25 };
  const next = applyBumpVerifyLastSeen(lastSeen, "done", verify);
  assert.strictEqual(next.done, 11);
  assert.strictEqual(next.habit, 5);
  assert.strictEqual(next.forge, 20);
}

/* AfterPullRound：失败 / skippedMeta 不推进 lastSeen */
function afterRoundAlignLastSeen(lastSeen, remoteVersions, results) {
  const next = Object.assign({}, lastSeen);
  for (const id of Object.keys(remoteVersions)) {
    const rv = Number(remoteVersions[id]);
    if (!Number.isFinite(rv)) continue;
    const packed = results[id];
    if (!packed || packed.ok === false || packed.skippedMeta) continue;
    next[id] = rv;
  }
  return next;
}

{
  const lastSeen = { done: 1, habit: 1, forge: 1 };
  const remote = { done: 2, habit: 3, forge: 4 };
  const results = {
    done: { ok: true },
    habit: { ok: false, error: "net" },
    forge: { ok: true, skippedMeta: true }
  };
  const next = afterRoundAlignLastSeen(lastSeen, remote, results);
  assert.strictEqual(next.done, 2);
  assert.strictEqual(next.habit, 1);
  assert.strictEqual(next.forge, 1);
}

/* —— safety-full 水位：仅有效完成后推进 —— */
function roundEffectivelyComplete(domainIds, results) {
  if (!results) return false;
  for (const id of domainIds) {
    const packed = results[id];
    if (!packed || packed.ok === false) return false;
    if (packed.skippedMeta || packed.reason === "superseded") return false;
  }
  return true;
}

function shouldAdvanceSafetyWatermark({
  pullReason,
  gateReason,
  forceAll,
  safetyAt,
  domainIds,
  results
}) {
  const isSafety = gateReason === "safety-full" || pullReason === "safety-full";
  const isBootLike = !!forceAll || pullReason === "boot" || gateReason === "boot";
  if (!(isSafety || (isBootLike && safetyAt <= 0))) return false;
  return roundEffectivelyComplete(domainIds, results);
}

const ALL = ["done", "habit", "forge"];

{
  /* 成功的 safety-full → 推进 */
  assert.strictEqual(
    shouldAdvanceSafetyWatermark({
      pullReason: "poll",
      gateReason: "safety-full",
      forceAll: false,
      safetyAt: 100,
      domainIds: ALL,
      results: { done: { ok: true }, habit: { ok: true }, forge: { ok: true } }
    }),
    true
  );
}

{
  /* 失败的 safety-full（一域 ok:false）→ 不推进 */
  assert.strictEqual(
    shouldAdvanceSafetyWatermark({
      pullReason: "poll",
      gateReason: "safety-full",
      forceAll: false,
      safetyAt: 100,
      domainIds: ALL,
      results: { done: { ok: true }, habit: { ok: false, error: "timeout" }, forge: { ok: true } }
    }),
    false,
    "failed safety-full must not advance watermark"
  );
}

{
  /* 缺失域结果 → 不推进 */
  assert.strictEqual(
    shouldAdvanceSafetyWatermark({
      pullReason: "poll",
      gateReason: "safety-full",
      forceAll: false,
      safetyAt: 100,
      domainIds: ALL,
      results: { done: { ok: true }, habit: { ok: true } }
    }),
    false
  );
}

{
  /* superseded → 不推进 */
  assert.strictEqual(
    shouldAdvanceSafetyWatermark({
      pullReason: "poll",
      gateReason: "safety-full",
      forceAll: false,
      safetyAt: 100,
      domainIds: ALL,
      results: {
        done: { ok: true },
        habit: { ok: false, reason: "superseded" },
        forge: { ok: true }
      }
    }),
    false
  );
}

{
  /* meta-unchanged 非 safety → 不推进 */
  assert.strictEqual(
    shouldAdvanceSafetyWatermark({
      pullReason: "poll",
      gateReason: "meta-unchanged",
      forceAll: false,
      safetyAt: 100,
      domainIds: ALL,
      results: { done: { ok: true }, habit: { ok: true }, forge: { ok: true } }
    }),
    false
  );
}

{
  /* 首次 boot 全成功且 safetyAt=0 → 推进 */
  assert.strictEqual(
    shouldAdvanceSafetyWatermark({
      pullReason: "boot",
      gateReason: "boot",
      forceAll: true,
      safetyAt: 0,
      domainIds: ALL,
      results: { done: { ok: true }, habit: { ok: true }, forge: { ok: true } }
    }),
    true
  );
}

{
  /* 首次 boot 失败 → 不推进 */
  assert.strictEqual(
    shouldAdvanceSafetyWatermark({
      pullReason: "boot",
      gateReason: "boot",
      forceAll: true,
      safetyAt: 0,
      domainIds: ALL,
      results: { done: { ok: false }, habit: { ok: true }, forge: { ok: true } }
    }),
    false,
    "failed boot must not seed safety watermark"
  );
}

/* visibility 字面量 */
{
  assert.ok(!html.includes('scheduleAliyunSyncPrimaryNearRealtimePull("visibility")'));
  assert.ok(!html.includes('scheduleAliyunSyncPrimaryNearRealtimePull("pageshow")'));
}

/* 禁止无代次的 markAliyunSyncPrimaryPullInFlight(false) 盲清 */
{
  assert.ok(
    !html.includes("function markAliyunSyncPrimaryPullInFlight"),
    "old ungarded markAliyunSyncPrimaryPullInFlight must be removed"
  );
}

/* —— LWW：旧 d.run() 在代次失效后继续 merge，不得覆盖本机已更新数据 —— */
/** 镜像 Done：lTs > rTs 跳过 */
function doneMergeApplyRemote(localById, remoteItems) {
  const out = Object.assign({}, localById);
  for (const rid of Object.keys(remoteItems)) {
    const remote = remoteItems[rid];
    const local = out[rid];
    const rTs = Number(remote && remote.updatedAt) || 0;
    const lTs = Number(local && local.updatedAt) || 0;
    if (local && lTs > rTs) continue;
    if (!local) {
      out[rid] = { id: rid, text: remote.text, updatedAt: rTs };
      continue;
    }
    if (rTs >= lTs) {
      out[rid] = {
        id: rid,
        text: remote.text,
        updatedAt: Math.max(rTs, lTs)
      };
    }
  }
  return out;
}

{
  /* 新轮已写入更新正文；旧轮过期远端不得回盖 */
  const afterNewPull = {
    a: { id: "a", text: "newer-local", updatedAt: 200 }
  };
  const staleRemote = {
    a: { id: "a", text: "stale-cloud", updatedAt: 100 }
  };
  const merged = doneMergeApplyRemote(afterNewPull, staleRemote);
  assert.strictEqual(merged.a.text, "newer-local");
  assert.strictEqual(merged.a.updatedAt, 200);
}

{
  /* 远端更新：仍可前进 */
  const local = { a: { id: "a", text: "old", updatedAt: 100 } };
  const remote = { a: { id: "a", text: "cloud-new", updatedAt: 150 } };
  const merged = doneMergeApplyRemote(local, remote);
  assert.strictEqual(merged.a.text, "cloud-new");
  assert.strictEqual(merged.a.updatedAt, 150);
}

/** 镜像 Forge settings：remTs < locTs 拒绝 */
function forgeApplyRemoteSettings(localSettingsAt, localMap, remoteSettings) {
  const remTs = Number(remoteSettings.updatedAt) || 0;
  const locTs = Number(localSettingsAt) || 0;
  if (remTs < locTs) return { applied: false, map: localMap, settingsUpdatedAt: locTs };
  return {
    applied: true,
    map: remoteSettings.kbWeightKg || localMap,
    settingsUpdatedAt: remTs > locTs ? remTs : locTs
  };
}

{
  const r = forgeApplyRemoteSettings(500, { x: 1 }, { updatedAt: 400, kbWeightKg: { x: 9 } });
  assert.strictEqual(r.applied, false);
  assert.deepStrictEqual(r.map, { x: 1 });
}

/** 镜像净值：仅 ra > la 才用远端 */
function mergeNetWorthWanForSync(locVal, locAt, remVal, remAt) {
  const la = Number(locAt) || 0;
  const ra = Number(remAt) || 0;
  if (locVal == null && remVal == null) return { netWorthWan: -20, netWorthWanUpdatedAt: 0 };
  if (locVal == null) return { netWorthWan: remVal, netWorthWanUpdatedAt: ra };
  if (remVal == null) return { netWorthWan: locVal, netWorthWanUpdatedAt: la };
  if (ra > la) return { netWorthWan: remVal, netWorthWanUpdatedAt: ra };
  return { netWorthWan: locVal, netWorthWanUpdatedAt: la };
}

{
  /* 新轮已写 -20.00@T2；旧轮 -27.68@T1 不得回盖 */
  const m = mergeNetWorthWanForSync(-20, 2000, -27.68, 1000);
  assert.strictEqual(m.netWorthWan, -20);
  assert.strictEqual(m.netWorthWanUpdatedAt, 2000);
}

{
  const m = mergeNetWorthWanForSync(-27.68, 1000, -20, 2000);
  assert.strictEqual(m.netWorthWan, -20);
  assert.strictEqual(m.netWorthWanUpdatedAt, 2000);
}

/* —— AfterPullRound：await 期间代次失效 → 不得推进 lastSeen —— */
async function simulateAfterPullRoundAsync({
  pullGen,
  isCurrent,
  seedNeeded,
  remoteVersions,
  bootLike,
  results
}) {
  const lastSeen = Object.create(null);
  let safetyAt = 0;
  function stillCurrent() {
    if (!pullGen) return true;
    return isCurrent(pullGen);
  }
  if (!stillCurrent()) return { lastSeen, safetyAt, aborted: "before-start" };

  if (seedNeeded) {
    await Promise.resolve(); /* 模拟 seed await */
    if (!stillCurrent()) return { lastSeen, safetyAt, aborted: "after-seed-await" };
    lastSeen.done = 1;
    lastSeen.forge = 1;
    return { lastSeen, safetyAt, aborted: null };
  }
  if (remoteVersions) {
    if (!stillCurrent()) return { lastSeen, safetyAt, aborted: "before-remoteVersions" };
    for (const id of Object.keys(remoteVersions)) {
      const packed = results && results[id];
      if (!packed || packed.ok === false || packed.skippedMeta) continue;
      lastSeen[id] = remoteVersions[id];
    }
    return { lastSeen, safetyAt, aborted: null };
  }
  if (bootLike) {
    await Promise.resolve(); /* 模拟 meta fetch await */
    if (!stillCurrent()) return { lastSeen, safetyAt, aborted: "after-fetch-await" };
    lastSeen.done = 9;
    lastSeen.forge = 9;
    return { lastSeen, safetyAt, aborted: null };
  }
  return { lastSeen, safetyAt, aborted: null };
}

{
  /* seed await 期间代次失效 → 不写 lastSeen */
  let calls = 0;
  const out = await simulateAfterPullRoundAsync({
    pullGen: 3,
    isCurrent: () => {
      calls += 1;
      return calls === 1; /* 进入时 true；seed await 后再查为 false */
    },
    seedNeeded: true,
    remoteVersions: null,
    bootLike: false,
    results: null
  });
  assert.strictEqual(out.aborted, "after-seed-await");
  assert.strictEqual(Object.keys(out.lastSeen).length, 0);
}

{
  /* boot meta-fetch await 期间代次失效 → 不写 lastSeen */
  let calls = 0;
  const out = await simulateAfterPullRoundAsync({
    pullGen: 7,
    isCurrent: () => {
      calls += 1;
      return calls === 1;
    },
    seedNeeded: false,
    remoteVersions: null,
    bootLike: true,
    results: null
  });
  assert.strictEqual(out.aborted, "after-fetch-await");
  assert.ok(!out.lastSeen.done, "must not write lastSeen after superseded fetch await");
}

{
  /* remoteVersions 同步路径：全程 current → 可推进 */
  const out = await simulateAfterPullRoundAsync({
    pullGen: 1,
    isCurrent: () => true,
    seedNeeded: false,
    remoteVersions: { done: 5, forge: 5 },
    bootLike: false,
    results: { done: { ok: true }, forge: { ok: true } }
  });
  assert.strictEqual(out.aborted, null);
  assert.strictEqual(out.lastSeen.done, 5);
  assert.strictEqual(out.lastSeen.forge, 5);
}

console.log("ok: tablet aliyun sync recovery tests passed");
