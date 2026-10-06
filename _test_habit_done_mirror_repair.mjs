/**
 * Habit→Done 镜像：
 * - 简单习惯按 times/stamps 补齐 N 条
 * - optional-remark（notebookLm 等）同样按 times/stamps 增量补齐，且幂等
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
/* optional-remark 不得再「已有任一行就 return」后只 sync 一次 */
assert.match(html, /optional-remark（Gemini Notebook \/ 听网课·有声书等）/);
assert.match(html, /缺行时不删已有 Done：交给 rebuild 按 stamps\[N-1\] 增量补第 N 次/);
assert.doesNotMatch(
  html,
  /if \(isHabitOptionalRemarkKey\(habitKey\)\) \{\s*if \(getHabitDoneRowsForDay\(habitKey, dateStr\)\.length > 0\) return;/
);
assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261006n"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261006n"/);

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

/**
 * optional-remark：按「第 N 次」是否已存在增量补齐；已有则只在时刻偏离时校正。
 * 与 index.html rebuildMissingHabitDoneRowsForDate optional-remark 分支语义一致。
 */
function planOptionalRemarkDoneFills(existingRows, expectTimes, stamps) {
  const haveN = new Set();
  const rowByN = Object.create(null);
  (existingRows || []).forEach(function (entry, idx) {
    const text = typeof entry === "string" ? entry : entry && entry.text;
    const completedAt =
      typeof entry === "object" && entry && entry.completedAt != null
        ? Number(entry.completedAt) || 0
        : 0;
    const m = String(text || "").match(/第\s*(\d+)\s*次/);
    if (m) {
      const nn = Number(m[1]);
      haveN.add(nn);
      if (!rowByN[nn]) rowByN[nn] = { text, completedAt, idx };
    }
  });
  if (haveN.size === 0 && existingRows && existingRows.length) {
    for (let i = 0; i < existingRows.length; i++) {
      const entry = existingRows[i];
      const text = typeof entry === "string" ? entry : entry && entry.text;
      const completedAt =
        typeof entry === "object" && entry && entry.completedAt != null
          ? Number(entry.completedAt) || 0
          : 0;
      haveN.add(i + 1);
      rowByN[i + 1] = { text, completedAt, idx: i };
    }
  }
  const creates = [];
  const aligns = [];
  for (let n = 1; n <= expectTimes; n++) {
    const stamp = stamps[n - 1] || stamps[stamps.length - 1] || 0;
    if (haveN.has(n)) {
      const row = rowByN[n];
      const curAt = row ? Number(row.completedAt) || 0 : 0;
      if (row && curAt > 0 && stamp > 0 && Math.abs(curAt - stamp) > 60000) {
        aligns.push({ n, stamp });
      }
      continue;
    }
    creates.push({ n, stamp });
  }
  return { creates, aligns };
}

const fills = planSimpleHabitDoneFills(0, 2, [100, 200]);
assert.equal(fills.length, 2);
assert.equal(fills[0].n, 1);
assert.equal(fills[1].n, 2);
assert.equal(planSimpleHabitDoneFills(1, 1, [100]).length, 0);

/* ① times=1 → 补 1 条 */
{
  const r = planOptionalRemarkDoneFills([], 1, [1791091192104]);
  assert.equal(r.creates.length, 1);
  assert.equal(r.creates[0].n, 1);
  assert.equal(r.creates[0].stamp, 1791091192104);
}

/* ② times=2、已有第1次 → 只补第2次，stamp=16:06 */
{
  const r = planOptionalRemarkDoneFills(
    ["【习惯】Gemini Notebook · 第 1 次打卡"],
    2,
    [1791091192104, 1791101169805]
  );
  assert.equal(r.creates.length, 1);
  assert.equal(r.creates[0].n, 2);
  assert.equal(r.creates[0].stamp, 1791101169805);
  assert.equal(r.aligns.length, 0);
}

/* ③ times=3、已有 1+2 → 只补第3次 */
{
  const r = planOptionalRemarkDoneFills(
    ["【习惯】Gemini Notebook · 第 1 次打卡", "【习惯】Gemini Notebook · 第 2 次打卡"],
    3,
    [100, 200, 300]
  );
  assert.equal(r.creates.length, 1);
  assert.equal(r.creates[0].n, 3);
  assert.equal(r.creates[0].stamp, 300);
}

/* ④ 重复 repair：已有 1..3 → creates 空 */
{
  const r = planOptionalRemarkDoneFills(
    [
      "【习惯】Gemini Notebook · 第 1 次打卡",
      "【习惯】Gemini Notebook · 第 2 次打卡",
      "【习惯】Gemini Notebook · 第 3 次打卡"
    ],
    3,
    [100, 200, 300]
  );
  assert.equal(r.creates.length, 0);
}

/* 真实样本：误标「第2次」且 completedAt=最早 stamp → 补第1次 + 校正第2次到 16:06 */
{
  const r = planOptionalRemarkDoneFills(
    [
      {
        text: "【习惯】Gemini Notebook · 第 2 次打卡",
        completedAt: 1791091192104
      }
    ],
    2,
    [1791091192104, 1791101169805]
  );
  assert.equal(r.creates.length, 1);
  assert.equal(r.creates[0].n, 1);
  assert.equal(r.creates[0].stamp, 1791091192104);
  assert.equal(r.aligns.length, 1);
  assert.equal(r.aligns[0].n, 2);
  assert.equal(r.aligns[0].stamp, 1791101169805);
}

/* ⑤ 两 Habit 同分钟：各自独立计划，互不覆盖 */
{
  const a = planOptionalRemarkDoneFills([], 1, [1791101169805]);
  const b = planOptionalRemarkDoneFills([], 1, [1791101173676]);
  assert.equal(a.creates[0].stamp, 1791101169805);
  assert.equal(b.creates[0].stamp, 1791101173676);
  assert.notEqual(a.creates[0].stamp, b.creates[0].stamp);
}

console.log("OK habit-done-mirror-repair");
