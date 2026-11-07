/**
 * Done 分类选择卡顿优化 · 静态回归（v20261107a）
 * 运行：node _test_done_outcome_classify_lag.mjs
 */
import assert from "assert";
import fs from "fs";

const html = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function sliceFn(name) {
  const start = html.indexOf("function " + name + "(");
  assert.ok(start >= 0, "missing function " + name);
  const next = html.indexOf("\n    function ", start + 10);
  return html.slice(start, next > 0 ? next : start + 12000);
}

mustIncludeCache();
mustDeferFollowUp();
mustOpenWithoutPrebuiltPanel();
mustNotForceFlushOnClick();

function mustIncludeCache() {
  assert.ok(
    html.includes('APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261107a"'),
    "cache badge bump"
  );
  assert.ok(sw.includes('CACHE_NAME = "exec-system-pwa-v20261107a"'), "sw cache bump");
}

function mustDeferFollowUp() {
  const body = sliceFn("scheduleDoneOutcomeClickFollowUp");
  assert.ok(body.includes("setTimeout"), "follow-up must defer off click turn");
  assert.ok(body.includes("saveState("), "still saves");
  assert.ok(body.includes("notifyAliyunDoneRealUpsert"), "still upserts Aliyun Done");
  assert.ok(
    body.includes("doneOutcomePendingFollowUps"),
    "batches rapid clicks so no upsert is dropped"
  );
  assert.ok(
    body.includes("skipUiPaintDirty: !anyPatchFail"),
    "success path skips done paint dirty"
  );
  /* saveState 须在 timer 回调内，不能在 schedule 入口同步调用 */
  const timerIdx = body.indexOf("setTimeout(function");
  const saveIdx = body.indexOf("saveState({");
  assert.ok(timerIdx >= 0 && saveIdx > timerIdx, "saveState must run inside setTimeout");
  assert.ok(
    !/flushLocalPersistedState\(\s*["']force["']\s*\)/.test(body),
    "click path must not force full persist"
  );
  assert.ok(
    body.includes("scheduleDoneOutcomeChromeRefreshLight") ||
      body.includes("refreshDoneOutcomeDerivedChromeLight"),
    "still refreshes derived chrome"
  );
}

function mustNotForceFlushOnClick() {
  const chrome = sliceFn("scheduleDoneOutcomeChromeRefreshLight");
  assert.ok(chrome.includes("DONE_OUTCOME_CHROME_REFRESH_MS") || chrome.includes("120"), "chrome debounce");
  assert.ok(!/flushLocalPersistedState/.test(chrome), "chrome refresh is UI-only");
}

function mustOpenWithoutPrebuiltPanel() {
  const body = sliceFn("createDoneOutcomeSegmentEl");
  assert.ok(
    body.includes("openDoneOutcomeEditorFromCompact"),
    "compact open uses direct editor entry"
  );
  assert.ok(body.includes("ev.preventDefault()"), "blocks native details open");
  assert.ok(
    body.includes("patchDoneOutcomeUiImmediate(item)"),
    "open patches to expand-row immediately"
  );
  /* 收起态不再预挂 expand 面板（避免双布局） */
  const compactBranch = body.slice(body.indexOf('done-outcome-segment--compact'));
  assert.ok(
    !compactBranch.includes('panel.className = "done-outcome-expand-panel"'),
    "must not prebuild expand panel inside closed details"
  );
}

console.log("_test_done_outcome_classify_lag.mjs OK");
