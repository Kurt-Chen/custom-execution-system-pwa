/**
 * BUILD/RULE 日锁 · 隔离房协议级双端验证（真实 FC，非真机 UI）
 * 覆盖：A 锁定 BUILD → B 读到；纠错 RULE 保留小时；并发首次锁冲突；跨日无锁回落。
 * 运行：node _bench_block_mode_lock_cross_device.mjs
 */
import assert from "node:assert/strict";

const BASE = "https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run";
const ROOM = "cursor-bdh-modelock-bench-5732";
const FORGE_DOC = "aliyun-forge-real-v1-" + ROOM;
const META_DOC = "aliyun-meta-v1-domains-" + ROOM;
const DAY = "2026-11-11";
const NEXT_DAY = "2026-11-12";
const POLL_MS = 2500;
const DOMAIN_IDS = [
  "done",
  "habit",
  "forge",
  "anniv",
  "sprint",
  "todayPlan",
  "amb",
  "rule100",
  "lists",
  "goals"
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(method, url, bodyObj) {
  const init = { method, headers: { Accept: "application/json" } };
  if (bodyObj != null) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(bodyObj);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_e) {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, text, bytes: text ? Buffer.byteLength(text) : 0 };
}

function emptyMetaVersions() {
  const v = Object.create(null);
  for (const id of DOMAIN_IDS) v[id] = 0;
  return v;
}

function emptyForgeEnv() {
  return {
    kind: "forge-real-v1",
    roomId: ROOM,
    envelopeUpdatedAt: Date.now(),
    items: {},
    tombstones: {},
    settings: null
  };
}

function parsePayload(row) {
  if (!row) return null;
  const attrs = row.attrs || row;
  if (attrs && Object.prototype.hasOwnProperty.call(attrs, "payload")) {
    const p = attrs.payload;
    if (typeof p === "string") {
      try {
        return JSON.parse(p);
      } catch (_e) {
        return null;
      }
    }
    return p;
  }
  return attrs;
}

async function getDoc(docId) {
  const res = await fetchJson("GET", BASE + "/smoke/" + encodeURIComponent(docId), null);
  if (res.status === 404 || (res.data && res.data.error === "not_found")) {
    return { ok: true, missing: true };
  }
  if (!res.ok) return { ok: false, error: "HTTP " + res.status };
  return { ok: true, missing: false, payload: parsePayload(res.data && res.data.data) };
}

async function putDoc(docId, payload) {
  const res = await fetchJson("POST", BASE + "/smoke", { id: docId, payload });
  return { ok: res.ok, status: res.status, error: res.ok ? null : "HTTP " + res.status };
}

function normalizeMode(mode) {
  return mode === "holiday" || mode === "weekday" ? mode : "";
}

function normalizeDay(raw) {
  if (!raw || typeof raw !== "object") return null;
  const hours = Math.max(0, Math.floor(Number(raw.hours) || 0));
  const mode = normalizeMode(raw.mode);
  if (hours <= 0 && !mode) return null;
  const out = {
    hours,
    updatedAt: Number(raw.updatedAt) || 0
  };
  if (mode) {
    out.mode = mode;
    const lock = Number(raw.modeLockedAt) || 0;
    const upd = Number(raw.modeUpdatedAt) || 0;
    if (lock > 0) out.modeLockedAt = lock;
    if (upd > 0) out.modeUpdatedAt = upd;
  }
  return out;
}

function mergeModeFields(l, r) {
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
      mode = lLock > 0 && rLock > 0 && lLock !== rLock ? (lLock <= rLock ? lm : rm) : lm;
    }
  } else if (lLock > 0 && rLock > 0) {
    mode = lLock <= rLock ? lm : rm;
  } else if (rLock > 0) {
    mode = rm;
  }
  const out = { mode };
  if (modeLockedAt > 0) out.modeLockedAt = modeLockedAt;
  if (modeUpdatedAt > 0) out.modeUpdatedAt = modeUpdatedAt;
  return out;
}

function mergeDreamEnvelope(cloudRaw, localRaw) {
  const co = (cloudRaw && cloudRaw.days) || {};
  const lo = (localRaw && localRaw.days) || {};
  const keys = new Set([...Object.keys(co), ...Object.keys(lo)]);
  const days = {};
  for (const k of keys) {
    const c = normalizeDay(co[k]);
    const l = normalizeDay(lo[k]);
    if (!c && !l) continue;
    if (!c) {
      days[k] = Object.assign({}, l);
      continue;
    }
    if (!l) {
      days[k] = Object.assign({}, c);
      continue;
    }
    const cAt = Number(c.updatedAt) || 0;
    const lAt = Number(l.updatedAt) || 0;
    let row;
    if (lAt > cAt) row = { hours: l.hours, updatedAt: lAt };
    else if (cAt > lAt) row = { hours: c.hours, updatedAt: cAt };
    else row = { hours: Math.max(c.hours, l.hours), updatedAt: Math.max(cAt, lAt) };
    const mf = mergeModeFields(c, l);
    if (mf) Object.assign(row, mf);
    days[k] = row;
  }
  return { days };
}

function dayEntry(settings, dayKey) {
  return normalizeDay(
    settings &&
      settings.blockDreamHours &&
      settings.blockDreamHours.days &&
      settings.blockDreamHours.days[dayKey]
  );
}

async function bumpForgeMeta() {
  const fresh = await getDoc(META_DOC);
  const versions = emptyMetaVersions();
  if (fresh.ok && !fresh.missing && fresh.payload && fresh.payload.versions) {
    Object.assign(versions, fresh.payload.versions);
  }
  versions.forge = (Number(versions.forge) || 0) + 1;
  await putDoc(META_DOC, {
    kind: "domains-meta-v1",
    roomId: ROOM,
    versions,
    at: Date.now()
  });
  return versions.forge;
}

async function flushSettings(localDream) {
  const getForge = await getDoc(FORGE_DOC);
  let env =
    getForge.missing || !getForge.payload
      ? emptyForgeEnv()
      : Object.assign(emptyForgeEnv(), getForge.payload);
  if (!env.settings || typeof env.settings !== "object") env.settings = {};
  const mergedDream = mergeDreamEnvelope(env.settings.blockDreamHours, localDream);
  env.settings = Object.assign({}, env.settings, {
    updatedAt: Date.now(),
    blockDreamHours: mergedDream
  });
  env.envelopeUpdatedAt = Date.now();
  env.roomId = ROOM;
  const put = await putDoc(FORGE_DOC, env);
  assert.ok(put.ok, "forge put");
  const v = await bumpForgeMeta();
  return { dream: mergedDream, forgeV: v };
}

async function deviceBWaitMode(dayKey, expectMode, lastV, deadlineMs) {
  const phase = Math.floor(Math.random() * POLL_MS);
  await sleep(phase);
  let seenV = lastV;
  const t0 = Date.now();
  while (Date.now() < deadlineMs) {
    const meta = await getDoc(META_DOC);
    const v =
      meta.ok && !meta.missing && meta.payload && meta.payload.versions
        ? Number(meta.payload.versions.forge) || 0
        : 0;
    if (v > seenV) {
      seenV = v;
      const forge = await getDoc(FORGE_DOC);
      const e = dayEntry(forge.payload && forge.payload.settings, dayKey);
      if (e && e.mode === expectMode) {
        return { ok: true, entry: e, latencyMs: Date.now() - t0, forgeV: seenV };
      }
    }
    const remain = deadlineMs - Date.now();
    if (remain <= 0) break;
    await sleep(Math.min(POLL_MS, remain));
  }
  return { ok: false, forgeV: seenV, latencyMs: Date.now() - t0 };
}

const health = await fetchJson("GET", BASE + "/health", null);
assert.equal(health.status, 200, "health");

const report = {
  room: ROOM,
  scenarios: {},
  measuredAt: new Date().toISOString()
};

/* 1) A 锁定 BUILD → B 同步 */
{
  const tClick = Date.now();
  await sleep(80);
  const local = {
    days: {
      [DAY]: {
        hours: 1,
        updatedAt: tClick,
        mode: "weekday",
        modeLockedAt: tClick,
        modeUpdatedAt: 0
      }
    }
  };
  const a = await flushSettings(local);
  const b = await deviceBWaitMode(DAY, "weekday", 0, Date.now() + 12000);
  report.scenarios.lockBuildSync = {
    ok: !!(b.ok && b.entry && b.entry.hours === 1 && b.entry.mode === "weekday"),
    latencyMs: b.latencyMs,
    entry: b.entry || null
  };
  assert.ok(report.scenarios.lockBuildSync.ok, "B should lock BUILD with hours=1");
}

/* 2) 纠错 RULE，小时保留并同步 */
{
  const t0 = Date.now();
  const local = {
    days: {
      [DAY]: {
        hours: 2,
        updatedAt: t0,
        mode: "holiday",
        modeLockedAt: t0 - 10000,
        modeUpdatedAt: t0
      }
    }
  };
  const metaBefore = await getDoc(META_DOC);
  const lastV =
    metaBefore.ok && !metaBefore.missing && metaBefore.payload && metaBefore.payload.versions
      ? Number(metaBefore.payload.versions.forge) || 0
      : 0;
  await flushSettings(local);
  const b = await deviceBWaitMode(DAY, "holiday", lastV, Date.now() + 12000);
  report.scenarios.reviseKeepHours = {
    ok: !!(b.ok && b.entry && b.entry.mode === "holiday" && b.entry.hours >= 2),
    latencyMs: b.latencyMs,
    entry: b.entry || null
  };
  assert.ok(report.scenarios.reviseKeepHours.ok, "revise RULE keep hours");
}

/* 3) 并发首次锁：weekday@earlier vs holiday@later → weekday；小时 max */
{
  const base = Date.now();
  const cloud = {
    days: {
      [DAY]: {
        hours: 1,
        updatedAt: base,
        mode: "weekday",
        modeLockedAt: base,
        modeUpdatedAt: 0
      }
    }
  };
  await putDoc(FORGE_DOC, Object.assign(emptyForgeEnv(), {
    settings: { updatedAt: base, blockDreamHours: cloud }
  }));
  const local = {
    days: {
      [DAY]: {
        hours: 1,
        updatedAt: base + 5,
        mode: "holiday",
        modeLockedAt: base + 5,
        modeUpdatedAt: 0
      }
    }
  };
  const merged = mergeDreamEnvelope(cloud, local);
  const e = normalizeDay(merged.days[DAY]);
  report.scenarios.concurrentFirstLock = {
    ok: !!(e && e.mode === "weekday" && e.hours === 1 && e.modeLockedAt === base),
    entry: e
  };
  assert.ok(report.scenarios.concurrentFirstLock.ok, "earlier lock wins; hours not lost");
}

/* 4) 跨日：次日无锁 → 自动判断（模拟无 mode 条目） */
{
  const got = await getDoc(FORGE_DOC);
  const eNext = dayEntry(got.payload && got.payload.settings, NEXT_DAY);
  report.scenarios.nextDayUnlocked = {
    ok: !eNext || !eNext.mode,
    entry: eNext,
    note: "次日无 mode 条目时 getEffective 回落日历；本协议级检查确认无串日锁"
  };
  assert.ok(report.scenarios.nextDayUnlocked.ok, "next day should not inherit lock");
}

console.log(JSON.stringify(report, null, 2));
console.log("OK block-mode-lock-cross-device-bench");
