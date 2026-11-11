/**
 * BUILD/RULE 梦想小时跨设备同步优化：静态契约 + 合并语义。
 * 运行：node _test_block_dream_hours_sync_opt.mjs
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
  assert.ok(i >= 0, "missing marker: " + marker);
  return html.slice(Math.max(0, i - before), i + after);
}

/* —— 静态契约 —— */
assert.match(html, /ALIYUN_SYNC_PRIMARY_POLL_MS = 2500/);
assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261111m"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261111m"/);

const setFn = sliceAround("function setBlockDreamHoursForDay", 0, 1400);
assert.match(setFn, /乐观更新/);
assert.match(setFn, /skipAliyunForgeNotify:\s*true/);
assert.match(setFn, /skipUiPaintDirty:\s*true/);
assert.match(setFn, /notifyAliyunForgeRealSettingsAfterLocalChange\("block-dream-hours"\)/);
assert.ok(
  setFn.indexOf("syncBlockDreamHoursUI()") < setFn.indexOf('saveState({ lists: ["forge"]'),
  "本机须先刷 UI 再 saveState"
);

const scheduleFn = sliceAround("function scheduleAliyunForgeRealSync", 0, 1600);
assert.match(scheduleFn, /队列内只保留最新一条/);
assert.match(scheduleFn, /__forgeSettings__/);

const applyMut = sliceAround(
  "function aliyunForgeRealApplyMutationToEnvelope",
  0,
  2200
);
assert.match(applyMut, /mergeBlockDreamHoursForSync/);
assert.match(applyMut, /即使本机 settings 戳更旧/);

assert.match(html, /dream-hours only \(skip forge mins\/done refresh\)/);
assert.match(html, /aliyunForgeRealLastSettingsApply/);
assert.match(html, /skipAliyunForgeNotify/);

/* —— 合并语义（与 index 内 mergeBlockDreamHoursForSync 对齐） —— */
function normalizeBlockDreamHoursDayEntry(raw) {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const h = Math.max(0, Math.floor(raw));
    return h > 0 ? { hours: h, updatedAt: 0 } : null;
  }
  if (typeof raw !== "object") return null;
  const hours = Math.max(0, Math.floor(Number(raw.hours) || 0));
  if (hours <= 0) return null;
  return { hours: hours, updatedAt: Number(raw.updatedAt) || 0 };
}

function mergeBlockDreamHoursForSync(localRaw, remoteRaw) {
  const lo =
    localRaw && typeof localRaw === "object" && localRaw.days && typeof localRaw.days === "object"
      ? localRaw.days
      : {};
  const ro =
    remoteRaw && typeof remoteRaw === "object" && remoteRaw.days && typeof remoteRaw.days === "object"
      ? remoteRaw.days
      : {};
  const keys = Array.from(new Set(Object.keys(lo).concat(Object.keys(ro))));
  const days = {};
  keys.forEach(function (k) {
    const l = normalizeBlockDreamHoursDayEntry(lo[k]);
    const r = normalizeBlockDreamHoursDayEntry(ro[k]);
    if (!l && !r) return;
    if (!l) {
      days[k] = { hours: r.hours, updatedAt: r.updatedAt || 0 };
      return;
    }
    if (!r) {
      days[k] = { hours: l.hours, updatedAt: l.updatedAt || 0 };
      return;
    }
    const hours = Math.max(l.hours, r.hours);
    let updatedAt = Math.max(l.updatedAt || 0, r.updatedAt || 0);
    if (hours === l.hours && l.updatedAt) updatedAt = Math.max(updatedAt, l.updatedAt);
    if (hours === r.hours && r.updatedAt) updatedAt = Math.max(updatedAt, r.updatedAt);
    days[k] = { hours: hours, updatedAt: updatedAt || 0 };
  });
  return { days: days };
}

/** 模拟信封 settings 应用：戳旧仍并入梦想小时；戳新则整片替换但梦想小时取 max */
function applySettingsMutationToEnvelope(env, mutation) {
  const now = Date.now();
  let next = JSON.parse(JSON.stringify(mutation.settings));
  const ts = Number(next.updatedAt) || now;
  const prevTs =
    env.settings && typeof env.settings === "object" ? Number(env.settings.updatedAt) || 0 : 0;
  const baseDream =
    env.settings && env.settings.blockDreamHours ? env.settings.blockDreamHours : { days: {} };
  next.blockDreamHours = mergeBlockDreamHoursForSync(baseDream, next.blockDreamHours);
  if (ts < prevTs) {
    if (env.settings && typeof env.settings === "object") {
      env.settings.blockDreamHours = next.blockDreamHours;
    }
    return env;
  }
  env.settings = next;
  env.settings.updatedAt = ts;
  return env;
}

const day = "2026-11-11";
const env = {
  settings: {
    updatedAt: 2000,
    kbWeightKg: { value: 24 },
    blockDreamHours: { days: { [day]: { hours: 5, updatedAt: 1500 } } }
  }
};

/* 本机连续 +1 到 7，但 settings 戳更旧（他端刚改过重量）→ 云端应保留 24kg 且小时升到 7 */
applySettingsMutationToEnvelope(env, {
  op: "settings",
  settings: {
    updatedAt: 1000,
    kbWeightKg: { value: 16 },
    blockDreamHours: { days: { [day]: { hours: 7, updatedAt: 1800 } } }
  }
});
assert.equal(env.settings.kbWeightKg.value, 24, "旧戳不得覆盖他端重量");
assert.equal(env.settings.blockDreamHours.days[day].hours, 7, "旧戳仍应抬升梦想小时");

/* 本机戳更新：整片替换，但梦想小时仍取与云端的 max（防丢他端更高累计） */
applySettingsMutationToEnvelope(env, {
  op: "settings",
  settings: {
    updatedAt: 3000,
    kbWeightKg: { value: 16 },
    blockDreamHours: { days: { [day]: { hours: 6, updatedAt: 2900 } } }
  }
});
assert.equal(env.settings.kbWeightKg.value, 16);
assert.equal(
  env.settings.blockDreamHours.days[day].hours,
  7,
  "新戳替换 settings 时梦想小时仍取 max(云端7,本机6)"
);

/* 延迟预算（架构推算，非线上实测承诺） */
const POLL_MS = 2500;
const FLUSH_DEBOUNCE_MS = 80;
const avgDiscoveryMs = FLUSH_DEBOUNCE_MS + POLL_MS / 2;
const worstDiscoveryMs = FLUSH_DEBOUNCE_MS + POLL_MS;
assert.ok(avgDiscoveryMs <= 2000, "平均发现等待应落入约 1–2s 档（不含网络 RTT）");
assert.ok(worstDiscoveryMs <= 3000, "最坏发现等待应 ≤3s（不含网络 RTT）");

console.log("OK block-dream-hours-sync-opt", {
  pollMs: POLL_MS,
  flushDebounceMs: FLUSH_DEBOUNCE_MS,
  avgDiscoveryMsExcludingNetwork: avgDiscoveryMs,
  worstDiscoveryMsExcludingNetwork: worstDiscoveryMs
});
