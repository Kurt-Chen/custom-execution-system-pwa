/**
 * Phase 1b · 仿真：meta 未变零正文 / 单域变化只拉一域
 * Run: node _test_aliyun_domains_meta_sim.mjs
 */
import assert from "assert";

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

function emptyVersions() {
  const v = Object.create(null);
  for (const id of DOMAIN_IDS) v[id] = 0;
  return v;
}

/** 最小编排器，镜像 Phase 1b 决定逻辑 */
function simulateRound({ reason, lastSeen, remoteVersions, bootDone, safetyAt, now }) {
  const forceAll =
    reason === "boot" || reason === "manual-full" || reason === "gate-off";
  if (forceAll) {
    return {
      metaKB: 0.3,
      pullIds: DOMAIN_IDS.slice(),
      skipIds: [],
      bodyDownloadKB: DOMAIN_IDS.length * 40,
      skippedFullPull: false
    };
  }
  const needBoot = !bootDone || reason === "boot";
  const needSafety = !needBoot && (!safetyAt || now - safetyAt >= 12 * 60 * 1000);
  if (needBoot || needSafety) {
    return {
      metaKB: 0.3,
      pullIds: DOMAIN_IDS.slice(),
      skipIds: [],
      bodyDownloadKB: DOMAIN_IDS.length * 40,
      skippedFullPull: false,
      reason: needBoot ? "boot" : "safety-full"
    };
  }
  const pullIds = [];
  const skipIds = [];
  for (const id of DOMAIN_IDS) {
    const remoteV = Number(remoteVersions[id]);
    const localV = lastSeen[id];
    if (localV == null || !Number.isFinite(Number(localV))) pullIds.push(id);
    else if (!Number.isFinite(remoteV) || Number(remoteV) !== Number(localV)) pullIds.push(id);
    else skipIds.push(id);
  }
  if (!pullIds.length) {
    return {
      metaKB: 0.3,
      pullIds: [],
      skipIds,
      bodyDownloadKB: 0,
      skippedFullPull: true,
      savedEstimatedKB: skipIds.length * 40
    };
  }
  return {
    metaKB: 0.3,
    pullIds,
    skipIds,
    bodyDownloadKB: pullIds.length * 40,
    skippedFullPull: false,
    savedEstimatedKB: skipIds.length * 40
  };
}

/* 场景 A：云端无变化，连续多轮 */
{
  const lastSeen = emptyVersions();
  for (const id of DOMAIN_IDS) lastSeen[id] = 1;
  const remote = Object.assign(emptyVersions(), lastSeen);
  let bodyTotal = 0;
  let metaRounds = 0;
  for (let i = 0; i < 24; i++) {
    const r = simulateRound({
      reason: "poll",
      lastSeen,
      remoteVersions: remote,
      bootDone: true,
      safetyAt: Date.now(),
      now: Date.now()
    });
    metaRounds += 1;
    bodyTotal += r.bodyDownloadKB;
    assert.strictEqual(r.skippedFullPull, true);
    assert.strictEqual(r.pullIds.length, 0);
  }
  assert.strictEqual(bodyTotal, 0);
  assert.strictEqual(metaRounds, 24);
  console.log("A ok: 24 polls, bodyDownloadKB=0, meta-only");
}

/* 场景 B：仅 Done version+1 */
{
  const lastSeen = emptyVersions();
  for (const id of DOMAIN_IDS) lastSeen[id] = 5;
  const remote = Object.assign(emptyVersions(), lastSeen);
  remote.done = 6;
  const r = simulateRound({
    reason: "poll",
    lastSeen,
    remoteVersions: remote,
    bootDone: true,
    safetyAt: Date.now(),
    now: Date.now()
  });
  assert.deepStrictEqual(r.pullIds, ["done"]);
  assert.strictEqual(r.skipIds.length, 9);
  assert.strictEqual(r.bodyDownloadKB, 40);
  assert.ok(r.savedEstimatedKB >= 360);
  console.log("B ok: only done body downloaded");
}

/* 场景 C：inflight 去重（逻辑断言：同时只能有一轮） */
{
  let inFlight = false;
  function tryPull() {
    if (inFlight) return { skipped: true, reason: "in-flight" };
    inFlight = true;
    return { skipped: false };
  }
  const a = tryPull();
  const b = tryPull();
  assert.strictEqual(a.skipped, false);
  assert.strictEqual(b.skipped, true);
  inFlight = false;
  const c = tryPull();
  assert.strictEqual(c.skipped, false);
  console.log("C ok: inflight dedupe");
}

/* 场景 D：长时间无操作 = A 的延伸 */
{
  const lastSeen = emptyVersions();
  for (const id of DOMAIN_IDS) lastSeen[id] = 2;
  const remote = Object.assign(emptyVersions(), lastSeen);
  let body = 0;
  for (let i = 0; i < 120; i++) {
    const r = simulateRound({
      reason: "poll",
      lastSeen,
      remoteVersions: remote,
      bootDone: true,
      safetyAt: Date.now(),
      now: Date.now()
    });
    body += r.bodyDownloadKB;
  }
  assert.strictEqual(body, 0);
  console.log("D ok: 120 quiet polls still zero body");
}

console.log("ok: domains meta sim scenarios A–D passed");
