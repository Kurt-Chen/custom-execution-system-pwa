/**
 * 静态验收：Done 分类选择点击路径不在同步链 force flush / 同步 save+notify。
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

const start = html.indexOf("function scheduleDoneOutcomeClickFollowUp(");
if (start < 0) fail("missing scheduleDoneOutcomeClickFollowUp");
const end = html.indexOf("\n    function setDoneOutcomeKindForDoneId(", start);
if (end < 0) fail("missing setDoneOutcomeKindForDoneId after follow-up");
const body = html.slice(start, end);

if (body.includes('flushLocalPersistedState("force")')) {
  fail("outcome follow-up still force-flushes local persist on click path");
}
ok("follow-up 不再 force flush");

if (!body.includes("requestAnimationFrame")) {
  fail("follow-up must yield via requestAnimationFrame before save/notify");
}
ok("follow-up 先 rAF 再落盘/同步");

if (!body.includes("doneOutcomePendingUpserts")) {
  fail("missing pending upserts map for coalesced multi-row clicks");
}
ok("连点 upsert 合并 Map 存在");

if (!body.includes("doneOutcomeChromeRefreshTimer")) {
  fail("missing chrome refresh debounce timer");
}
ok("顶栏派生短防抖存在");

/* compact 打开：click preventDefault 直切 expand，不预建 expand-panel */
const segStart = html.indexOf("function createDoneOutcomeSegmentEl(");
const segEnd = html.indexOf("\n    function isMobileDoneTimelineViewport(", segStart);
const segBody = html.slice(segStart, segEnd);
if (!segBody.includes("enterDoneOutcomeExpandFromCompact")) {
  fail("compact open missing enterDoneOutcomeExpandFromCompact");
}
if (!segBody.includes("ev.preventDefault()")) {
  fail("summary click must preventDefault to skip native details open");
}
if (segBody.includes('className = "done-outcome-expand-panel"')) {
  fail("compact segment should not prebuild expand-panel");
}
ok("compact 打开直切 expand-row，无预建面板");

if (!html.includes('APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261107b"')) {
  fail("index.html cache badge not bumped to v20261107b");
}
if (!sw.includes('CACHE_NAME = "exec-system-pwa-v20261107b"')) {
  fail("sw.js CACHE_NAME not bumped to v20261107b");
}
ok("缓存版本 v20261107b");

/* 三次收尾：顶栏轻刷跳过跑马灯；就地点选可跳过 pick 布局 */
const chromeStart = html.indexOf("function refreshDoneOutcomeDerivedChromeLight(");
const chromeEnd = html.indexOf("\n    function scheduleDoneOutcomeClickFollowUp(", chromeStart);
const chromeBody = html.slice(chromeStart, chromeEnd);
if (!chromeBody.includes("skipMarqueeSync: true")) {
  fail("chrome light refresh must skip marquee sync on outcome click path");
}
ok("顶栏轻刷 skipMarqueeSync");

const patchStart = html.indexOf("function patchDoneOutcomeUiImmediate(");
const patchEnd = html.indexOf("\n    function collectDoneTasksForOutcomeChrome(", patchStart);
const patchBody = html.slice(patchStart, patchEnd);
if (!patchBody.includes("hintStillInSeg") || !patchBody.includes("alreadyPicking")) {
  fail("in-place outcome patch should skip pick layout when already picking");
}
ok("就地点选可跳过 pick 布局搬迁");

const kindStart = html.indexOf("function setDoneOutcomeKindForDoneId(");
const kindEnd = html.indexOf("\n    function setDoneOutcomeScoreForDoneId(", kindStart);
const kindBody = html.slice(kindStart, kindEnd);
if (kindBody.indexOf("patchDoneOutcomeUiImmediate") > kindBody.indexOf("playVictoryCelebration(") && kindBody.includes("playVictoryCelebration(")) {
  fail("kind select must patch row before victory celebration");
}
ok("性质选择先 patch 再庆祝");

console.log("\nAll checks passed.");
