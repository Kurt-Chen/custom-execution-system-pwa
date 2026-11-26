/**
 * 今日计划端到端诊断 v2：契约 + firstGap 逻辑单元。
 * 运行：node _test_today_plan_e2e_diag_trace.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

const badge = html.match(/APP_CACHE_NAME_FOR_BADGE\s*=\s*"([^"]+)"/);
const swCache = sw.match(/CACHE_NAME\s*=\s*"([^"]+)"/);
assert.equal(badge[1], swCache[1]);
assert.match(badge[1], /v20261126h$/);

assert.match(html, /diag:\s*"today-plan-sync-v2-e2e"/);
assert.match(html, /function todayPlanSyncDiagBuildE2eTrace\s*\(/);
assert.match(html, /function todayPlanSyncDiagBuildDomainCards\s*\(/);
assert.match(html, /function todayPlanSyncDiagDiffIds\s*\(/);
assert.match(html, /metaLag/);
assert.match(html, /完整端到端诊断/);
assert.match(html, /isExpectedBuild/);
assert.match(html, /domainsMeta/);
assert.match(html, /activelyFlushing/);
assert.match(html, /cloud-mark-present-local-body-missing/);

const peekStart = html.indexOf("async function todayPlanSyncDiagCloudPeekReadonly");
const peekEnd = html.indexOf("async function buildTodayPlanSyncDiagSnapshot", peekStart);
const peekBody = html.slice(peekStart, peekEnd);
assert.doesNotMatch(peekBody, /aliyunExpFetchJson\(\s*"POST"/i);
assert.doesNotMatch(peekBody, /saveState\s*\(/);
assert.match(peekBody, /aliyunDomainsMetaFetch/);

const fnStart = html.indexOf("function todayPlanSyncDiagBuildE2eTrace");
const fnEnd = html.indexOf("function todayPlanSyncDiagBuildDomainCards", fnStart);
const idStart = html.indexOf("function todayPlanSyncDiagIdSet");
const stub = `
${html.slice(idStart, fnEnd)}
const local = {
  todayKey: "2026-11-26",
  otherToday: {
    items: [{ id: "local-only", done: false, text24: "本机独有", textHash: "a" }]
  },
  todayPlanMarksForToday: [{ id: "local-only", date: "2026-11-26" }]
};
const cloud = {
  todayPlan: {
    ok: true,
    marksForToday: [
      { id: "cloud-mark-1", date: "2026-11-26" },
      { id: "mismatch-1", date: "2026-11-26" }
    ]
  },
  sprint: {
    ok: true,
    items: [
      { id: "cloud-mark-1", done: false, text24: "云端任务", textHash: "b" },
      { id: "mismatch-1", done: true, text24: "同文案", textHash: "c" }
    ]
  }
};
local.otherToday.items.push({
  id: "mismatch-1",
  done: false,
  text24: "同文案",
  textHash: "c"
});
local.todayPlanMarksForToday.push({ id: "mismatch-1", date: "2026-11-26" });
const tr = todayPlanSyncDiagBuildE2eTrace(local, cloud);
const byId = Object.create(null);
tr.tasks.forEach((t) => (byId[t.id] = t.firstGap));
console.log(JSON.stringify({ gaps: byId, counts: tr.gapCounts }));
`;

const tmp = path.join(ROOT, "_tmp_e2e_trace.mjs");
writeFileSync(tmp, stub);
const run = spawnSync(process.execPath, [tmp], { encoding: "utf8" });
unlinkSync(tmp);
assert.equal(run.status, 0, run.stderr || run.stdout);
const out = JSON.parse(run.stdout.trim());
assert.equal(out.gaps["cloud-mark-1"], "cloud-mark-present-local-body-missing");
assert.equal(out.gaps["mismatch-1"], "body-present-but-content-or-done-mismatch");
assert.equal(out.gaps["local-only"], "local-body-present-cloud-mark-missing");

console.log("ok: today-plan e2e diag trace");
