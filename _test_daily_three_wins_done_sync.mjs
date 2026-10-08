/**
 * 每天三赢 Done 跨设备：上传例外 + 历史回补 + 删除不复活 + 评分诊断。
 * 运行：node _test_daily_three_wins_done_sync.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261004ab"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261004ab"/);

assert.match(html, /function stableDailyThreeWinsDoneId\(/);
assert.match(html, /dw-today-/);
assert.match(html, /notifyAliyunDoneRealUpsert\("dailyThreeWins"/);
assert.match(html, /notifyAliyunDoneRealUpsert\("dailyThreeWins-backfill"/);
assert.match(html, /function backfillDailyThreeWinsDoneMirrorsToAliyun\(/);
assert.match(html, /backfillDailyThreeWinsDoneMirrorsToAliyun\("after-" \+ pullReason\)/);
assert.match(html, /不按「今天」过滤：跨日后仍须回补昨日\/历史日已有 Done 行/);
assert.match(html, /focusDate: "2026-10-04"/);
assert.match(html, /dailyWin-backfill-historical/);
assert.match(html, /frozenCompletedAt/);
assert.match(html, /refreshAllDailyWinCheckins\(\{ skipNotify: true \}\)/);
assert.match(html, /allowRemove/);
assert.match(html, /isDailyThreeWinsDoneTombstoned/);
assert.match(html, /dailyThreeWinsDoneSuppressed = true/);
assert.match(html, /拉取指纹未变但本机缺口/);
assert.match(html, /function diagDoneVdDayBreakdown\(/);
assert.match(html, /「已同步」≠ 某次 HTTP 200/);

/* Habit repair 仍跳过，避免双路径叠双 */
assert.match(
  html,
  /function repairHabitDoneMirrorsAfterAliyunHabitPull[\s\S]*?if \(habitKey === "dailyThreeWins"\) return;/
);

/* 纯逻辑：不足 3 条默认 keep；allowRemove 才删 */
function planRefreshDailyThreeWins(refCount, hasDone, suppressed, tombstoned, allowRemove) {
  const should = refCount >= 3;
  if (should && !hasDone && !suppressed && !tombstoned) return "create";
  if (!should && hasDone && !allowRemove) return "keep";
  if (!should && hasDone && allowRemove) return "remove";
  if (suppressed && hasDone) return "remove";
  return "noop";
}
assert.equal(planRefreshDailyThreeWins(0, true, false, false, false), "keep");
assert.equal(planRefreshDailyThreeWins(2, true, false, false, false), "keep");
assert.equal(planRefreshDailyThreeWins(2, true, false, false, true), "remove");
assert.equal(planRefreshDailyThreeWins(3, false, true, false, false), "noop");
assert.equal(planRefreshDailyThreeWins(3, false, false, true, false), "noop");
assert.equal(planRefreshDailyThreeWins(3, false, false, false, false), "create");

/* 纯逻辑：评分差按 id，不硬改总分 */
function explainScoreGap(computerRows, phoneRows) {
  const sum = (rows) => rows.reduce((a, r) => a + Number(r.score || 0), 0);
  const byId = (rows) => new Map(rows.map((r) => [String(r.id), r]));
  const cMap = byId(computerRows);
  const pMap = byId(phoneRows);
  const onlyComputer = [];
  const onlyPhone = [];
  cMap.forEach((r, id) => {
    if (!pMap.has(id)) onlyComputer.push(r);
  });
  pMap.forEach((r, id) => {
    if (!cMap.has(id)) onlyPhone.push(r);
  });
  return {
    computerTotal: sum(computerRows),
    phoneTotal: sum(phoneRows),
    gap: sum(phoneRows) - sum(computerRows),
    onlyComputer,
    onlyPhone
  };
}
const sample = explainScoreGap(
  [
    { id: "dw-today-2026-10-04", score: 1 },
    { id: "dw-tomorrow-2026-10-05", score: 1 },
    { id: "t1", score: -1 },
    { id: "t2", score: -1 },
    { id: "rest", score: 48 }
  ],
  [
    { id: "dw-tomorrow-2026-10-05", score: 1 },
    { id: "rest", score: 48 }
  ]
);
/* 电脑 48 = 1+1-1-1+48；手机缺 today(+1) 与两条 treason(-2) → 49 */
assert.equal(sample.computerTotal, 48);
assert.equal(sample.phoneTotal, 49);
assert.equal(sample.gap, 1);
assert.equal(sample.onlyComputer.length, 3);

console.log("OK daily-three-wins-done-sync");
