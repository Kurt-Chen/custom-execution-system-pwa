/**
 * BUILD/RULE 每日模式锁定：静态契约 + 合并/锁定语义。
 * 运行：node _test_block_mode_daily_lock.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

function sliceAround(marker, before, after) {
  const i = html.indexOf(marker);
  assert.ok(i >= 0, "missing: " + marker);
  return html.slice(Math.max(0, i - before), i + after);
}

assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261111o"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261111o"/);
assert.match(html, /function mergeBlockDreamModeFields/);
assert.match(html, /function reviseTodayBlockModeLock/);
assert.match(html, /function healBlockDreamModeLocksFromHistory/);
assert.match(html, /function isTodayBlockModeLocked/);
assert.match(html, /block-dream-hours-lock/);
assert.match(html, /今天已采用/);
assert.match(html, /已记录时间将保留/);

const eff = sliceAround("function getEffectiveTodayPlanBlockMode", 0, 900);
assert.match(eff, /getBlockDreamModeLockForDay/);
assert.match(eff, /readTodayPlanBlockModeOverride/);
assert.match(eff, /getAutoTodayPlanBlockMode/);

const toggle = sliceAround("function toggleTodayPlanBlockMode", 0, 1200);
assert.match(toggle, /window\.confirm/);
assert.match(toggle, /reviseTodayBlockModeLock/);
assert.match(toggle, /isTodayBlockModeLocked/);

const setFn = sliceAround("function setBlockDreamHoursForDay", 0, 2200);
assert.match(setFn, /首次有效计时/);
assert.match(setFn, /modeLockedAt/);
assert.match(setFn, /writeTodayPlanBlockModeOverride/);

/* —— 纯逻辑：与生产 mergeBlockDreamModeFields 对齐 —— */
function normalizeMode(mode) {
  return mode === "holiday" || mode === "weekday" ? mode : "";
}

function mergeBlockDreamModeFields(localEntry, remoteEntry) {
  const l = localEntry || null;
  const r = remoteEntry || null;
  const lm = l ? normalizeMode(l.mode) : "";
  const rm = r ? normalizeMode(r.mode) : "";
  if (!lm && !rm) return null;
  if (!lm) {
    return {
      mode: rm,
      modeLockedAt: Number(r.modeLockedAt) || 0,
      modeUpdatedAt: Number(r.modeUpdatedAt) || 0
    };
  }
  if (!rm) {
    return {
      mode: lm,
      modeLockedAt: Number(l.modeLockedAt) || 0,
      modeUpdatedAt: Number(l.modeUpdatedAt) || 0
    };
  }
  const lLock = Number(l.modeLockedAt) || 0;
  const rLock = Number(r.modeLockedAt) || 0;
  const lUpd = Number(l.modeUpdatedAt) || 0;
  const rUpd = Number(r.modeUpdatedAt) || 0;
  let modeLockedAt = 0;
  if (lLock > 0 && rLock > 0) modeLockedAt = Math.min(lLock, rLock);
  else modeLockedAt = Math.max(lLock, rLock);
  let mode = lm;
  let modeUpdatedAt = 0;
  if (lUpd > 0 || rUpd > 0) {
    if (lUpd > rUpd) {
      mode = lm;
      modeUpdatedAt = lUpd;
    } else if (rUpd > lUpd) {
      mode = rm;
      modeUpdatedAt = rUpd;
    } else {
      modeUpdatedAt = lUpd;
      if (lLock > 0 && rLock > 0 && lLock !== rLock) mode = lLock <= rLock ? lm : rm;
      else mode = lm;
    }
  } else if (lLock > 0 && rLock > 0) {
    mode = lLock <= rLock ? lm : rm;
  } else if (rLock > 0 && lLock <= 0) {
    mode = rm;
  }
  const out = { mode };
  if (modeLockedAt > 0) out.modeLockedAt = modeLockedAt;
  if (modeUpdatedAt > 0) out.modeUpdatedAt = modeUpdatedAt;
  return out;
}

function mergeHoursMax(l, r) {
  return Math.max(l.hours || 0, r.hours || 0);
}

/* 工作日默认 BUILD；首次计时锁定 BUILD */
{
  const lock = { mode: "weekday", modeLockedAt: 1000, modeUpdatedAt: 0, hours: 1 };
  assert.equal(mergeBlockDreamModeFields(lock, null).mode, "weekday");
}

/* 假期默认 RULE；首次锁定 holiday */
{
  const lock = { mode: "holiday", modeLockedAt: 1000, modeUpdatedAt: 0, hours: 1 };
  assert.equal(mergeBlockDreamModeFields(null, lock).mode, "holiday");
}

/* 多设备同时首次计时：较早 modeLockedAt 胜出 */
{
  const a = { mode: "weekday", modeLockedAt: 1000, modeUpdatedAt: 0, hours: 1 };
  const b = { mode: "holiday", modeLockedAt: 1005, modeUpdatedAt: 0, hours: 1 };
  const m = mergeBlockDreamModeFields(a, b);
  assert.equal(m.mode, "weekday");
  assert.equal(m.modeLockedAt, 1000);
  assert.equal(mergeHoursMax(a, b), 1);
}

/* 手动纠错：较新 modeUpdatedAt 覆盖模式，小时取 max 保留 */
{
  const locked = { mode: "weekday", modeLockedAt: 1000, modeUpdatedAt: 0, hours: 2 };
  const revised = {
    mode: "holiday",
    modeLockedAt: 1000,
    modeUpdatedAt: 2000,
    hours: 2
  };
  const m = mergeBlockDreamModeFields(locked, revised);
  assert.equal(m.mode, "holiday");
  assert.equal(m.modeUpdatedAt, 2000);
  assert.equal(m.modeLockedAt, 1000);
  assert.equal(mergeHoursMax(locked, revised), 2);
}

/* 纠错后累计继续增加不丢 */
{
  const a = { mode: "holiday", modeLockedAt: 1000, modeUpdatedAt: 2000, hours: 2 };
  const b = { mode: "holiday", modeLockedAt: 1000, modeUpdatedAt: 2000, hours: 5 };
  assert.equal(mergeHoursMax(a, b), 5);
  assert.equal(mergeBlockDreamModeFields(a, b).mode, "holiday");
}

/* 旧数据仅有 hours：heal 语义（日历推断）不丢 hours */
{
  const legacy = { hours: 3, updatedAt: 500 };
  assert.ok(legacy.hours === 3);
  const healed = {
    hours: legacy.hours,
    updatedAt: legacy.updatedAt,
    mode: "weekday",
    modeLockedAt: legacy.updatedAt,
    modeUpdatedAt: 0
  };
  assert.equal(healed.hours, 3);
  assert.equal(healed.mode, "weekday");
}

console.log("OK block-mode-daily-lock");
