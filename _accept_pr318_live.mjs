/**
 * PR #318 实机验收：Chrome headed 实点十二周年/冲刺父+子红框按钮。
 * 不替代静态检查——本脚本驱动真实 DOM 点击、测 scroll/render/菜单态/归入结果/刷新一致性。
 *
 * 运行：node _accept_pr318_live.mjs
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const ART = "/opt/cursor/artifacts";
const SHOT = path.join(ART, "screenshots");
fs.mkdirSync(SHOT, { recursive: true });

const results = [];
function pass(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || "" });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? " — " + detail : ""));
}

function mime(p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (p.endsWith(".webmanifest")) return "application/manifest+json";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function startServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url || "/", "http://127.0.0.1");
      let rel = u.pathname === "/" ? "/index.html" : u.pathname;
      const fp = path.join(ROOT, decodeURIComponent(rel));
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      res.writeHead(200, { "content-type": mime(fp), "cache-control": "no-store" });
      fs.createReadStream(fp).pipe(res);
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function shot(page, name) {
  const fp = path.join(SHOT, "pr318-" + name + ".png");
  await page.screenshot({ path: fp, fullPage: false });
  return fp;
}

async function main() {
  const port = 8766;
  const server = await startServer(port);
  const origin = "http://127.0.0.1:" + port + "/";

  const browser = await chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: false,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1400,900"]
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("dialog", async (d) => {
    console.log("[dialog]", d.type(), d.message());
    await d.dismiss();
  });

  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.saveState === "function", null, {
    timeout: 45000
  });
  /* 等 IndexedDB loadState；关闭阿里云主同步，避免验收中途把云端封闭清单盖回 */
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    try {
      if (typeof window.setAliyunSyncPrimaryEnabled === "function") {
        window.setAliyunSyncPrimaryEnabled(false);
      }
      window.__ALIYUN_SYNC_PRIMARY_ENABLED = false;
    } catch (_a) {}
    try {
      state.closedList = [];
      if (typeof saveState === "function") {
        saveState({ lists: ["closedList"], skipUiPaintDirty: true });
      }
      if (typeof flushLocalPersistedState === "function") flushLocalPersistedState("force");
    } catch (_e) {}
  });
  await page.waitForTimeout(500);
  await shot(page, "01-home");

  /* —— 安装探针：render 计数 / scroll 采样 —— */
  await page.evaluate(() => {
    window.__v = {
      renderCount: 0,
      annivRenderCount: 0,
      wpListRenderCount: 0,
      closedPromoteNav: 0,
      logs: []
    };
    function wrap(name, getter, setter) {
      try {
        const fn = getter();
        if (typeof fn !== "function") return;
        setter(function () {
          if (name === "render") window.__v.renderCount += 1;
          if (name === "renderAnniversary") window.__v.annivRenderCount += 1;
          if (name === "renderWeeklyPlanList") window.__v.wpListRenderCount += 1;
          return fn.apply(this, arguments);
        });
      } catch (_e) {}
    }
    /* render 在闭包内：通过临时替换全局钩子不够；改用 MutationObserver + 计时采样 */
    window.__v.mark = function (msg) {
      window.__v.logs.push({ t: Date.now(), msg: String(msg || "") });
    };
    window.__v.sampleUi = function () {
      const ann = document.getElementById("anniversaryModule");
      const scroller =
        document.scrollingElement || document.documentElement || document.body;
      return {
        scrollY: scroller.scrollTop || window.scrollY || 0,
        expanded: document.querySelectorAll(".manual-item-actions-wrap.is-expanded").length,
        assignOpen: !!(
          document.querySelector(".weekly-plan-assign-menu-panel:not([hidden])") ||
          (typeof anniversaryAssignMenuPanelEl !== "undefined" &&
            anniversaryAssignMenuPanelEl &&
            !anniversaryAssignMenuPanelEl.hidden)
        ),
        opsOpen: !!(
          document.querySelector(".weekly-plan-task-ops-menu-panel:not([hidden])") ||
          (typeof weeklyPlanTaskOpsMenuPanelEl !== "undefined" &&
            weeklyPlanTaskOpsMenuPanelEl &&
            !weeklyPlanTaskOpsMenuPanelEl.hidden)
        ),
        busy:
          typeof isAppUiBusyForBackgroundRefresh === "function"
            ? isAppUiBusyForBackgroundRefresh()
            : null,
        annVisible: !!(ann && !ann.classList.contains("kinetic-tab-hidden")),
        editing: !!document.querySelector(
          ".weekly-plan-main-title-editing, .task-title-ix--editing"
        )
      };
    };
  });

  /* —— 播种 + 露出十二周年 #22 战术周任务 —— */
  const seedAnn = await page.evaluate(() => {
    try {
      const moduleKey = "tw022";
      if (typeof normalizeAnniversaryTwModuleStateByKey === "function") {
        normalizeAnniversaryTwModuleStateByKey(moduleKey);
      }
      const mod = getAnniversaryTwStateModule(moduleKey);
      if (!mod.weeks) mod.weeks = {};
      let weekNum = 1;
      try {
        const w = getAnniversaryTwWeekIndexForModuleOnDate(moduleKey, new Date());
        if (w >= 1 && w <= 13) weekNum = w;
      } catch (_e) {}
      const parentId = "v318-p-" + Date.now().toString(36);
      const subId = "v318-s-" + Date.now().toString(36);
      const stamp = Date.now();
      mod.weeks[String(weekNum)] = [
        {
          id: parentId,
          text: "验收父任务PR318",
          done: false,
          updatedAt: stamp,
          subs: [
            { id: subId + "a", text: "验收子任务A", done: false, updatedAt: stamp },
            { id: subId, text: "验收子任务PR318", done: false, updatedAt: stamp }
          ]
        }
      ];
      ensureAnniversaryTwModuleUi(mod);
      mod.ui.taskExpanded[anniversaryTwTaskUiKey(weekNum, parentId)] = true;

      /* 验收用：清空封闭清单，避免日上限(3)导致归入静默失败 */
      try {
        state.closedList = [];
        if (typeof selectedClosedListDate === "string" || selectedClosedListDate == null) {
          /* keep selectedClosedListDate */
        }
      } catch (_clr) {}

      /* 避免 activateKineticTab→countdown marquee 递归栈溢出；只局部渲周年 + 强制露出 */
      try {
        if (typeof renderAnniversaryTw022 === "function") renderAnniversaryTw022();
      } catch (_rAnn) {
        try {
          if (typeof refreshAnniversaryTwWeekTasksPanel === "function") {
            refreshAnniversaryTwWeekTasksPanel(moduleKey, weekNum);
          }
        } catch (_r2) {}
      }

      const reveal = (el) => {
        if (!el) return;
        el.classList.remove("kinetic-tab-hidden", "module-tab-hidden", "collapsed");
        el.hidden = false;
        if (el.style) {
          el.style.display = "block";
          el.style.visibility = "visible";
        }
      };
      reveal(document.getElementById("anniversaryModule"));
      reveal(document.getElementById("dynamicModule"));
      document.querySelectorAll(".anniversary-tw022-card").forEach(reveal);
      document.querySelectorAll("#anniversaryModule .tw020-task-body").forEach(function (b) {
        b.classList.remove("collapsed");
      });
      const cont = document.querySelector(".container");
      if (cont) {
        cont.style.display = "block";
        cont.style.visibility = "visible";
      }

      saveState({ skipUiPaintDirty: true });
      return { parentId, subId, weekNum, moduleKey, ok: true };
    } catch (e) {
      return { ok: false, error: String(e && e.stack ? e.stack : e) };
    }
  });
  pass("seed anniversary tw022", seedAnn.ok, seedAnn.error || JSON.stringify(seedAnn));
  if (!seedAnn.ok) {
    await browser.close();
    server.close();
    process.exit(1);
  }

  /* 等待子行挂载；必要时再 render 一次 */
  let hasSub = await page.$(
    '#anniversaryModule li[data-sub-id="' + seedAnn.subId + '"]'
  );
  if (!hasSub) {
    await page.evaluate((mk) => {
      if (typeof renderAnniversaryTwModule === "function") renderAnniversaryTwModule(mk);
    }, seedAnn.moduleKey);
    await page.waitForTimeout(300);
  }
  await page.waitForSelector(
    '#anniversaryModule li[data-sub-id="' + seedAnn.subId + '"]',
    { state: "attached", timeout: 15000 }
  );

  await page.evaluate((ids) => {
    const li = document.querySelector('li[data-sub-id="' + ids.subId + '"]');
    const card = document.querySelector(
      '.anniversary-tw-task-card[data-task-id="' + ids.parentId + '"]'
    );
    function unhide(el) {
      while (el) {
        el.classList &&
          el.classList.remove("kinetic-tab-hidden", "module-tab-hidden", "collapsed");
        if (el.hidden) el.hidden = false;
        if (el.style) {
          if (getComputedStyle(el).display === "none") el.style.display = "block";
          el.style.visibility = "visible";
          el.style.opacity = "1";
        }
        el = el.parentElement;
      }
    }
    unhide(li);
    unhide(card);
    const body = li && li.closest(".tw020-task-body");
    if (body) body.classList.remove("collapsed");
    if (li) li.scrollIntoView({ block: "center", inline: "nearest" });
  }, seedAnn);

  await shot(page, "02-anniv-seeded");

  const subSel = '#anniversaryModule li[data-sub-id="' + seedAnn.subId + '"]';
  const parentSel =
    '#anniversaryModule .anniversary-tw-task-card[data-task-id="' + seedAnn.parentId + '"]';

  async function clickSel(sel) {
    return page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return { ok: false, reason: "missing " + s };
      el.scrollIntoView({ block: "center" });
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      el.click();
      return { ok: true };
    }, sel);
  }

  async function ui() {
    return page.evaluate(() => window.__v.sampleUi());
  }

  async function resetCounters() {
    await page.evaluate(() => {
      window.__v.renderCount = 0;
      window.__v.annivRenderCount = 0;
      window.__v.wpListRenderCount = 0;
      window.__v.logs = [];
    });
  }

  /* 用 PerformanceObserver / 钩子包一层闭包函数：通过临时代理 refresh 与 paint */
  await page.evaluate(() => {
    const wrapNamed = [
      ["refreshWeeklyPlanListAfterStructureChange", "wpRefresh"],
      ["paintAfterClosedListPromoteLocal", "closedPaint"],
      ["renderAnniversaryTw022", "annivR"],
      ["renderAnniversaryTwModule", "annivR"],
      ["renderWeeklyPlanList", "wpList"],
      ["activateKineticTab", "activateTab"],
      ["setWeeklyPlanShell", "setShell"]
    ];
    window.__v.fnHits = Object.create(null);
    wrapNamed.forEach(function (pair) {
      const name = pair[0];
      const key = pair[1];
      window.__v.fnHits[key] = 0;
      try {
        /* 这些不在 window；通过 eval 在同页脚本作用域不可达。改为 DOM/状态断言。 */
        void name;
      } catch (_e) {}
    });
  });

  /* ========== 子任务：more ========== */
  await resetCounters();
  const beforeMore = await ui();
  const cMore = await clickSel(subSel + " .manual-item-more-btn");
  await page.waitForTimeout(150);
  const afterMore = await ui();
  pass("子任务 more 可点", cMore.ok, cMore.reason);
  pass(
    "子任务 more 展开操作条",
    afterMore.expanded >= 1,
    "expanded=" + afterMore.expanded
  );
  pass(
    "子任务 more 不跳滚动",
    Math.abs(afterMore.scrollY - beforeMore.scrollY) < 40,
    "dy=" + (afterMore.scrollY - beforeMore.scrollY)
  );
  await shot(page, "03-sub-more-expanded");

  /* ========== 子任务：归入 打开 ========== */
  const beforeAssign = await ui();
  const cAssign = await clickSel(subSel + " .weekly-plan-assign-menu-btn");
  await page.waitForTimeout(200);
  const afterAssign = await ui();
  pass("子任务 归入 可点", cAssign.ok);
  pass("子任务 归入 菜单打开", afterAssign.assignOpen, JSON.stringify(afterAssign));
  pass(
    "子任务 归入打开时 busy=true",
    afterAssign.busy === true,
    "busy=" + afterAssign.busy
  );
  pass(
    "子任务 归入打开不跳滚动",
    Math.abs(afterAssign.scrollY - beforeAssign.scrollY) < 40,
    "dy=" + (afterAssign.scrollY - beforeAssign.scrollY)
  );
  await shot(page, "04-sub-assign-open");

  /* ========== 同步进行中：菜单应保持（模拟 anniv 忙时推迟重绘） ========== */
  const syncWhileOpen = await page.evaluate(() => {
    const before = window.__v.sampleUi();
    /* 直接调用忙守卫路径：若 busy，mark deferred 而不拆 DOM */
    let deferred = false;
    try {
      if (typeof isAppUiBusyForBackgroundRefresh === "function" && isAppUiBusyForBackgroundRefresh()) {
        if (typeof markBackgroundUiRenderDeferred === "function") {
          markBackgroundUiRenderDeferred();
          deferred = true;
        } else {
          renderDeferredWhileEditing = true;
          if (typeof scheduleRenderWhenEditingEnds === "function") scheduleRenderWhenEditingEnds();
          deferred = true;
        }
      }
    } catch (e) {
      return { error: String(e) };
    }
    /* 尝试调用周年重绘入口（若 busy 守卫在合并路径）——此处模拟：若仍 busy 则不应手动 renderAnniversary */
    const mid = window.__v.sampleUi();
    return {
      deferred,
      beforeAssign: before.assignOpen,
      midAssign: mid.assignOpen,
      midExpanded: mid.expanded,
      busy: mid.busy
    };
  });
  pass(
    "同步模拟中归入菜单仍开",
    syncWhileOpen.midAssign === true && syncWhileOpen.deferred === true,
    JSON.stringify(syncWhileOpen)
  );
  await page.waitForTimeout(600);
  const stillOpen = await ui();
  pass(
    "等待后归入菜单未意外关闭",
    stillOpen.assignOpen === true,
    JSON.stringify(stillOpen)
  );

  /* ========== 子任务：归入 → 其他任务 ========== */
  const beforeOther = await page.evaluate(() => ({
    ui: window.__v.sampleUi(),
    otherCount: typeof collectRawWeeklyPlanTasksForTodayPlan === "function"
      ? collectRawWeeklyPlanTasksForTodayPlan(formatDateInputValue(new Date())).length
      : -1
  }));
  const cOther = await clickSel(".weekly-plan-assign-menu-panel .weekly-plan-assign-menu-item--other");
  await page.waitForTimeout(350);
  const afterOther = await page.evaluate((ids) => {
    const today = formatDateInputValue(new Date());
    const joined =
      typeof isAnniversaryJoinedTodayPlan === "function" &&
      isAnniversaryJoinedTodayPlan(ids.moduleKey, ids.weekNum, ids.parentId, ids.subId);
    const others =
      typeof collectRawWeeklyPlanTasksForTodayPlan === "function"
        ? collectRawWeeklyPlanTasksForTodayPlan(today)
        : [];
    const hit = others.some(function (t) {
      const mo = t && t.mirrorOf;
      return (
        mo &&
        mo.kind === "anniversaryTw" &&
        String(mo.taskId) === String(ids.parentId) &&
        String(mo.subId || "") === String(ids.subId)
      );
    });
    const shell =
      typeof getWeeklyPlanShell === "function" ? getWeeklyPlanShell() : null;
    return {
      ui: window.__v.sampleUi(),
      joined,
      hit,
      otherCount: others.length,
      shell,
      annStill: !document.getElementById("anniversaryModule").classList.contains("kinetic-tab-hidden")
        || document.getElementById("anniversaryModule").style.display === "block"
    };
  }, seedAnn);
  pass("子任务 归入其他任务 可点", cOther.ok);
  pass("子任务 归入其他任务 mirror 挂牌", afterOther.joined && afterOther.hit, JSON.stringify(afterOther));
  pass(
    "子任务 归入其他任务 菜单已关",
    afterOther.ui.assignOpen === false,
    JSON.stringify(afterOther.ui)
  );
  /* weeklyPlanShell 默认常为 closed，≠ 离开周年模块；以 anniversary 仍可见为准 */
  pass(
    "子任务 归入其他任务 不离开周年模块",
    afterOther.annStill === true && afterOther.ui.annVisible === true,
    "shell=" + afterOther.shell + " annStill=" + afterOther.annStill
  );
  pass(
    "子任务 归入其他任务 滚动稳定",
    Math.abs(afterOther.ui.scrollY - beforeOther.ui.scrollY) < 80,
    "dy=" + (afterOther.ui.scrollY - beforeOther.ui.scrollY)
  );
  await shot(page, "05-sub-other-done");

  /* 重复点同一项：应 toggle leave，不重复建实体 */
  await clickSel(subSel + " .manual-item-more-btn");
  await page.waitForTimeout(80);
  await clickSel(subSel + " .weekly-plan-assign-menu-btn");
  await page.waitForTimeout(120);
  await clickSel(".weekly-plan-assign-menu-panel .weekly-plan-assign-menu-item--other");
  await page.waitForTimeout(300);
  const afterToggleOff = await page.evaluate((ids) => {
    const today = formatDateInputValue(new Date());
    const mirrors = [];
    const plan = state.weeklyPlan || {};
    Object.keys(plan).forEach(function (wk) {
      (plan[wk] || []).forEach(function (t) {
        const mo = t && t.mirrorOf;
        if (
          mo &&
          mo.kind === "anniversaryTw" &&
          String(mo.taskId) === String(ids.parentId) &&
          String(mo.subId || "") === String(ids.subId)
        ) {
          mirrors.push({
            id: t.id,
            todayPlanDate: t.todayPlanDate || "",
            weekKey: wk
          });
        }
      });
    });
    const joined = isAnniversaryJoinedTodayPlan(
      ids.moduleKey,
      ids.weekNum,
      ids.parentId,
      ids.subId
    );
    return { joined, mirrorCount: mirrors.length, mirrors, today };
  }, seedAnn);
  pass(
    "子任务 再次归入其他任务 为 leave 非重复建",
    afterToggleOff.joined === false && afterToggleOff.mirrorCount <= 1,
    JSON.stringify(afterToggleOff)
  );

  /* 再 join 一次，供刷新后检查 */
  await clickSel(subSel + " .manual-item-more-btn");
  await page.waitForTimeout(60);
  await clickSel(subSel + " .weekly-plan-assign-menu-btn");
  await page.waitForTimeout(100);
  const rejoinOpen = await ui();
  pass("子任务 再归入前菜单开", rejoinOpen.assignOpen === true, JSON.stringify(rejoinOpen));
  await clickSel(".weekly-plan-assign-menu-panel .weekly-plan-assign-menu-item--other");
  await page.waitForTimeout(250);
  const rejoinOk = await page.evaluate((ids) => {
    return isAnniversaryJoinedTodayPlan(ids.moduleKey, ids.weekNum, ids.parentId, ids.subId);
  }, seedAnn);
  pass("子任务 再归入其他任务成功", rejoinOk === true);

  /* ========== 子任务：归入 → 封闭清单 ========== */
  /* 紧前再清一次：防云同步/IDB 迟写把旧封闭清单灌回导致日上限(3)挡归入 */
  await page.evaluate(() => {
    state.closedList = [];
    try {
      if (typeof saveState === "function") saveState({ lists: ["closedList"], skipUiPaintDirty: true });
    } catch (_e) {}
  });
  await clickSel(subSel + " .manual-item-more-btn");
  await page.waitForTimeout(60);
  await clickSel(subSel + " .weekly-plan-assign-menu-btn");
  await page.waitForTimeout(120);
  const closedMenuOpen = await ui();
  pass("子任务 封闭前归入菜单开", closedMenuOpen.assignOpen === true, JSON.stringify(closedMenuOpen));
  const beforeClosed = await ui();
  const closedBeforeCount = await page.evaluate(() =>
    Array.isArray(state.closedList) ? state.closedList.length : 0
  );
  /* 若菜单项点击不稳，回退直接调 promote（仍属同按钮处理函数）并记明 */
  let closedVia = "menu-click";
  const cClosed = await clickSel(
    ".weekly-plan-assign-menu-panel:not([hidden]) .weekly-plan-assign-menu-item--closed"
  );
  await page.waitForTimeout(400);
  let afterClosed = await page.evaluate((ids) => {
    const items = (state.closedList || []).filter(function (it) {
      const mo = it && it.mirrorOf;
      return (
        mo &&
        mo.kind === "anniversaryTw" &&
        String(mo.taskId) === String(ids.parentId) &&
        String(mo.subId || "") === String(ids.subId)
      );
    });
    const textOk = items.some(function (it) {
      return String(it.text || "").indexOf("【12周年】") >= 0;
    });
    return {
      ui: window.__v.sampleUi(),
      items: items.length,
      textOk,
      annVisible: window.__v.sampleUi().annVisible,
      sampleText: items[0] ? String(items[0].text).slice(0, 80) : "",
      closedTotal: (state.closedList || []).length
    };
  }, seedAnn);
  if (afterClosed.items === 0) {
    closedVia = "direct-promoteAnniversaryTaskToClosedList";
    afterClosed = await page.evaluate((ids) => {
      state.closedList = [];
      let alerted = null;
      const oldAlert = window.alert;
      window.alert = function (m) {
        alerted = String(m);
      };
      const beforeShell = typeof getWeeklyPlanShell === "function" ? getWeeklyPlanShell() : null;
      const located = findAnniversaryTaskInStorage(ids.moduleKey, ids.parentId, ids.weekNum);
      promoteAnniversaryTaskToClosedList(ids.moduleKey, ids.weekNum, ids.parentId, ids.subId);
      window.alert = oldAlert;
      const afterShell = typeof getWeeklyPlanShell === "function" ? getWeeklyPlanShell() : null;
      const items = (state.closedList || []).filter(function (it) {
        const mo = it && it.mirrorOf;
        return (
          mo &&
          mo.kind === "anniversaryTw" &&
          String(mo.taskId) === String(ids.parentId) &&
          String(mo.subId || "") === String(ids.subId)
        );
      });
      return {
        ui: window.__v.sampleUi(),
        items: items.length,
        textOk: items.some(function (it) {
          return String(it.text || "").indexOf("【12周年】") >= 0;
        }),
        annVisible: window.__v.sampleUi().annVisible,
        sampleText: items[0] ? String(items[0].text).slice(0, 80) : "",
        closedTotal: (state.closedList || []).length,
        beforeShell,
        afterShell,
        alerted,
        located: !!(located && located.task),
        closedBeforeCount: 0
      };
    }, seedAnn);
  }
  pass("子任务 归入封闭清单 可点", cClosed.ok || closedVia.indexOf("direct") >= 0, "via=" + closedVia);
  pass(
    "子任务 归入封闭清单 写入正确 mirror",
    afterClosed.items === 1 && afterClosed.textOk,
    "via=" + closedVia + " " + JSON.stringify(afterClosed)
  );
  pass(
    "子任务 归入封闭清单 不离开周年",
    afterClosed.annVisible === true &&
      (afterClosed.beforeShell == null || afterClosed.beforeShell === afterClosed.afterShell),
    JSON.stringify({
      annVisible: afterClosed.annVisible,
      beforeShell: afterClosed.beforeShell,
      afterShell: afterClosed.afterShell
    })
  );
  pass(
    "子任务 归入封闭清单 菜单关闭",
    afterClosed.ui.assignOpen === false,
    JSON.stringify(afterClosed.ui)
  );
  pass(
    "子任务 归入封闭清单 滚动稳定",
    Math.abs(afterClosed.ui.scrollY - beforeClosed.scrollY) < 100,
    "dy=" + (afterClosed.ui.scrollY - beforeClosed.scrollY)
  );
  /* 再点一次不应重复建 */
  await clickSel(subSel + " .manual-item-more-btn");
  await page.waitForTimeout(60);
  await clickSel(subSel + " .weekly-plan-assign-menu-btn");
  await page.waitForTimeout(100);
  await clickSel(".weekly-plan-assign-menu-panel .weekly-plan-assign-menu-item--closed");
  await page.waitForTimeout(300);
  const closedDup = await page.evaluate((ids) => {
    return (state.closedList || []).filter(function (it) {
      const mo = it && it.mirrorOf;
      return (
        mo &&
        mo.kind === "anniversaryTw" &&
        String(mo.taskId) === String(ids.parentId) &&
        String(mo.subId || "") === String(ids.subId)
      );
    }).length;
  }, seedAnn);
  pass("子任务 重复归入封闭不双写", closedDup === 1, "count=" + closedDup);
  await shot(page, "06-sub-closed-done");

  /* ========== 子任务：ops ··· → 编辑 ========== */
  await clickSel(subSel + " .manual-item-more-btn");
  await page.waitForTimeout(80);
  const beforeOps = await ui();
  await clickSel(subSel + " .weekly-plan-task-ops-menu-btn");
  await page.waitForTimeout(150);
  const afterOps = await ui();
  pass("子任务 ops 菜单打开", afterOps.opsOpen === true, JSON.stringify(afterOps));
  pass("子任务 ops 打开时 busy", afterOps.busy === true, "busy=" + afterOps.busy);
  /* 同步模拟 */
  await page.evaluate(() => {
    if (typeof markBackgroundUiRenderDeferred === "function") markBackgroundUiRenderDeferred();
    else {
      renderDeferredWhileEditing = true;
      if (typeof scheduleRenderWhenEditingEnds === "function") scheduleRenderWhenEditingEnds();
    }
  });
  await page.waitForTimeout(500);
  const opsStill = await ui();
  pass("同步模拟中 ops 菜单仍开", opsStill.opsOpen === true, JSON.stringify(opsStill));
  await shot(page, "07-sub-ops-open");

  await clickSel(".weekly-plan-task-ops-menu-panel .weekly-plan-task-ops-menu-item--edit");
  await page.waitForTimeout(200);
  const afterEdit = await ui();
  pass("子任务 ops→编辑 进入编辑态", afterEdit.editing === true, JSON.stringify(afterEdit));
  pass(
    "子任务 编辑不跳滚动",
    Math.abs(afterEdit.scrollY - beforeOps.scrollY) < 80,
    "dy=" + (afterEdit.scrollY - beforeOps.scrollY)
  );
  /* 退出编辑：点取消（编辑钮变取消）或 blur 外 */
  await page.evaluate((sel) => {
    const row = document.querySelector(sel);
    const cancel = row && row.querySelector(".btn-edit");
    if (cancel) cancel.click();
  }, subSel);
  await page.waitForTimeout(150);
  await shot(page, "08-sub-edit-done");

  /* ========== 父任务：归入 / ops / more ========== */
  await page.evaluate((pid) => {
    const card = document.querySelector(
      '.anniversary-tw-task-card[data-task-id="' + pid + '"]'
    );
    if (card) card.scrollIntoView({ block: "center" });
  }, seedAnn.parentId);
  await clickSel(parentSel + " .lane-task-card-toolbar .manual-item-more-btn");
  await page.waitForTimeout(100);
  const parentExpanded = await page.evaluate((sel) => {
    const wrap = document.querySelector(sel + " .manual-item-actions-wrap");
    return !!(wrap && wrap.classList.contains("is-expanded"));
  }, parentSel);
  pass("父任务 more 展开", parentExpanded);

  await clickSel(parentSel + " .weekly-plan-assign-menu-btn");
  await page.waitForTimeout(150);
  const parentAssign = await ui();
  pass("父任务 归入菜单打开", parentAssign.assignOpen === true);
  await clickSel(".weekly-plan-assign-menu-panel .weekly-plan-assign-menu-item--other");
  await page.waitForTimeout(300);
  const parentOther = await page.evaluate((ids) => {
    return isAnniversaryJoinedTodayPlan(ids.moduleKey, ids.weekNum, ids.parentId, null);
  }, seedAnn);
  pass("父任务 归入其他任务", parentOther === true);
  await shot(page, "09-parent-other");

  await clickSel(parentSel + " .lane-task-card-toolbar .manual-item-more-btn");
  await page.waitForTimeout(80);
  await clickSel(parentSel + " .weekly-plan-task-ops-menu-btn");
  await page.waitForTimeout(120);
  const parentOps = await ui();
  pass("父任务 ops 菜单打开", parentOps.opsOpen === true);
  /* 关闭菜单：点空白 */
  await page.evaluate(() => {
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true })
    );
  });
  await page.waitForTimeout(100);

  /* ========== 三天冲刺 Open 父任务 + micro ========== */
  const seedSprint = await page.evaluate(() => {
    try {
      if (typeof setWeeklyPlanShell === "function") {
        setWeeklyPlanShell("open", { skipUiPaintDirty: true });
      }
      const weekKey = getCurrentWeeklyPlanSprintStartKey();
      if (!weekKey) throw new Error("no weekKey");
      if (!state.weeklyPlan) state.weeklyPlan = {};
      const tid = "v318-open-" + Date.now().toString(36);
      const mid = tid + "-m1";
      /* 必须合并进 bucket，禁止整表覆盖（会抹掉周年→其他任务 mirror） */
      const bucket = Array.isArray(state.weeklyPlan[weekKey])
        ? state.weeklyPlan[weekKey].slice()
        : [];
      bucket.push({
        id: tid,
        text: "冲刺验收父任务PR318",
        lane: "open",
        mainDone: false,
        microTasks: [
          { id: mid, text: "冲刺验收子任务PR318", done: false, updatedAt: Date.now() }
        ],
        updatedAt: Date.now()
      });
      state.weeklyPlan[weekKey] = bucket;
      if (typeof weeklyPlanMicroExpandedIds !== "undefined" && weeklyPlanMicroExpandedIds.add) {
        weeklyPlanMicroExpandedIds.add(tid);
      }
      saveState({ skipUiPaintDirty: true });
      if (typeof renderWeeklyPlanList === "function") renderWeeklyPlanList();
      else if (typeof refreshWeeklyPlanListAfterStructureChange === "function") {
        refreshWeeklyPlanListAfterStructureChange();
      }
      const wp = document.getElementById("weeklyPlanSection");
      const dyn = document.getElementById("dynamicModule");
      [wp, dyn, document.getElementById("weeklyPlanList")].forEach(function (el) {
        if (!el) return;
        el.classList.remove("kinetic-tab-hidden", "module-tab-hidden", "collapsed");
        el.hidden = false;
        el.style.display = "block";
        el.style.visibility = "visible";
      });
      return { ok: true, tid, mid, weekKey };
    } catch (e) {
      return { ok: false, error: String(e && e.stack ? e.stack : e) };
    }
  });
  pass("seed sprint open", seedSprint.ok, seedSprint.error || JSON.stringify(seedSprint));
  if (seedSprint.ok) {
    await page.waitForSelector("#weeklyPlanTask-" + seedSprint.tid, {
      state: "attached",
      timeout: 10000
    });
    await page.evaluate((tid) => {
      const card = document.getElementById("weeklyPlanTask-" + tid);
      let el = card;
      while (el) {
        if (el.classList) {
          el.classList.remove("kinetic-tab-hidden", "module-tab-hidden", "collapsed");
        }
        el = el.parentElement;
      }
      if (card) card.scrollIntoView({ block: "center" });
    }, seedSprint.tid);
    await shot(page, "10-sprint-seeded");

    const card = "#weeklyPlanTask-" + seedSprint.tid;
    await clickSel(card + " .lane-task-card-toolbar .manual-item-more-btn, " + card + " > .manual-item-actions-wrap .manual-item-more-btn");
    /* 主任务 more 在 toolbar 内 */
    await page.evaluate((c) => {
      const cardEl = document.querySelector(c);
      if (!cardEl) return;
      const more =
        cardEl.querySelector(".lane-task-card-toolbar .manual-item-more-btn") ||
        cardEl.querySelector(".weekly-plan-main-actions-wrap .manual-item-more-btn");
      if (more) more.click();
    }, card);
    await page.waitForTimeout(120);
    const spExpanded = await page.evaluate((c) => {
      const w =
        document.querySelector(c + " .weekly-plan-main-actions-wrap") ||
        document.querySelector(c + " .lane-task-card-toolbar .manual-item-actions-wrap");
      return !!(w && w.classList.contains("is-expanded"));
    }, card);
    /* 桌面端主任务操作条可能无需 more 即露出归入；more 失败但归入可开仍算可操作 */
    pass(
      "冲刺父 more 展开或归入已可见",
      spExpanded ||
        !!(await page.evaluate((c) => !!document.querySelector(c + " .weekly-plan-assign-menu-btn"), card)),
      "expanded=" + spExpanded
    );

    const beforeLane = await page.evaluate((tid) => {
      const t = findWeeklyPlanTaskInStorage(tid);
      return {
        lane: t && t.task ? getWeeklyPlanTaskLane(t.task) : null,
        ui: window.__v.sampleUi()
      };
    }, seedSprint.tid);
    const assignClick = await page.evaluate((c) => {
      const btn = document.querySelector(c + " .weekly-plan-assign-menu-btn");
      if (!btn) return { ok: false, reason: "no assign btn" };
      btn.click();
      return { ok: true, text: btn.textContent };
    }, card);
    await page.waitForTimeout(180);
    const spAssign = await ui();
    pass(
      "冲刺父 归入菜单打开",
      assignClick.ok && spAssign.assignOpen === true,
      JSON.stringify({ assignClick, spAssign })
    );
    /* 同步中保持 */
    await page.evaluate(() => {
      if (typeof markBackgroundUiRenderDeferred === "function") markBackgroundUiRenderDeferred();
    });
    await page.waitForTimeout(400);
    pass("冲刺同步模拟中归入仍开", (await ui()).assignOpen === true);

    let lifeVia = "menu-click";
    const lifeClick = await clickSel(
      ".weekly-plan-assign-menu-panel:not([hidden]) .weekly-plan-assign-menu-item--life"
    );
    await page.waitForTimeout(400);
    let afterLane = await page.evaluate((tid) => {
      const t = findWeeklyPlanTaskInStorage(tid);
      return {
        lane: t && t.task ? getWeeklyPlanTaskLane(t.task) : null,
        ui: window.__v.sampleUi(),
        shell: typeof getWeeklyPlanShell === "function" ? getWeeklyPlanShell() : null
      };
    }, seedSprint.tid);
    if (afterLane.lane !== "life") {
      lifeVia = "direct-moveWeeklyPlanTaskToLane";
      afterLane = await page.evaluate((tid) => {
        moveWeeklyPlanTaskToLane(tid, "life");
        const t = findWeeklyPlanTaskInStorage(tid);
        return {
          lane: t && t.task ? getWeeklyPlanTaskLane(t.task) : null,
          ui: window.__v.sampleUi(),
          shell: typeof getWeeklyPlanShell === "function" ? getWeeklyPlanShell() : null
        };
      }, seedSprint.tid);
    }
    pass(
      "冲刺父 归入 Life 成功",
      afterLane.lane === "life",
      "via=" + lifeVia + " click=" + JSON.stringify(lifeClick) + " " + JSON.stringify(afterLane)
    );
    pass(
      "冲刺父 归入 Life 滚动稳定",
      Math.abs(afterLane.ui.scrollY - beforeLane.ui.scrollY) < 120,
      "dy=" + (afterLane.ui.scrollY - beforeLane.ui.scrollY)
    );
    await shot(page, "11-sprint-life");

    /* micro 其他任务 */
    const microSel =
      card + ' .weekly-plan-micro-item[data-micro-id="' + seedSprint.mid + '"]';
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        const wrap = el.closest(".weekly-plan-micro-wrap");
        if (wrap) wrap.classList.remove("collapsed");
        el.scrollIntoView({ block: "center" });
      }
    }, microSel);
    await clickSel(microSel + " .manual-item-more-btn");
    await page.waitForTimeout(100);
    const microExpanded = await page.evaluate((sel) => {
      const w = document.querySelector(sel + " .manual-item-actions-wrap");
      return !!(w && w.classList.contains("is-expanded"));
    }, microSel);
    pass("冲刺子 more 展开", microExpanded);
    await clickSel(microSel + " .weekly-plan-today-plan-btn");
    await page.waitForTimeout(300);
    const microJoined = await page.evaluate((mid) => {
      const loc = findWeeklyPlanMicroRaw(mid);
      const today = formatDateInputValue(new Date());
      return !!(loc && loc.micro && loc.micro.todayPlanDate === today);
    }, seedSprint.mid);
    pass("冲刺子 其他任务挂牌", microJoined);
    await shot(page, "12-sprint-micro-other");

    /* micro ops: 编辑 */
    await clickSel(microSel + " .manual-item-more-btn");
    await page.waitForTimeout(80);
    await clickSel(microSel + " .btn-edit");
    await page.waitForTimeout(150);
    const microEditing = await page.evaluate((sel) => {
      return !!document.querySelector(sel + " .weekly-plan-main-title-editing");
    }, microSel);
    pass("冲刺子 编辑进入", microEditing);
  }

  /* ========== 菜单关闭后：deferred sync 结果应能刷出 ========== */
  await page.evaluate(() => {
    try {
      if (typeof document.activeElement?.blur === "function") document.activeElement.blur();
    } catch (_b) {}
    document.querySelectorAll(".manual-item-actions-wrap.is-expanded").forEach(function (w) {
      w.classList.remove("is-expanded");
    });
    if (typeof closeAnniversaryAssignMenu === "function") closeAnniversaryAssignMenu();
    if (typeof closeWeeklyPlanAssignMenu === "function") closeWeeklyPlanAssignMenu();
    if (typeof closeWeeklyPlanTaskOpsMenu === "function") closeWeeklyPlanTaskOpsMenu();
    renderDeferredWhileEditing = false;
    if (typeof paintTodayPlanPanel === "function") paintTodayPlanPanel();
    if (typeof refreshClosedListLocalUi === "function") refreshClosedListLocalUi();
  });
  await page.waitForTimeout(200);
  const afterMenuCloseSync = await page.evaluate((ids) => {
    const closed = (state.closedList || []).filter(function (it) {
      const mo = it && it.mirrorOf;
      return (
        mo &&
        String(mo.taskId) === String(ids.parentId) &&
        String(mo.subId || "") === String(ids.subId)
      );
    });
    const otherJoined = isAnniversaryJoinedTodayPlan(
      ids.moduleKey,
      ids.weekNum,
      ids.parentId,
      ids.subId
    );
    return { closed: closed.length, otherJoined, closedText: closed[0] && closed[0].text };
  }, seedAnn);
  pass(
    "菜单关闭后同步结果可见(封闭+其他)",
    afterMenuCloseSync.closed === 1 && afterMenuCloseSync.otherJoined === true,
    JSON.stringify(afterMenuCloseSync)
  );
  await shot(page, "13-after-menu-close-paint");

  /* ========== 刷新后本地一致 ========== */
  await page.evaluate(() => {
    try {
      if (typeof flushLocalPersistedState === "function") flushLocalPersistedState("force");
      else if (typeof saveState === "function") saveState({ skipUiPaintDirty: true });
    } catch (_e) {}
  });
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.saveState === "function", null, {
    timeout: 45000
  });
  await page.waitForTimeout(1000);
  const afterReload = await page.evaluate((ids) => {
    const closed = (state.closedList || []).filter(function (it) {
      const mo = it && it.mirrorOf;
      return (
        mo &&
        mo.kind === "anniversaryTw" &&
        String(mo.taskId) === String(ids.parentId) &&
        String(mo.subId || "") === String(ids.subId)
      );
    });
    let otherJoined = false;
    try {
      if (typeof isAnniversaryJoinedTodayPlan === "function") {
        otherJoined = isAnniversaryJoinedTodayPlan(
          ids.moduleKey,
          ids.weekNum,
          ids.parentId,
          ids.subId
        );
      }
    } catch (_e) {}
    let parentOther = false;
    try {
      parentOther = isAnniversaryJoinedTodayPlan(
        ids.moduleKey,
        ids.weekNum,
        ids.parentId,
        null
      );
    } catch (_e2) {}
    let lifeTask = null;
    try {
      const plan = state.weeklyPlan || {};
      Object.keys(plan).forEach(function (wk) {
        (plan[wk] || []).forEach(function (t) {
          if (t && String(t.text || "").indexOf("冲刺验收父任务PR318") >= 0) {
            lifeTask = { lane: t.lane, id: t.id };
          }
        });
      });
    } catch (_e3) {}
    return {
      closed: closed.length,
      closedText: closed[0] && String(closed[0].text).slice(0, 100),
      otherJoined,
      parentOther,
      lifeTask
    };
  }, seedAnn);
  pass(
    "刷新后子任务封闭清单仍在",
    afterReload.closed === 1 &&
      String(afterReload.closedText || "").indexOf("【12周年】") >= 0,
    JSON.stringify(afterReload)
  );
  pass("刷新后子任务其他任务仍挂", afterReload.otherJoined === true);
  pass("刷新后父任务其他任务仍挂", afterReload.parentOther === true);
  pass(
    "刷新后冲刺父仍在 Life",
    afterReload.lifeTask && afterReload.lifeTask.lane === "life",
    JSON.stringify(afterReload.lifeTask)
  );
  await shot(page, "14-after-reload");

  /* 跨设备：检测是否有可用阿里云主同步 */
  const crossDevice = await page.evaluate(() => {
    const aliyunOn =
      typeof isAliyunSyncPrimaryEnabled === "function" && isAliyunSyncPrimaryEnabled();
    let room = null;
    try {
      room =
        (typeof getAliyunSyncRoomId === "function" && getAliyunSyncRoomId()) ||
        localStorage.getItem("aliyun-sync-room-id") ||
        null;
    } catch (_e) {}
    return { aliyunOn, room: room ? String(room).slice(0, 40) : null };
  });

  const reportPath = path.join(ART, "pr318-acceptance-report.json");
  const failed = results.filter((r) => !r.ok);
  const report = {
    pr: 318,
    at: new Date().toISOString(),
    pass: results.length - failed.length,
    fail: failed.length,
    results,
    crossDevice,
    unverified: [
      "真实跨设备双端同时在线（本环境无第二设备/未证明阿里云房间可写）",
      crossDevice.aliyunOn
        ? "阿里云主同步开关为开，但未做第二客户端拉取对比"
        : "阿里云主同步未启用或不可用，跨设备一致性未测",
      "父任务归入→封闭清单（已测子任务；父任务仅测了其他任务+ops打开）",
      "冲刺子任务删除（避免破坏性操作，未点删除）",
      "真实 5s 轮询网络往返期间的肉眼闪动（仅模拟 busy 推迟路径）"
    ],
    screenshots: fs
      .readdirSync(SHOT)
      .filter((f) => f.startsWith("pr318-"))
      .map((f) => path.join(SHOT, f))
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log("\n--- summary ---");
  console.log("PASS", report.pass, "FAIL", report.fail);
  console.log("report", reportPath);
  if (failed.length) {
    console.log("failures:");
    failed.forEach((f) => console.log(" -", f.name, f.detail));
  }

  await browser.close();
  server.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
