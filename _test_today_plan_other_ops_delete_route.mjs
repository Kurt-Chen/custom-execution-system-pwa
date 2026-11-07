/**
 * 回归：今日计划「其他任务」删除须删实体（同 id），不是只清挂牌展示。
 * 运行：node _test_today_plan_other_ops_delete_route.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

let passed = 0;
const failed = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("PASS " + name);
  } catch (err) {
    failed.push(name);
    console.log("FAIL " + name);
    console.log("  " + (err && err.message ? err.message : String(err)));
  }
}

test("存在 deleteTodayPlanOtherTaskEntity 路由", function () {
  assert.match(html, /function deleteTodayPlanOtherTaskEntity/);
});

test("按 id 路由到 deleteWeeklyPlanMicroTask / deleteWeeklyPlanTask（不按名称）", function () {
  assert.match(
    html,
    /function deleteTodayPlanOtherTaskEntity[\s\S]*?deleteWeeklyPlanMicroTask[\s\S]*?deleteWeeklyPlanTask/
  );
  const fnSlice = html.slice(
    html.indexOf("function deleteTodayPlanOtherTaskEntity"),
    html.indexOf("function openTodayPlanOtherOpsMenu")
  );
  assert.doesNotMatch(fnSlice, /\.text\s*===|taskName|byName/);
});

test("菜单确认后调用实体删除，不再只走 removeTodayPlanOtherTask", function () {
  const openSlice = html.slice(
    html.indexOf("function openTodayPlanOtherOpsMenu"),
    html.indexOf("function toggleTodayPlanOtherOpsMenu")
  );
  assert.match(openSlice, /deleteTodayPlanOtherTaskEntity\(id\)/);
  assert.doesNotMatch(openSlice, /removeTodayPlanOtherTask\(id\)/);
});

test("触控兜底：pointerup + click；浮层 stopPropagation", function () {
  const openSlice = html.slice(
    html.indexOf("function openTodayPlanOtherOpsMenu"),
    html.indexOf("function toggleTodayPlanOtherOpsMenu")
  );
  assert.match(openSlice, /pointerup/);
  assert.match(openSlice, /addEventListener\("click", runDeleteMenuAction\)/);
  const panelSlice = html.slice(
    html.indexOf("function ensureTodayPlanOtherOpsMenuPanel"),
    html.indexOf("function deleteTodayPlanOtherTaskEntity")
  );
  assert.match(panelSlice, /stopPropagation/);
});

test("主任务删除已写 todayPlanMark tomb + 局部摘其他任务行", function () {
  const delSlice = html.slice(
    html.indexOf("function deleteWeeklyPlanTask"),
    html.indexOf("function deleteWeeklyPlanMicroTask")
  );
  assert.match(delSlice, /recordTodayPlanMarkRemoved\(hit\.id\)/);
  assert.match(delSlice, /patchTodayPlanUiAfterOtherTaskRemoved\(tid\)/);
});

test("子任务删除同样写 todayPlanMark tomb + 局部摘行（双向统一）", function () {
  const microSlice = html.slice(
    html.indexOf("function deleteWeeklyPlanMicroTask"),
    html.indexOf("function renderWeeklyPlanChrome")
  );
  assert.match(microSlice, /recordTodayPlanMarkRemoved\(mid\)/);
  assert.match(microSlice, /patchTodayPlanUiAfterOtherTaskRemoved\(mid\)/);
});

test("逻辑模型：删实体后原始清单与其他任务均无该 id；仅清挂牌则清单仍在", function () {
  const weekKey = "2026-11-03";
  const state = {
    weeklyPlan: {
      [weekKey]: [
        { id: "keep-1", text: "同名任务", todayPlanDate: "2026-11-07" },
        { id: "del-2", text: "同名任务", todayPlanDate: "2026-11-07" }
      ]
    },
    syncTombstones: Object.create(null),
    todayPlanMarkTombs: Object.create(null)
  };

  function otherIds() {
    return (state.weeklyPlan[weekKey] || [])
      .filter((t) => t && t.todayPlanDate)
      .map((t) => t.id);
  }

  function deleteEntityById(taskId) {
    const tid = String(taskId);
    Object.keys(state.weeklyPlan).forEach(function (wk) {
      state.weeklyPlan[wk] = (state.weeklyPlan[wk] || []).filter(
        (t) => !(t && String(t.id) === tid)
      );
    });
    state.syncTombstones[tid] = Date.now();
    state.todayPlanMarkTombs[tid] = Date.now();
  }

  function unpinOnly(taskId) {
    const tid = String(taskId);
    Object.keys(state.weeklyPlan).forEach(function (wk) {
      (state.weeklyPlan[wk] || []).forEach(function (t) {
        if (t && String(t.id) === tid) t.todayPlanDate = "";
      });
    });
  }

  /* 错误旧行为：仅清挂牌 → 其他任务消失但原始清单仍在 */
  const buggy = JSON.parse(JSON.stringify(state));
  const buggyState = {
    weeklyPlan: buggy.weeklyPlan,
    syncTombstones: Object.create(null),
    todayPlanMarkTombs: Object.create(null)
  };
  (function () {
    const s = buggyState;
    Object.keys(s.weeklyPlan).forEach(function (wk) {
      (s.weeklyPlan[wk] || []).forEach(function (t) {
        if (t && String(t.id) === "del-2") t.todayPlanDate = "";
      });
    });
    assert.equal(
      (s.weeklyPlan[weekKey] || []).some((t) => t && t.id === "del-2"),
      true,
      "仅清挂牌时实体仍在清单"
    );
    assert.equal(
      (s.weeklyPlan[weekKey] || []).filter((t) => t && t.todayPlanDate).map((t) => t.id).includes("del-2"),
      false
    );
  })();

  /* 正确行为：按 id 删实体 → 清单与其他任务都无；同名 keep-1 保留 */
  deleteEntityById("del-2");
  assert.equal(
    (state.weeklyPlan[weekKey] || []).some((t) => t && t.id === "del-2"),
    false
  );
  assert.deepEqual(otherIds(), ["keep-1"]);
  assert.ok(state.syncTombstones["del-2"]);
  assert.ok(state.todayPlanMarkTombs["del-2"]);
});

test("index/sw 缓存名一致", function () {
  const badge = html.match(/APP_CACHE_NAME_FOR_BADGE\s*=\s*"([^"]+)"/);
  const swCache = sw.match(/CACHE_NAME\s*=\s*"([^"]+)"/);
  assert.ok(badge && swCache);
  assert.equal(badge[1], swCache[1]);
});

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) process.exit(1);
console.log("PASS: today-plan other ops delete = entity delete by id (unified)");
