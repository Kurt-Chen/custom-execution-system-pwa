/**
 * 「记录本次数量」输入稳定性：云端 pull/merge 不得关掉弹窗或清空 draft。
 * 运行：node _test_habit_numeric_input_stability.mjs
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

mustInclude("let habitNumericCheckinDraft", "local draft state");
mustInclude("function captureHabitNumericCheckinDraftFromInputs", "capture draft");
mustInclude("function restoreHabitNumericCheckinDraftToInputs", "restore draft");
mustInclude("function clearHabitNumericCheckinDraft", "clear draft");
mustInclude("function paintHabitUiAfterCloudMerge", "cloud merge paint path");

/* 阿里云 Habit pull 不得再走会关弹窗的 finalizeHabitCheckinUiAfterPunch */
const pullStart = html.indexOf("async function runAliyunHabitRealPullAndMerge");
assert.ok(pullStart > 0, "habit pull fn");
const pullEnd = html.indexOf("window.runAliyunHabitRealPullAndMerge", pullStart);
const pullBody = html.slice(pullStart, pullEnd > pullStart ? pullEnd : pullStart + 20000);
assert.ok(
  pullBody.includes("paintHabitUiAfterCloudMerge"),
  "pull must paint via paintHabitUiAfterCloudMerge"
);
assert.ok(
  !/finalizeHabitCheckinUiAfterPunch\s*\(/.test(pullBody),
  "pull must NOT call finalizeHabitCheckinUiAfterPunch (closes dialog)"
);

/* paintHabitUiAfterCloudMerge 在弹窗打开时 defer */
const paintStart = html.indexOf("function paintHabitUiAfterCloudMerge");
const paintBody = html.slice(paintStart, paintStart + 1200);
assert.match(paintBody, /isHabitNumericDialogOpen/);
assert.match(paintBody, /renderDeferredWhileEditing\s*=\s*true/);
assert.match(paintBody, /return;/);

/* 后台 busy 盾含数值弹窗 */
const busyStart = html.indexOf("function isAppUiBusyForBackgroundRefresh");
const busyBody = html.slice(busyStart, busyStart + 900);
assert.match(busyBody, /isHabitNumericDialogOpen/);

const chromeStart = html.indexOf("function isAppUiTransientChromeOpen");
const chromeBody = html.slice(chromeStart, chromeStart + 700);
assert.match(chromeBody, /isHabitNumericDialogOpen/);

/* renderHabitCheckins 硬挡 */
const renderHabitStart = html.indexOf("function renderHabitCheckins()");
const renderHabitHead = html.slice(renderHabitStart, renderHabitStart + 900);
assert.match(renderHabitHead, /isHabitNumericDialogOpen/);
assert.match(renderHabitHead, /return;/);

/* input 只更新 draft，确认前不写主数据路径仍经 commit */
mustInclude("captureHabitNumericCheckinDraftFromInputs();", "input captures draft");
mustInclude("function commitHabitNumericCheckin", "commit only on confirm");

mustInclude("必须用 text + inputmode", "text input for decimal draft");
assert.match(html, /id="habitNumericCheckinInput"[\s\S]*?type="text"/);


assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261001eg"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261001eg"/);

console.log("OK habit-numeric-input-stability");
