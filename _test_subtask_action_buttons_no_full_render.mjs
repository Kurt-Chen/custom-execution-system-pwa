/**
 * 静态验收：十二周年 / 三天冲刺子任务区「归入 / ···」不得 full render 打断操作。
 * 运行：node _test_subtask_action_buttons_no_full_render.mjs
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

function sliceFn(name, nextNames) {
  const start = html.indexOf("function " + name + "(");
  if (start < 0) fail("missing " + name);
  let end = html.length;
  for (let i = 0; i < nextNames.length; i++) {
    const n = html.indexOf("\n    function " + nextNames[i] + "(", start + 10);
    if (n > start && n < end) end = n;
  }
  return html.slice(start, end);
}

/** 真调用 render(…)，忽略注释里的「full render()」字样 */
function callsRender(body) {
  const withoutComments = String(body || "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
  return /\brender\s*\(/.test(withoutComments);
}

/* —— 缓存版本 —— */
if (!html.includes('APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261015j"')) {
  fail("index.html cache badge not v20261015j");
}
if (!sw.includes('CACHE_NAME = "exec-system-pwa-v20261015j"')) {
  fail("sw.js CACHE_NAME not v20261015j");
}
ok("缓存版本 v20261015j");

/* —— busy 守卫含归入/操作菜单 —— */
const busy = sliceFn("isAppUiTransientChromeOpen", [
  "isAppUiBusyForBackgroundRefresh",
  "scheduleRenderWhenEditingEnds"
]);
if (!busy.includes("isAssignOrTaskOpsMenuOpen")) {
  fail("isAppUiTransientChromeOpen must defer when assign/ops menus open");
}
ok("TransientChrome 覆盖归入/··· 浮层");

const assignBusy = sliceFn("isAssignOrTaskOpsMenuOpen", ["isAppUiTransientChromeOpen"]);
if (!assignBusy.includes("weekly-plan-assign-menu-panel")) {
  fail("isAssignOrTaskOpsMenuOpen missing assign panel");
}
if (!assignBusy.includes("weekly-plan-task-ops-menu-panel")) {
  fail("isAssignOrTaskOpsMenuOpen missing ops panel");
}
ok("isAssignOrTaskOpsMenuOpen 检测双菜单");

/* —— moreBtn 防冒泡 —— */
const wireMore = sliceFn("wireManualItemActionsWrap", ["appendManualDeleteOnlyWrap"]);
if (!wireMore.includes("preventDefault")) {
  fail("wireManualItemActionsWrap must preventDefault");
}
if (!wireMore.includes("pointerdown")) {
  fail("wireManualItemActionsWrap must stop pointerdown");
}
ok("⋯ moreBtn 防默认/冒泡");

/* —— 冲刺：归入 Life/Work 禁止 full render —— */
const moveLane = sliceFn("moveWeeklyPlanTaskToLane", [
  "closeWeeklyPlanAssignMenu",
  "ensureWeeklyPlanAssignMenuDismiss"
]);
if (callsRender(moveLane)) {
  fail("moveWeeklyPlanTaskToLane must not call render()");
}
if (!moveLane.includes("refreshWeeklyPlanListAfterStructureChange")) {
  fail("moveWeeklyPlanTaskToLane must refresh list locally");
}
ok("冲刺归入 Life/Work 局部刷列表");

/* —— 冲刺 / 十二周年：归入封闭清单不切 Tab、不 full render —— */
const paintPromote = sliceFn("paintAfterClosedListPromoteLocal", [
  "promoteWeeklyPlanTaskToClosedList"
]);
if (callsRender(paintPromote)) {
  fail("paintAfterClosedListPromoteLocal must not render()");
}
ok("paintAfterClosedListPromoteLocal 无 full render");

const wpClosed = sliceFn("promoteWeeklyPlanTaskToClosedList", [
  "CLOSED_LIST_ANNIVERSARY_PREFIX",
  "buildAnniversaryClosedListLineText"
]);
if (wpClosed.includes("setWeeklyPlanShell(\"closed\")")) {
  fail("promoteWeeklyPlanTaskToClosedList must stay in place (no shell switch)");
}
if (callsRender(wpClosed)) {
  fail("promoteWeeklyPlanTaskToClosedList must not call render()");
}
if (!wpClosed.includes("paintAfterClosedListPromoteLocal")) {
  fail("promoteWeeklyPlanTaskToClosedList must paint locally");
}
ok("冲刺→封闭清单：留在原位局部更新");

const annClosed = sliceFn("promoteAnniversaryTaskToClosedList", [
  "moduleHasAnniversaryTwAnchor"
]);
if (annClosed.includes("activateKineticTab")) {
  fail("promoteAnniversaryTaskToClosedList must not switch kinetic tab");
}
if (annClosed.includes("setWeeklyPlanShell(\"closed\")")) {
  fail("promoteAnniversaryTaskToClosedList must not switch shell");
}
if (callsRender(annClosed)) {
  fail("promoteAnniversaryTaskToClosedList must not call render()");
}
if (!annClosed.includes("paintAfterClosedListPromoteLocal")) {
  fail("promoteAnniversaryTaskToClosedList must paint locally");
}
ok("十二周年→封闭清单：留在原位局部更新");

/* —— 十二周年归入其他任务不双刷 —— */
const toggleAnn = sliceFn("toggleAnniversaryTaskTodayPlan", [
  "appendAnniversaryManualActionsWrap"
]);
const toggleAnnCode = toggleAnn.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
if (/paintTodayPlanPanel\s*\(/.test(toggleAnnCode)) {
  /* join/leave 内已 paint；toggle 本身不应再 paint */
  fail("toggleAnniversaryTaskTodayPlan should not re-paintTodayPlanPanel (join/leave already did)");
}
if (toggleAnnCode.includes("promoteAnniversaryTaskToClosedList")) {
  fail("toggleAnniversaryTaskTodayPlan must not promote to closed");
}
ok("十二周年归入其他任务：无重复 paint / 不进封闭");

/* —— 周年云合并：忙时推迟重绘 —— */
if (!html.includes("UI 忙，推迟十二周年模块重绘")) {
  fail("anniversary merge paint must defer when UI busy");
}
if (!html.includes("annivUiBusy")) {
  fail("anniversary merge missing annivUiBusy guard");
}
ok("周年同步合并：UI 忙推迟重绘");

/* —— 冲刺空文档/首次加载也走 busy 守卫 —— */
const sprintBusyHits = html.split("refreshWeeklyPlanListAfterStructureChange").length - 1;
if (sprintBusyHits < 3) {
  fail("expected sprint empty/first-load paths to prefer refreshWeeklyPlanListAfterStructureChange");
}
ok("冲刺拉取空/首次路径偏好局部刷新");

console.log("\nAll checks passed.");
