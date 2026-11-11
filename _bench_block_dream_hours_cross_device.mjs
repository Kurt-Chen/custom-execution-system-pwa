/**
 * BUILD/RULE 梦想小时 · 隔离房间双端同步耗时实测（打真实阿里云 FC）
 *
 * 房间：cursor-bdh-bench-5732（不碰正式 default-room）
 * 模拟：
 *   A = 本机 +1 → 80ms 防抖 → forge RMW → domains meta bump(+verify)
 *   B = 2.5s meta 轮询（随机相位）→ forge 正文 → 读出 hours
 *
 * 运行：node _bench_block_dream_hours_cross_device.mjs
 */
import assert from "node:assert/strict";

const BASE = "https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run";
const ROOM = "cursor-bdh-bench-5732";
const FORGE_DOC = "aliyun-forge-real-v1-" + ROOM;
const META_DOC = "aliyun-meta-v1-domains-" + ROOM;
const DAY = "2026-11-11";
const POLL_MS = 2500;
const FLUSH_DEBOUNCE_MS = 80;
const TRIALS = 12;
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
  const t0 = Date.now();
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
  return {
    ok: res.ok,
    status: res.status,
    data,
    ms: Date.now() - t0,
    bytes: text ? Buffer.byteLength(text) : 0
  };
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
  const url = BASE + "/smoke/" + encodeURIComponent(docId);
  const res = await fetchJson("GET", url, null);
  if (res.status === 404 || (res.data && res.data.error === "not_found")) {
    return { ok: true, missing: true, ms: res.ms, bytes: res.bytes };
  }
  if (!res.ok) return { ok: false, error: "HTTP " + res.status, ms: res.ms, bytes: res.bytes };
  const row = res.data && res.data.data;
  return {
    ok: true,
    missing: false,
    payload: parsePayload(row),
    ms: res.ms,
    bytes: res.bytes
  };
}

async function putDoc(docId, payload) {
  const res = await fetchJson("POST", BASE + "/smoke", { id: docId, payload });
  return {
    ok: res.ok,
    status: res.status,
    ms: res.ms,
    bytes: res.bytes,
    error: res.ok ? null : "HTTP " + res.status
  };
}

function dayHours(settings) {
  const e =
    settings &&
    settings.blockDreamHours &&
    settings.blockDreamHours.days &&
    settings.blockDreamHours.days[DAY];
  return e ? Number(e.hours) || 0 : 0;
}

function normalizeDay(raw) {
  if (!raw || typeof raw !== "object") return null;
  const hours = Math.max(0, Math.floor(Number(raw.hours) || 0));
  if (hours <= 0) return null;
  return { hours, updatedAt: Number(raw.updatedAt) || 0 };
}

function mergeDreamLww(cloudRaw, localRaw) {
  const co =
    cloudRaw && cloudRaw.days && typeof cloudRaw.days === "object" ? cloudRaw.days : {};
  const lo =
    localRaw && localRaw.days && typeof localRaw.days === "object" ? localRaw.days : {};
  const keys = new Set([...Object.keys(co), ...Object.keys(lo)]);
  const days = {};
  for (const k of keys) {
    const c = normalizeDay(co[k]);
    const l = normalizeDay(lo[k]);
    if (!c && !l) continue;
    if (!c) {
      days[k] = { hours: l.hours, updatedAt: l.updatedAt };
      continue;
    }
    if (!l) {
      days[k] = { hours: c.hours, updatedAt: c.updatedAt };
      continue;
    }
    if (l.updatedAt > c.updatedAt) days[k] = { hours: l.hours, updatedAt: l.updatedAt };
    else if (c.updatedAt > l.updatedAt) days[k] = { hours: c.hours, updatedAt: c.updatedAt };
    else days[k] = { hours: Math.max(c.hours, l.hours), updatedAt: Math.max(c.updatedAt, l.updatedAt) };
  }
  return { days };
}

function mergeDreamMax(a, b) {
  const ad = (a && a.days) || {};
  const bd = (b && b.days) || {};
  const keys = new Set([...Object.keys(ad), ...Object.keys(bd)]);
  const days = {};
  for (const k of keys) {
    const l = normalizeDay(ad[k]);
    const r = normalizeDay(bd[k]);
    if (!l && !r) continue;
    if (!l) {
      days[k] = { hours: r.hours, updatedAt: r.updatedAt };
      continue;
    }
    if (!r) {
      days[k] = { hours: l.hours, updatedAt: l.updatedAt };
      continue;
    }
    const hours = Math.max(l.hours, r.hours);
    days[k] = { hours, updatedAt: Math.max(l.updatedAt || 0, r.updatedAt || 0) };
  }
  return { days };
}

/** Device A：模拟 +1 flush（含 80ms 防抖 + forge RMW + meta bump+verify） */
async function deviceAIncrement(nextHours, traffic) {
  const tClick = Date.now();
  await sleep(FLUSH_DEBOUNCE_MS);

  const getForge = await getDoc(FORGE_DOC);
  traffic.gets += 1;
  traffic.getBytes += getForge.bytes;
  traffic.uploadWaitMs += getForge.ms;
  let env = getForge.missing || !getForge.payload ? emptyForgeEnv() : Object.assign(emptyForgeEnv(), getForge.payload);
  if (!env.settings || typeof env.settings !== "object") env.settings = {};

  const localDream = {
    days: { [DAY]: { hours: nextHours, updatedAt: tClick } }
  };
  const mergedDream = mergeDreamLww(env.settings.blockDreamHours, localDream);
  env.settings = Object.assign({}, env.settings, {
    updatedAt: Date.now(),
    blockDreamHours: mergedDream
  });
  env.envelopeUpdatedAt = Date.now();
  env.roomId = ROOM;

  const putForge = await putDoc(FORGE_DOC, env);
  traffic.posts += 1;
  traffic.postBytes += putForge.bytes;
  traffic.uploadWaitMs += putForge.ms;
  if (!putForge.ok) throw new Error("forge POST failed: " + putForge.error);

  /* meta bump：GET → WRITE → VERIFY（对齐生产 aliyunDomainsMetaBumpDomain） */
  let writeV = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const fresh = await getDoc(META_DOC);
    traffic.gets += 1;
    traffic.getBytes += fresh.bytes;
    traffic.uploadWaitMs += fresh.ms;
    const versions = emptyMetaVersions();
    if (fresh.ok && !fresh.missing && fresh.payload && fresh.payload.versions) {
      Object.assign(versions, fresh.payload.versions);
    }
    writeV = (Number(versions.forge) || 0) + 1;
    versions.forge = writeV;
    const payload = {
      kind: "domains-meta-v1",
      roomId: ROOM,
      versions,
      at: Date.now()
    };
    const wr = await putDoc(META_DOC, payload);
    traffic.posts += 1;
    traffic.postBytes += wr.bytes;
    traffic.uploadWaitMs += wr.ms;
    if (!wr.ok) continue;
    /* 对齐生产：WRITE 成功即返回；verify 不阻塞热路径 */
    break;
  }

  return { tClick, hours: nextHours, forgeVersion: writeV };
}

/** Device B：对齐 2.5s poll，随机相位；发现 forge 版本变化后拉正文 */
async function deviceBWaitForHours(targetHours, lastSeenForgeV, traffic, deadlineMs) {
  const phase = Math.floor(Math.random() * POLL_MS);
  await sleep(phase);
  let seenV = lastSeenForgeV;
  while (Date.now() < deadlineMs) {
    const meta = await getDoc(META_DOC);
    traffic.gets += 1;
    traffic.getBytes += meta.bytes;
    traffic.pollMetaBytes += meta.bytes;
    const v =
      meta.ok && !meta.missing && meta.payload && meta.payload.versions
        ? Number(meta.payload.versions.forge) || 0
        : 0;
    if (v > seenV) {
      seenV = v;
      const forge = await getDoc(FORGE_DOC);
      traffic.gets += 1;
      traffic.getBytes += forge.bytes;
      traffic.bodyBytes += forge.bytes;
      const hours = dayHours(forge.payload && forge.payload.settings);
      if (hours >= targetHours) {
        return { ok: true, hours, forgeVersion: seenV, tSeen: Date.now() };
      }
    }
    const remain = deadlineMs - Date.now();
    if (remain <= 0) break;
    await sleep(Math.min(POLL_MS, remain));
  }
  return { ok: false, hours: null, forgeVersion: seenV, tSeen: Date.now() };
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(samples) {
  const sorted = samples.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    avg: Math.round(sum / sorted.length),
    p50: pct(sorted, 50),
    p95: pct(sorted, 95),
    max: sorted[sorted.length - 1],
    min: sorted[0],
    samples: sorted
  };
}

async function seedBaseline() {
  const env = emptyForgeEnv();
  env.settings = {
    updatedAt: Date.now(),
    blockDreamHours: { days: { [DAY]: { hours: 1, updatedAt: Date.now() } } }
  };
  await putDoc(FORGE_DOC, env);
  const versions = emptyMetaVersions();
  versions.forge = 1;
  await putDoc(META_DOC, {
    kind: "domains-meta-v1",
    roomId: ROOM,
    versions,
    at: Date.now()
  });
  return { hours: 1, forgeV: 1 };
}

async function runLatencyTrials() {
  const traffic = {
    gets: 0,
    posts: 0,
    getBytes: 0,
    postBytes: 0,
    pollMetaBytes: 0,
    bodyBytes: 0,
    uploadWaitMs: 0
  };
  const base = await seedBaseline();
  let hours = base.hours;
  let forgeV = base.forgeV;
  const latencies = [];
  const failures = [];

  for (let i = 0; i < TRIALS; i++) {
    hours += 1;
    const aP = deviceAIncrement(hours, traffic);
    const bP = deviceBWaitForHours(hours, forgeV, traffic, Date.now() + 15000);
    const [a, b] = await Promise.all([aP, bP]);
    forgeV = Math.max(forgeV, a.forgeVersion, b.forgeVersion || 0);
    if (!b.ok) {
      failures.push({ trial: i + 1, target: hours });
      continue;
    }
    const ms = b.tSeen - a.tClick;
    latencies.push(ms);
    console.log(
      JSON.stringify({
        trial: i + 1,
        targetHours: hours,
        latencyMs: ms,
        forgeVersion: b.forgeVersion
      })
    );
    /* 试验间隔：避免 meta 版本粘连与相位相关 */
    await sleep(200);
  }
  return { latencies, failures, traffic, finalHours: hours };
}

async function runCorrectness() {
  const out = { continuous: null, concurrent: null, reset: null };

  /* 连续点击：本机快速 +3，单次 flush 后云端应为最终值 */
  {
    const start = 20;
    const env0 = emptyForgeEnv();
    env0.settings = {
      updatedAt: Date.now(),
      blockDreamHours: { days: { [DAY]: { hours: start, updatedAt: Date.now() } } }
    };
    await putDoc(FORGE_DOC, env0);
    const traffic = { gets: 0, posts: 0, getBytes: 0, postBytes: 0, pollMetaBytes: 0, bodyBytes: 0, uploadWaitMs: 0 };
    /* 模拟连点只 flush 最终值 */
    await deviceAIncrement(start + 3, traffic);
    const got = await getDoc(FORGE_DOC);
    const h = dayHours(got.payload && got.payload.settings);
    out.continuous = { ok: h === start + 3, expected: start + 3, actual: h };
  }

  /* 跨设备同时 +1：两边从同一基数各 +1；LWW/max 最终应 ≥ base+1，且不丢到低于 max 单侧 */
  {
    const baseH = 30;
    const t0 = Date.now();
    const env0 = emptyForgeEnv();
    env0.settings = {
      updatedAt: t0,
      blockDreamHours: { days: { [DAY]: { hours: baseH, updatedAt: t0 } } }
    };
    await putDoc(FORGE_DOC, env0);
    const trafficA = { gets: 0, posts: 0, getBytes: 0, postBytes: 0, pollMetaBytes: 0, bodyBytes: 0, uploadWaitMs: 0 };
    const trafficB = { gets: 0, posts: 0, getBytes: 0, postBytes: 0, pollMetaBytes: 0, bodyBytes: 0, uploadWaitMs: 0 };
    await Promise.all([
      deviceAIncrement(baseH + 1, trafficA),
      (async () => {
        await sleep(30);
        return deviceAIncrement(baseH + 1, trafficB);
      })()
    ]);
    const got = await getDoc(FORGE_DOC);
    const h = dayHours(got.payload && got.payload.settings);
    /* 并发同值 +1：最终至少 base+1；理想不可达 base+2（无 CRDT 计数） */
    out.concurrent = {
      ok: h >= baseH + 1,
      expectedMin: baseH + 1,
      actual: h,
      note: "按日 LWW/max：两端同时从同一基数 +1 时最终常为 base+1（不丢到更低）；不保证累加成 base+2"
    };
  }

  /* 重置/下调：显式更戳应能写入更低值（信封 LWW） */
  {
    const env0 = emptyForgeEnv();
    const tHigh = Date.now();
    env0.settings = {
      updatedAt: tHigh,
      blockDreamHours: { days: { [DAY]: { hours: 8, updatedAt: tHigh } } }
    };
    await putDoc(FORGE_DOC, env0);
    const traffic = { gets: 0, posts: 0, getBytes: 0, postBytes: 0, pollMetaBytes: 0, bodyBytes: 0, uploadWaitMs: 0 };
    await sleep(5);
    await deviceAIncrement(2, traffic); /* 复用 flush，hours=2 作为显式下调 */
    const got = await getDoc(FORGE_DOC);
    const h = dayHours(got.payload && got.payload.settings);
    out.reset = {
      ok: h === 2,
      expected: 2,
      actual: h,
      note: "长按调整下调依赖日戳 LWW；跨设备若对端仍持更高本地值，拉取 max 可能抬回（产品既有语义）"
    };
  }

  return out;
}

function estimatePollCost() {
  /* 闲置可见页：仅 domains meta GET；正文 gate 跳过 */
  const metaKB = 0.4; /* 文档量级参考 */
  const devices = 2;
  const hoursVisiblePerDay = 8;
  function dailyMetaGets(pollMs) {
    return devices * hoursVisiblePerDay * 3600 * (1000 / pollMs);
  }
  const before = dailyMetaGets(5000);
  const after = dailyMetaGets(2500);
  const extraGets = after - before;
  const extraMBMonth = (extraGets * metaKB * 30) / 1024;
  const cdtYuanPerGB = 0.8;
  const extraYuanMonth = (extraMBMonth / 1024) * cdtYuanPerGB;
  return {
    pollBeforeMs: 5000,
    pollAfterMs: 2500,
    devices,
    hoursVisiblePerDay,
    metaKBPerGet: metaKB,
    dailyMetaGetsBefore: Math.round(before),
    dailyMetaGetsAfter: Math.round(after),
    extraDailyGets: Math.round(extraGets),
    extraMBPerMonth: Math.round(extraMBMonth * 10) / 10,
    extraCdtYuanPerMonthApprox: Math.round(extraYuanMonth * 1000) / 1000,
    note: "仅计闲置 meta GET；正文仍 Phase1b 未变不下。CDT≈¥0.80/GB 粗算，未计免费额度。"
  };
}

const health = await fetchJson("GET", BASE + "/health", null);
assert.equal(health.status, 200, "FC /health must be 200");
console.log("[bench] health ok otsEndpointType=", health.data && health.data.otsEndpointType);

const correctness = await runCorrectness();
console.log("[bench] correctness", JSON.stringify(correctness, null, 2));
assert.ok(correctness.continuous.ok, "continuous click final value");
assert.ok(correctness.concurrent.ok, "concurrent click floor");
assert.ok(correctness.reset.ok, "explicit reset/decrease via day LWW");

const { latencies, failures, traffic, finalHours } = await runLatencyTrials();
assert.ok(latencies.length >= 10, "need >=10 successful latency samples, got " + latencies.length);
const stats = summarize(latencies);
const cost = estimatePollCost();

const report = {
  room: ROOM,
  pollMs: POLL_MS,
  flushDebounceMs: FLUSH_DEBOUNCE_MS,
  trialsRequested: TRIALS,
  successes: latencies.length,
  failures,
  latencyMs: stats,
  finalHours,
  traffic,
  costImpact25sPoll: cost,
  correctness,
  measuredAt: new Date().toISOString()
};

console.log("\n=== BENCH REPORT ===");
console.log(JSON.stringify(report, null, 2));
console.log(
  `\nSUMMARY latencyMs avg=${stats.avg} p95=${stats.p95} max=${stats.max} n=${stats.n}`
);
