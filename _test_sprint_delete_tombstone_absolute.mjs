/**
 * Sprint 删除：本机 syncTombstones 绝对优先于云端偏高 updatedAt。
 * 运行：node _test_sprint_delete_tombstone_absolute.mjs
 */
import assert from "node:assert/strict";

function shouldSkipRemoteImport(localTombAt, rTs, legacyCompare) {
  if (!(localTombAt > 0)) return false;
  if (legacyCompare) return localTombAt >= rTs;
  return true; /* fixed: absolute */
}

const t0 = 1_700_000_000_000;
let passed = 0;
let failed = [];

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

test("LEGACY 云端抬高 updatedAt 可压过本机删除 tomb → 删不掉", function () {
  const tombAt = t0 + 1000;
  const cloudInflated = t0 + 999999;
  assert.equal(shouldSkipRemoteImport(tombAt, cloudInflated, true), false);
});

test("FIXED 本机 tomb 绝对跳过云端导入，无论 rTs", function () {
  const tombAt = t0 + 1000;
  const cloudInflated = t0 + 999999;
  assert.equal(shouldSkipRemoteImport(tombAt, cloudInflated, false), true);
  assert.equal(shouldSkipRemoteImport(tombAt, tombAt - 1, false), true);
  assert.equal(shouldSkipRemoteImport(0, cloudInflated, false), false);
});

test("三任务场景：删除后云端旧副本不得并回", function () {
  const ids = ["a", "b", "c"];
  const tombs = { a: t0 + 10, b: t0 + 11, c: t0 + 12 };
  const cloud = {
    a: { updatedAt: t0 + 50000 },
    b: { updatedAt: t0 + 80000 },
    c: { updatedAt: t0 + 120000 }
  };
  const kept = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (shouldSkipRemoteImport(tombs[id], cloud[id].updatedAt, false)) continue;
    kept.push(id);
  }
  assert.deepEqual(kept, []);
});

console.log("");
console.log("passed=" + passed + " failed=" + failed.length);
if (failed.length) process.exit(1);
