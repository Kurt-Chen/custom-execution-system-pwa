/**
 * Lists 域 flush：GET 失败 / JSON 坏包时必须中止，禁止空信封 POST 冲掉封闭清单。
 * 运行：node _test_lists_flush_abort_empty_overwrite.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261005x"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261005x"/);

assert.match(html, /function aliyunListsRealTryParseEnvelope\(/);
assert.match(html, /abort flush to avoid empty Lists overwrite/);
assert.match(html, /Lists envelope parse failed/);
assert.match(html, /拉取指纹未变但本机缺口/);
assert.match(html, /lists meta bump FAIL/);
assert.match(html, /flush FAIL requeue reason=/);

/* flush 不得再在非 404 GET 失败时仅 console.warn 后继续 POST */
const flushStart = html.indexOf("async function flushAliyunListsRealQueue()");
assert.ok(flushStart > 0, "flushAliyunListsRealQueue missing");
const flushEnd = html.indexOf("async function runAliyunListsRealPullAndMerge()", flushStart);
assert.ok(flushEnd > flushStart, "runAliyunListsRealPullAndMerge after flush missing");
const flushBody = html.slice(flushStart, flushEnd);
assert.match(flushBody, /abort flush to avoid empty Lists overwrite/);
assert.match(flushBody, /aliyunListsRealTryParseEnvelope\(rawPayload\)/);
/* 非 404 GET 失败必须 throw，不能 warn 后继续 merge/POST */
assert.match(
  flushBody,
  /console\.warn\("\[aliyun-lists-real\] GET status"[\s\S]{0,200}throw new Error\([\s\S]{0,160}abort flush to avoid empty Lists overwrite/
);

/* TryParse 契约：坏 JSON / 非对象 → ok=false */
function aliyunListsRealEmptyEnvelope() {
  return {
    kind: "lists-real-v1",
    roomId: "",
    envelopeUpdatedAt: 0,
    closedList: [],
    memo: [],
    hatersDoubtersLog: [],
    trash: [],
    tombstones: {}
  };
}
function aliyunListsRealNormalizeTrashEntries(arr) {
  return Array.isArray(arr) ? arr.slice() : [];
}
function aliyunListsRealTryParseEnvelope(rawPayload) {
  let p = rawPayload;
  if (typeof p === "string") {
    const trimmed = p.trim();
    if (!trimmed) {
      return { ok: false, reason: "empty-string", env: aliyunListsRealEmptyEnvelope() };
    }
    try {
      p = JSON.parse(trimmed);
    } catch (_e) {
      return { ok: false, reason: "json-parse", env: aliyunListsRealEmptyEnvelope() };
    }
  }
  if (!p || typeof p !== "object") {
    return { ok: false, reason: "not-object", env: aliyunListsRealEmptyEnvelope() };
  }
  const env = aliyunListsRealEmptyEnvelope();
  env.roomId = p.roomId != null ? String(p.roomId) : env.roomId;
  env.envelopeUpdatedAt = Number(p.envelopeUpdatedAt) || 0;
  if (Array.isArray(p.closedList)) env.closedList = p.closedList;
  if (Array.isArray(p.memo)) env.memo = p.memo;
  if (Array.isArray(p.hatersDoubtersLog)) env.hatersDoubtersLog = p.hatersDoubtersLog;
  if (Array.isArray(p.trash)) env.trash = aliyunListsRealNormalizeTrashEntries(p.trash);
  if (p.tombstones && typeof p.tombstones === "object") env.tombstones = p.tombstones;
  env.kind = "lists-real-v1";
  return { ok: true, reason: "ok", env: env };
}

assert.equal(aliyunListsRealTryParseEnvelope("").ok, false);
assert.equal(aliyunListsRealTryParseEnvelope("{").ok, false);
assert.equal(aliyunListsRealTryParseEnvelope(null).ok, false);
const good = aliyunListsRealTryParseEnvelope({
  closedList: [{ id: "c1", text: "desk", createdAt: 1 }],
  memo: [],
  hatersDoubtersLog: [],
  trash: [],
  tombstones: {}
});
assert.equal(good.ok, true);
assert.equal(good.env.closedList[0].id, "c1");

console.log("_test_lists_flush_abort_empty_overwrite.mjs OK");
