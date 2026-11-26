/**
 * 今日计划三域：按 meta/内容缺口独立对齐（非「分组为空」补丁）。
 * 运行：node _test_closed_today_lists_catchup.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

const badge = html.match(/APP_CACHE_NAME_FOR_BADGE\s*=\s*"([^"]+)"/);
const swCache = sw.match(/CACHE_NAME\s*=\s*"([^"]+)"/);
assert.equal(badge[1], swCache[1]);
assert.match(badge[1], /v20261126h$/);

/* 不得再按「今天死磕为空」武装循环 */
assert.doesNotMatch(html, /closed-today-catchup/);
assert.doesNotMatch(html, /forceClosedTodayLists/);
assert.doesNotMatch(html, /isAliyunSyncPrimaryClosedTodayEmpty/);

/* 域修复 + 并集拉正文 */
assert.match(html, /function aliyunSyncPrimaryUnionPullIdsOntoGate\s*\(/);
assert.match(html, /function aliyunSyncPrimaryArmTodayPlanDomainRepair\s*\(/);
assert.match(html, /function aliyunSyncPrimaryClearTodayPlanDomainRepair\s*\(/);
assert.match(html, /today-plan-domain-repair/);
assert.match(html, /quota-exhausted/);

/* 内容缺口探测（正文/完成态/归属日/时段/修订） */
assert.match(html, /function aliyunListsRealProbeUnchangedContentGap\s*\(/);
assert.match(html, /function aliyunListsRealClosedItemContentDiverges\s*\(/);
assert.match(html, /function aliyunSprintRealProbeUnchangedContentGap\s*\(/);
assert.match(html, /function aliyunTodayPlanRealProbeUnchangedContentGap\s*\(/);
assert.match(html, /contentStale/);
assert.match(html, /localTombBlocksRemote/);

/* visible 不得因今日空打满全文；boot/manual/retry 仍可 */
assert.match(
  html,
  /forceTodaySurface[\s\S]*?pullReason === "boot"[\s\S]*?manual-full[\s\S]*?today-surface-retry/
);
const forceBlock = html.slice(
  html.indexOf("const forceTodaySurface ="),
  html.indexOf("const forceAllBodies =")
);
assert.doesNotMatch(forceBlock, /pullReason === "visible"/);

/* 诊断强制重拉：清 lastSeen，不 POST / 不改房间 */
assert.match(html, /function aliyunSyncPrimaryForceRepullTodayPlanDomains\s*\(/);
assert.match(html, /bootHealthForceTodayPlanBtn/);
const forceStart = html.indexOf("function aliyunSyncPrimaryForceRepullTodayPlanDomains");
const forceEnd = html.indexOf("function aliyunSyncPrimaryPaintTodaySurfaceAfterPull", forceStart);
assert.ok(forceStart > 0 && forceEnd > forceStart);
const forceBody = html.slice(forceStart, forceEnd);
assert.doesNotMatch(forceBody, /localStorage\.setItem\(CLOUD_SYNC_ROOM_KEY/);
assert.doesNotMatch(forceBody, /indexedDB\.deleteDatabase/);
assert.doesNotMatch(forceBody, /aliyunExpFetchJson\(\s*"POST"/);

/* 同步中死锁：watchdog 可强制 settle */
assert.match(html, /badge-watchdog-force-settle/);

/* 单元：内容缺口与 tomb 防复活 */
const listsFnStart = html.indexOf("function aliyunListsRealClosedItemContentDiverges");
const listsFnEnd = html.indexOf("function aliyunListsRealProbeUnchangedContentGap", listsFnStart);
const probeStart = html.indexOf("function aliyunListsRealProbeUnchangedContentGap");
const probeEnd = html.indexOf("function aliyunSprintRealProbeUnchangedContentGap", probeStart);
assert.ok(listsFnStart > 0 && probeEnd > probeStart);

const stub = `
globalThis.state = {
  closedList: [
    { id: "a", text: "旧文案", completed: false, updatedAt: 100, createdAt: 100 },
    { id: "tomb-local", text: "已删本机", updatedAt: 50, createdAt: 50 }
  ],
  memo: [],
  hatersDoubtersLog: [],
  trash: [],
  syncTombstones: { "tomb-local": 500, "cloud-only-deleted": 900 },
  weeklyPlan: {}
};
function getClosedListItemAssignmentDateKey(item) {
  if (!item) return null;
  if (item.assignDay) return item.assignDay;
  return null;
}
${html.slice(listsFnStart, probeEnd)}
const d1 = aliyunListsRealClosedItemContentDiverges(
  { id: "a", text: "旧文案", completed: false, updatedAt: 100 },
  { id: "a", text: "新文案", completed: false, updatedAt: 200 }
);
const d2 = aliyunListsRealClosedItemContentDiverges(
  { id: "a", text: "同", completed: true, updatedAt: 300, assignDay: "2026-11-26" },
  { id: "a", text: "同", completed: false, updatedAt: 200, assignDay: "2026-11-26" }
);
const gap = aliyunListsRealProbeUnchangedContentGap({
  closedList: [
    { id: "a", text: "新文案", completed: false, updatedAt: 200, createdAt: 100 },
    { id: "b", text: "云端新", completed: false, updatedAt: 300, createdAt: 300 },
    { id: "tomb-local", text: "云端仍有", updatedAt: 100, createdAt: 50 },
    { id: "cloud-only-deleted", text: "应被本机 tomb 挡住", updatedAt: 100, createdAt: 100 }
  ],
  memo: [],
  hatersDoubtersLog: [],
  trash: [],
  tombstones: {}
});
console.log(JSON.stringify({ d1, d2SameDone: d2, gap }));
`;
import { writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
const tmp = path.join(ROOT, "_tmp_content_gap_probe.mjs");
writeFileSync(tmp, stub);
const run = spawnSync(process.execPath, [tmp], { encoding: "utf8" });
unlinkSync(tmp);
assert.equal(run.status, 0, run.stderr || run.stdout);
const out = JSON.parse(run.stdout.trim());
assert.equal(out.d1, true);
assert.equal(out.d2SameDone, true); // completed 不同
assert.ok(out.gap.contentStale >= 1);
assert.ok(out.gap.localMiss >= 1); // b 缺失
/* tomb-local / cloud-only-deleted 不得计为 localMiss（防复活） */
assert.ok(out.gap.localMiss === 1, "localMiss should be only b, got " + out.gap.localMiss);

console.log("ok: today-plan domain repair + content gap");
