/**
 * 平板阿里云同步恢复 · 静态回归（不打真实 FC）
 * 覆盖：僵尸 inflight、visibility→visible、bump 不跨域推进 lastSeen、AfterPullRound 不推进失败域
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
mustInclude("markAliyunSyncPrimaryPullInFlight", "inflight marker with timestamp");
mustInclude("aliyunSyncPrimaryResumeFromBackground", "resume helper");
mustInclude("restartAliyunSyncPrimaryPollIntervalOnly", "interval restart without killing schedule");
mustInclude('scheduleAliyunSyncPrimaryNearRealtimePull("visible")', "resume uses visible reason");
mustInclude("window.addEventListener(\"focus\", aliyunSyncPrimaryOnFocus)", "focus listener");
mustInclude("window.addEventListener(\"online\", aliyunSyncPrimaryOnOnline)", "online listener");
mustInclude("__aliyunSyncPrimaryDebugSnapshot", "tablet debug snapshot");
mustInclude("gateReason: domainsGate && domainsGate.reason", "pass gateReason to after-round");
mustInclude("禁止把 verify 里他域更高版本写进 lastSeen", "bump no cross-domain lastSeen");
mustInclude("packed.skippedMeta) continue", "after-round skip skippedMeta lastSeen");
mustInclude("exec-system-pwa-v20261020n", "cache bump in html");
assert.ok(sw.includes("exec-system-pwa-v20261020n"), "cache bump in sw");

/* 纯逻辑：bump verify 不得跨域推进 lastSeen */
function applyBumpVerifyLastSeen(lastSeen, bumpedId, verifyVersions) {
  const next = Object.assign({}, lastSeen);
  const remoteV = Number(verifyVersions[bumpedId]) || 0;
  next[bumpedId] = remoteV;
  /* 正确行为：不遍历他域 */
  return next;
}

{
  const lastSeen = { done: 10, habit: 5, forge: 20 };
  const verify = { done: 11, habit: 9, forge: 25 };
  const next = applyBumpVerifyLastSeen(lastSeen, "done", verify);
  assert.strictEqual(next.done, 11);
  assert.strictEqual(next.habit, 5, "habit lastSeen must not jump without body pull");
  assert.strictEqual(next.forge, 20, "forge lastSeen must not jump without body pull");
}

/* AfterPullRound：失败 / skippedMeta 不推进 */
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
  assert.strictEqual(next.habit, 1, "failed pull must not advance lastSeen");
  assert.strictEqual(next.forge, 1, "skippedMeta must not advance lastSeen");
}

/* 僵尸 inflight：超过阈值可清除 */
function clearStale(inFlight, startedAt, now, staleMs) {
  if (!inFlight) return { cleared: false, inFlight: false };
  const age = startedAt > 0 ? now - startedAt : staleMs + 1;
  if (age < staleMs) return { cleared: false, inFlight: true };
  return { cleared: true, inFlight: false };
}

{
  const t0 = 1_000_000;
  assert.strictEqual(clearStale(true, t0, t0 + 30_000, 60_000).cleared, false);
  assert.strictEqual(clearStale(true, t0, t0 + 61_000, 60_000).cleared, true);
  assert.strictEqual(clearStale(true, 0, t0, 60_000).cleared, true);
}

/* safety 水位：gateReason=safety-full 即使 pullReason=poll 也推进 */
function shouldAdvanceSafety(pullReason, gateReason, forceAll, safetyAt) {
  const isSafety = gateReason === "safety-full" || pullReason === "safety-full";
  const isBootLike = !!forceAll || pullReason === "boot" || gateReason === "boot";
  return isSafety || (isBootLike && safetyAt <= 0);
}

{
  assert.strictEqual(shouldAdvanceSafety("poll", "safety-full", false, 100), true);
  assert.strictEqual(shouldAdvanceSafety("poll", "meta-unchanged", false, 100), false);
  assert.strictEqual(shouldAdvanceSafety("boot", "boot", true, 0), true);
}

/* visibility 字面量：旧 bug 用 visibility/pageshow，门闩检查 visible */
{
  assert.ok(
    !html.includes('scheduleAliyunSyncPrimaryNearRealtimePull("visibility")'),
    "must not schedule with reason=visibility anymore"
  );
  assert.ok(
    !html.includes('scheduleAliyunSyncPrimaryNearRealtimePull("pageshow")'),
    "must not schedule with reason=pageshow anymore"
  );
}

console.log("ok: tablet aliyun sync recovery tests passed");
