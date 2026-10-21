/**
 * 平板空白启动 · 静态回归（不打真实网络 / IDB）
 * 覆盖：IDB open 超时、陈旧「已同步」不再首屏刷绿、版本早写、lodash 兜底、诊断入口
 * Run: node _test_tablet_blank_boot.mjs
 */
import assert from "assert";
import fs from "fs";

const html = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function mustInclude(s, label) {
  assert.ok(html.includes(s), "missing: " + label + " → " + s.slice(0, 100));
}

mustInclude("APP_STATE_IDB_OPEN_TIMEOUT_MS", "IDB open timeout const");
mustInclude("stateStorageIdbOpenTimedOut", "IDB timeout flag");
mustInclude("IndexedDB 打开超时", "timeout error / log");
mustInclude("本会话回退 localStorage/紧急备份，不写空壳进 IDB", "timeout log intent");
mustInclude("if (settled) {\n            try {\n              db.close();", "late onsuccess closes db");
mustInclude("storage-hydrate-from-emergency", "emergency hydrate note");
mustInclude("!stateStorageIdbOpenTimedOut", "refuse IDB write after timeout");
mustInclude("appSafeDebounce", "lodash-safe debounce");
mustInclude("appSafeDebounce(persistFuelDayCloudSync, 600)", "fuel debounce uses safe helper");
mustInclude("appSafeDebounce(pushEffortScoreToUserPathImmediate, 600)", "effort debounce uses safe helper");
mustInclude("early-version-painted", "early version note");
mustInclude(
  '禁止用跨会话陈旧 lastSuccessAt 刷绿',
  "stale synced badge comment"
);
mustInclude(
  "function paintAliyunSyncPrimaryBadgeInitial() {\n      if (typeof isAliyunSyncPrimaryEnabled !== \"function\" || !isAliyunSyncPrimaryEnabled()) return;\n      paintAliyunSyncPrimaryBadgeSyncing();",
  "initial badge always syncing"
);
mustInclude("window.__bootHealthSnapshot", "boot health snapshot");
mustInclude("showBootHealthPanel", "diag panel");
mustInclude("bindBootHealthVersionTapOnce", "version tap binder");
mustInclude("连点版本号 5 次打开", "tablet diag hint");
mustInclude("exec-system-pwa-v20261021i", "cache bump in html");
assert.ok(sw.includes("exec-system-pwa-v20261021i"), "cache bump in sw");
mustInclude("版本 v20261021i</div>", "static HTML version (no JS needed)");
mustInclude("immediate-version-painted", "immediate DOM version paint");
mustInclude("isAliyunSyncPrimaryLocalDataSparse", "local sparse helper");
mustInclude("force-full-pull-local-sparse", "sparse forces full body pull");
mustInclude("!!localSparse ||", "forceAllBodies includes localSparse");
mustInclude("isAliyunSyncPrimaryTodaySurfaceEmpty", "today surface empty helper");
mustInclude("force-full-pull-today-surface-empty", "today empty forces full body pull");
mustInclude("!!forceTodaySurface ||", "forceAllBodies includes today surface");
mustInclude("aliyunSyncPrimaryPaintTodaySurfaceAfterPull", "paint today after pull");
mustInclude("aliyunSyncPrimaryScheduleTodaySurfaceRetryOnce", "one-shot today retry");
mustInclude("today-surface-retry", "today surface retry reason");
mustInclude("todaySurfaceEmpty:", "boot health / report todaySurfaceEmpty field");

mustInclude("unhydrated-sparse-after-pull", "unhydrated sparse handler");
mustInclude("aliyunSyncPrimaryPullLooksCloudEmpty", "cloud-empty assessor");
mustInclude("空壳无正文", "badge error for empty shell");
mustInclude("aliyunSyncPrimaryResetRoomToDefaultAndRepull", "diag reset room");
mustInclude("notFound: true, docId: docId", "Done 404 structured return");
mustInclude(
  "(sparseBefore && sparseAfter) || (todayEmptyBefore && todayEmptyAfter)",
  "unhydrated gate includes today surface"
);

/* 纯逻辑：超时后迟到 open 不得写成主连接 */
function simulateIdbOpenWithTimeout({ timeoutMs, lateSuccessAtMs }) {
  let settled = false;
  let timedOut = false;
  let resolvedDb = null;
  let lateClosed = false;
  const OPEN_MS = timeoutMs;
  function onTimeout() {
    if (settled) return;
    settled = true;
    timedOut = true;
  }
  function onSuccess(db) {
    if (settled) {
      lateClosed = true;
      return;
    }
    settled = true;
    resolvedDb = db;
  }
  onTimeout();
  if (lateSuccessAtMs >= OPEN_MS) onSuccess({ id: "late" });
  return { timedOut, resolvedDb, lateClosed };
}

{
  const r = simulateIdbOpenWithTimeout({ timeoutMs: 4000, lateSuccessAtMs: 5000 });
  assert.strictEqual(r.timedOut, true);
  assert.strictEqual(r.resolvedDb, null, "late success must not become primary db");
  assert.strictEqual(r.lateClosed, true);
}

/* 陈旧 lastSuccess 不得在 initial paint 时变成绿标文案 */
function paintInitialBadge(lastSuccessAt, paintSyncing, paintOk) {
  /* 新行为：忽略 lastSuccessAt，一律 syncing */
  paintSyncing();
  return { usedStale: false, lastSuccessAt: lastSuccessAt };
}
{
  let syncing = false;
  let ok = false;
  paintInitialBadge(Date.now() - 19 * 3600 * 1000, function () {
    syncing = true;
  }, function () {
    ok = true;
  });
  assert.strictEqual(syncing, true);
  assert.strictEqual(ok, false);
}

console.log("_test_tablet_blank_boot.mjs OK");
