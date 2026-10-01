/**
 * 仿真：Done 域先到、AMB ref 尚未合入时，不得误删预设明天三赢 Done。
 * Habit meta bump 重试契约（静态）。
 * 运行：node _test_habit_dw_chain_race.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const outDir = "/opt/cursor/artifacts/habit-dw-chain";
fs.mkdirSync(outDir, { recursive: true });

function syncDw(state, targetDateKey, opts) {
  const skipNotify = opts && opts.skipNotify;
  const allowRemove = !!(opts && opts.allowRemove);
  const raw = state.dailyWinTomorrowRef[targetDateKey];
  const list = Array.isArray(raw) ? raw : [];
  const meaningful = list.filter((x) => x && String(x.text || "").trim());
  const should = meaningful.length >= 3;
  const idx = state.done.findIndex(
    (r) => r && r.dailyWinTomorrowMeta && r.dailyWinTomorrowMeta.targetDateKey === targetDateKey
  );
  const tombs = state.tombs || [];
  if (!should) {
    if (idx !== -1) {
      if (!allowRemove) return { action: "keep", id: state.done[idx].id, tombs };
      const id = state.done[idx].id;
      if (!skipNotify) tombs.push(id);
      state.done.splice(idx, 1);
      return { action: "remove", id, tombs };
    }
    return { action: "noop", tombs };
  }
  const stableId = "dw-tomorrow-" + targetDateKey;
  if (idx !== -1) {
    state.done[idx].text = "预设明天三赢 · ok";
    return { action: "update", id: state.done[idx].id, tombs };
  }
  state.done.unshift({
    id: stableId,
    text: "预设明天三赢 · ok",
    dailyWinTomorrowMeta: { targetDateKey, recordedDateKey: "2026-10-01" }
  });
  return { action: "create", id: stableId, tombs };
}

/* 竞态：Done 先到，AMB ref 空，reconcile/hygiene */
const tablet = {
  dailyWinTomorrowRef: {},
  done: [
    {
      id: "dw-tomorrow-2026-10-02",
      text: "预设明天三赢 · ①a；②b；③c",
      dailyWinTomorrowMeta: { targetDateKey: "2026-10-02", recordedDateKey: "2026-10-01" }
    }
  ],
  tombs: []
};
const r1 = syncDw(tablet, "2026-10-02", { skipNotify: true });
assert.equal(r1.action, "keep");
assert.equal(tablet.done.length, 1);
assert.equal(tablet.tombs.length, 0);

/* AMB 随后合入 3 条 → 更新/保留 */
tablet.dailyWinTomorrowRef["2026-10-02"] = [
  { text: "a" },
  { text: "b" },
  { text: "c" }
];
const r2 = syncDw(tablet, "2026-10-02", { skipNotify: true });
assert.ok(r2.action === "update" || r2.action === "keep");
assert.equal(tablet.done.length, 1);

/* 用户删到不足 3 条才允许 remove */
tablet.dailyWinTomorrowRef["2026-10-02"] = [{ text: "a" }];
const r3 = syncDw(tablet, "2026-10-02", { allowRemove: true });
assert.equal(r3.action, "remove");
assert.equal(tablet.done.length, 0);

/* Habit 契约 */
assert.match(html, /maxAttempts = 3/);
assert.match(html, /doneRepairedOnSkip/);
assert.match(html, /\[habit-done-chain\]/);
assert.match(html, /stableDailyWinTomorrowPresetDoneId/);

const report = {
  ok: true,
  raceKeep: r1,
  afterAmb: r2,
  userRemove: r3,
  cache: "v20261001ep"
};
fs.writeFileSync(path.join(outDir, "race-report.json"), JSON.stringify(report, null, 2));
console.log("OK habit-dw-chain-race", JSON.stringify(report));
