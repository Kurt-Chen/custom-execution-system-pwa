/**
 * Habit→Done 镜像：简单习惯按 times 补齐；payload 未变仍应能触发 repair 路径（源码断言）。
 * 运行：node _test_habit_done_mirror_repair.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

assert.match(html, /拉取无变化，但已补齐缺失的 Habit→Done 镜像/);
assert.match(html, /简单习惯（间歇性断食 \/ 手掌写符号等）/);
assert.match(html, /checkin-direct/);
assert.match(html, /for \(let n = existingRows\.length \+ 1; n <= expectTimes; n\+\+/);
assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20260930ak"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20260930ak"/);

/** 纯逻辑：已有 0 行、times=2 → 应补 2 次 */
function planSimpleHabitDoneFills(existingCount, expectTimes, stamps) {
  const out = [];
  for (let n = existingCount + 1; n <= expectTimes; n++) {
    out.push({
      n,
      stamp: stamps[n - 1] || stamps[stamps.length - 1] || 0
    });
  }
  return out;
}

const fills = planSimpleHabitDoneFills(0, 2, [100, 200]);
assert.equal(fills.length, 2);
assert.equal(fills[0].n, 1);
assert.equal(fills[1].n, 2);
assert.equal(planSimpleHabitDoneFills(1, 1, [100]).length, 0);

console.log("OK habit-done-mirror-repair");
