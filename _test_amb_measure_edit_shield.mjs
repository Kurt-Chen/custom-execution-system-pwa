/**
 * AMB 衡量面显式编辑会话：pull/merge 不得 forceLists 拆掉 gain / 向后衡量 / Think Day 输入。
 * 运行：node _test_amb_measure_edit_shield.mjs
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

mustInclude("let ambMeasureEditSession", "explicit AMB measure edit session state");
mustInclude("function isAmbMeasureEditSessionActive", "session active helper");
mustInclude("function beginAmbMeasureEditSession", "begin session");
mustInclude("function endAmbMeasureEditSession", "end session");
mustInclude("function ensureAmbMeasureEditSessionLeaveDetection", "leave via pointerdown");
mustInclude("function bindAmbMeasurePendingInputShield", "pending input bind");
mustInclude("function shouldPreserveAmbMeasureListDom", "list preserve helper");
mustInclude("ambBackwardPendingDrafts", "backward measure local drafts");
mustInclude("ambThinkDayPendingDraft", "think day local draft");

/* AMB paint：编辑中不得 forceLists:true */
const paintFn = html.slice(
  html.indexOf("function aliyunAmbRealPaintLocalUiAfterMerge"),
  html.indexOf("function aliyunAmbRealPaintLocalUiAfterMerge") + 2800
);
assert.match(paintFn, /preserveAmbLists|isAmbMeasureEditSessionActive/);
assert.match(paintFn, /forceLists:\s*!preserveAmbLists/);
assert.ok(
  paintFn.includes("禁止 forceLists") || paintFn.includes("绝不 forceLists"),
  "paint must document skip forceLists during edit"
);

/* renderAmbGainList 编辑保护 */
const gainFn = html.slice(
  html.indexOf("function renderAmbGainList(kind, forceRefresh)"),
  html.indexOf("function renderAmbGainList(kind, forceRefresh)") + 3500
);
assert.match(gainFn, /shouldPreserveAmbMeasureListDom/);
assert.match(gainFn, /collectAmbGainPendingDrafts/);

/* Think Day：禁止 forceLists 覆盖焦点/会话中的 textarea */
assert.match(
  html,
  /禁止 forceLists 覆盖正在编辑\/会话中的 Think Day|document\.activeElement === ta \|\| thinkEditing/
);

/* busy 守卫纳入 AMB 会话 */
const busyFn = html.slice(
  html.indexOf("function isAppUiBusyForBackgroundRefresh"),
  html.indexOf("function isAppUiBusyForBackgroundRefresh") + 900
);
assert.match(busyFn, /isAmbMeasureEditSessionActive/);

mustInclude('endAmbMeasureEditSession("leave-module")', "end on leave module");
mustInclude('endAmbMeasureEditSession("amb-gain-save")', "end on gain save");

assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261004x"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261004x"/);

console.log("OK amb-measure-edit-session");
