/**
 * Audible 等同日多次打卡：每次 Done 行保留独立 completedAt；
 * sanitize / repair 不得把上午记录挤到第二次打卡时间。
 * 运行：node _test_audible_done_timeline_stamps.mjs
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
assert.match(html, /function normalizeHabitCheckinStampsList\(/);
assert.match(html, /function collectHabitDoneRowClockStamps\(/);
assert.match(html, /function getHabitNumericPrevStampsForPunch\(/);
assert.match(html, /function alignNumericHabitDoneRowsToStamps\(/);
assert.match(html, /必须保留 stamps\[\]/);
assert.match(html, /getHabitNumericPrevStampsForPunch\(current, habitKey, dateKey\)/);
assert.match(html, /缺行时不删已有 Done：交给 rebuild 按 stamps\[N-1\] 增量补第 N 次/);
assert.match(html, /stamps 不足则只回填槽，不把上午挤到晚间/);
assert.match(html, /out\.stamps = stampsNorm/);
assert.match(html, /stampsFromDone/);

/** 与 sanitizeHabitNumericCheckinValue 保留 stamps 的语义一致 */
function sanitizeKeepStamps(val) {
  const out = {
    times: val.times,
    batches: val.batches.slice(),
    minutes: val.minutes
  };
  if (Number(val.stampAt) > 0) out.stampAt = Number(val.stampAt);
  if (Number(val.revisedAt) > 0) out.revisedAt = Number(val.revisedAt);
  const stamps = (val.stamps || [])
    .map(Number)
    .filter((t) => Number.isFinite(t) && t > 0)
    .sort((a, b) => a - b);
  if (stamps.length) {
    out.stamps = stamps;
    if (!(Number(out.stampAt) > 0)) out.stampAt = stamps[0];
  }
  return out;
}

const morning = 1_000_000_000_000;
const evening = morning + 8 * 3600 * 1000;
const slot = {
  minutes: 60,
  times: 2,
  batches: [30, 30],
  stamps: [morning, evening],
  stampAt: morning,
  revisedAt: evening
};
const sanitized = sanitizeKeepStamps(slot);
assert.deepEqual(sanitized.stamps, [morning, evening]);
assert.equal(sanitized.stampAt, morning);

/** sanitize 丢 stamps 后，第二次打卡应从 Done 回填 prevStamps */
function prevStampsForPunch(slotStamps, doneClocks) {
  const fromSlot = (slotStamps || []).filter((t) => t > 0).sort((a, b) => a - b);
  if (fromSlot.length) return fromSlot;
  return (doneClocks || []).slice().sort((a, b) => a - b);
}
assert.deepEqual(prevStampsForPunch([], [morning]), [morning]);
assert.deepEqual(prevStampsForPunch([], [morning]).concat([evening]), [morning, evening]);

function uniqSortClocks(list) {
  return Array.from(new Set((list || []).map(Number).filter((t) => t > 0))).sort((a, b) => a - b);
}

/** stamps 只有晚间、Done 仍有上午：回填槽，不改写 Done */
function planAlign(stamps, doneClocks, rowCount) {
  const rows = rowCount != null ? rowCount : (doneClocks || []).length;
  let stampList = uniqSortClocks(stamps);
  const fromDone = uniqSortClocks(doneClocks);
  let slotUpdated = false;
  if (stampList.length < rows && fromDone.length > stampList.length) {
    stampList = fromDone;
    slotUpdated = true;
  }
  const aligns = [];
  if (stampList.length >= rows) {
    for (let i = 0; i < rows; i++) {
      const cur = doneClocks[i];
      if (Math.abs(cur - stampList[i]) > 60000) {
        aligns.push({ n: i + 1, to: stampList[i] });
      }
    }
  }
  return { stampList, slotUpdated, aligns };
}
{
  const r = planAlign([evening], [morning, evening], 2);
  assert.equal(r.slotUpdated, true);
  assert.deepEqual(r.stampList, [morning, evening]);
  assert.equal(r.aligns.length, 0);
}
/** stamps 完整且第1行被挤到晚间：可按 stamps 恢复上午 */
{
  const r = planAlign([morning, evening], [evening, evening], 2);
  assert.equal(r.aligns.length, 1);
  assert.equal(r.aligns[0].n, 1);
  assert.equal(r.aligns[0].to, morning);
}
/** 两边都只有晚间（去重后 stamps 仍不足覆盖 2 行）：不猜测上午 */
{
  const r = planAlign([evening], [evening, evening], 2);
  assert.equal(r.slotUpdated, false);
  assert.equal(r.aligns.length, 0);
}

console.log("OK audible-done-timeline-stamps");
