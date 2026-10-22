/**
 * 静态验收：周计划子任务分类入口含「今天死磕」+「其他任务」；
 * micro 封闭清单走 microId mirror；完成态同步不整父完成。
 * 运行：node _test_wp_classify_menu_subtask.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}
function ok(msg) {
  console.log("OK:", msg);
}

if (!html.includes("function appendWeeklyPlanClassifyDropdown(")) {
  fail("missing appendWeeklyPlanClassifyDropdown");
}
ok("appendWeeklyPlanClassifyDropdown 存在");

if (!html.includes("function promoteWeeklyPlanMicroToClosedList(")) {
  fail("missing promoteWeeklyPlanMicroToClosedList");
}
ok("promoteWeeklyPlanMicroToClosedList 存在");

if (!html.includes("function leaveWeeklyPlanClosedListMirror(")) {
  fail("missing leaveWeeklyPlanClosedListMirror");
}
ok("leaveWeeklyPlanClosedListMirror 存在");

/* 子任务行不再挂独立 weekly-plan-today-plan-btn + toggleWeeklyPlanMicroTodayPlan 直点 */
const microLiFn = html.indexOf("function createWeeklyPlanMicroItemLi(");
if (microLiFn < 0) fail("missing createWeeklyPlanMicroItemLi");
const microLiEnd = html.indexOf("\n    function ", microLiFn + 10);
const microBody = html.slice(microLiFn, microLiEnd > 0 ? microLiEnd : microLiFn + 8000);
if (microBody.includes('className = "weekly-plan-today-plan-btn"')) {
  fail("createWeeklyPlanMicroItemLi still has standalone today-plan-btn");
}
if (!microBody.includes("appendWeeklyPlanClassifyDropdown")) {
  fail("createWeeklyPlanMicroItemLi missing classify dropdown");
}
ok("子任务 createWeeklyPlanMicroItemLi 已改为分类入口");

const applyStart = html.indexOf("function applyWeeklyPlanCompletionFromMirror(");
const applyEnd = html.indexOf("\n    function syncAllWeeklyPlanMirrorsForWeek(", applyStart);
const applyBody = html.slice(applyStart, applyEnd);
if (!applyBody.includes("mirrorOf.microId")) {
  fail("applyWeeklyPlanCompletionFromMirror missing microId branch");
}
if (!applyBody.includes("applyWeeklyPlanMainDoneFromMicros")) {
  fail("micro completion must update parent via applyWeeklyPlanMainDoneFromMicros");
}
ok("完成态同步支持 microId，不整父强行全完成");

const syncStart = html.indexOf("function syncAllWeeklyPlanMirrorsForWeek(");
const syncEnd = html.indexOf("\n    function ensureWeeklyPlanWeekRef(", syncStart);
const syncBody = html.slice(syncStart, syncEnd);
if (!syncBody.includes("mo.microId")) {
  fail("syncAllWeeklyPlanMirrorsForWeek missing microId branch");
}
ok("syncAllWeeklyPlanMirrorsForWeek 区分 micro 镜像");

const openMenuStart = html.indexOf("function openWeeklyPlanAssignMenu(");
const openMenuEnd = html.indexOf("\n    function toggleWeeklyPlanAssignMenu(", openMenuStart);
const openMenuBody = html.slice(openMenuStart, openMenuEnd);
if (!openMenuBody.includes('action === "closed"')) {
  fail("Open assign menu missing closed/今天死磕");
}
if (!openMenuBody.includes("promoteWeeklyPlanTaskToClosedList")) {
  fail("Open assign closed not wired to promote");
}
ok("Open 归入菜单含今天死磕");

const annMenuStart = html.indexOf("function openAnniversaryAssignMenu(");
const annMenuEnd = html.indexOf("\n    function toggleAnniversaryAssignMenu(", annMenuStart);
const annMenuBody = html.slice(annMenuStart, annMenuEnd);
if (!annMenuBody.includes("closedOn ? \"\\u2713 今天死磕\"")) {
  fail("anniversary menu missing closed status label");
}
if (!annMenuBody.includes("leaveAnniversaryClosedListExact")) {
  fail("anniversary menu missing exact leave for switch");
}
ok("十二周年菜单显示今天死磕状态并可精确切换");

if (!html.includes('APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261022a"')) {
  fail("index.html cache badge not bumped to v20261022a");
}
if (!sw.includes('CACHE_NAME = "exec-system-pwa-v20261022a"')) {
  fail("sw.js CACHE_NAME not bumped to v20261022a");
}
ok("缓存版本 v20261022a");

console.log("\nAll checks passed.");
