/**
 * 早期启动诊断 · 静态 + 逻辑回归（不依赖业务脚本 / IDB）
 * 验证：业务初始化失败时诊断仍可打开；未知计数不得显示成 0
 * Run: node _test_early_boot_diag.mjs
 */
import assert from "assert";
import fs from "fs";
import vm from "vm";
import { createRequire } from "module";

const html = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");

function mustInclude(s, label) {
  assert.ok(html.includes(s), "missing: " + label + " → " + String(s).slice(0, 100));
}

/* —— 位置：早期壳必须在登录门之后、lodash/主业务脚本之前 —— */
const earlyApiIdx = html.indexOf("window.__EARLY_BOOT_DIAG");
const lodashIdx = html.indexOf("cdn.jsdelivr.net/npm/lodash");
const mainScriptBadgeIdx = html.indexOf("APP_CACHE_NAME_FOR_BADGE");
assert.ok(earlyApiIdx > 0, "__EARLY_BOOT_DIAG present");
assert.ok(earlyApiIdx < lodashIdx, "early diag script before lodash");
assert.ok(earlyApiIdx < mainScriptBadgeIdx, "early diag before main APP_CACHE_NAME");
assert.ok(!html.includes('id="earlyBootDiagBtn"'), "floating diag button removed");

mustInclude("__showEarlyBootDiag", "programmatic diag open");
mustInclude("启动诊断（无任务正文）", "diag panel title");
mustInclude("installEarlyBootDiag", "early installer");
mustInclude("window.onerror", "first JS error capture");
mustInclude("unhandledrejection", "promise rejection capture");
mustInclude("noteCloudFromPullReport", "cloud stage ingest");
mustInclude('status: NOT_RUN', "cloud stage default 未执行");
mustInclude("formatCount", "count formatter");
mustInclude('return UNKNOWN', "unknown count path");
mustInclude("可直接选中下方文本或截图", "copy-fail fallback hint");
mustInclude("user-select: text", "selectable diag text");
mustInclude("z-index: 100001", "diag overlay above UI");
mustInclude("exec-system-pwa-v20261021m", "cache bump html");
assert.ok(sw.includes("exec-system-pwa-v20261021m"), "cache bump sw");
mustInclude("版本 v20261021m</div>", "static version j");
mustInclude("diag-panel-fallback-missing-early", "fallback if early missing");
mustInclude("版本连点已绑定", "version tap meta when bound");

/* —— 逻辑：未知 ≠ 0；业务 throw 后仍能 open —— */
const sandbox = {
  console,
  setTimeout,
  Date,
  JSON,
  String,
  Object,
  isFinite,
  document: {
    body: { appendChild() {}, addEventListener() {} },
    getElementById() {
      return null;
    },
    createElement(tag) {
      const el = {
        tagName: String(tag).toUpperCase(),
        style: { cssText: "" },
        classList: {
          _c: new Set(),
          add(c) {
            this._c.add(c);
          },
          remove(c) {
            this._c.delete(c);
          },
          contains(c) {
            return this._c.has(c);
          }
        },
        children: [],
        textContent: "",
        value: "",
        setAttribute() {},
        addEventListener() {},
        appendChild(child) {
          this.children.push(child);
          if (child && child.id) sandbox.__els[child.id] = child;
          return child;
        },
        insertBefore(n, _ref) {
          this.children.unshift(n);
          return n;
        },
        firstChild: null,
        lastElementChild: null,
        id: ""
      };
      return el;
    },
    addEventListener() {},
    createRange() {
      return { selectNodeContents() {} };
    }
  },
  window: {
    addEventListener() {},
    alert() {},
    setTimeout,
    getSelection() {
      return { removeAllRanges() {}, addRange() {} };
    },
    navigator: {}
  },
  navigator: {},
  __els: Object.create(null)
};
sandbox.window.document = sandbox.document;
sandbox.globalThis = sandbox;

/* 从 index.html 抽出 installEarlyBootDiag IIFE 正文并在沙箱执行 */
const startMark = "function installEarlyBootDiag() {";
const start = html.indexOf(startMark);
assert.ok(start > 0, "installEarlyBootDiag found");
let i = start + startMark.length;
let depth = 1;
while (i < html.length && depth > 0) {
  const ch = html[i];
  if (ch === "{") depth++;
  else if (ch === "}") depth--;
  i++;
}
const fnBody = html.slice(start + startMark.length, i - 1);
const code =
  "var window = globalThis.window; var document = globalThis.document; var navigator = globalThis.navigator;\n" +
  "function installEarlyBootDiag() {\n" +
  fnBody +
  "\n}\ninstallEarlyBootDiag();\n";
vm.runInNewContext(code, sandbox, { timeout: 3000 });

assert.ok(sandbox.window.__EARLY_BOOT_DIAG, "API installed");
const api = sandbox.window.__EARLY_BOOT_DIAG;
assert.strictEqual(api.formatCount(null), "未知");
assert.strictEqual(api.formatCount(undefined), "未知");
assert.strictEqual(api.formatCount(Number.NaN), "未知");
assert.strictEqual(api.formatCount(0), "0", "real zero stays zero");
assert.strictEqual(api.formatCount(3), "3");

/* 业务初始化失败模拟：主脚本未完成，但 open 仍成功 */
try {
  throw new Error("simulated-business-init-failure");
} catch (bizErr) {
  api.setBusinessFlag("initError", bizErr.message);
  api.markStep("boot-err", bizErr.message);
}
api.setCloudStage("read", { status: "未执行", count: null, detail: null });
api.setCloudStage("merge", { status: "未知", count: null, detail: "no-signal" });

/* open 需要 overlay DOM；补齐 getElementById 映射 */
sandbox.document.getElementById = function (id) {
  return sandbox.__els[id] || null;
};
sandbox.document.body.appendChild = function (child) {
  if (child && child.id) sandbox.__els[child.id] = child;
  return child;
};

const opened = api.open();
assert.strictEqual(opened, true, "diag opens after business init failure");
const overlay = sandbox.__els.earlyBootDiagOverlay;
assert.ok(overlay, "overlay created");
assert.ok(overlay.classList.contains("is-open"), "overlay open class");
const pre = sandbox.__els.earlyBootDiagPre;
assert.ok(pre && pre.textContent, "diag text present");
assert.ok(pre.textContent.includes("simulated-business-init-failure"), "shows init error");
assert.ok(pre.textContent.includes('"count": "未知"') || pre.textContent.includes("未知"), "unknown not coerced away");
assert.ok(!/"count": 0/.test(pre.textContent) || pre.textContent.includes('"count": "0"'), "counts are labeled strings in view");
/* cloud view uses formatCount → string 未知, never bare null mistaken as 0 in UI text */
assert.ok(pre.textContent.includes("未执行") || pre.textContent.includes("未知"), "stage status explicit");

console.log("_test_early_boot_diag.mjs OK");
