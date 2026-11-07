/**
 * Done 分类选择卡顿 · 静态回归（v20261107a）
 * 运行：node _test_done_outcome_pick_perf.mjs
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

const CACHE = "exec-system-pwa-v20261107a";
if (!html.includes('APP_CACHE_NAME_FOR_BADGE = "' + CACHE + '"')) {
  fail("index.html cache badge not bumped to " + CACHE);
}
if (!sw.includes('CACHE_NAME = "' + CACHE + '"')) {
  fail("sw.js CACHE_NAME not bumped to " + CACHE);
}
ok("缓存版本 " + CACHE);

function sliceFn(name) {
  const start = html.indexOf("function " + name + "(");
  if (start < 0) fail("missing function " + name);
  const next = html.indexOf("\n    function ", start + 10);
  return html.slice(start, next > 0 ? next : start + 12000);
}

const follow = sliceFn("scheduleDoneOutcomeClickFollowUp");
if (follow.includes('flushLocalPersistedState("force")')) {
  fail("scheduleDoneOutcomeClickFollowUp must not force-flush IDB on click");
}
ok("follow-up 不再 force 全量落盘");

if (!follow.includes("skipUiPaintDirty: !!patchedOk")) {
  fail("follow-up must keep skipUiPaintDirty when row patched");
}
if (!follow.includes('notifyAliyunDoneRealUpsert(reason || "outcome-edit", item)')) {
  fail("follow-up must still upsert Done outcome to Aliyun");
}
if (!follow.includes("setTimeout(function")) {
  fail("follow-up must defer save/upsert off click stack");
}
if (!follow.includes("requestAnimationFrame(runChrome)")) {
  fail("follow-up must paint chrome after a frame");
}
ok("落盘/云 upsert/顶栏刷新均延后，且保留 skipUiPaintDirty + upsert");

const chrome = sliceFn("refreshDoneOutcomeDerivedChromeLight");
if (chrome.includes("renderDoneDayStats")) {
  fail("outcome chrome must not rebuild time-of-day stats");
}
if (chrome.includes("renderDoneRefocusChrome") || chrome.includes("renderDoneDailyDecisionReport")) {
  fail("outcome chrome must not touch Refocus / decision-report stub");
}
if (!chrome.includes("patchDoneVdIndexHomeLight")) {
  fail("outcome chrome should light-patch V/D home");
}
ok("顶栏只刷性质统计 + 轻量 V/D，不碰时间分布/Refocus/跑马灯全量重建");

if (!html.includes("function patchDoneVdIndexHomeLight(")) {
  fail("missing patchDoneVdIndexHomeLight");
}
const vdLight = sliceFn("patchDoneVdIndexHomeLight");
if (!vdLight.includes("renderDoneVdIndexHome(tasks)")) {
  fail("light V/D must fall back to full render when method panel open");
}
if (vdLight.includes("syncVdIndexRulesMarquee") || vdLight.includes("syncVdDesireMarquee")) {
  fail("light V/D must not sync marquees");
}
ok("V/D 轻量路径存在且默认不 sync 跑马灯");

const createSeg = sliceFn("createDoneOutcomeSegmentEl");
if (!createSeg.includes("ev.preventDefault()")) {
  fail("summary click must preventDefault to skip details mid-frame");
}
if (!createSeg.includes("patchDoneOutcomeUiImmediate(item)")) {
  fail("open picker must sync-patch to expand-row");
}
const toggleIdx = createSeg.indexOf("onDoneOutcomeDetailsToggle");
if (toggleIdx < 0) fail("toggle fallback missing");
const toggleBody = createSeg.slice(toggleIdx, toggleIdx + 800);
if (toggleBody.includes("requestAnimationFrame")) {
  fail("details toggle fallback must not wait for rAF");
}
ok("打开选择器：summary 同步切 expand；toggle 兜底也不等 rAF");

const setKind = sliceFn("setDoneOutcomeKindForDoneId");
const setScore = sliceFn("setDoneOutcomeScoreForDoneId");
if (!setKind.includes("patchDoneOutcomeUiImmediate(item)")) {
  fail("kind click must still immediate-patch row");
}
if (!setScore.includes("patchDoneOutcomeUiImmediate(item)")) {
  fail("score click must still immediate-patch row");
}
if (!setKind.includes('scheduleDoneOutcomeClickFollowUp(item, "outcome-kind", patchedOk)')) {
  fail("kind click must schedule follow-up");
}
if (!setScore.includes('scheduleDoneOutcomeClickFollowUp(item, "outcome-score", patchedOk)')) {
  fail("score click must schedule follow-up");
}
ok("选分类/分值仍本行即时反馈 + 后台 follow-up");

console.log("\nAll checks passed.");
