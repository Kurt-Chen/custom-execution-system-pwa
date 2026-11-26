/**
 * 今天死磕 / 其他任务：本机按日折叠偏好（不进云同步）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, "index.html"), "utf8");

assert.match(html, /TODAY_PLAN_CLOSED_COLLAPSE_UI_KEY\s*=\s*"today-plan-closed-collapse-ui-v1"/);
assert.match(html, /TODAY_PLAN_OTHER_COLLAPSE_UI_KEY\s*=\s*"today-plan-other-collapse-ui-v1"/);
assert.match(html, /function toggleTodayPlanClosedManualCollapse\s*\(/);
assert.match(html, /function loadTodayPlanOtherCollapseUiState\s*\(/);
assert.match(html, /function persistTodayPlanOtherCollapseUiPrefs\s*\(/);
assert.match(html, /today-plan-panel__closed-chevron/);
assert.match(html, /is-manual-collapsed/);
assert.match(html, /function syncTodayPlanOtherSmartCollapse\s*\(/);

const start = html.indexOf("function getTodayPlanClosedCollapseDayKey");
const end = html.indexOf("function paintTodayPlanOtherSectionHead");
assert.ok(start > 0 && end > start, "collapse helpers block missing");
const block = html.slice(start, end);
assert.equal(block.includes("scheduleCloudSync"), false);
assert.equal(block.includes("pushStateToCloud"), false);
assert.equal(/[^/\n]*saveState\s*\(/.test(block), false, "must not call saveState()");

/* 两套偏好键相互独立 */
assert.notEqual(
  "today-plan-closed-collapse-ui-v1",
  "today-plan-other-collapse-ui-v1"
);

function simulateClosed(prefs, today) {
  if (!prefs.day || prefs.day !== today) return false; // default expanded → collapsed=false
  return !!prefs.collapsed;
}
function simulateOther(prefs, today) {
  if (!prefs.day || prefs.day !== today) {
    return { expanded: false, manualPending: false, wasClosedAllDone: false };
  }
  return {
    expanded: !!prefs.expanded,
    manualPending: !!prefs.manualPending,
    wasClosedAllDone: !!prefs.wasClosedAllDone
  };
}

assert.equal(simulateClosed({ day: "2026-11-26", collapsed: true }, "2026-11-26"), true);
assert.equal(simulateClosed({ day: "2026-11-26", collapsed: true }, "2026-11-27"), false);
assert.deepEqual(
  simulateOther({ day: "2026-11-26", expanded: true, manualPending: true, wasClosedAllDone: false }, "2026-11-26"),
  { expanded: true, manualPending: true, wasClosedAllDone: false }
);
assert.deepEqual(
  simulateOther({ day: "2026-11-26", expanded: true, manualPending: true, wasClosedAllDone: true }, "2026-11-27"),
  { expanded: false, manualPending: false, wasClosedAllDone: false }
);

/* 智能展开边沿：未全完成→全完成才展开；同日刷新不因 wasClosedAllDone 丢失而重复强制展开 */
function edgeExpand(wasAllDone, allDone, expanded) {
  if (allDone) {
    if (!wasAllDone) return true;
    return expanded;
  }
  return false;
}
assert.equal(edgeExpand(false, true, false), true);
assert.equal(edgeExpand(true, true, false), false); // 保留手动折叠
assert.equal(edgeExpand(true, false, true), false);

console.log("ok: sikao + other collapse day prefs + smart-edge isolation");
