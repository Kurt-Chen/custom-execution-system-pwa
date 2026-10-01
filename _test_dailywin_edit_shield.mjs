/**
 * 每天三赢显式编辑会话：AMB pull/merge 不得在会话中重建 dailyWin DOM。
 * 运行：node _test_dailywin_edit_shield.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

function mustInclude(marker, msg) {
  assert.ok(html.includes(marker), msg || "missing: " + marker);
}

mustInclude("let dailyWinEditSession", "explicit edit session state");
mustInclude("function isDailyWinEditSessionActive", "session active helper");
mustInclude("function beginDailyWinEditSession", "begin session");
mustInclude("function endDailyWinEditSession", "end session");
mustInclude("function ensureDailyWinEditSessionLeaveDetection", "leave via pointerdown");
mustInclude("function bindDailyWinPendingInputShield", "pending input bind");
mustInclude("function protectDailyWinEditorsInMergedSlice", "merge protect");

/* 禁止 blur 宽限期清会话 */
assert.ok(!html.includes("scheduleDailyWinEditorShieldRelease"), "blur-grace release must be gone");
assert.ok(!html.includes("DAILY_WIN_EDITOR_SHIELD_BLUR_MS"), "blur ms constant must be gone");
assert.ok(!/\.addEventListener\(\"blur\".*dailyWin|scheduleDailyWinEditorShieldRelease/.test(html));

/* renderList 硬挡 */
const renderListFn = html.slice(
  html.indexOf("function renderList(ul, tasks, listName)"),
  html.indexOf("function renderList(ul, tasks, listName)") + 900
);
assert.match(renderListFn, /isDailyWinEditSessionActive/);
assert.match(renderListFn, /return;/);

/* AMB paint 会话中不走整页 render */
const paintFn = html.slice(
  html.indexOf("function aliyunAmbRealPaintLocalUiAfterMerge"),
  html.indexOf("function aliyunAmbRealPaintLocalUiAfterMerge") + 2200
);
assert.match(paintFn, /isDailyWinEditSessionActive|dwSession/);
assert.match(paintFn, /return;/);
assert.ok(
  paintFn.includes("绝不调用") || paintFn.includes("绕开会碰 dailyWin"),
  "paint must document skip full render during session"
);

/* 保存 / 离开模块结束会话 */
mustInclude('endDailyWinEditSession("composer-save")', "end on composer save");
mustInclude('endDailyWinEditSession("leave-module")', "end on leave module");
mustInclude('endDailyWinEditSession("leave-panel")', "end on leave panel");

assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261001ed"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261001ed"/);

console.log("OK dailywin-edit-session");
