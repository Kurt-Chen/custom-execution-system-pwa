/**
 * 其他任务：昨日已完成不显示在今日（纯 Node）。
 * 覆盖：todayPlanDate 被结转到今天后，completedAt/statusAt 仍属昨日 → 应过滤。
 * 运行：node _test_today_plan_hide_yesterday_done.mjs
 */
import assert from "node:assert/strict";

function normalizeWeeklyPlanTodayPlanDate(value) {
  if (typeof value !== "string") return "";
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}

function normalizeWeeklyPlanCompletedAtMs(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatDateInputValue(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function isWeeklyPlanMainComplete(task) {
  const micros = Array.isArray(task.microTasks) ? task.microTasks : [];
  if (micros.length > 0) return micros.every((m) => m.done);
  return Boolean(task.mainDone);
}

function getWeeklyPlanMainCompletionFromMicros(task) {
  const micros = task && Array.isArray(task.microTasks) ? task.microTasks : [];
  if (!micros.length) return null;
  let latest = null;
  micros.forEach(function (m) {
    const ts = normalizeWeeklyPlanCompletedAtMs(m && m.completedAt);
    if (ts != null && (latest == null || ts > latest)) latest = ts;
  });
  return latest;
}

function getWeeklyPlanTaskCompletedDateKey(task) {
  if (!task || !isWeeklyPlanMainComplete(task)) return "";
  let ms = normalizeWeeklyPlanCompletedAtMs(task.completedAt);
  if (ms == null) ms = getWeeklyPlanMainCompletionFromMicros(task);
  if (ms == null) {
    const st = Number(task.statusAt) || 0;
    if (st > 0) ms = st;
  }
  if (ms == null || !(ms > 0)) return "";
  return formatDateInputValue(new Date(ms));
}

/** 与 index.html collectRawWeeklyPlanTasksForTodayPlan 过滤语义一致 */
function collectRaw(plan, todayKey) {
  const out = [];
  const seen = Object.create(null);
  const want = normalizeWeeklyPlanTodayPlanDate(todayKey);
  if (!want) return out;
  const keys = Object.keys(plan);
  for (let i = 0; i < keys.length; i++) {
    const arr = plan[keys[i]];
    if (!Array.isArray(arr)) continue;
    for (let j = 0; j < arr.length; j++) {
      const task = arr[j];
      if (!task) continue;
      const date = normalizeWeeklyPlanTodayPlanDate(task.todayPlanDate);
      if (!date) continue;
      if (date === want) {
        if (isWeeklyPlanMainComplete(task)) {
          const doneDay = getWeeklyPlanTaskCompletedDateKey(task);
          if (doneDay && doneDay < want) continue;
        }
      } else if (date < want && !isWeeklyPlanMainComplete(task)) {
        /* keep */
      } else {
        continue;
      }
      const id = String(task.id || "");
      if (!id || seen[id]) continue;
      seen[id] = 1;
      out.push(task);
    }
  }
  return out;
}

/** 与 retireCompletedTodayPlanOtherTasksBeforeToday 摘牌条件一致 */
function shouldRetire(task, todayKey) {
  const date = normalizeWeeklyPlanTodayPlanDate(task.todayPlanDate);
  if (!date) return false;
  if (!isWeeklyPlanMainComplete(task)) return false;
  const doneDay = getWeeklyPlanTaskCompletedDateKey(task);
  const pastHang = date < todayKey;
  const doneBeforeToday = !!(doneDay && doneDay < todayKey);
  return pastHang || doneBeforeToday;
}

const today = "2026-10-04";
const yesterdayMs = Date.parse("2026-10-03T15:00:00");
const todayMs = Date.parse("2026-10-04T10:00:00");

const plan = {
  "2026-10-01": [
    {
      id: "y-done",
      text: "理发染发",
      mainDone: true,
      todayPlanDate: today, /* 结转残留 */
      completedAt: yesterdayMs,
      statusAt: yesterdayMs
    },
    {
      id: "y-done-status",
      text: "继续优化阿里云计费",
      mainDone: true,
      todayPlanDate: today,
      statusAt: yesterdayMs
    },
    {
      id: "t-done",
      text: "今日已打卡",
      mainDone: true,
      todayPlanDate: today,
      completedAt: todayMs,
      statusAt: todayMs
    },
    {
      id: "t-open",
      text: "看《洛奇》",
      mainDone: false,
      todayPlanDate: today
    },
    {
      id: "past-open",
      text: "昨日未完成结转",
      mainDone: false,
      todayPlanDate: "2026-10-03"
    },
    {
      id: "past-done-hang",
      text: "昨日完成仍挂昨日",
      mainDone: true,
      todayPlanDate: "2026-10-03",
      completedAt: yesterdayMs
    }
  ]
};

const visible = collectRaw(plan, today).map((t) => t.id);
assert.deepEqual(
  visible.sort(),
  ["past-open", "t-done", "t-open"].sort(),
  "昨日完成（含仅 statusAt）不得进入今日；今日完成/未完成与过去未完成应可见"
);

assert.equal(shouldRetire(plan["2026-10-01"][0], today), true, "结转残留的昨日完成应摘牌");
assert.equal(shouldRetire(plan["2026-10-01"][1], today), true, "仅 statusAt 的昨日完成应摘牌");
assert.equal(shouldRetire(plan["2026-10-01"][2], today), false, "今日完成不摘牌");
assert.equal(shouldRetire(plan["2026-10-01"][5], today), true, "挂牌日已过的已完成应摘牌");

console.log("ok: today-plan hide yesterday done");
