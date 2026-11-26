/**
 * 回归：电脑端其他任务领先云端 Sprint（真实故障 v20261126i 证据）。
 * - marks 有、Sprint 今日集合无（mwwxbwwxv50ru）
 * - 本机 done=true / 云端 done=false（mwsfjbbg2j0t0）
 * - suppress 期间仍须入队；拉取丢 upsert 后须回补
 * - content-gap 须识别 mainDone / localOnlyToday
 * - 无业务变化 merge 不得抬 updatedAt
 * 运行：node _test_sprint_local_ahead_upload_heal.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

const badge = html.match(/APP_CACHE_NAME_FOR_BADGE\s*=\s*"([^"]+)"/);
const swCache = sw.match(/CACHE_NAME\s*=\s*"([^"]+)"/);
assert.equal(badge[1], swCache[1]);
assert.match(badge[1], /v20261126j$/);

/* 契约：suppress 下 notify 仍可入队；flush 才受 suppress 门闩 */
assert.match(html, /queuedUnderSuppress:\s*!!aliyunSprintRealSuppressPush/);
assert.match(html, /function aliyunSprintRealHealLocalAheadAfterPull/);
assert.match(html, /function aliyunSprintRealFlushLocalDirty/);
assert.match(html, /function aliyunSprintRealMergeUpsertWhenClockLoses/);
assert.match(html, /function aliyunSprintRealBusinessSig/);
assert.match(html, /localOnlyToday/);
assert.match(html, /cloud-mark-present-sprint-body-missing/);
assert.match(html, /domains-meta-skip-dirty/);
assert.match(html, /pull-noop-but-local-ahead/);
assert.match(html, /idPresence/);
assert.match(html, /todayPlanMarksSource/);

const notifyUpsert = html.slice(
  html.indexOf("function notifyAliyunSprintRealUpsert"),
  html.indexOf("function notifyAliyunSprintRealForTaskId")
);
assert.doesNotMatch(notifyUpsert, /aliyunSprintRealSuppressPush/);

const sched = html.slice(
  html.indexOf("function scheduleAliyunSprintRealSync"),
  html.indexOf("function notifyAliyunSprintRealUpsert")
);
assert.match(sched, /if \(aliyunSprintRealSuppressPush\) return;/);

/* content-gap：mainDone + localOnly */
const probeStart = html.indexOf("function aliyunSprintRealProbeUnchangedContentGap");
const probeEnd = html.indexOf("function aliyunTodayPlanRealProbeUnchangedContentGap", probeStart);
const probeBody = html.slice(probeStart, probeEnd);
assert.match(probeBody, /isWeeklyPlanMainComplete|mainDone/);
assert.match(probeBody, /localOnlyToday/);
assert.doesNotMatch(
  probeBody,
  /const lDone = !!\(local\.completed \|\| local\.status === "done" \|\| local\.done\);/
);

/* 单元：businessSig / diverges / assess firstGap 优先级 */
const helpersStart = html.indexOf("function aliyunSprintRealBusinessSig");
const helpersEnd = html.indexOf("function scheduleAliyunSprintRealSync", helpersStart);
const itemTsStart = html.indexOf("function aliyunSprintRealItemTs");
const itemTsEnd = html.indexOf("function aliyunSprintRealNormalizeWeekKey", itemTsStart);
const e2eStart = html.indexOf("function todayPlanSyncDiagBuildE2eTrace");
const e2eEnd = html.indexOf("function todayPlanSyncDiagBuildDomainCards", e2eStart);
const idSetStart = html.indexOf("function todayPlanSyncDiagIdSet");
const idSetEnd = html.indexOf("function todayPlanSyncDiagDiffIds", idSetStart);

const stub = `
import assert from "node:assert/strict";
${html.slice(itemTsStart, itemTsEnd)}
${html.slice(helpersStart, helpersEnd)}
${html.slice(idSetStart, e2eEnd)}

function isWeeklyPlanMainComplete(t) { return !!(t && t.mainDone); }
function normalizeWeeklyPlanTodayPlanDate(v) {
  return typeof v === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(v.trim()) ? v.trim() : "";
}

// mwsfjbbg2j0t0: local done ahead of cloud
const localDone = {
  id: "mwsfjbbg2j0t0",
  text: "晚上吃酱牛肉+一包荞麦方便面",
  mainDone: true,
  todayPlanDate: "2026-11-26",
  updatedAt: 1795695997641,
  statusAt: 1795695997641
};
const cloudUndone = {
  id: "mwsfjbbg2j0t0",
  text: "晚上吃酱牛肉+一包荞麦方便面",
  mainDone: false,
  todayPlanDate: "2026-11-26",
  updatedAt: 1795387793164,
  weekKey: "2026-11-25"
};
assert.equal(aliyunSprintRealLocalDivergesFromRemote(localDone, cloudUndone), true);
assert.notEqual(aliyunSprintRealBusinessSig(localDone), aliyunSprintRealBusinessSig(cloudUndone));

// noop same business
const local2 = Object.assign({}, localDone);
assert.equal(aliyunSprintRealBusinessSig(localDone), aliyunSprintRealBusinessSig(local2));

// e2eTrace: mark+local body but no cloud sprint today → sprint-body-missing（非 mark-missing 假阳性）
const localSurf = {
  todayKey: "2026-11-26",
  otherToday: {
    items: [
      {
        id: "mwwxbwwxv50ru",
        done: true,
        text24: "GPT充值",
        textHash: "cd9080db",
        todayPlanDate: "2026-11-26"
      },
      {
        id: "mwsfjbbg2j0t0",
        done: true,
        text24: "晚上吃酱牛肉+一包荞麦方便面",
        textHash: "cc4196fd",
        todayPlanDate: "2026-11-26"
      }
    ]
  },
  todayPlanMarksForToday: []
};
const cloudPeek = {
  todayPlan: {
    ok: true,
    marksForToday: [
      { id: "mwwxbwwxv50ru", date: "2026-11-26" },
      { id: "mwsfjbbg2j0t0", date: "2026-11-26" }
    ]
  },
  sprint: {
    ok: true,
    items: [
      {
        id: "mwsfjbbg2j0t0",
        done: false,
        text24: "晚上吃酱牛肉+一包荞麦方便面",
        textHash: "cc4196fd"
      }
    ],
    idPresence: {
      mwwxbwwxv50ru: { present: false },
      mwsfjbbg2j0t0: {
        present: true,
        todayPlanDate: "2026-11-26",
        mainDone: false
      }
    }
  }
};
const tr = todayPlanSyncDiagBuildE2eTrace(localSurf, cloudPeek);
const byId = Object.create(null);
tr.tasks.forEach((x) => (byId[x.id] = x.firstGap));
assert.equal(byId["mwwxbwwxv50ru"], "cloud-mark-present-sprint-body-missing");
assert.equal(byId["mwsfjbbg2j0t0"], "body-present-but-content-or-done-mismatch");
console.log(JSON.stringify({ gaps: byId, ok: true }));
`;

const tmp = path.join(ROOT, "_tmp_sprint_local_ahead.mjs");
writeFileSync(tmp, stub);
const run = spawnSync(process.execPath, [tmp], { encoding: "utf8" });
unlinkSync(tmp);
assert.equal(run.status, 0, run.stderr || run.stdout);
const out = JSON.parse(run.stdout.trim().split("\n").pop());
assert.equal(out.ok, true);

console.log("ok: sprint local-ahead upload heal");
