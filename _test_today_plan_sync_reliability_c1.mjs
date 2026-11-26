/**
 * 今日计划跨设备同步可靠性（C1 域级 flush-busy + 队列/重试安全）静态契约。
 * 运行：node _test_today_plan_sync_reliability_c1.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

const badge = html.match(/APP_CACHE_NAME_FOR_BADGE\s*=\s*"([^"]+)"/);
const swCache = sw.match(/CACHE_NAME\s*=\s*"([^"]+)"/);
assert.ok(badge && swCache, "cache markers");
assert.equal(badge[1], swCache[1], "html badge must match sw CACHE_NAME");
assert.match(badge[1], /^exec-system-pwa-v/);

assert.doesNotMatch(
  html,
  /if \(aliyunSyncPrimaryAnyDomainFlushBusy\(\)\) \{\s*return await runAliyunSyncPrimaryReadonlyPullDuringFlushBusy/
);
assert.match(html, /skipDomainsBlockedByLocalFlush:\s*skipFlushBlock/);
assert.match(html, /function aliyunSyncPrimaryDomainActivelyFlushing/);
assert.match(html, /function aliyunSyncPrimaryDomainsBlockedByLocalFlush/);
assert.match(html, /function aliyunSyncPrimaryDomainFlushBusy/);
assert.match(html, /reason:\s*"local-flush-busy"/);

const flushTp = html.slice(
  html.indexOf("async function flushAliyunTodayPlanRealQueue"),
  html.indexOf("async function flushAliyunTodayPlanRealQueue") + 1100
);
assert.match(flushTp, /if \(aliyunTodayPlanRealSuppressPush\) return;/);
assert.doesNotMatch(
  flushTp,
  /isAliyunTodayPlanRealSyncEnabled\(\) \|\| aliyunTodayPlanRealSuppressPush/
);
assert.match(html, /suppress 期间保留的队列：合并结束后立刻冲刷/);

assert.match(html, /ALIYUN_SPRINT_REAL_FLUSH_MAX_AUTO_RETRIES = 8/);
assert.match(html, /flush fail requeue paused:[\s\S]*await next local sprint schedule/);

assert.match(html, /ALIYUN_SYNC_PRIMARY_POLL_MS = 2500/);
assert.match(html, /isAliyunSyncPrimaryUploadGateOpen/);
assert.match(html, /aliyunSyncPrimaryArmTodayPlanMissingCatchup/);

function domainsBlockedByLocalFlush(busySet) {
  const blocked = Object.create(null);
  const ids = [
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
  for (const id of ids) {
    if (busySet.has(id)) blocked[id] = true;
  }
  if (blocked.sprint || blocked.todayPlan) {
    blocked.sprint = true;
    blocked.todayPlan = true;
  }
  return blocked;
}

function keys(obj) {
  return Object.keys(obj).sort();
}

assert.deepEqual(keys(domainsBlockedByLocalFlush(new Set(["forge"]))), ["forge"]);
assert.deepEqual(keys(domainsBlockedByLocalFlush(new Set(["done", "habit"]))), [
  "done",
  "habit"
]);
assert.deepEqual(keys(domainsBlockedByLocalFlush(new Set(["sprint"]))), [
  "sprint",
  "todayPlan"
]);
assert.deepEqual(keys(domainsBlockedByLocalFlush(new Set(["todayPlan"]))), [
  "sprint",
  "todayPlan"
]);
assert.deepEqual(keys(domainsBlockedByLocalFlush(new Set(["lists"]))), ["lists"]);
const forgeBusy = domainsBlockedByLocalFlush(new Set(["forge", "anniv"]));
assert.equal(!!forgeBusy.todayPlan, false);
assert.equal(!!forgeBusy.sprint, false);

/* 沙箱执行 DomainFlushBusy 函数体（注入假状态） */
const fnStart = html.indexOf("function aliyunSyncPrimaryDomainFlushBusy(domainId)");
const fnEnd = html.indexOf("function aliyunSyncPrimaryAnyDomainFlushBusy()", fnStart);
const blockedStart = html.indexOf(
  "function aliyunSyncPrimaryDomainsBlockedByLocalFlush()",
  fnStart
);
const blockedEnd = html.indexOf("try {", blockedStart);
const idsConstStart = html.indexOf("const ALIYUN_SYNC_PRIMARY_DOMAIN_IDS_FOR_FLUSH");
const idsConstEnd = html.indexOf("];", idsConstStart) + 2;
assert.ok(fnStart > 0 && fnEnd > fnStart && blockedStart > 0);

const sandbox = {
  aliyunDoneRealFlushing: false,
  aliyunDoneRealQueue: [],
  aliyunHabitRealFlushing: false,
  aliyunHabitRealQueue: [],
  aliyunForgeRealFlushing: true,
  aliyunForgeRealQueue: [{ x: 1 }],
  aliyunAnnivRealFlushing: false,
  aliyunAnnivRealQueue: [],
  aliyunSprintRealFlushing: false,
  aliyunSprintRealQueue: [],
  aliyunTodayPlanRealFlushing: false,
  aliyunTodayPlanRealQueue: [],
  aliyunAmbRealFlushing: false,
  aliyunAmbRealPendingReason: null,
  aliyunRule100RealFlushing: false,
  aliyunRule100RealPendingReason: null,
  aliyunListsRealFlushing: false,
  aliyunListsRealPendingReason: null,
  aliyunGoalsRealFlushing: false,
  aliyunGoalsRealPendingReason: null
};
const code =
  html.slice(idsConstStart, idsConstEnd) +
  "\n" +
  html.slice(fnStart, fnEnd) +
  "\n" +
  html.slice(fnEnd, blockedStart) +
  "\n" +
  html.slice(blockedStart, blockedEnd) +
  "\n" +
  "var __blocked = aliyunSyncPrimaryDomainsBlockedByLocalFlush();\n" +
  "var __any = aliyunSyncPrimaryAnyDomainFlushBusy();\n" +
  "var __forge = aliyunSyncPrimaryDomainFlushBusy('forge');\n" +
  "var __tp = aliyunSyncPrimaryDomainFlushBusy('todayPlan');\n";
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
assert.equal(sandbox.__any, true);
assert.equal(sandbox.__forge, true);
assert.equal(sandbox.__tp, false);
assert.equal(!!sandbox.__blocked.forge, true);
assert.equal(!!sandbox.__blocked.todayPlan, false);
assert.equal(!!sandbox.__blocked.sprint, false);

console.log("OK _test_today_plan_sync_reliability_c1.mjs");
