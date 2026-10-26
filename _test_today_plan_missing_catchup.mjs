/**
 * 静态回归：其他任务 skippedMissing 不得推进 domains lastSeen，且有同轮/后续补拉武装。
 */
import fs from "fs";
import assert from "assert";
import { fileURLToPath } from "url";
import path from "path";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

assert.match(html, /aliyunSyncPrimaryArmTodayPlanMissingCatchup/);
assert.match(html, /today-plan-missing-catchup/);
assert.match(html, /same-round sprint\+todayPlan catchup/);
assert.match(html, /Number\(packed\.skippedMissing\) > 0/);
assert.match(html, /Number\(packed && packed\.skippedMissing\) > 0/);
assert.match(
  html,
  /skippedMissing：今日计划 marks 缺 Sprint 任务正文，同样禁止推进/
);
assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261026a"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261026a"/);

console.log("ok: today-plan missing catchup anchors + cache v20261026a");
