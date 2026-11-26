/**
 * 其他任务：拉取互斥只认正在 Flushing；boot 不因队列非空跳过 sprint/todayPlan。
 * 运行：node _test_other_tasks_boot_pull_not_blocked.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

const badge = html.match(/APP_CACHE_NAME_FOR_BADGE\s*=\s*"([^"]+)"/);
const swCache = sw.match(/CACHE_NAME\s*=\s*"([^"]+)"/);
assert.equal(badge[1], swCache[1]);
assert.match(badge[1], /v20261126i$/);

assert.match(html, /function aliyunSyncPrimaryDomainActivelyFlushing\s*\(/);
assert.match(html, /aliyunSyncPrimaryDomainActivelyFlushing\(id\)/);
assert.match(html, /skipFlushBlock/);
assert.match(html, /other-tasks-incomplete/);
assert.match(html, /gate-open-before-sprint-loaded/);
/* lists 合并逻辑关键字仍在 */
assert.match(html, /function aliyunListsRealProbeUnchangedContentGap\s*\(/);

const fnStart = html.indexOf("function aliyunSyncPrimaryDomainActivelyFlushing");
const fnEnd = html.indexOf("function aliyunSyncPrimaryDomainsBlockedByLocalFlush", fnStart);
const blockStart = fnEnd;
const blockEnd = html.indexOf("try {\n      window.aliyunSyncPrimaryDomainFlushBusy", blockStart);
assert.ok(fnStart > 0 && blockEnd > blockStart);

const stub = `
var aliyunDoneRealFlushing=false, aliyunHabitRealFlushing=false, aliyunForgeRealFlushing=false;
var aliyunAnnivRealFlushing=false, aliyunSprintRealFlushing=false, aliyunTodayPlanRealFlushing=false;
var aliyunAmbRealFlushing=false, aliyunRule100RealFlushing=false, aliyunListsRealFlushing=false, aliyunGoalsRealFlushing=false;
var ALIYUN_SYNC_PRIMARY_DOMAIN_IDS_FOR_FLUSH=["done","habit","forge","anniv","sprint","todayPlan","amb","rule100","lists","goals"];
${html.slice(fnStart, blockEnd)}
var aliyunSprintRealQueue=[{x:1}];
var aliyunTodayPlanRealQueue=[{x:1}];
var blocked = aliyunSyncPrimaryDomainsBlockedByLocalFlush();
console.log(JSON.stringify({
  sprintActive: aliyunSyncPrimaryDomainActivelyFlushing("sprint"),
  todayActive: aliyunSyncPrimaryDomainActivelyFlushing("todayPlan"),
  blockedSprint: !!blocked.sprint,
  blockedToday: !!blocked.todayPlan
}));
aliyunSprintRealFlushing=true;
blocked = aliyunSyncPrimaryDomainsBlockedByLocalFlush();
console.log(JSON.stringify({
  blockedSprintWhenFlushing: !!blocked.sprint,
  blockedTodayWhenFlushing: !!blocked.todayPlan
}));
`;

const tmp = path.join(ROOT, "_tmp_other_tasks_boot.mjs");
writeFileSync(tmp, stub);
const run = spawnSync(process.execPath, [tmp], { encoding: "utf8" });
unlinkSync(tmp);
assert.equal(run.status, 0, run.stderr || run.stdout);
const lines = run.stdout.trim().split("\n");
const a = JSON.parse(lines[0]);
const b = JSON.parse(lines[1]);
assert.equal(a.sprintActive, false);
assert.equal(a.blockedSprint, false);
assert.equal(a.blockedToday, false);
assert.equal(b.blockedSprintWhenFlushing, true);
assert.equal(b.blockedTodayWhenFlushing, true);

console.log("ok: other-tasks boot pull not blocked by queue-only");
