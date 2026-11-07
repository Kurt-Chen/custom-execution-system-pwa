/**
 * Done 已完成任务分类选择 · 点击热路径不得阻塞 UI
 * Run: node _test_done_outcome_click_perf.mjs
 */
import assert from "assert";
import fs from "fs";

const html = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function mustInclude(s, label) {
  assert.ok(html.includes(s), "missing: " + label + " → " + String(s).slice(0, 120));
}

function extractFn(name) {
  const re = new RegExp("function " + name + "\\s*\\(");
  const start = html.search(re);
  assert.ok(start >= 0, "missing function " + name);
  let i = html.indexOf("{", start);
  assert.ok(i >= 0, "missing body " + name);
  let depth = 0;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

mustInclude("exec-system-pwa-v20261106o", "cache bump html");
assert.ok(sw.includes("exec-system-pwa-v20261106o"), "cache bump sw");
mustInclude("function openDoneOutcomePickerForId", "open picker helper");
mustInclude("function findDoneTimelineItemById", "row lookup helper");
mustInclude("function patchDoneVdIndexHomeInPlace", "in-place V/D patch");
mustInclude('ev.preventDefault();\n        openDoneOutcomePickerForId(tid);', "summary click opens picker immediately");
mustInclude("notifyAliyunDoneRealUpsert(reason || \"outcome-edit\", item)", "click still uploads outcome");

const followUp = extractFn("scheduleDoneOutcomeClickFollowUp");
assert.ok(!followUp.includes('flushLocalPersistedState("force")'), "follow-up must not force persist");
assert.ok(followUp.includes("skipUiPaintDirty"), "follow-up still skips paint dirty");
assert.ok(followUp.includes("notifyAliyunDoneRealUpsert"), "follow-up still upserts Aliyun Done");
assert.ok(followUp.includes("refreshDoneOutcomeDerivedChromeLight"), "follow-up still refreshes chrome");

const chrome = extractFn("refreshDoneOutcomeDerivedChromeLight");
assert.ok(chrome.includes("patchDoneVdIndexHomeInPlace"), "chrome uses in-place V/D patch");
assert.ok(!chrome.includes("renderDoneVdIndexHome"), "chrome must not rebuild V/D capsule");
assert.ok(!chrome.includes("renderDoneRefocusChrome"), "chrome must not refresh Refocus");
assert.ok(!chrome.includes("renderDoneDayStats"), "chrome must not rebuild time-of-day stats");
assert.ok(!chrome.includes("syncVdIndexRulesMarquee"), "chrome must not restart V/D marquees");

const openPick = extractFn("openDoneOutcomePickerForId");
assert.ok(openPick.includes("patchDoneOutcomeUiImmediate"), "open picker patches current row");
assert.ok(!openPick.includes("requestAnimationFrame"), "open picker must not wait a frame");
assert.ok(!openPick.includes("saveState"), "opening picker must not save/sync");
assert.ok(!openPick.includes("render("), "opening picker must not full render");

const lookup = extractFn("findDoneTimelineItemById");
assert.ok(lookup.includes("CSS.escape"), "row lookup prefers attribute selector");

const patchVd = extractFn("patchDoneVdIndexHomeInPlace");
assert.ok(!patchVd.includes("el.replaceChildren()"), "in-place V/D must not wipe capsule");
assert.ok(!patchVd.includes("syncVdIndexRulesMarquee"), "in-place V/D must not remount marquees");
assert.ok(!patchVd.includes("syncVdDesireMarquee"), "in-place V/D must not remount desire marquee");

console.log("_test_done_outcome_click_perf.mjs OK");
