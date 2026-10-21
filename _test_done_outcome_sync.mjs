/**
 * Done 完成性质（力量/中立/背叛）跨端同步 · 静态回归
 * Run: node _test_done_outcome_sync.mjs
 */
import assert from "assert";
import fs from "fs";

const html = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function mustInclude(s, label) {
  assert.ok(html.includes(s), "missing: " + label + " → " + String(s).slice(0, 100));
}

mustInclude("function aliyunDoneRealMergeOutcomeIntoLocal", "outcome merge helper");
mustInclude("aliyunDoneRealMergeOutcomeIntoLocal(local, remote, false)", "merge when local newer");
mustInclude("outcomeGap", "fingerprint skip checks outcome gap");
mustInclude("notifyAliyunDoneRealUpsert(reason || \"outcome-edit\", item)", "click uploads outcome");
mustInclude("mergeDoneItemOutcomeFields(next, local, remote, true)", "LWW path uses shared outcome merge");
mustInclude("exec-system-pwa-v20261021m", "cache bump html");
assert.ok(sw.includes("exec-system-pwa-v20261021m"), "cache bump sw");

/* 纯逻辑：本机更新更新、远端有力量 → 仍应合入 */
function mergeDoneItemOutcomeFields(mergedItem, localItem, remoteItem, preferRemoteOnConflict) {
  const locEx = !!(localItem && (localItem.outcomeKind === "power" || localItem.outcomeKind === "neutral" || localItem.outcomeKind === "treason"));
  const remEx = !!(remoteItem && (remoteItem.outcomeKind === "power" || remoteItem.outcomeKind === "neutral" || remoteItem.outcomeKind === "treason"));
  if (!locEx && !remEx) return mergedItem;
  let kind;
  if (!locEx && remEx) kind = remoteItem.outcomeKind;
  else if (locEx && !remEx) kind = localItem.outcomeKind;
  else if (localItem.outcomeKind === remoteItem.outcomeKind) kind = localItem.outcomeKind;
  else {
    const locK = localItem.outcomeKind;
    const remK = remoteItem.outcomeKind;
    const locStrong = locK === "power" || locK === "treason";
    const remStrong = remK === "power" || remK === "treason";
    if (locStrong && remK === "neutral") kind = locK;
    else if (remStrong && locK === "neutral") kind = remK;
    else kind = preferRemoteOnConflict ? remK : locK;
  }
  const out = Object.assign({}, mergedItem);
  if (out.outcomeKind !== kind) {
    out.outcomeKind = kind;
    return out;
  }
  return mergedItem;
}

function mergeOutcomeIntoLocal(local, remote, preferRemote) {
  const merged = mergeDoneItemOutcomeFields(local, local, remote, preferRemote);
  if (!merged || merged === local) return false;
  local.outcomeKind = merged.outcomeKind;
  return true;
}

{
  const local = { id: "a", text: "x", updatedAt: 200, completedAt: 100 };
  const remote = { id: "a", text: "x", updatedAt: 150, completedAt: 100, outcomeKind: "power", outcomeScore: 1 };
  assert.strictEqual(local.updatedAt > remote.updatedAt, true, "local newer");
  assert.strictEqual(mergeOutcomeIntoLocal(local, remote, false), true);
  assert.strictEqual(local.outcomeKind, "power");
}

{
  const local = { id: "b", text: "y", updatedAt: 200, outcomeKind: "power", outcomeScore: 2 };
  const remote = { id: "b", text: "y", updatedAt: 150, outcomeKind: "neutral", outcomeScore: 0 };
  assert.strictEqual(mergeOutcomeIntoLocal(local, remote, false), false, "keep local strong");
  assert.strictEqual(local.outcomeKind, "power");
}

console.log("_test_done_outcome_sync.mjs OK");
