/**
 * 冒烟：第二轮 FLOW_DIAG 埋点必须存在（只日志，不改行为）。
 * node _test_flow_diag_presence.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");

const need = [
  "FLOW_DIAG · MODULE SWITCH",
  "===== MODULE SWITCH =====",
  "===== CHECKIN -> DONE =====",
  "function flowDiagBeginCheckin",
  "function flowDiagPrintModuleSwitch",
  "function flowDiagPrintCheckin",
  "function flowDiagNoteApi",
  "function flowDiagNoteMerge",
  "function flowDiagNoteCloudRender",
  "FLOW_DIAG_SWITCH_WINDOW_MS",
  "window.__flowDiag",
  "exec-system-pwa-v20261002r"
];

let failed = 0;
for (const s of need) {
  if (!html.includes(s)) {
    console.error("MISSING in index.html:", s);
    failed += 1;
  }
}
if (!sw.includes("exec-system-pwa-v20261002r")) {
  console.error("MISSING cache bump in sw.js");
  failed += 1;
}

// hooks
const hooks = [
  'flowDiagBeginCheckin("habit"',
  'flowDiagBeginCheckin("forge-body"',
  'flowDiagBeginCheckin("forge-mind"',
  "flowDiagNoteCheckinLocalWrite",
  "flowDiagProbeCheckinDoneVisible",
  "flowDiagNotePull(reason",
  "flowDiagNoteParse(parseMs)"
];
for (const s of hooks) {
  if (!html.includes(s)) {
    console.error("MISSING hook:", s);
    failed += 1;
  }
}

if (failed) {
  console.error("FAIL", failed);
  process.exit(1);
}
console.log("OK flow-diag presence + cache v20261002r");
