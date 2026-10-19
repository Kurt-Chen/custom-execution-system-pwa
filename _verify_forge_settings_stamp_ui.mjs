/**
 * Forge settings：纯 updatedAt 前进不得触发 UI 重渲（卡顿修复契约）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import assert from "assert";

const html = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "index.html"),
  "utf8"
);

const fnStart = html.indexOf("function aliyunForgeRealApplyRemoteSettings");
const fnEnd = html.indexOf("function aliyunForgeRealParseEnvelope");
assert(fnStart > 0 && fnEnd > fnStart, "applyRemoteSettings found");
const body = html.slice(fnStart, fnEnd);

assert(body.includes("stampOnly"), "stampOnly tracked");
assert(body.includes("contentChanged: !!changed"), "meas notes contentChanged");
assert(
  !/if \(remTs > locTs\) changed = true/.test(body),
  "must NOT force changed=true on remTs > locTs"
);
assert(html.includes("__forgeLagMeas"), "lag meas console API present");
assert(html.includes("v20261019p"), "cache p");

console.log("PASS stamp-only no longer forces settingsChanged UI");
console.log("PASS __forgeLagMeas present");
console.log("ALL_OK");
