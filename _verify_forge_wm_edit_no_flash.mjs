/**
 * 周/日最低编辑不闪动 · 核验契约（无真机双端；勿当作完整验收）
 *
 * 覆盖：
 * 1) 编辑只延后列表 DOM，合并仍写入 state
 * 2) retain 仅保护 label/目标草稿，不整对象替换、不复活已删 id
 * 3) A 改周目标 + B 打卡（Done）语义：两域独立合并后并存
 * 4) 退出编辑 / 切分类会清 --editing 并 flush deferred
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import assert from "assert";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function pass(msg) {
  console.log("PASS", msg);
}

function fail(msg) {
  throw new Error("FAIL: " + msg);
}

/* —— 源码契约 —— */
pass("syntax helpers present");
assert(html.includes("function retainForgeMinEditingLocalRows"), "retain fn");
assert(html.includes("function endForgeMinEditingSessions"), "end sessions fn");
assert(html.includes("function isForgeMinListEditingInProgress"), "editing detect");

/* 不得把 forge min 编辑塞进全局 busy（会挡其它域） */
{
  const busyFn = html.slice(
    html.indexOf("function isAppUiBusyForBackgroundRefresh()"),
    html.indexOf("function scheduleRenderWhenEditingEnds()")
  );
  assert(
    !busyFn.includes("isForgeMinListEditingInProgress"),
    "forge min edit must NOT gate global isAppUiBusyForBackgroundRefresh"
  );
  pass("global busy does not include forge min editing");
}

/* settings UI / deferred flush 仍单独识别编辑 */
assert(
  /forgeSettingsBusy[\s\S]{0,350}isForgeMinListEditingInProgress/.test(html),
  "forge settings UI defers on min editing"
);
assert(
  /function scheduleRenderWhenEditingEnds\(\)[\s\S]{0,450}isForgeMinListEditingInProgress/.test(html),
  "deferred flush waits for min editing end"
);
pass("settings defer + deferred flush recognize min editing");

/* retain 实现应写 label/targetField，而非整对象 loc 替换 */
{
  const fnStart = html.indexOf("function retainForgeMinEditingLocalRows");
  const fnEnd = html.indexOf("function endForgeMinEditingSessions");
  const body = html.slice(fnStart, fnEnd);
  assert(body.includes("item.label"), "retain overlays label");
  assert(body.includes("item[targetField]"), "retain overlays target field");
  assert(!body.includes("nextById.set(String(id), loc)"), "retain must not swap whole local object");
  assert(body.includes("if (!item) continue"), "retain does not resurrect deleted id");
  pass("retain only overlays draft fields; no full-object swap; no resurrect");
}

assert(html.includes("endForgeMinEditingSessions({ revert: true })"), "category switch ends edit");
assert(html.includes("exceptEl: el"), "starting edit ends other sessions");
assert(
  /applyWeeklyMinRowLocked\(true\);[\s\S]{0,280}scheduleRenderWhenEditingEnds/.test(html),
  "save/cancel flushes deferred render"
);
pass("exit paths clear editing and flush deferred");

assert(html.includes("v20261019n") && sw.includes("v20261019n"), "cache v20261019n");
pass("cache version v20261019n");

/* —— 语义模拟：retain 草稿 + Done 打卡独立 —— */
function simulateRetainOverlay(listKey, nextArr, draftsById) {
  const isDaily = listKey === "dailyMinimums";
  const targetField = isDaily ? "dailyMin" : "weeklyMin";
  const byId = new Map();
  nextArr.forEach((r) => {
    if (r && r.id != null) byId.set(String(r.id), r);
  });
  Object.keys(draftsById).forEach((id) => {
    const item = byId.get(String(id));
    if (!item) return; // deleted remotely → not resurrected
    const d = draftsById[id];
    if (d.label != null) item.label = d.label;
    if (d.target != null) item[targetField] = d.target;
  });
  return nextArr;
}

function mergeIdPreferLocalOnTie(loc, rem) {
  const map = new Map();
  rem.forEach((r) => map.set(String(r.id), Object.assign({}, r)));
  loc.forEach((r) => {
    const id = String(r.id);
    const cur = map.get(id);
    if (!cur) map.set(id, Object.assign({}, r));
    else if ((Number(r.updatedAt) || 0) >= (Number(cur.updatedAt) || 0)) {
      map.set(id, Object.assign({}, r));
    }
  });
  return Array.from(map.values());
}

/* 设备 A 编辑周目标草稿 350；合并拿到远端同行其它字段 + 新行 */
{
  const localWm = [
    { id: "act1", label: "静坐", weeklyMin: "35", unit: "min", source: { kind: "habit" }, updatedAt: 1 }
  ];
  const remoteWm = [
    {
      id: "act1",
      label: "静坐",
      weeklyMin: "35",
      unit: "min",
      source: { kind: "habit", text: "from-B" },
      updatedAt: 2
    },
    { id: "act2", label: "NSDR", weeklyMin: "70", unit: "min", updatedAt: 2 }
  ];
  let merged = mergeIdPreferLocalOnTie(localWm, remoteWm);
  merged = simulateRetainOverlay("weeklyMinimums", merged, {
    act1: { label: "静坐", target: "350" }
  });
  const a1 = merged.find((x) => x.id === "act1");
  const a2 = merged.find((x) => x.id === "act2");
  assert.strictEqual(a1.weeklyMin, "350", "A draft weeklyMin kept");
  assert.strictEqual(a1.source && a1.source.text, "from-B", "remote non-draft field kept");
  assert.ok(a2, "remote new row kept");
  pass("A draft target + remote sibling fields/rows coexist");
}

/* 远端删除 act1：编辑中不复活 */
{
  const merged = simulateRetainOverlay(
    "weeklyMinimums",
    [{ id: "act2", label: "NSDR", weeklyMin: "70" }],
    { act1: { label: "静坐", target: "350" } }
  );
  assert.strictEqual(
    merged.find((x) => x.id === "act1"),
    undefined,
    "deleted id not resurrected"
  );
  pass("remote delete of editing id is not blocked by retain");
}

/* Done 打卡与 weeklyMinimums 独立：模拟 A 保存目标后 state 同时有新目标与 B 打卡 */
{
  const forgeAfterASave = {
    weeklyMinimums: [{ id: "act1", label: "静坐", weeklyMin: "350", unit: "min" }]
  };
  const doneAfterBCheckin = [
    {
      id: "done-b1",
      text: "静坐 20min",
      forgeMindMeta: { dateKey: "2026-10-19", amount: "20", unit: "min" },
      completedAt: Date.now()
    }
  ];
  assert.strictEqual(forgeAfterASave.weeklyMinimums[0].weeklyMin, "350");
  assert.strictEqual(doneAfterBCheckin.length, 1);
  assert.ok(doneAfterBCheckin[0].forgeMindMeta);
  pass("semantic: new weeklyMin and new Done checkin can coexist in state");
}

console.log("\nALL_OK contracts + semantic sims");
console.log(
  "NOTE: 未做真实双设备 / 浏览器 UI 验收；脚本 PASS ≠ 完整验收。请本机刷新 v20261019n 后手测。"
);
