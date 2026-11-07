/**
 * 静态验收：已完成任务分类选择不在点击路径强制整包落盘 / 整页 render。
 * 运行：node _test_done_outcome_picker_perf.mjs
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

const followStart = html.indexOf("function scheduleDoneOutcomeClickFollowUp(");
if (followStart < 0) fail("missing scheduleDoneOutcomeClickFollowUp");
const followEnd = html.indexOf("\n    function setDoneOutcomeKindForDoneId(", followStart);
if (followEnd < 0) fail("cannot bound scheduleDoneOutcomeClickFollowUp");
const followBody = html.slice(followStart, followEnd);

if (followBody.includes('flushLocalPersistedState("force")')) {
  fail("scheduleDoneOutcomeClickFollowUp still force-flushes on click path");
}
ok("分类 follow-up 不再 force flush 整包落盘");

if (!followBody.includes("requestAnimationFrame")) {
  fail("follow-up should yield a paint frame before save/cloud");
}
ok("follow-up 先让出绘制帧");

if (!followBody.includes("skipUiPaintDirty: ok")) {
  fail("patched path must keep skipUiPaintDirty");
}
ok("成功 patch 时仍 skipUiPaintDirty");

if (!followBody.includes("notifyAliyunDoneRealUpsert")) {
  fail("must still upsert outcome to Aliyun");
}
ok("仍走阿里云 Done upsert");

const createStart = html.indexOf("function createDoneOutcomeSegmentEl(");
const createEnd = html.indexOf("\n    function isMobileDoneTimelineViewport(", createStart);
const createBody = html.slice(createStart, createEnd);
if (!createBody.includes("ev.preventDefault()")) {
  fail("summary click should preventDefault to skip native details open");
}
if (!createBody.includes("patchDoneOutcomeUiImmediate(item)")) {
  fail("summary click should patch immediately into expand-row");
}
ok("分类芯片点击同帧切入 expand-row");

if (!html.includes('APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261107a"')) {
  fail("index.html cache badge not bumped to v20261107a");
}
if (!sw.includes('CACHE_NAME = "exec-system-pwa-v20261107a"')) {
  fail("sw.js CACHE_NAME not bumped to v20261107a");
}
ok("缓存版本 v20261107a");

console.log("\nAll checks passed.");
