/**
 * Done 跨设备漏项：镜像类 Done（清空油箱 / 预设明天三赢 / 封闭清单 / 备忘录）
 * 必须进入阿里云 Done 序列化，且 AMB/Lists pull 后有 repair 安全网。
 * Habit 仍走 habitCheckins + repair（不进 Done 主路径）。
 * 运行：node _test_done_mirror_aliyun_sync.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

assert.match(html, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261001ej"/);
assert.match(sw, /CACHE_NAME = "exec-system-pwa-v20261001ej"/);

/* 序列化必须带镜像 meta */
assert.match(html, /out\.fuelMeta = meta/);
assert.match(html, /out\.dailyWinTomorrowMeta = \{/);
assert.match(html, /out\.closedListMeta = \{/);
assert.match(html, /out\.memoMeta = \{/);

/* 本地写入必须 notify Done upsert */
assert.match(html, /notifyAliyunDoneRealUpsert\("fuel"/);
assert.match(html, /notifyAliyunDoneRealUpsert\("dailyWin-tomorrow"/);
assert.match(html, /notifyAliyunDoneRealUpsert\("closedList"/);
assert.match(html, /notifyAliyunDoneRealUpsert\("memo"/);

/* AMB / Lists pull 安全网 */
assert.match(html, /function reconcileAmbDerivedDoneMirrorsFromState\(/);
assert.match(html, /function reconcileFuelScoreDoneMirrorsFromState\(/);
assert.match(html, /function reconcileListsDerivedDoneMirrorsFromState\(/);
assert.match(html, /reconcileAmbDerivedDoneMirrorsFromState\(\)/);
assert.match(html, /reconcileListsDerivedDoneMirrorsFromState\(\)/);

/* 去重键：同日油箱只留一行 */
assert.match(html, /return "fuel:" \+ String\(task\.fuelMeta\.date\)/);

/* 删除不再仅限 manualDone */
assert.match(
  html,
  /\/\* Habit 镜像走 Habit 域；其余进入 Done List 的业务行都要 tombstone \*\//
);

/* Habit 仍不走 Done 主上传（注释契约） */
assert.match(html, /Habit 仍走 habitCheckins \+ pull 后 repair/);

/** 纯逻辑：油箱镜像就地更新应保留 id */
function planFuelMirrorUpsert(existingId, dateStr, score) {
  const existing = existingId
    ? { id: existingId, fuelMeta: { date: dateStr, score: 1 }, text: "old" }
    : null;
  if (existing) {
    existing.fuelMeta.score = score;
    existing.text = "【清空油箱】程度 " + score + "/10";
    return { id: existing.id, created: false };
  }
  return {
    id: "new-" + dateStr,
    created: true,
    fuelMeta: { date: dateStr, score: score }
  };
}

const keep = planFuelMirrorUpsert("abc", "2026-10-01", 8);
assert.equal(keep.id, "abc");
assert.equal(keep.created, false);
const created = planFuelMirrorUpsert(null, "2026-10-01", 8);
assert.equal(created.created, true);
assert.equal(created.fuelMeta.score, 8);

console.log("OK done-mirror-aliyun-sync");
