/**
 * 每天三赢 Done 跨设备漏项：须进阿里云 Done 域（Habit repair 显式跳过该槽）。
 * 运行：node _test_daily_three_wins_done_sync.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261004z"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261004z"/);

/* 稳定 id + 序列化例外 */
assert.match(html, /function stableDailyThreeWinsDoneId\(/);
assert.match(html, /dw-today-/);
assert.match(html, /String\(item\.habitMeta\.key \|\| ""\) === "dailyThreeWins"/);
assert.match(html, /out\.habitMeta = meta/);

/* 本地写入 / 改文案 / 删除须走 Done 域 */
assert.match(html, /notifyAliyunDoneRealUpsert\("dailyThreeWins"/);
assert.match(html, /notifyAliyunDoneRealTombstone\("dailyThreeWins-remove"/);
assert.match(html, /notifyAliyunDoneRealTombstone\("dailyThreeWins-stable-id"/);
assert.match(html, /notifyAliyunDoneRealTombstone\("dailyThreeWins-toggle-off"/);

/* AMB pull 安全网补齐今天三赢（skipNotify） */
assert.match(html, /refreshAllDailyWinCheckins\(\{ skipNotify: true \}\)/);
assert.match(html, /每天三赢在 Habit repair 中被显式跳过/);

/* 去重：同日只留一行 + 稳定 id 优先 */
assert.match(html, /return "habit:dailyThreeWins:" \+ hd/);
assert.match(html, /String\(task\.id\)\.indexOf\("dw-today-"\) === 0/);

/* 删除 tombstone 例外（habitMeta 不再一律跳过） */
assert.match(
  html,
  /task\.habitMeta && String\(task\.habitMeta\.key \|\| ""\) === "dailyThreeWins"/
);

/* 「已同步」不得仅凭单次请求成功（队列未空仍同步中） */
assert.match(html, /aliyunSyncPrimaryAnyDomainFlushBusy\(\)/);
assert.match(html, /「已同步」≠ 某次 HTTP 200/);

/* 评分诊断：按行拆开，禁止硬改总分 */
assert.match(html, /function diagDoneVdDayBreakdown\(/);
assert.match(html, /window\.__diagDoneVdDayBreakdown = diagDoneVdDayBreakdown/);

/* Habit repair 仍跳过 dailyThreeWins（不得误开双路径叠双） */
const repairSkip =
  /function repairHabitDoneMirrorsAfterAliyunHabitPull[\s\S]*?if \(habitKey === "dailyThreeWins"\) return;/;
assert.match(html, repairSkip);
const rebuildSkip =
  /function rebuildMissingHabitDoneRowsForDate[\s\S]*?if \(habitKey === "dailyThreeWins"\) return;/;
assert.match(html, rebuildSkip);

/* 纯逻辑：23:02 与 23:04 不同 id，互不覆盖 */
function planDoneEnvelopeUpsert(env, mutation) {
  const id = String(mutation.id || "");
  if (!id) return env;
  if (!env.items) env.items = {};
  if (mutation.op === "upsert" && mutation.item) {
    env.items[id] = mutation.item;
  }
  return env;
}
let env = { items: {} };
env = planDoneEnvelopeUpsert(env, {
  op: "upsert",
  id: "dw-today-2026-10-04",
  item: { id: "dw-today-2026-10-04", text: "每天三赢 · …", habitMeta: { key: "dailyThreeWins", date: "2026-10-04" } }
});
env = planDoneEnvelopeUpsert(env, {
  op: "upsert",
  id: "dw-tomorrow-2026-10-05",
  item: {
    id: "dw-tomorrow-2026-10-05",
    text: "预设明天三赢 · …",
    dailyWinTomorrowMeta: { targetDateKey: "2026-10-05" }
  }
});
assert.equal(Object.keys(env.items).length, 2);
assert.ok(env.items["dw-today-2026-10-04"]);
assert.ok(env.items["dw-tomorrow-2026-10-05"]);

/* 纯逻辑：评分差 = 行级分差之和，不能硬改 */
function explainScoreGap(computerRows, phoneRows) {
  const sum = (rows) => rows.reduce((a, r) => a + Number(r.score || 0), 0);
  const byId = (rows) => {
    const m = new Map();
    rows.forEach((r) => m.set(String(r.id), r));
    return m;
  };
  const cMap = byId(computerRows);
  const pMap = byId(phoneRows);
  const onlyComputer = [];
  const onlyPhone = [];
  const scoreDiff = [];
  cMap.forEach((r, id) => {
    if (!pMap.has(id)) onlyComputer.push(r);
    else if (Number(pMap.get(id).score) !== Number(r.score)) {
      scoreDiff.push({ id, computer: r.score, phone: pMap.get(id).score });
    }
  });
  pMap.forEach((r, id) => {
    if (!cMap.has(id)) onlyPhone.push(r);
  });
  return {
    computerTotal: sum(computerRows),
    phoneTotal: sum(phoneRows),
    gap: sum(phoneRows) - sum(computerRows),
    onlyComputer,
    onlyPhone,
    scoreDiff
  };
}
const sample = explainScoreGap(
  [
    { id: "dw-today-2026-10-04", score: 1 },
    { id: "dw-tomorrow-2026-10-05", score: 1 },
    { id: "x", score: 46 }
  ],
  [
    { id: "dw-tomorrow-2026-10-05", score: 1 },
    { id: "x", score: 46 },
    { id: "y", score: 2 }
  ]
);
assert.equal(sample.computerTotal, 48);
assert.equal(sample.phoneTotal, 49);
assert.equal(sample.gap, 1);
assert.equal(sample.onlyComputer[0].id, "dw-today-2026-10-04");
assert.equal(sample.onlyPhone[0].id, "y");
assert.equal(sample.onlyPhone[0].score, 2);

console.log("OK daily-three-wins-done-sync");
