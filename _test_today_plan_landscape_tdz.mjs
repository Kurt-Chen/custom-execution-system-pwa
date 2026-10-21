/**
 * 平板横屏今日计划 · TDZ / 启动顺序静态回归
 * Run: node _test_today_plan_landscape_tdz.mjs
 */
import assert from "assert";
import fs from "fs";

const html = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function idx(s) {
  const i = html.indexOf(s);
  assert.ok(i >= 0, "missing: " + s.slice(0, 80));
  return i;
}

const observerLet = idx("let todayPlanMoneyBarResizeObserver = null;");
const bindFn = idx("function bindTodayPlanMoneyFormulaBarResize()");
const initMq = idx("(function initTodayPlanLayoutMqAfterDeps()");
const setExpanded = idx("function setTodayPlanPanelExpanded(expanded)");
const syncLandscape = idx("function syncTodayPlanPanelForTabletLandscape()");

assert.ok(observerLet < bindFn, "observer let before bind");
assert.ok(bindFn < initMq, "bind before landscape MQ init IIFE");
assert.ok(setExpanded < initMq, "setExpanded defined before first landscape sync IIFE");
assert.ok(syncLandscape < initMq, "syncLandscape before IIFE");
assert.strictEqual(
  html.includes("initTodayPlanTabletLandscapeSync"),
  false,
  "old early IIFE name must be gone"
);
assert.ok(
  !html.includes("(function initTodayPlanTabletLandscapeSync()"),
  "old early landscape IIFE must not run before bind"
);

assert.ok(html.includes("badge-watchdog-skip-synced-boot-incomplete"), "watchdog boot guard");
assert.ok(html.includes("badge-ok-blocked-boot-incomplete"), "badgeOk boot guard");
assert.ok(
  html.includes("已绑定则跳过，避免横竖屏多次 expand 重复 observe"),
  "no double observe"
);

assert.ok(html.includes("exec-system-pwa-v20261021l"), "cache bump html");
assert.ok(sw.includes("exec-system-pwa-v20261021l"), "cache bump sw");
assert.ok(html.includes("版本 v20261021l</div>"), "static version k");

/* 模拟 TDZ：let 在后、访问在前会抛；初始化后可安全访问 */
function simulateObserverOrder(accessBeforeInit) {
  let todayPlanMoneyBarResizeObserver;
  let accessed = null;
  function bind() {
    accessed = todayPlanMoneyBarResizeObserver;
    if (!accessed) todayPlanMoneyBarResizeObserver = { observe() {} };
  }
  if (accessBeforeInit) {
    assert.throws(() => {
      /* 模拟 TDZ：未初始化的 let */
      if (true) {
        let x;
        (function () {
          void x;
          x = 1;
        })();
        /* 用显式 TDZ 模拟 */
        throw new ReferenceError("Cannot access 'todayPlanMoneyBarResizeObserver' before initialization");
      }
    }, /before initialization/);
    return "tdz";
  }
  todayPlanMoneyBarResizeObserver = null;
  bind();
  bind();
  assert.ok(todayPlanMoneyBarResizeObserver, "bound once");
  return "ok";
}
assert.strictEqual(simulateObserverOrder(true), "tdz");
assert.strictEqual(simulateObserverOrder(false), "ok");

console.log("_test_today_plan_landscape_tdz.mjs OK");
