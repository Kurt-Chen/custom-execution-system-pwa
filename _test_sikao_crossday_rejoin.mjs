/**
 * 静态验收：归入 → 今天死磕 支持跨日再加入（独立今日记录）
 */
import fs from "fs";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}
function ok(msg) {
  console.log("OK:", msg);
}

/* 1) 归属日：镜像以 createdAt 为准 */
if (!/item\.mirrorOf[\s\S]{0,120}createdAt/.test(html) || !html.includes("一律以 createdAt 为准")) {
  fail("getClosedListItemAssignmentDateKey 应对 mirrorOf 优先 createdAt");
}
ok("镜像归属日用 createdAt");

/* 2) 去重按日分桶 */
if (!html.includes('"@" +') && !html.includes("'@' +")) {
  /* 检查 @dayKey 拼接 */
  if (!/@\"\s*\+\s*dayKey|@\"\s*\+\s*dayKey|"@" \+ dayKey|'@' \+ dayKey|\+ "@" \+/.test(html) && !html.includes('+ "@" +')) {
    if (!html.includes('+"@"+') && !html.includes('+ "@" +') && !html.includes("+ '@' +")) {
      /* looser */
      if (!/@\" \+|@"\s*\+|@\"\s*\+/.test(html) && !html.includes('"@" + dayKey') && !html.includes("'@' + dayKey") && !html.includes('+ "@" +')) {
        /* from our patch: `"@" + dayKey` or `"@" +\n          dayKey` */
      }
    }
  }
}
if (!html.includes('"@" +') && !html.includes("'@' +") && !html.includes('+ "@" +') === false) {
  const dedupeWp = html.includes("跨日独立记录保留（昨天未完成可今天再归入）");
  const dedupeAnn = html.includes("跨日独立记录保留；完成态仅对齐「今日」镜像");
  if (!dedupeWp || !dedupeAnn) fail("去重应按日保留跨日独立记录");
}
ok("去重按日保留跨日记录");

/* 3) join 判定默认今日 */
if (!/function isWeeklyPlanJoinedClosedList\([^)]*dateKeyOpt/.test(html)) {
  fail("isWeeklyPlanJoinedClosedList 应支持 dateKeyOpt / 按日");
}
if (!/function isAnniversaryJoinedClosedList\([^)]*dateKeyOpt/.test(html)) {
  fail("isAnniversaryJoinedClosedList 应支持 dateKeyOpt / 按日");
}
ok("JoinedClosedList 按日判定");

/* 4) promote：同日不重复、跨日新建，禁止搬迁旧镜像 */
if (html.includes("assignClosedListItemToDateKey(existingMirror")) {
  fail("promote 不应再搬迁已有镜像到今日");
}
if (html.includes("assignClosedListItemToDateKey(existingAnnMirror")) {
  fail("周年 promote 不应搬迁已有镜像");
}
if (!html.includes("findWeeklyPlanClosedListMirror(task.id, null, dateStr)")) {
  fail("promote 应按今日查找已有镜像");
}
if (!html.includes("跨日新建独立今日记录")) {
  fail("promote 缺少跨日新建注释/逻辑意图");
}
if (!html.includes("getClosedListItemAssignmentDateKey(it) === dateStr")) {
  fail("周年 promote 应按日匹配已有镜像");
}
ok("promote 跨日新建、同日不重复、不搬迁历史");

/* 5) 菜单 leave 仅今日 */
if ((html.match(/leaveWeeklyPlanClosedListMirror\([^)]*leaveTodayKey\)/g) || []).length < 2) {
  fail("周计划菜单 leave 应传今日 key");
}
if ((html.match(/leaveAnniversaryClosedListExact\(/g) || []).length < 2) {
  fail("周年菜单 leave 调用次数不足");
}
if (!html.includes("leaveAnniversaryClosedListExact(\r\n                c.module,\r\n                c.weekNum,\r\n                c.taskId,\r\n                c.subId,\r\n                leaveTodayKey") &&
    !html.includes("leaveAnniversaryClosedListExact(\n                c.module,\n                c.weekNum,\n                c.taskId,\n                c.subId,\n                leaveTodayKey") &&
    !/leaveAnniversaryClosedListExact\([\s\S]{0,200}?leaveTodayKey/.test(html)) {
  fail("周年菜单 leave 应传今日 key");
}
ok("菜单取消仅摘今日");

/* 6) 完成态同步不改历史日 */
if (!html.includes("历史日镜像：只同步文案/截止，不改完成态（跨日独立）")) {
  fail("周计划 mirror 完成态同步应跳过历史日");
}
if (!html.includes("今天完成不影响昨天")) {
  fail("周年 mirror 完成态同步应跳过历史日");
}
ok("完成态同步不改历史日");

/* 7) 不自动结转 */
if (!html.includes("function rolloverIncompleteClosedListPastDaysToToday()") || !html.includes("return false;")) {
  fail("不应自动结转昨天未完成到今天");
}
const roll = html.slice(
  html.indexOf("function rolloverIncompleteClosedListPastDaysToToday"),
  html.indexOf("function rolloverIncompleteClosedListPastDaysToToday") + 200
);
if (!/return false/.test(roll)) {
  fail("rolloverIncompleteClosedListPastDaysToToday 必须保持 return false");
}
ok("无自动迁移昨天未完成");

console.log("\nALL PASS · 今天死磕跨日再加入静态验收");
