/**
 * 断言：Tablestore 下行审计诊断钩子已接入（不改同步策略）。
 * 运行：node _test_aliyun_ots_traffic_diag.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

assert.match(html, /exec-system-pwa-v20261002p/);
assert.match(sw, /exec-system-pwa-v20261002p/);
assert.match(html, /window\.getAliyunOtsTrafficDiag/);
assert.match(html, /window\.dumpAliyunOtsTrafficDiag/);
assert.match(html, /window\.resetAliyunOtsTrafficDiag/);
assert.match(html, /\[aliyun-ots-diag\]/);
assert.match(html, /ALIYUN_OTS_ENDPOINT_TYPE = "ots-public"/);
assert.match(html, /aliyunOtsDiagNoteEvent/);
assert.match(html, /aliyunSyncPrimaryLastPullReason/);
assert.match(html, /responseBytes/);
assert.match(html, /endpointType/);
/* 本轮不改 safety 间隔；main 仍为 12 分钟（审计结论） */
assert.match(html, /ALIYUN_DOMAINS_META_SAFETY_FULL_MS = 12 \* 60 \* 1000/);
assert.match(html, /ALIYUN_SYNC_PRIMARY_POLL_MS = 5000/);

console.log("ok: aliyun ots traffic diag hooks present (audit-only)");
