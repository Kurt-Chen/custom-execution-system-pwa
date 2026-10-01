/**
 * 编辑会话稳定性：周计划/标题 Edit 不得因 blur 结束；同步 paint 须硬挡。
 * 运行：node _test_editor_session_stability.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

assert.ok(html.includes("function ensureTaskTitleIxLeaveDetection"), "leave detection");
assert.ok(html.includes("function ensureAppUiImeComposeTracking"), "IME tracking");
assert.ok(html.includes("let appUiImeComposing"), "IME flag");

/* wireTaskTitleViewEditPair 不得再 blur→cancelEdit */
const pairStart = html.indexOf("function wireTaskTitleViewEditPair");
const pairEnd = html.indexOf("function mountTaskTitleCreateSlot");
const pairBody = html.slice(pairStart, pairEnd);
assert.ok(pairBody.includes("blur/IME 绝不结束 Edit"), "comment about no blur cancel");
assert.ok(!/addEventListener\(\"blur\"[\s\S]{0,400}cancelEdit\(/.test(pairBody), "no blur→cancelEdit");

/* create slot 不得 blur→cancelCreate */
const createStart = html.indexOf("function mountTaskTitleCreateSlot");
const createEnd = html.indexOf("function formatDoneListTime");
const createBody = html.slice(createStart, createEnd > createStart ? createEnd : createStart + 8000);
assert.ok(!/addEventListener\(\"blur\"[\s\S]{0,300}cancelCreate\(/.test(createBody), "no blur→cancelCreate");

/* sync paint 硬挡 */
assert.ok(
  html.includes('deferRenderForTaskTitleIx("refreshWeeklyPlanListAfterStructureChange")') ||
    html.includes("refreshWeeklyPlanListAfterStructureChange") &&
      html.includes("taskTitleIxIsBusy"),
  "sprint refresh guarded"
);
const listsPaint = html.slice(
  html.indexOf("function aliyunListsRealPaintLocalUiAfterMerge"),
  html.indexOf("function aliyunListsRealPaintLocalUiAfterMerge") + 800
);
assert.match(listsPaint, /taskTitleIxIsBusy|isAppUiBusyForBackgroundRefresh/);

const goalsPaint = html.slice(
  html.indexOf("function aliyunGoalsRealPaintLocalUiAfterMerge"),
  html.indexOf("function aliyunGoalsRealPaintLocalUiAfterMerge") + 700
);
assert.match(goalsPaint, /taskTitleIxIsBusy|isAppUiBusyForBackgroundRefresh/);

const busy = html.slice(
  html.indexOf("function isAppUiBusyForBackgroundRefresh"),
  html.indexOf("function isAppUiBusyForBackgroundRefresh") + 700
);
assert.match(busy, /appUiImeComposing/);
assert.match(busy, /taskTitleIxIsBusy/);

assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261001ed"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261001ed"/);

console.log("OK editor-session-stability");
