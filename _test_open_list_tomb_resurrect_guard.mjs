/**
 * Open List 删除防复活守卫回归
 * 运行：node _test_open_list_tomb_resurrect_guard.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261015f"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261015f"/);

assert.match(html, /if \(aliyunSprintRealSuppressPush\) return;/);
assert.doesNotMatch(
  html,
  /if \(!isAliyunSprintRealSyncEnabled\(\) \|\| aliyunSprintRealSuppressPush\) \{\s*aliyunSprintRealQueue = \[\];/
);

assert.match(html, /ts <= prevTombTs/);
assert.match(html, /local-tomb-blocks-upsert/);
assert.match(html, /function stripResurrectedWeeklyPlanTasksMatchingLocalTombs/);
assert.match(html, /sprint-tomb-heal-local/);
assert.match(html, /pull-strip-heal-local-tombs/);
assert.match(html, /恢复须清 tomb/);

/* 纯逻辑：upsert 相等时 tomb 赢 */
function shouldApplyUpsert(ts, prevTs, prevTombTs) {
  if (ts < prevTs || ts <= prevTombTs) return false;
  return true;
}
assert.equal(shouldApplyUpsert(100, 50, 100), false);
assert.equal(shouldApplyUpsert(101, 50, 100), true);
assert.equal(shouldApplyUpsert(99, 50, 100), false);

console.log("PASS open-list tomb resurrect guards");
