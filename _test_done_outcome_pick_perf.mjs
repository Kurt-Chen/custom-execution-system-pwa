/**
 * 已完成任务分类选择：点选不得同步整包落盘，选择态已就位时不得反复搬 DOM。
 * 运行：node _test_done_outcome_pick_perf.mjs
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}
function ok(msg) {
  console.log("OK:", msg);
}

function sliceFn(name, nextName) {
  const start = html.indexOf("function " + name + "(");
  if (start < 0) fail("missing " + name);
  const end = html.indexOf("\n    function " + nextName + "(", start);
  if (end < 0) fail("missing end of " + name + " before " + nextName);
  return html.slice(start, end);
}

const follow = sliceFn("scheduleDoneOutcomeClickFollowUp", "setDoneOutcomeKindForDoneId");
if (follow.includes('flushLocalPersistedState("force")') || follow.includes("flushLocalPersistedState('force')")) {
  fail("分类点击仍同步 flushLocalPersistedState(force)");
}
if (!follow.includes("notifyAliyunDoneRealUpsert")) fail("分类点击丢掉阿里云 upsert");
if (!follow.includes('lists: ["done"]')) fail("分类点击未窄域 saveState");
if (!follow.includes("skipUiPaintDirty")) fail("分类点击未跳过整表 paint 脏标");
ok("点击后续：落盘防抖 + 阿里云 upsert，无同步整包 flush");

const openFn = sliceFn("createDoneOutcomeSegmentEl", "isMobileDoneTimelineViewport");
if (!openFn.includes("ev.preventDefault()")) fail("分类选择器点击未 preventDefault");
if (!openFn.includes("openDoneOutcomePickerFromCompact")) fail("未同步切入选择态");
if (openFn.includes("requestAnimationFrame(function ()")) {
  fail("打开分类选择器仍延后一帧再 patch（会多排一次 details）");
}
ok("打开选择器：同一次点击同步切入，不先展开 details");

const layoutSrc = sliceFn("syncDoneCompactPickLayout", "normalizeDoneOutcomeKindsInState");
if (!layoutSrc.includes("sourceLine.nextElementSibling !== hint")) {
  fail("选择态未跳过已就位节点");
}
ok("选择态布局：已就位则不搬动");

function makeEl(cls) {
  const el = {
    className: cls || "",
    children: [],
    parentElement: null,
    parentNode: null,
    classSet: new Set(
      String(cls || "")
        .split(/\s+/)
        .filter(Boolean)
    ),
    appendChild(child) {
      if (child.parentElement) child.parentElement.removeChild(child);
      this.children.push(child);
      child.parentElement = this;
      child.parentNode = this;
      el.moves += 1;
      return child;
    },
    insertBefore(child, ref) {
      if (child.parentElement) child.parentElement.removeChild(child);
      const i = ref ? this.children.indexOf(ref) : this.children.length;
      this.children.splice(i < 0 ? this.children.length : i, 0, child);
      child.parentElement = this;
      child.parentNode = this;
      el.moves += 1;
      return child;
    },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      child.parentElement = null;
      child.parentNode = null;
      el.moves += 1;
      return child;
    },
    querySelector(sel) {
      const all = this.querySelectorAll(sel);
      return all[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      const parts = String(sel)
        .split(",")
        .map(function (s) {
          return s.trim();
        });
      function walk(node, depth) {
        node.children.forEach(function (ch) {
          if (match(ch, parts, depth === 0)) out.push(ch);
          walk(ch, depth + 1);
        });
      }
      function match(node, sels, direct) {
        return sels.some(function (s) {
          const scope = s.indexOf(":scope > ") === 0;
          if (scope && !direct) return false;
          const rest = scope ? s.slice(":scope > ".length) : s;
          if (rest.indexOf("details") === 0) return false;
          const classes = rest.split(".").filter(Boolean);
          return classes.every(function (c) {
            return node.classSet.has(c);
          });
        });
      }
      walk(this, 0);
      return out;
    },
    classList: null,
    moves: 0
  };
  el.classList = {
    contains(name) {
      return el.classSet.has(name);
    },
    toggle(name, on) {
      const has = el.classSet.has(name);
      const next = on == null ? !has : !!on;
      if (next === has) return next;
      if (next) el.classSet.add(name);
      else el.classSet.delete(name);
      return next;
    },
    remove(name) {
      el.classSet.delete(name);
    }
  };
  Object.defineProperty(el, "nextElementSibling", {
    get() {
      if (!this.parentElement) return null;
      const i = this.parentElement.children.indexOf(this);
      return i >= 0 ? this.parentElement.children[i + 1] || null : null;
    }
  });
  return el;
}

const sandbox = { console: console };
vm.createContext(sandbox);
vm.runInContext(layoutSrc + "\nthis.syncDoneCompactPickLayout = syncDoneCompactPickLayout;", sandbox);

const row = makeEl("done-compact-row");
const meta = makeEl("done-compact-meta-stack");
const first = makeEl("done-compact-first-row");
const outcome = makeEl("done-compact-outcome-row");
const source = makeEl("done-compact-source-line");
const trailing = makeEl("done-compact-trailing");
const seg = makeEl("done-outcome-segment done-outcome-segment--expand-row");
const hint = makeEl("done-outcome-90day-hint");
row.appendChild(meta);
meta.appendChild(first);
first.appendChild(outcome);
first.appendChild(source);
source.appendChild(trailing);
outcome.appendChild(seg);
seg.appendChild(hint);
row.moves = 0;
meta.moves = 0;
first.moves = 0;
source.moves = 0;
seg.moves = 0;

sandbox.syncDoneCompactPickLayout(row);
if (!meta.classSet.has("done-compact-meta-stack--picking")) fail("未进入选择态 class");
if (hint.parentElement !== meta) fail("90 天提示未挂到 metaStack");
if (source.parentElement !== meta) fail("任务名行未挂到 metaStack");
if (source.nextElementSibling !== hint) fail("选择态顺序不是 任务名 → 提示");
if (trailing.parentElement !== source) fail("··· 未留在任务名行");
const movesAfterEnter =
  row.moves + meta.moves + first.moves + source.moves + seg.moves + hint.moves;
if (movesAfterEnter < 1) fail("首次进入选择态应搬一次节点");
ok("首次进入选择态：提示与任务名就位（搬动 " + movesAfterEnter + " 次）");

row.moves = meta.moves = first.moves = source.moves = seg.moves = hint.moves = trailing.moves = 0;
sandbox.syncDoneCompactPickLayout(row);
const movesAfterStay =
  row.moves + meta.moves + first.moves + source.moves + seg.moves + hint.moves + trailing.moves;
if (movesAfterStay !== 0) fail("已在选择态再次同步仍搬动了 DOM：" + movesAfterStay);
if (hint.parentElement !== meta) fail("再次同步后提示丢失");
ok("已在选择态再点分类：零 DOM 搬动");

if (!html.includes('APP_CACHE_NAME_FOR_BADGE = "exec-system-pwa-v20261107a"')) {
  fail("index cache badge 未升到 v20261107a");
}
if (!sw.includes('CACHE_NAME = "exec-system-pwa-v20261107a"')) {
  fail("sw.js CACHE_NAME 未升到 v20261107a");
}
ok("缓存版本 v20261107a");

console.log("\nAll checks passed.");
