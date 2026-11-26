/**
 * 今日计划跨设备只读同步诊断入口契约（平板无 DevTools）。
 * 运行：node _test_today_plan_sync_diag_snapshot.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

const badge = html.match(/APP_CACHE_NAME_FOR_BADGE\s*=\s*"([^"]+)"/);
const swCache = sw.match(/CACHE_NAME\s*=\s*"([^"]+)"/);
assert.ok(badge && swCache, "cache name markers present");
assert.equal(badge[1], swCache[1], "index.html badge cache must match sw.js CACHE_NAME");
assert.match(badge[1], /^exec-system-pwa-v20261126i$/);

assert.match(html, /function __todayPlanSyncDiagSnapshotSync\s*\(/);
assert.match(html, /async function buildTodayPlanSyncDiagSnapshot\s*\(/);
assert.match(html, /async function copyTodayPlanSyncDiag\s*\(/);
assert.match(html, /async function todayPlanSyncDiagCloudPeekReadonly\s*\(/);
assert.match(html, /window\.__copyTodayPlanSyncDiag\s*=\s*copyTodayPlanSyncDiag/);
assert.match(html, /earlyBootDiagCopyTodayPlanBtn/);
assert.match(html, /复制本机今日计划诊断/);
assert.match(html, /完整端到端诊断/);
assert.match(html, /diag:\s*"today-plan-sync-v2-e2e"/);
assert.match(html, /mode:\s*"GET-only-no-apply"/);
assert.match(html, /firebaseV2ShardingAffectsTodayPlan:\s*false/);
assert.match(html, /expected-under-aliyun-primary-not-empty-cloud/);
assert.match(html, /阿里云主路径下 Firebase 启动默认跳过/);

/* 云端探测必须只读：函数体内不得出现 POST/PUT apply/merge 写回 */
const peekStart = html.indexOf("async function todayPlanSyncDiagCloudPeekReadonly");
assert.ok(peekStart > 0);
const peekEnd = html.indexOf("async function buildTodayPlanSyncDiagSnapshot", peekStart);
assert.ok(peekEnd > peekStart);
const peekBody = html.slice(peekStart, peekEnd);
assert.doesNotMatch(peekBody, /method:\s*"POST"|aliyunExpFetchJson\(\s*"POST"/i);
assert.doesNotMatch(peekBody, /aliyunListsRealApplySliceToState|applyRemoteState|saveState\s*\(/);
assert.match(peekBody, /aliyunExpFetchJson\(\s*"GET"/);

/* 诊断面板提示禁止清缓存/改房间 */
assert.match(html, /不清缓存、不改房间/);
assert.match(html, /同步诊断（只读·无密钥）/);


assert.match(html, /early-boot-diag-btn-primary/);
assert.match(html, /e2eComplete/);
assert.match(html, /incompleteReason/);
assert.match(html, /todayPlanSyncDiagWithTimeout/);
assert.match(html, /todayPlanSyncDiagAssessE2eComplete/);
assert.match(html, /reportKind/);
assert.match(html, /requireCloudPeek:\s*true/);
/* 主按钮显式白字+蓝底，避免全局 button{color:#fff} 叠浅底导致「灰白不可点」 */
assert.match(html, /early-boot-diag-btn-primary[\s\S]*?color:\s*#fff\s*!important/);
assert.match(html, /压掉全局 button\{color:#fff\}/);

console.log("ok: today-plan sync diag snapshot contracts");
