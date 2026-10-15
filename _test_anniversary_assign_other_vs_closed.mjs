/**
 * 静态验收：十二周年「归入」其他任务 vs 封闭清单不得共用封闭清单路径。
 * 运行：node _test_anniversary_assign_other_vs_closed.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function ok(msg) {
  console.log("OK:", msg);
}

const toggleStart = html.indexOf("function toggleAnniversaryTaskTodayPlan(");
if (toggleStart < 0) fail("missing toggleAnniversaryTaskTodayPlan");
const toggleEnd = html.indexOf("\n    function appendAnniversaryManualActionsWrap(", toggleStart);
if (toggleEnd < 0) fail("cannot bound toggleAnniversaryTaskTodayPlan");
const toggleBody = html.slice(toggleStart, toggleEnd);

if (toggleBody.includes("promoteAnniversaryTaskToClosedList")) {
  fail("toggleAnniversaryTaskTodayPlan still calls promoteAnniversaryTaskToClosedList");
}
ok("toggleAnniversaryTaskTodayPlan 不再调用封闭清单 promote");

if (!toggleBody.includes("promoteAnniversaryTaskToOtherTasks")) {
  fail("toggleAnniversaryTaskTodayPlan missing promoteAnniversaryTaskToOtherTasks");
}
if (!toggleBody.includes("leaveAnniversaryTaskOtherTasks")) {
  fail("toggleAnniversaryTaskTodayPlan missing leaveAnniversaryTaskOtherTasks");
}
ok("toggleAnniversaryTaskTodayPlan 走其他任务 join/leave");

const menuStart = html.indexOf("function openAnniversaryAssignMenu(");
if (menuStart < 0) fail("missing openAnniversaryAssignMenu");
const menuEnd = html.indexOf("\n    function toggleAnniversaryAssignMenu(", menuStart);
if (menuEnd < 0) fail("cannot bound openAnniversaryAssignMenu");
const menuBody = html.slice(menuStart, menuEnd);

if (!/action === ["']other["'][\s\S]*toggleAnniversaryTaskTodayPlan/.test(menuBody)) {
  fail("menu other action not wired to toggleAnniversaryTaskTodayPlan");
}
if (!/action === ["']closed["'][\s\S]*promoteAnniversaryTaskToClosedList/.test(menuBody)) {
  fail("menu closed action not wired to promoteAnniversaryTaskToClosedList");
}
ok("归入菜单 other/closed 目标标识分离");

const promoteOtherStart = html.indexOf("function promoteAnniversaryTaskToOtherTasks(");
if (promoteOtherStart < 0) fail("missing promoteAnniversaryTaskToOtherTasks");
const promoteOtherEnd = html.indexOf(
  "\n    function leaveAnniversaryTaskOtherTasks(",
  promoteOtherStart
);
const promoteOtherBody = html.slice(promoteOtherStart, promoteOtherEnd);
if (promoteOtherBody.includes("setWeeklyPlanShell(\"closed\")")) {
  fail("promoteAnniversaryTaskToOtherTasks must not switch shell to closed");
}
if (!promoteOtherBody.includes('lane: "open"') && !promoteOtherBody.includes("lane: 'open'")) {
  fail("promoteAnniversaryTaskToOtherTasks must create open lane task");
}
if (!promoteOtherBody.includes("todayPlanDate")) {
  fail("promoteAnniversaryTaskToOtherTasks must set todayPlanDate");
}
if (!promoteOtherBody.includes("findWeeklyPlanAnniversaryOtherMirror")) {
  fail("promoteAnniversaryTaskToOtherTasks must reuse existing mirror");
}
ok("其他任务归入：Open + todayPlanDate + 去重");

const closedPromote = html.indexOf("function promoteAnniversaryTaskToClosedList(");
if (closedPromote < 0) fail("missing promoteAnniversaryTaskToClosedList");
ok("封闭清单 promote 仍保留");

if (!html.includes('APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261015j"')) {
  fail("index.html cache badge not bumped to v20261015j");
}
const sw = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");
if (!sw.includes('CACHE_NAME = "exec-system-pwa-v20261015j"')) {
  fail("sw.js CACHE_NAME not bumped to v20261015j");
}
ok("缓存版本 v20261015j");

console.log("\nAll checks passed.");
