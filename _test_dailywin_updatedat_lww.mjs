/**
 * 每天三赢 AMB LWW：新建/改文案须写 updatedAt；删除已走 syncTombstones（main 已有）。
 * 运行：node _test_dailywin_updatedat_lww.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

function sliceAround(marker, before, after) {
  const i = html.indexOf(marker);
  assert.ok(i >= 0, "missing marker: " + marker);
  return html.slice(Math.max(0, i - before), i + after);
}

const createFn = sliceAround("function createDailyWin", 0, 450);
assert.match(createFn, /updatedAt:\s*now/);

const textUpdate = sliceAround('} else if (listName === "dailyWin") {\n        const it = state.dailyWin.find', 0, 280);
assert.match(textUpdate, /it\.updatedAt = Date\.now\(\)/);

const tombBlock = sliceAround(
  'listName === "dailyWin" ||\n        listName === "stopDoing"',
  0,
  280
);
assert.match(tombBlock, /recordSyncTombstone\(task\.id\)/);

assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261001dx"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261001dx"/);

function recordTieTimestampForSync(item) {
  if (!item || typeof item !== "object") return 0;
  let best = 0;
  [item.completedAt, item.updatedAt, item.createdAt].forEach(function (v) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) best = Math.max(best, n);
  });
  return best;
}

function mergePreferLocalOnTie(localArr, remoteArr) {
  const idx = new Map();
  function ingest(item, preferLocalOnTie) {
    if (!item || item.id == null) return;
    const id = String(item.id);
    const ts = recordTieTimestampForSync(item);
    const cur = idx.get(id);
    if (!cur || ts > cur.ts || (ts === cur.ts && preferLocalOnTie)) {
      idx.set(id, { item, ts });
    }
  }
  remoteArr.forEach((x) => ingest(x, false));
  localArr.forEach((x) => ingest(x, true));
  return Array.from(idx.values()).map((x) => x.item);
}

const t0 = 1_700_000_000_000;
const localStale = { id: "dw1", text: "旧文案", createdAt: t0, updatedAt: t0 };
const remoteEdited = { id: "dw1", text: "手机新文案", createdAt: t0, updatedAt: t0 + 5000 };
assert.equal(
  mergePreferLocalOnTie([localStale], [remoteEdited])[0].text,
  "手机新文案",
  "有 updatedAt 时远端改文案应胜出"
);

const localNoUpd = { id: "dw2", text: "电脑旧", createdAt: t0 };
const remoteNoUpd = { id: "dw2", text: "手机新", createdAt: t0 };
assert.equal(
  mergePreferLocalOnTie([localNoUpd], [remoteNoUpd])[0].text,
  "电脑旧",
  "无 updatedAt 平局偏本地（对照旧 bug）"
);

console.log("OK dailywin-updatedat-lww");
