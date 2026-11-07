/**
 * Done 分类选择热路径性能守卫 · 静态回归
 * Run: node _test_done_outcome_classify_perf.mjs
 *
 * 约束：点分类须行级 patch；save 后不 force 全量 flush；
 * upsert/顶栏延后；展开直切 expand-row；V/D 刷新可跳过跑马灯。
 */
import assert from "assert";
import fs from "fs";

const html = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}
function ok(msg) {
  console.log("OK:", msg);
}

const CACHE = "exec-system-pwa-v20261107a";
if (!html.includes(CACHE)) fail("index.html cache not " + CACHE);
if (!sw.includes(CACHE)) fail("sw.js CACHE_NAME not " + CACHE);
ok("缓存 " + CACHE);

if (!html.includes("function findDoneTimelineLiById(")) {
  fail("missing findDoneTimelineLiById");
}
ok("findDoneTimelineLiById 存在");

if (!html.includes("function patchDoneOutcomeUiImmediate(")) {
  fail("missing patchDoneOutcomeUiImmediate");
}
ok("patchDoneOutcomeUiImmediate 存在");

const followStart = html.indexOf("function scheduleDoneOutcomeClickFollowUp(");
if (followStart < 0) fail("missing scheduleDoneOutcomeClickFollowUp");
const followEnd = html.indexOf("\n    function setDoneOutcomeKindForDoneId(", followStart);
const followBody = html.slice(followStart, followEnd > 0 ? followEnd : followStart + 2500);

if (followBody.includes('flushLocalPersistedState("force")')) {
  fail("scheduleDoneOutcomeClickFollowUp must not force-flush full state JSON on click");
}
ok("分类 follow-up 不再 force flush");

if (!followBody.includes("skipUiPaintDirty: !!patchedOk")) {
  fail("successful patch must skipUiPaintDirty");
}
ok("patch 成功时 skipUiPaintDirty");

if (!followBody.includes("notifyAliyunDoneRealUpsert(reason || \"outcome-edit\", item)")) {
  fail("follow-up must still upsert outcome to Aliyun");
}
if (!followBody.includes("setTimeout(function ()")) {
  fail("upsert/chrome must be deferred via setTimeout");
}
const saveIdx = followBody.indexOf("saveState({");
const timerIdx = followBody.indexOf("doneOutcomeClickFollowUpTimer = setTimeout");
const notifyIdx = followBody.indexOf("notifyAliyunDoneRealUpsert(reason || \"outcome-edit\", item)");
if (saveIdx < 0 || timerIdx < 0 || notifyIdx < 0) {
  fail("follow-up missing save/timer/notify anchors");
}
if (!(saveIdx < timerIdx && timerIdx < notifyIdx)) {
  fail("saveState should stay sync before timer; notify must be inside deferred timer");
}
ok("save 同步、upsert/顶栏延后");

if (!html.includes("renderDoneVdIndexHome(statsTasks, { skipMarquee: true })")) {
  fail("outcome chrome refresh must skip V/D marquees");
}
ok("顶栏刷新跳过跑马灯");

const createStart = html.indexOf("function createDoneOutcomeSegmentEl(");
if (createStart < 0) fail("missing createDoneOutcomeSegmentEl");
const createEnd = html.indexOf("\n    function isMobileDoneTimelineViewport(", createStart);
const createBody = html.slice(createStart, createEnd > 0 ? createEnd : createStart + 12000);

if (createBody.includes("onDoneOutcomeDetailsToggle")) {
  fail("compact expand must not use delayed details.toggle rebuild");
}
if (!createBody.includes("ev.preventDefault()")) {
  fail("compact summary click must preventDefault and expand immediately");
}
if (!createBody.includes("patchDoneOutcomeUiImmediate(item)")) {
  fail("compact summary click must patch to expand-row immediately");
}
/* 收起态不应再预挂 expand-panel（展开由 patch 生成） */
const compactPanelHint =
  createBody.includes('panel.className = "done-outcome-expand-panel"') &&
  createBody.includes("details.appendChild(panel)");
if (compactPanelHint) {
  fail("compact segment should not prebuild expand-panel DOM");
}
ok("收起态点击直切 expand-row，不预建面板");

console.log("\nAll checks passed.");
