/**
 * 每天三赢编辑盾：AMB pull/merge 不得在编辑中重建 dailyWin DOM。
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

mustInclude("let dailyWinEditorShield", "dailyWinEditorShield state");
mustInclude("function isDailyWinEditorShieldActive", "shield active helper");
mustInclude("function armDailyWinEditorShield", "arm shield");
mustInclude("function clearDailyWinEditorShield", "clear shield");
mustInclude("function scheduleDailyWinEditorShieldRelease", "blur grace release");
mustInclude("function bindDailyWinPendingInputShield", "pending input bind");
mustInclude("function protectDailyWinEditorsInMergedSlice", "merge protect");
mustInclude("function taskTitleIxShieldKeepDailyWinText", "item text shield");

mustInclude("bindDailyWinPendingInputShield(inputMain)", "wire pending inputs");
mustInclude("protectDailyWinEditorsInMergedSlice(mergedSlice)", "pull/flush protect call");

/* render 跳过 dailyWin DOM */
mustInclude("isDailyWinEditorShieldActive()", "shield checked in render/busy");
mustInclude("paintDailyWinDom = false", "skip dailyWin DOM rebuild");

/* busy / editing 路径纳入盾 */
const busyFn = html.slice(
  html.indexOf("function isAppUiBusyForBackgroundRefresh"),
  html.indexOf("function isAppUiBusyForBackgroundRefresh") + 450
);
assert.match(busyFn, /isDailyWinEditorShieldActive/);

const editFn = html.slice(
  html.indexOf("function isAppUiEditingInProgress"),
  html.indexOf("function isAppUiEditingInProgress") + 400
);
assert.match(editFn, /isDailyWinEditorShieldActive/);

/* AMB paint 在盾激活时记 deferred */
const paintFn = html.slice(
  html.indexOf("function aliyunAmbRealPaintLocalUiAfterMerge"),
  html.indexOf("function aliyunAmbRealPaintLocalUiAfterMerge") + 1200
);
assert.match(paintFn, /dwShield|isDailyWinEditorShieldActive/);
assert.match(paintFn, /renderDeferredWhileEditing\s*=\s*true/);

/* 保存后清盾 */
mustInclude('clearDailyWinEditorShield("composer-save")', "clear on composer save");

assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261001dw"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261001dw"/);

console.log("OK dailywin-edit-shield");
