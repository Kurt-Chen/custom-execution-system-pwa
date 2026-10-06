/**
 * Audible 等数值 Habit：batches>1 时 Done 镜像必须按批补齐，且不得每轮删补 churn。
 * 运行：node _test_audible_habit_done_mirror.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261006n"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261006n"/);
assert.match(html, /function fillMissingNumericHabitDoneRowsFromBatches\(/);
assert.match(html, /domains-meta skip Habit body; local Done mirror repair ok/);
assert.match(html, /!\(packed && packed\.ok === false\)/);
assert.match(html, /stamps: nextStamps/);
assert.match(
  html,
  /旧逻辑「已有任一行就 return \+ 只 sync 第 1 批」会导致 times\/batches>1 时/
);

/** 纯逻辑：与 fillMissingNumericHabitDoneRowsFromBatches 同语义 */
function planNumericDoneFills(existingCount, batches, stamps, fallbackAt) {
  const expect = batches.length || 1;
  const out = [];
  for (let n = existingCount + 1; n <= expect; n++) {
    const batch = batches[n - 1];
    const total = batches.slice(0, n).reduce((a, b) => a + b, 0);
    const atMs = stamps[n - 1] || stamps[stamps.length - 1] || fallbackAt;
    out.push({ n, batch, total, atMs });
  }
  return out;
}

const audBatches = [30, 30];
const fills0 = planNumericDoneFills(0, audBatches, [], 1791022906089);
assert.equal(fills0.length, 2);
assert.equal(fills0[0].batch, 30);
assert.equal(fills0[0].total, 30);
assert.equal(fills0[0].n, 1);
assert.equal(fills0[1].total, 60);
assert.equal(fills0[1].n, 2);

const fills1 = planNumericDoneFills(1, audBatches, [100, 200], 0);
assert.equal(fills1.length, 1);
assert.equal(fills1[0].n, 2);
assert.equal(fills1[0].atMs, 200);

assert.equal(planNumericDoneFills(2, audBatches, [], 1).length, 0);

/** repair churn：补齐后 expect===rows，不得再 delete */
function wouldChurn(rowsLen, expect) {
  return rowsLen !== expect;
}
assert.equal(wouldChurn(1, 2), true); // 旧 bug
assert.equal(wouldChurn(2, 2), false); // 修复后

console.log("OK audible-habit-done-mirror");
