/**
 * 其他任务（sprint/todayPlan）与 lists 修复配额分离。
 * 运行：node _test_other_tasks_repair_split.mjs
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

assert.match(html, /aliyunSyncPrimaryListsRepairLeft/);
assert.match(html, /aliyunSyncPrimaryOtherTasksRepairLeft/);
assert.match(html, /function aliyunSyncPrimaryClearListsRepairOnly\s*\(/);
assert.match(html, /function aliyunSyncPrimaryClearOtherTasksRepairOnly\s*\(/);
assert.match(html, /function aliyunSyncPrimaryShouldDeferOtherTasksFlushForRepair\s*\(/);
assert.match(html, /quota-exhausted-other/);
assert.match(html, /quota-exhausted-lists/);
assert.match(html, /skippedMissing-other-tasks/);
assert.match(html, /defer upsert flush: other-tasks repair/);
assert.doesNotMatch(html, /aliyunSyncPrimaryTodayPlanDomainRepairLeft/);

/* lists 内容缺口逻辑仍在；本文件不改其探测函数签名 */
assert.match(html, /function aliyunListsRealProbeUnchangedContentGap\s*\(/);
assert.match(html, /function aliyunSprintRealProbeUnchangedContentGap\s*\(/);

const start = html.indexOf("function aliyunSyncPrimaryClearTodayPlanDomainRepair");
const end = html.indexOf("function aliyunSyncPrimaryForceRepullTodayPlanDomains");
assert.ok(start > 0 && end > start);
const chunk = html.slice(
  html.indexOf("function aliyunSyncPrimaryTodayPlanRepairHasPending"),
  end
);

const stub = `
let aliyunSyncPrimaryTodayPlanDomainRepairScheduled = false;
let aliyunSyncPrimaryTodayPlanDomainRepairIds = Object.create(null);
let aliyunSyncPrimaryListsRepairLeft = 0;
let aliyunSyncPrimaryOtherTasksRepairLeft = 0;
function noteBootHealth() {}
function scheduleAliyunSyncPrimaryNearRealtimePull() {}
function runAliyunSyncPrimaryNearRealtimePull() { return Promise.resolve({}); }
${chunk}
aliyunSyncPrimaryArmTodayPlanDomainRepair(["lists", "sprint", "todayPlan"], "t");
aliyunSyncPrimaryNoteTodayPlanDomainRepaired("lists");
const afterLists = {
  hasLists: !!aliyunSyncPrimaryTodayPlanDomainRepairIds.lists,
  hasSprint: !!aliyunSyncPrimaryTodayPlanDomainRepairIds.sprint,
  hasToday: !!aliyunSyncPrimaryTodayPlanDomainRepairIds.todayPlan,
  listsLeft: aliyunSyncPrimaryListsRepairLeft,
  otherLeft: aliyunSyncPrimaryOtherTasksRepairLeft
};
aliyunSyncPrimaryClearListsRepairOnly("test");
const afterClearLists = {
  hasSprint: !!aliyunSyncPrimaryTodayPlanDomainRepairIds.sprint,
  otherLeft: aliyunSyncPrimaryOtherTasksRepairLeft
};
const deferSp = aliyunSyncPrimaryShouldDeferOtherTasksFlushForRepair("sprint");
const deferLi = aliyunSyncPrimaryShouldDeferOtherTasksFlushForRepair("lists");
console.log(JSON.stringify({ afterLists, afterClearLists, deferSp, deferLi }));
`;

const tmp = path.join(ROOT, "_tmp_other_tasks_repair.mjs");
writeFileSync(tmp, stub);
const run = spawnSync(process.execPath, [tmp], { encoding: "utf8" });
unlinkSync(tmp);
assert.equal(run.status, 0, run.stderr || run.stdout);
const out = JSON.parse(run.stdout.trim());
assert.equal(out.afterLists.hasLists, false);
assert.equal(out.afterLists.hasSprint, true);
assert.equal(out.afterLists.hasToday, true);
assert.ok(out.afterLists.otherLeft > 0);
assert.equal(out.afterClearLists.hasSprint, true);
assert.equal(out.deferSp, true);
assert.equal(out.deferLi, false);

console.log("ok: other-tasks repair split");
