/**
 * Habit/Forge warm 切换：细标脏不得误扩全切片；Done 切片不含 habit/forge。
 * node _test_habit_forge_warm_switch_dirty.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

function extractFn(name) {
  const re = new RegExp(
    "function " + name + "\\([\\s\\S]*?\\n    \\}\\n(?=\\n    (?:function |const |let |var |/\\*|window\\.))",
    "m"
  );
  const m = html.match(re);
  if (!m) throw new Error("cannot extract " + name);
  return m[0];
}

// Minimal harness mirroring dirty helpers
const harness = `
var UI_PAINT_SLICE_KEYS = ["stopDoing","notToDo","haters","memo","closedList","done","dailyWin","habit","goals","weeklyPlan","kinetic","forge","purpose"];
var uiPaintDirty = null;
var habitCheckinsSubTabDirty = false;
function createAllDirtyUiPaintMap() {
  var o = {};
  UI_PAINT_SLICE_KEYS.forEach(function (k) { o[k] = true; });
  return o;
}
function markAllUiPaintSlicesDirty() { uiPaintDirty = null; }
function markHabitCheckinsSubTabDirty() { habitCheckinsSubTabDirty = true; }
function markSprintTaskShellsDirty() {}
function markSprintShellDirty() {}
function markIsgGateScanDirty() {}
function flowDiagNoteDoneDirty() {}
${extractFn("markUiPaintSlicesDirty")}
${extractFn("uiPaintSlicesForListName").replace(/function uiPaintSlicesForListName[\s\S]*?(?=function |\n    \/\*\*)/, "")}
`;

// extract uiPaintSlicesForListName more carefully
const doneLine = html.includes('if (listName === "done") return ["done", "weeklyPlan", "closedList"];');
const badDone = html.includes('if (listName === "done") return ["done", "weeklyPlan", "closedList", "habit", "forge"];');
const seedFalse = html.includes("细标脏时必须先收束为全 false");
const habitForgeFn = html.includes("function primaryModuleHabitForgeNeedsPaint");
const cache = html.includes("v20261002t");

if (badDone) {
  console.error("FAIL: done slice still dirties habit/forge");
  process.exit(1);
}
if (!doneLine) {
  console.error("FAIL: done slice allowlist missing");
  process.exit(1);
}
if (!seedFalse || !habitForgeFn || !cache) {
  console.error("FAIL: missing warm-switch guards or cache bump", { seedFalse, habitForgeFn, cache });
  process.exit(1);
}

// runtime: mark(["done"]) from null must not dirty habit/forge
const markBody = extractFn("markUiPaintSlicesDirty");
const ctx = {
  UI_PAINT_SLICE_KEYS: [
    "stopDoing",
    "notToDo",
    "haters",
    "memo",
    "closedList",
    "done",
    "dailyWin",
    "habit",
    "goals",
    "weeklyPlan",
    "kinetic",
    "forge",
    "purpose"
  ],
  uiPaintDirty: null,
  habitCheckinsSubTabDirty: false,
  createAllDirtyUiPaintMap: function () {
    const o = {};
    this.UI_PAINT_SLICE_KEYS.forEach((k) => (o[k] = true));
    return o;
  },
  markAllUiPaintSlicesDirty: function () {
    this.uiPaintDirty = null;
  },
  markHabitCheckinsSubTabDirty: function () {
    this.habitCheckinsSubTabDirty = true;
  },
  markSprintTaskShellsDirty: function () {},
  markSprintShellDirty: function () {},
  markIsgGateScanDirty: function () {},
  flowDiagNoteDoneDirty: function () {}
};
vm.createContext(ctx);
vm.runInContext(markBody, ctx);
vm.runInContext("markUiPaintSlicesDirty(['done']);", ctx);
if (ctx.uiPaintDirty.habit || ctx.uiPaintDirty.forge) {
  console.error("FAIL: mark(['done']) dirtied habit/forge", ctx.uiPaintDirty);
  process.exit(1);
}
if (!ctx.uiPaintDirty.done) {
  console.error("FAIL: done not marked dirty");
  process.exit(1);
}
console.log("OK habit/forge warm-switch dirty isolation + cache v20261002t");
