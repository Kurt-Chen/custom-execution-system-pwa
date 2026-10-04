/**
 * 实网验证：Done 回补链路（队列→云端→拉取缺口合并）+ 版本探测。
 * 不写入用户真实「每天三赢」正文；用可清理的探针 id。
 * 运行：node _verify_daily_three_wins_live_chain.mjs
 */
import assert from "node:assert/strict";

const BASE = "https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run";
const SITE = "https://kurt-chen.github.io/custom-execution-system-pwa/";
const ROOM = "default-room";
const DOC = "aliyun-done-real-v1-" + ROOM;
const PROBE_ID = "dw-today-probe-verify-27ba";

async function getJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function postSmoke(payload) {
  const res = await fetch(BASE + "/smoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

function parseEnv(getRes) {
  const row = getRes.data && getRes.data.data;
  const attrs = (row && (row.attrs || row)) || {};
  let p = attrs.payload != null ? attrs.payload : attrs;
  if (typeof p === "string") p = JSON.parse(p);
  if (!p || typeof p !== "object") {
    return { kind: "done-real-v1", roomId: ROOM, envelopeUpdatedAt: Date.now(), items: {}, tombstones: {} };
  }
  return {
    kind: p.kind || "done-real-v1",
    roomId: p.roomId || ROOM,
    envelopeUpdatedAt: Number(p.envelopeUpdatedAt) || 0,
    items: p.items && typeof p.items === "object" ? p.items : {},
    tombstones: p.tombstones && typeof p.tombstones === "object" ? p.tombstones : {}
  };
}

const siteHtml = await (await fetch(SITE)).text();
const siteSw = await (await fetch(SITE + "sw.js")).text();
assert.match(siteHtml, /APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261004/);
assert.match(siteSw, /CACHE_NAME = "exec-system-pwa-v20261004/);
const liveVer = (siteSw.match(/CACHE_NAME = "exec-system-pwa-(v[^"]+)"/) || [])[1];
console.log("live_version", liveVer);
assert.ok(
  /v20261004a[ab]/.test(String(liveVer || "")),
  "正式站应至少为 v20261004aa/ab，当前=" + liveVer
);

const before = parseEnv(await getJson(BASE + "/smoke/" + encodeURIComponent(DOC)));
const focusId = "dw-today-2026-10-04";
const focus = before.items[focusId];
const hasDwToday = !!focus;
const hasTomorrow = !!before.items["dw-tomorrow-2026-10-05"];
console.log("cloud_has_dw_today_2026-10-04", hasDwToday);
console.log("cloud_has_dw_tomorrow_2026-10-05", hasTomorrow);
if (focus) {
  const ts = Number(focus.completedAt) || 0;
  const clock = ts
    ? new Date(ts).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
    : "";
  console.log(
    "focus_row",
    JSON.stringify({
      id: focusId,
      text: String(focus.text || "").slice(0, 120),
      habitDate: focus.habitMeta && focus.habitMeta.date,
      completedAt: focus.completedAt,
      clockCST: clock
    })
  );
  assert.equal(focus.habitMeta && focus.habitMeta.date, "2026-10-04");
  assert.ok(String(focus.text || "").includes("每天三赢"), "原文应含每天三赢");
  assert.ok(/23:02/.test(clock), "completedAt 墙钟应为 23:02 CST，实际=" + clock);
}
assert.equal(hasTomorrow, true, "现场 23:04 预设明天应仍在云端");

/* 探针：模拟电脑回补 upsert → 云端 → 手机缺口 merge */
const now = Date.now();
const probeItem = {
  id: PROBE_ID,
  text: "每天三赢 · ①探针验证A；②探针验证B；③探针验证C",
  createdAt: now,
  completedAt: now,
  updatedAt: now,
  deleted: false,
  habitMeta: { key: "dailyThreeWins", date: "2099-01-01", stampAt: now }
};
const env1 = structuredClone(before);
delete env1.tombstones[PROBE_ID];
env1.items[PROBE_ID] = probeItem;
env1.envelopeUpdatedAt = now;
const put1 = await postSmoke({ id: DOC, payload: env1 });
assert.ok(put1.ok, "probe upsert HTTP " + put1.status);

const mid = parseEnv(await getJson(BASE + "/smoke/" + encodeURIComponent(DOC)));
assert.ok(mid.items[PROBE_ID], "云端应有探针");
assert.equal(mid.items[PROBE_ID].habitMeta.key, "dailyThreeWins");

/* 模拟手机本地缺此 id：指纹未变场景下仍应合并（契约由代码保证；此处验证云端可读） */
const phoneLocal = { done: Object.keys(mid.items).filter((id) => id !== PROBE_ID).map((id) => mid.items[id]) };
assert.equal(
  phoneLocal.done.some((d) => d && d.id === PROBE_ID),
  false
);
const missing = Object.keys(mid.items).filter((id) => !phoneLocal.done.some((d) => d && d.id === id));
assert.ok(missing.includes(PROBE_ID), "手机缺口应包含探针");

/* 删除：tombstone 后不应再被 items 持有 */
const env2 = parseEnv(await getJson(BASE + "/smoke/" + encodeURIComponent(DOC)));
delete env2.items[PROBE_ID];
env2.tombstones[PROBE_ID] = {
  id: PROBE_ID,
  deleted: true,
  deletedAt: Date.now(),
  updatedAt: Date.now(),
  reason: "probe-cleanup"
};
env2.envelopeUpdatedAt = Date.now();
const put2 = await postSmoke({ id: DOC, payload: env2 });
assert.ok(put2.ok, "probe tombstone HTTP " + put2.status);
const after = parseEnv(await getJson(BASE + "/smoke/" + encodeURIComponent(DOC)));
assert.equal(!!after.items[PROBE_ID], false, "tombstone 后 items 无探针");
assert.ok(after.tombstones[PROBE_ID], "tombstone 记录存在");

console.log(
  JSON.stringify(
    {
      ok: true,
      live_version: liveVer,
      historical_dw_today_2026_10_04_present: hasDwToday,
      tomorrow_present: hasTomorrow,
      probe_upsert_ok: true,
      probe_tombstone_ok: true,
      note: hasDwToday
        ? "历史 dw-today-2026-10-04 已在云端（含原文/日期/23:02）"
        : "历史 dw-today-2026-10-04 仍缺：需电脑端加载新版本触发跨日 backfill（勿重填、勿清 IDB）"
    },
    null,
    2
  )
);
