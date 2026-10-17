/**
 * 2026-10-17 CDT 费用只读排查 · 静态断言（不改同步行为）
 * Run: node _test_aliyun_cdt_egress_audit_20261017.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const audit = fs.readFileSync(
  path.join(root, "docs/aliyun-cdt-egress-audit-20261017.md"),
  "utf8"
);

assert.match(html, /exec-system-pwa-v20261016f/);
assert.match(html, /ALIYUN_DOMAINS_META_SAFETY_FULL_MS = 12 \* 60 \* 1000/);
assert.match(html, /ALIYUN_SYNC_PRIMARY_POLL_MS = 5000/);
assert.match(html, /window\.getAliyunOtsTrafficDiag/);
assert.match(html, /function aliyunAmbRealCloneTombstonesFromState/);
/* AMB 仍整包复制全局 syncTombstones（已知浪费源；本轮不改） */
assert.match(
  html,
  /function aliyunAmbRealCloneTombstonesFromState\(\) \{\s*const src =\s*state\.syncTombstones/s
);
/* Lists 已有作用域裁剪（对照） */
assert.match(html, /function aliyunListsRealScopeTombstonesForEnvelope/);
assert.match(audit, /云数据传输/);
assert.match(audit, /otsEndpointType.*vpc/i);
assert.match(audit, /No-Go/);
assert.match(audit, /aliyunAmbRealCloneTombstonesFromState/);

console.log("ok: aliyun CDT egress audit-20261017 static checks");
