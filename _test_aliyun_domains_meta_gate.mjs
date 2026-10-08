/**
 * Phase 1b domains meta gate · 纯逻辑单测（不打真实 FC）
 * Run: node _test_aliyun_domains_meta_gate.mjs
 */
import assert from "assert";
import fs from "fs";

const html = fs.readFileSync("index.html", "utf8");

function mustInclude(s, label) {
  assert.ok(html.includes(s), "missing: " + label);
}

mustInclude("aliyun-meta-v1-domains-", "domains meta doc id");
mustInclude("domains-meta-v1", "domains meta kind");
mustInclude("[Sync Check]", "sync check log");
mustInclude("skippedFullPull=", "skippedFullPull log");
mustInclude("savedEstimatedKB=", "savedEstimatedKB log");
mustInclude('aliyunDomainsMetaBumpDomain("done")', "done bump");
mustInclude('aliyunDomainsMetaBumpDomain("habit"', "habit bump");
mustInclude('aliyunDomainsMetaBumpDomain("forge")', "forge bump");
mustInclude('aliyunDomainsMetaBumpDomain("goals")', "goals bump");
mustInclude("runAliyunSyncPrimaryBootPull({ reason: pullReason })", "poll passes reason");
mustInclude("Phase 1b", "phase 1b marker");
mustInclude("exec-system-pwa-v20261002p", "cache bump in html");
assert.ok(
  fs.readFileSync("sw.js", "utf8").includes("exec-system-pwa-v20261002p"),
  "cache bump in sw"
);

/* 抽出 decide 的核心比较逻辑做表驱动测试（与实现一致） */
function decidePullIds(ids, remoteVersions, lastSeen) {
  const pullIds = [];
  const skipIds = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const remoteV = Number(remoteVersions && remoteVersions[id]);
    const localV = lastSeen[id];
    if (localV == null || !Number.isFinite(Number(localV))) {
      pullIds.push(id);
      continue;
    }
    if (!Number.isFinite(remoteV) || Number(remoteV) !== Number(localV)) {
      pullIds.push(id);
    } else {
      skipIds.push(id);
    }
  }
  return { pullIds, skipIds, skipAll: pullIds.length === 0 };
}

const ids = ["done", "habit", "forge"];

{
  const r = decidePullIds(ids, { done: 1, habit: 1, forge: 1 }, { done: 1, habit: 1, forge: 1 });
  assert.deepStrictEqual(r.pullIds, []);
  assert.strictEqual(r.skipAll, true);
}

{
  const r = decidePullIds(ids, { done: 2, habit: 1, forge: 1 }, { done: 1, habit: 1, forge: 1 });
  assert.deepStrictEqual(r.pullIds, ["done"]);
  assert.deepStrictEqual(r.skipIds, ["habit", "forge"]);
  assert.strictEqual(r.skipAll, false);
}

{
  const r = decidePullIds(ids, { done: 1, habit: 5, forge: 3 }, { done: 1, habit: 4, forge: 3 });
  assert.deepStrictEqual(r.pullIds, ["habit"]);
}

{
  /* lastSeen 空 → 全部拉 */
  const r = decidePullIds(ids, { done: 1, habit: 1, forge: 1 }, {});
  assert.deepStrictEqual(r.pullIds, ["done", "habit", "forge"]);
}

/* bump RMW 语义：保留他域版本 */
function bumpOne(versions, lastSeen, domainId) {
  const next = Object.assign({}, versions);
  const floorV = Math.max(Number(next[domainId]) || 0, Number(lastSeen[domainId]) || 0);
  next[domainId] = floorV + 1;
  return next;
}
{
  const v = bumpOne({ done: 3, habit: 8, forge: 2 }, { done: 3, habit: 8, forge: 2 }, "done");
  assert.deepStrictEqual(v, { done: 4, habit: 8, forge: 2 });
}

console.log("ok: aliyun domains meta gate tests passed");
