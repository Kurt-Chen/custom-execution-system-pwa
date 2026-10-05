/**
 * Lists 域：
 * 1) flush GET/解析失败必须 abort，禁止空信封覆盖封闭清单
 * 2) 信封 tombstone 必须裁剪，禁止把全局数万 syncTombstones 写入 OTS
 * 运行：node _test_lists_flush_abort_empty_overwrite.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261005y"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261005y"/);

assert.match(html, /function aliyunListsRealTryParseEnvelope\(/);
assert.match(html, /abort flush to avoid empty Lists overwrite/);
assert.match(html, /Lists envelope parse failed/);
assert.match(html, /拉取指纹未变但本机缺口/);
assert.match(html, /lists meta bump FAIL/);
assert.match(html, /flush FAIL requeue reason=/);
assert.match(html, /function aliyunListsRealScopeTombstonesForEnvelope\(/);
assert.match(html, /ALIYUN_LISTS_ENVELOPE_TOMBSTONE_MAX = 2000/);
assert.match(html, /tombstone-prune-heal/);
assert.match(html, /Lists soft-fail \(no hard badge\)/);

const flushStart = html.indexOf("async function flushAliyunListsRealQueue()");
assert.ok(flushStart > 0, "flushAliyunListsRealQueue missing");
const flushEnd = html.indexOf("async function runAliyunListsRealPullAndMerge()", flushStart);
assert.ok(flushEnd > flushStart, "runAliyunListsRealPullAndMerge after flush missing");
const flushBody = html.slice(flushStart, flushEnd);
assert.match(flushBody, /abort flush to avoid empty Lists overwrite/);
assert.match(flushBody, /aliyunListsRealTryParseEnvelope\(rawPayload\)/);
assert.match(
  flushBody,
  /console\.warn\("\[aliyun-lists-real\] GET status"[\s\S]{0,200}throw new Error\([\s\S]{0,160}abort flush to avoid empty Lists overwrite/
);

/* —— 纯逻辑：scope 后信封远小于污染的远端 tombstones —— */
const ALIYUN_LISTS_ENVELOPE_TOMBSTONE_MAX = 2000;
const ALIYUN_LISTS_ENVELOPE_TOMBSTONE_LOCAL_EXTRA = 300;

function aliyunListsRealCollectSliceIds(slice) {
  const ids = Object.create(null);
  if (!slice || typeof slice !== "object") return ids;
  const keys = ["closedList", "memo", "hatersDoubtersLog", "trash"];
  for (let k = 0; k < keys.length; k++) {
    const arr = slice[keys[k]];
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      if (it && it.id != null) ids[String(it.id)] = true;
    }
  }
  return ids;
}

function aliyunListsRealScopeTombstonesForEnvelope(mergedTs, localTs, locSlice, remSlice, mergedSlice) {
  const live = aliyunListsRealCollectSliceIds(mergedSlice);
  const locIds = aliyunListsRealCollectSliceIds(locSlice);
  const remIds = aliyunListsRealCollectSliceIds(remSlice);
  Object.keys(locIds).forEach(function (id) {
    live[id] = true;
  });
  Object.keys(remIds).forEach(function (id) {
    live[id] = true;
  });
  const src = mergedTs && typeof mergedTs === "object" ? mergedTs : {};
  const out = {};
  Object.keys(src).forEach(function (k) {
    if (!live[k]) return;
    const v = Number(src[k]);
    if (Number.isFinite(v) && v > 0) out[k] = v;
  });
  const locSrc = localTs && typeof localTs === "object" ? localTs : {};
  const extras = [];
  Object.keys(locSrc).forEach(function (k) {
    if (out[k]) return;
    const v = Number(locSrc[k]);
    if (Number.isFinite(v) && v > 0) extras.push([k, v]);
  });
  extras.sort(function (a, b) {
    return b[1] - a[1];
  });
  const extraBudget = Math.min(
    ALIYUN_LISTS_ENVELOPE_TOMBSTONE_LOCAL_EXTRA,
    Math.max(0, ALIYUN_LISTS_ENVELOPE_TOMBSTONE_MAX - Object.keys(out).length)
  );
  for (let i = 0; i < extras.length && i < extraBudget; i++) {
    out[extras[i][0]] = extras[i][1];
  }
  const keys = Object.keys(out);
  if (keys.length > ALIYUN_LISTS_ENVELOPE_TOMBSTONE_MAX) {
    keys.sort(function (a, b) {
      return out[a] - out[b];
    });
    const drop = keys.length - ALIYUN_LISTS_ENVELOPE_TOMBSTONE_MAX;
    for (let d = 0; d < drop; d++) delete out[keys[d]];
  }
  return out;
}

const bloated = {};
for (let i = 0; i < 64495; i++) bloated["polluted" + i] = 1791168263371 - i;
bloated.c1 = 1791168263371;
const loc = {
  closedList: [{ id: "c1", text: "desk", createdAt: 1 }],
  memo: [],
  hatersDoubtersLog: [],
  trash: []
};
const rem = {
  closedList: [{ id: "c1", text: "desk", createdAt: 1 }],
  memo: [],
  hatersDoubtersLog: [],
  trash: [],
  tombstones: bloated
};
const scoped = aliyunListsRealScopeTombstonesForEnvelope(
  Object.assign({}, bloated),
  { c1: 1791168263371, foreverDel: 1791168263400 },
  loc,
  rem,
  loc
);
assert.ok(Object.keys(scoped).length <= ALIYUN_LISTS_ENVELOPE_TOMBSTONE_MAX);
assert.equal(scoped.c1, 1791168263371);
assert.equal(scoped.foreverDel, 1791168263400);
assert.equal(scoped.polluted0, undefined);
const scopedJson = JSON.stringify(scoped);
assert.ok(scopedJson.length < 50000, "scoped tombstones should be tiny, got " + scopedJson.length);

console.log("_test_lists_flush_abort_empty_overwrite.mjs OK");
