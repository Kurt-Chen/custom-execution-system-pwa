/**
 * 今天死磕为空但其他任务非空时，仍强制拉 lists（closed-today-catchup）。
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
assert.match(badge[1], /v20261126d$/);

assert.match(html, /function isAliyunSyncPrimaryClosedTodayEmpty\s*\(/);
assert.match(html, /function aliyunSyncPrimaryArmClosedTodayCatchup\s*\(/);
assert.match(html, /function aliyunSyncPrimaryForceRepullTodayPlanDomains\s*\(/);
assert.match(html, /closed-today-catchup/);
assert.match(html, /force lists body \(closed-today-catchup/);
assert.match(html, /skipAll overridden by closed-today-catchup/);
assert.match(html, /bootHealthForceTodayPlanBtn/);
assert.match(html, /强制重拉今日计划三域/);
assert.match(html, /window\.__aliyunSyncPrimaryForceRepullTodayPlanDomains/);

/* 强制重拉不得改房间 / 清 IDB / POST */
const forceStart = html.indexOf("function aliyunSyncPrimaryForceRepullTodayPlanDomains");
const forceEnd = html.indexOf(
  "/** 拉完后若今日面仍空：强制重绘今天死磕/其他任务/Done",
  forceStart
);
assert.ok(forceStart > 0 && forceEnd > forceStart);
const forceBody = html.slice(forceStart, forceEnd);
assert.doesNotMatch(forceBody, /localStorage\.setItem\(CLOUD_SYNC_ROOM_KEY/);
assert.doesNotMatch(forceBody, /indexedDB\.deleteDatabase|clear\(\)/);
assert.doesNotMatch(forceBody, /aliyunExpFetchJson\(\s*"POST"/);

console.log("ok: closed-today lists catchup");
