/**
 * Performance regression check（页面 Console / CDP，无测试框架）。
 *
 * 用法（应用已加载并解锁）：
 *   const s = await (await fetch('./perf/run-regression-check.js')).text(); eval(s);
 *   const report = await runPerfRegressionCheck({ hotIterations: 3, switchIterations: 5 });
 *   console.log(report.printable);
 *   // 完整：window.__perfRegressionLastReport
 *
 * 优先从 ./perf/baseline-v1.json 加载基线；失败则用内嵌 fallback。
 * 不修改 Firebase / sync / merge / 业务逻辑；探针尽量可回滚。
 */
(function () {
  "use strict";

  /** @type {any} 与 baseline-v1.json 同步的内嵌 fallback（fetch 失败时用） */
  const EMBEDDED_BASELINE = {
    version: "v1.1",
    capturedAt: "2026-09-08",
    thresholds: {
      warningPct: 20,
      regressionPct: 40,
      warningRatio: 1.2,
      regressionRatio: 1.4,
      noiseFloorMs: 5,
      compareField: "median"
    },
    structuralRules: {
      forbidMarkAllOnHotPaths: true,
      forbidFullHygieneWhenNarrowExpected: true,
      forbidWarmPrimaryFullRender: true
    },
    paths: {
      addMemo: {
        label: "addMemo 备忘新增",
        category: "hot",
        metric: "renderMs",
        baseline: { avg: 5.66, median: 5.66, p90: 5.66 },
        expect: { markAll: false, hygieneDomain: "skip|none", expectHygieneSkip: true, forbidFullHygiene: true }
      },
      closedListPlainToggle: {
        label: "普通 ClosedList 勾选（无 mirrorOf）",
        category: "hot",
        metric: "renderMs",
        baseline: { avg: 20.38, median: 20.38, p90: 20.38 },
        expect: { markAll: false, hygieneDomain: "donePrune", forbidFullHygiene: true }
      },
      habitSimpleCheckin: {
        label: "普通 Habit 打卡（简单戳记）",
        category: "hot",
        metric: "renderMs",
        baseline: { avg: 23.36, median: 23.36, p90: 23.36 },
        expect: { markAll: false, hygieneDomain: "habitDone|skip|none", forbidFullHygiene: true }
      },
      habitSwitchCold: {
        label: "Habit 底栏切换 cold",
        category: "primarySwitch",
        metric: "totalMs",
        baseline: { avg: 100.0, median: 100.0, p90: 120.0 },
        expect: { module: "habit", mode: "cold" }
      },
      habitSwitchWarm: {
        label: "Habit 底栏切换 warm",
        category: "primarySwitch",
        metric: "totalMs",
        baseline: { avg: 20.0, median: 20.0, p90: 24.0 },
        expect: { module: "habit", mode: "warm", warmNoFullRender: true }
      },
      forgeSwitchCold: {
        label: "Forge 底栏切换 cold",
        category: "primarySwitch",
        metric: "totalMs",
        baseline: { avg: 70.0, median: 70.0, p90: 90.0 },
        expect: { module: "forge", mode: "cold" }
      },
      forgeSwitchWarm: {
        label: "Forge 底栏切换 warm",
        category: "primarySwitch",
        metric: "totalMs",
        baseline: { avg: 2.0, median: 2.0, p90: 4.0 },
        expect: { module: "forge", mode: "warm", warmNoFullRender: true }
      },
      goalsSwitchCold: {
        label: "Goals 底栏切换 cold",
        category: "primarySwitch",
        metric: "totalMs",
        baseline: { avg: 220.0, median: 220.0, p90: 250.0 },
        expect: { module: "goals", mode: "cold" }
      },
      goalsSwitchWarm: {
        label: "Goals 底栏切换 warm",
        category: "primarySwitch",
        metric: "totalMs",
        baseline: { avg: 10.0, median: 10.0, p90: 14.0 },
        expect: { module: "goals", mode: "warm", warmNoFullRender: true }
      },
      purposeSwitchCold: {
        label: "Purpose 底栏切换 cold",
        category: "primarySwitch",
        metric: "totalMs",
        baseline: { avg: 20.0, median: 20.0, p90: 28.0 },
        expect: { module: "purpose", mode: "cold" }
      },
      purposeSwitchWarm: {
        label: "Purpose 底栏切换 warm",
        category: "primarySwitch",
        metric: "totalMs",
        baseline: { avg: 2.0, median: 2.0, p90: 4.0 },
        expect: { module: "purpose", mode: "warm", warmNoFullRender: true }
      },
      dynamicSwitchCold: {
        label: "Kinetic 底栏切换 cold",
        category: "primarySwitch",
        metric: "totalMs",
        baseline: { avg: 55.0, median: 55.0, p90: 70.0 },
        expect: { module: "dynamic", mode: "cold" }
      },
      dynamicSwitchWarm: {
        label: "Kinetic 底栏切换 warm",
        category: "primarySwitch",
        metric: "totalMs",
        baseline: { avg: 3.0, median: 3.0, p90: 5.0 },
        expect: { module: "dynamic", mode: "warm", warmNoFullRender: true }
      },
      anniversarySwitchCold: {
        label: "十二周年 Kinetic 切换 cold",
        category: "kineticSub",
        metric: "totalMs",
        baseline: { avg: 25.0, median: 25.0, p90: 32.0 },
        expect: { mode: "cold", forbidPrimaryFullRenderChain: true }
      },
      anniversarySwitchWarm: {
        label: "十二周年 Kinetic 切换 warm",
        category: "kineticSub",
        metric: "totalMs",
        baseline: { avg: 22.0, median: 22.0, p90: 30.0 },
        expect: { mode: "warm", forbidPrimaryFullRenderChain: true }
      }
    }
  };

  let BASELINE = EMBEDDED_BASELINE;

  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function round2(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function stats(arr) {
    const a = (arr || []).map(Number).filter(function (n) {
      return Number.isFinite(n);
    });
    if (!a.length) return { n: 0, avg: 0, median: 0, p90: 0, min: 0, max: 0 };
    a.sort(function (x, y) {
      return x - y;
    });
    const sum = a.reduce(function (s, n) {
      return s + n;
    }, 0);
    return {
      n: a.length,
      avg: round2(sum / a.length),
      median: a[Math.floor(a.length / 2)],
      p90: a[Math.min(a.length - 1, Math.floor(a.length * 0.9))],
      min: a[0],
      max: a[a.length - 1]
    };
  }

  function snap() {
    return typeof getCloudSyncPerfSnapshot === "function" ? getCloudSyncPerfSnapshot() : {};
  }

  function resetPerf() {
    if (typeof resetCloudSyncPerfCounters === "function") resetCloudSyncPerfCounters();
  }

  function paintIsMarkAll() {
    try {
      return typeof uiPaintDirty !== "undefined" && uiPaintDirty == null;
    } catch (_e) {
      return null;
    }
  }

  function rAF2() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }

  function pctChange(baselineAvg, measuredAvg) {
    if (!baselineAvg || !Number.isFinite(baselineAvg) || !Number.isFinite(measuredAvg)) return null;
    return round2(((measuredAvg - baselineAvg) / baselineAvg) * 100);
  }

  function effectiveBaselineValue(baselineVal, thresholds) {
    const th = thresholds || BASELINE.thresholds || {};
    const floor = th.noiseFloorMs != null ? Number(th.noiseFloorMs) : 0;
    if (!Number.isFinite(baselineVal)) return baselineVal;
    if (floor > 0 && baselineVal < floor) return floor;
    return baselineVal;
  }

  function verdictFor(baselineVal, measuredVal, structuralFail, thresholds) {
    const th = thresholds || BASELINE.thresholds || {};
    const warnR = th.warningRatio != null ? th.warningRatio : 1.2;
    const regR = th.regressionRatio != null ? th.regressionRatio : 1.4;
    const change = pctChange(baselineVal, measuredVal);
    if (structuralFail && structuralFail.length) {
      return {
        level: "structural_regression",
        ratio: null,
        changePct: change,
        reasons: structuralFail
      };
    }
    if (!baselineVal || !Number.isFinite(measuredVal)) {
      return {
        level: "unknown",
        ratio: null,
        changePct: null,
        reasons: ["missing baseline or sample"]
      };
    }
    const eff = effectiveBaselineValue(baselineVal, th);
    const ratio = measuredVal / eff;
    if (ratio >= regR) {
      return { level: "regression", ratio: round2(ratio), changePct: change, reasons: [] };
    }
    if (ratio >= warnR) {
      return { level: "warning", ratio: round2(ratio), changePct: change, reasons: [] };
    }
    return { level: "pass", ratio: round2(ratio), changePct: change, reasons: [] };
  }

  function domainOk(expected, actual) {
    if (!expected) return true;
    const parts = String(expected).split("|");
    const act = String(actual || "none");
    return parts.some(function (p) {
      return p === act || (p === "none" && (!actual || actual === "" || actual === "none"));
    });
  }

  async function measureOnce(runFn) {
    resetPerf();
    const before = snap();
    const tracesBefore =
      typeof getLastUiStallTraces === "function" ? getLastUiStallTraces().length : 0;
    const markAllBefore = paintIsMarkAll();
    const t0 = now();
    let meta = {};
    try {
      meta = (await runFn()) || {};
    } catch (e) {
      meta = { error: String(e && e.message ? e.message : e) };
    }
    const totalMs = now() - t0;
    await rAF2();
    const s = snap();
    const traces = typeof getLastUiStallTraces === "function" ? getLastUiStallTraces() : [];
    /* stall 仅在 >1s 时落盘；未新增 trace 时 last.hygieneDomain 是历史残留，不可信 */
    const newStall = traces.length > tracesBefore;
    const last = newStall && traces.length ? traces[traces.length - 1] : null;
    const renderCountDelta = (s.renderCount || 0) - (before.renderCount || 0);
    const hygienePass = s.hygienePassCount || 0;
    const hygieneSkip = s.hygieneSkippedCount || 0;
    let hygieneDomainInferred = "none";
    if (hygienePass > 0) {
      hygieneDomainInferred = last && last.hygieneDomain ? last.hygieneDomain : "ran-unknown";
    } else if (hygieneSkip > 0) {
      hygieneDomainInferred = "skip";
    }
    return {
      totalMs: round2(totalMs),
      renderMs: round2(s.renderMs || 0),
      renderCount: renderCountDelta,
      hygieneMs: round2(s.hygieneMs || 0),
      hygienePassCount: hygienePass,
      hygieneSkippedCount: hygieneSkip,
      heavyModulesMs: round2(s.renderHeavyModulesMs || 0),
      heavyFpSkip: s.renderHeavyFingerprintSkipCount || 0,
      stringifyMs: round2(s.stringifyMs || 0),
      persistMs: round2(s.persistMs || 0),
      markAllAfter: paintIsMarkAll(),
      markAllBefore: markAllBefore,
      stallHygieneDomain: last && last.hygieneDomain ? last.hygieneDomain : "",
      hygieneDomainInferred: hygieneDomainInferred,
      stallDoneTimelineMs: last && last.render ? last.render.doneTimelineMs : null,
      stallHeavyMs: last && last.render ? last.render.heavyModulesMs : null,
      stallMarkAll: last ? Boolean(last.markAll) : null,
      newStall: newStall,
      meta: meta
    };
  }

  function findPlainClosedListItem() {
    const list = state && Array.isArray(state.closedList) ? state.closedList : [];
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it && it.id && !it.mirrorOf) return it;
    }
    return null;
  }

  function findSimpleHabitKey() {
    const preferred = ["makeBed", "floss", "drinkWater", "morningLight", "coldShower"];
    function isUsable(key) {
      if (!key) return false;
      if (typeof isHabitNumericInputKey === "function" && isHabitNumericInputKey(key)) return false;
      if (key === "weightAndBodyFat") return false;
      if (typeof isHabitOptionalRemarkKey === "function" && isHabitOptionalRemarkKey(key)) return false;
      if (typeof isScheduledLetterKey === "function" && isScheduledLetterKey(key)) return false;
      if (typeof isHabitExperimentKey === "function" && isHabitExperimentKey(key)) return false;
      return !!document.querySelector('#habitRoutineModule .habit-en-row[data-habit-key="' + key + '"]');
    }
    for (let i = 0; i < preferred.length; i++) {
      if (isUsable(preferred[i])) return preferred[i];
    }
    const rows = document.querySelectorAll("#habitHabitsBundle .habit-en-row[data-habit-key]");
    for (let i = 0; i < rows.length; i++) {
      const key = rows[i].getAttribute("data-habit-key");
      if (isUsable(key)) return key;
    }
    return null;
  }

  function forceColdPaint() {
    if (typeof markAllUiPaintSlicesDirty === "function") markAllUiPaintSlicesDirty();
    try {
      lastHeavyModuleDepSnapshot = null;
      lastHeavyModuleCheapKey = "";
    } catch (_e) {}
    try {
      if (typeof lastLife4000PaintSig !== "undefined") lastLife4000PaintSig = "";
    } catch (_e2) {}
    try {
      if (typeof primaryModulePaintedOnce === "object" && primaryModulePaintedOnce) {
        Object.keys(primaryModulePaintedOnce).forEach(function (k) {
          primaryModulePaintedOnce[k] = false;
        });
      }
    } catch (_e3) {}
    try {
      if (typeof resetHabitCheckinsSubTabPaintForPerf === "function") {
        resetHabitCheckinsSubTabPaintForPerf();
      }
    } catch (_e4) {}
    try {
      if (typeof resetSprintShellPaintForPerf === "function") {
        resetSprintShellPaintForPerf();
      }
    } catch (_e5) {}
  }

  /** 切入目标模块前先离开，避免「已在目标」导致假 warm */
  function leavePrimaryModule(targetKey) {
    if (typeof setPrimaryModuleFocus !== "function") return;
    const alt =
      targetKey === "dynamic"
        ? "habit"
        : targetKey === "habit"
          ? "forge"
          : targetKey === "forge"
            ? "goals"
            : targetKey === "goals"
              ? "purpose"
              : "dynamic";
    setPrimaryModuleFocus(alt);
  }

  async function probeAddMemo(n) {
    n = n || 3;
    if (typeof addMemo !== "function" || typeof memoInput === "undefined" || !memoInput) {
      return { skip: true, reason: "addMemo/memoInput missing" };
    }
    const samples = [];
    const structural = [];
    for (let i = 0; i < n; i++) {
      const tag = "__perf_reg_" + Date.now() + "_" + i;
      memoInput.value = tag;
      const one = await measureOnce(async function () {
        addMemo();
        return { hygieneDomain: "skip" };
      });
      samples.push(one);
      if (one.markAllAfter === true) structural.push("markAll after addMemo");
      if (one.stallMarkAll === true) structural.push("stall markAll");
      if (one.hygienePassCount > 0) structural.push("hygiene ran on addMemo (expect skip)");
      if (one.newStall && one.stallHygieneDomain === "full") structural.push("full hygiene on addMemo");
      const m = (state.memo || []).find(function (x) {
        return x && String(x.text) === tag;
      });
      if (m) {
        try {
          state.memo = (state.memo || []).filter(function (x) {
            return !(x && x.id === m.id);
          });
          if (typeof saveState === "function") saveState({ lists: ["memo"] });
          if (typeof render === "function") render();
        } catch (_e2) {}
      }
    }
    return { samples: samples, structural: structural };
  }

  async function probeClosedList(n) {
    n = n || 3;
    let item = findPlainClosedListItem();
    let createdTemp = false;
    if (!item && Array.isArray(state.closedList) && typeof createClosedListItem === "function") {
      const day = typeof formatDateInputValue === "function" ? formatDateInputValue(new Date()) : "";
      item = createClosedListItem("__perf_reg_closed__", day || undefined, "");
      state.closedList.unshift(item);
      createdTemp = true;
      if (typeof saveState === "function") saveState({ lists: ["closedList"] });
    }
    if (!item || typeof toggleClosedListComplete !== "function") {
      return { skip: true, reason: "no plain closedList item" };
    }
    const samples = [];
    const structural = [];
    const start = Boolean(item.completed);
    for (let i = 0; i < n; i++) {
      const target = !Boolean(item.completed);
      const one = await measureOnce(async function () {
        toggleClosedListComplete(item.id, target);
        return { hygieneDomain: "donePrune" };
      });
      samples.push(one);
      if (one.markAllAfter === true) structural.push("markAll after closedList toggle");
      if (one.stallMarkAll === true) structural.push("stall markAll");
      if (one.newStall && one.stallHygieneDomain === "full") {
        structural.push("full hygiene on plain closedList");
      }
    }
    try {
      toggleClosedListComplete(item.id, start);
    } catch (_e) {}
    if (createdTemp) {
      try {
        state.closedList = (state.closedList || []).filter(function (x) {
          return !(x && x.id === item.id);
        });
        if (typeof saveState === "function") saveState({ lists: ["closedList", "done"] });
        if (typeof render === "function") render();
      } catch (_e2) {}
    }
    return { samples: samples, structural: structural };
  }

  async function probeHabit(n) {
    n = n || 3;
    const key = findSimpleHabitKey();
    if (!key || typeof toggleHabitCheckin !== "function") {
      return { skip: true, reason: "no simple habit key" };
    }
    const samples = [];
    const structural = [];
    for (let i = 0; i < n; i++) {
      const one = await measureOnce(async function () {
        toggleHabitCheckin(key);
        return {};
      });
      samples.push(one);
      if (one.markAllAfter === true) structural.push("markAll after habit checkin");
      if (one.stallMarkAll === true) structural.push("stall markAll");
      if (one.newStall && one.stallHygieneDomain === "full") {
        structural.push("full hygiene on simple habit");
      }
    }
    try {
      for (let j = 0; j < n; j++) toggleHabitCheckin(key);
    } catch (_e) {}
    return { samples: samples, structural: structural, habitKey: key };
  }

  async function probePrimarySwitch(moduleKey, mode, n) {
    n = n || 5;
    if (typeof setPrimaryModuleFocus !== "function") {
      return { skip: true, reason: "setPrimaryModuleFocus missing" };
    }
    const samples = [];
    const structural = [];
    // warm：先各刷一遍，再采样本
    if (mode === "warm") {
      leavePrimaryModule(moduleKey);
      setPrimaryModuleFocus(moduleKey);
      await rAF2();
      leavePrimaryModule(moduleKey);
      await rAF2();
    }
    for (let i = 0; i < n; i++) {
      if (mode === "cold") {
        forceColdPaint();
        leavePrimaryModule(moduleKey);
        await rAF2();
      } else {
        leavePrimaryModule(moduleKey);
        await rAF2();
      }
      const one = await measureOnce(async function () {
        setPrimaryModuleFocus(moduleKey);
        return { module: moduleKey, mode: mode };
      });
      samples.push(one);
      if (mode === "warm" && one.renderCount > 0) {
        structural.push("warm primary switch invoked full render (count=" + one.renderCount + ")");
      }
      if (one.markAllAfter === true && mode === "warm") {
        structural.push("markAll after warm primary switch");
      }
    }
    return { samples: samples, structural: structural };
  }

  async function probeAnniversary(mode, n) {
    n = n || 5;
    if (typeof activateKineticTab !== "function") {
      return { skip: true, reason: "activateKineticTab missing" };
    }
    const samples = [];
    const structural = [];
    if (typeof setPrimaryModuleFocus === "function") setPrimaryModuleFocus("dynamic");
    activateKineticTab("done");
    await rAF2();
    if (mode === "warm") {
      activateKineticTab("anniversary", { preferCurrentCycle: true });
      await rAF2();
      activateKineticTab("done");
      await rAF2();
    }
    for (let i = 0; i < n; i++) {
      if (typeof setPrimaryModuleFocus === "function") setPrimaryModuleFocus("dynamic");
      activateKineticTab("done");
      if (mode === "cold") forceColdPaint();
      await rAF2();
      const one = await measureOnce(async function () {
        activateKineticTab("anniversary", { preferCurrentCycle: true });
        return { fullRender: false };
      });
      samples.push(one);
      /* 十二周年不应误走底栏完整 render 整链；允许局部周年重渲 */
      if (one.renderCount > 2) {
        structural.push("anniversary switch unexpected full-render storm (count=" + one.renderCount + ")");
      }
    }
    return { samples: samples, structural: structural };
  }

  function sampleMetric(def, sample) {
    const metric = def.metric || "totalMs";
    let v = sample[metric];
    if ((!Number.isFinite(v) || v <= 0) && metric === "renderMs" && sample.totalMs > 0) {
      v = sample.totalMs;
    }
    return Number.isFinite(v) ? v : 0;
  }

  function collectStructural(def, probe) {
    const structural = Array.from(new Set(probe.structural || []));
    const expect = def.expect || {};
    (probe.samples || []).forEach(function (s) {
      if (expect.markAll === false && (s.markAllAfter === true || s.stallMarkAll === true)) {
        structural.push("markAll/full dirty");
      }
      /* 仅「本轮新产生的 stall」上的 full 可信；历史 stall domain 忽略 */
      if (
        expect.forbidFullHygiene &&
        s.newStall &&
        s.stallHygieneDomain === "full"
      ) {
        structural.push("narrow path degraded to full hygiene");
      }
      if (
        (expect.expectHygieneSkip === true || expect.hygieneDomain === "skip|none" || expect.hygieneDomain === "skip") &&
        s.hygienePassCount > 0
      ) {
        structural.push("expected hygiene skip but hygienePass>0");
      }
      if (expect.warmNoFullRender && expect.mode === "warm" && s.renderCount > 0) {
        structural.push("local/warm path degraded to full render");
      }
    });
    return Array.from(new Set(structural));
  }

  function summarizePath(pathKey, probe) {
    const def = BASELINE.paths[pathKey];
    if (!def) return null;
    if (probe.skip) {
      return {
        path: pathKey,
        label: def.label,
        status: "skipped",
        reason: probe.reason,
        current: null,
        baseline: def.baseline ? def.baseline.avg : null,
        changePct: null,
        verdict: "skipped"
      };
    }
    const metric = def.metric || "totalMs";
    const values = (probe.samples || []).map(function (s) {
      return sampleMetric(def, s);
    });
    const st = stats(values);
    const renderStats = stats(
      (probe.samples || []).map(function (s) {
        return s.renderMs;
      })
    );
    const hygieneStats = stats(
      (probe.samples || []).map(function (s) {
        return s.hygieneMs;
      })
    );
    const heavyStats = stats(
      (probe.samples || []).map(function (s) {
        return s.heavyModulesMs;
      })
    );
    const renderCountStats = stats(
      (probe.samples || []).map(function (s) {
        return s.renderCount;
      })
    );
    const structural = collectStructural(def, probe);
    const compareField =
      (BASELINE.thresholds && BASELINE.thresholds.compareField) || "median";
    const baselineVal =
      def.baseline && Number.isFinite(def.baseline[compareField])
        ? def.baseline[compareField]
        : def.baseline && def.baseline.avg;
    const measuredVal =
      st && Number.isFinite(st[compareField]) ? st[compareField] : st.avg;
    const v = verdictFor(baselineVal, measuredVal, structural, BASELINE.thresholds);
    const change = pctChange(def.baseline && def.baseline.avg, st.avg);
    const effBase = effectiveBaselineValue(baselineVal, BASELINE.thresholds);
    return {
      path: pathKey,
      label: def.label,
      category: def.category || "",
      metric: metric,
      compareField: compareField,
      metricNote: metric === "renderMs" ? "falls back to totalMs when renderMs==0" : "",
      baseline: def.baseline,
      measured: st,
      current: measuredVal,
      currentAvg: st.avg,
      baselineAvg: def.baseline && def.baseline.avg,
      baselineCompare: baselineVal,
      effectiveBaseline: effBase,
      changePct: change,
      changePctCompare: v.changePct,
      phases: {
        renderMs: renderStats,
        hygieneMs: hygieneStats,
        heavyModulesMs: heavyStats,
        renderCount: renderCountStats
      },
      structural: structural,
      samples: probe.samples,
      verdict: v.level,
      ratio: v.ratio,
      reasons: v.reasons || []
    };
  }

  function formatPct(p) {
    if (p == null || !Number.isFinite(p)) return "-";
    const sign = p > 0 ? "+" : "";
    return sign + p + "%";
  }

  function buildPrintable(results, thresholds) {
    const th = thresholds || {};
    const lines = [
      "path | current(" +
        ((thresholds && thresholds.compareField) || "median") +
        ") | baseline | change%(avg) | verdict",
      "---- | ------- | -------- | ------- | -------"
    ];
    results.forEach(function (r) {
      if (r.status === "skipped") {
        lines.push(r.path + " | - | - | - | SKIPPED (" + r.reason + ")");
        return;
      }
      lines.push(
        r.path +
          " | " +
          r.current +
          " | " +
          r.baselineCompare +
          " | " +
          formatPct(r.changePct) +
          " | " +
          r.verdict +
          (r.structural && r.structural.length ? " [" + r.structural.join("; ") + "]" : "")
      );
    });
    lines.push("");
    lines.push(
      "rules: >" +
        (th.warningPct != null ? th.warningPct : 20) +
        "% warning; >" +
        (th.regressionPct != null ? th.regressionPct : 40) +
        "% regression; markAll / new-stall full hygiene / warm→full render = structural_regression" +
        (th.noiseFloorMs != null ? "; noiseFloorMs=" + th.noiseFloorMs : "") +
        "; compareField=" +
        (th.compareField || "median")
    );
    return lines.join("\n");
  }

  async function loadBaselineFromJson() {
    try {
      const url = new URL("./perf/baseline-v1.json", location.href).href;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (!json || !json.paths) throw new Error("invalid baseline json");
      return json;
    } catch (e) {
      console.warn("[perf-regression] fetch baseline-v1.json failed, using embedded fallback", e);
      return EMBEDDED_BASELINE;
    }
  }

  async function runProbeForPath(pathKey, hotN, switchN) {
    const def = BASELINE.paths[pathKey];
    if (!def) return { skip: true, reason: "unknown path" };
    const expect = def.expect || {};
    if (pathKey === "addMemo") return probeAddMemo(hotN);
    if (pathKey === "closedListPlainToggle") return probeClosedList(hotN);
    if (pathKey === "habitSimpleCheckin") return probeHabit(hotN);
    if (def.category === "primarySwitch" || expect.module) {
      const mod = expect.module || String(pathKey).replace(/Switch(Cold|Warm)$/, "");
      const mode = expect.mode || (pathKey.indexOf("Warm") >= 0 ? "warm" : "cold");
      return probePrimarySwitch(mod, mode, switchN);
    }
    if (pathKey.indexOf("anniversary") === 0 || def.category === "kineticSub") {
      const mode = expect.mode || (pathKey.indexOf("Warm") >= 0 ? "warm" : "cold");
      return probeAnniversary(mode, switchN);
    }
    return { skip: true, reason: "no probe mapped" };
  }

  /** 默认覆盖顺序（与 baseline paths 优先列表一致） */
  const DEFAULT_PATH_ORDER = [
    "addMemo",
    "closedListPlainToggle",
    "habitSimpleCheckin",
    "habitSwitchCold",
    "habitSwitchWarm",
    "forgeSwitchCold",
    "forgeSwitchWarm",
    "goalsSwitchCold",
    "goalsSwitchWarm",
    "purposeSwitchCold",
    "purposeSwitchWarm",
    "dynamicSwitchCold",
    "dynamicSwitchWarm",
    "anniversarySwitchCold",
    "anniversarySwitchWarm"
  ];

  async function runPerfRegressionCheck(opts) {
    opts = opts || {};
    const hotN = opts.hotIterations || 3;
    const switchN = opts.switchIterations || 5;
    BASELINE = opts.baseline || (await loadBaselineFromJson());

    if (typeof unlockApp === "function") {
      try {
        unlockApp();
      } catch (_e) {}
    }

    const pathKeys =
      opts.paths && opts.paths.length
        ? opts.paths
        : DEFAULT_PATH_ORDER.filter(function (k) {
            return BASELINE.paths[k];
          });

    const report = {
      version: BASELINE.version,
      at: new Date().toISOString(),
      thresholds: BASELINE.thresholds,
      structuralRules: BASELINE.structuralRules || null,
      baselineSource: opts.baseline ? "opts" : "baseline-v1.json|embedded",
      results: [],
      summary: {
        pass: 0,
        warning: 0,
        regression: 0,
        structural_regression: 0,
        skipped: 0,
        unknown: 0
      }
    };

    for (let i = 0; i < pathKeys.length; i++) {
      const pathKey = pathKeys[i];
      let probe;
      try {
        probe = await runProbeForPath(pathKey, hotN, switchN);
      } catch (e) {
        probe = { skip: true, reason: String(e && e.message ? e.message : e) };
      }
      const row = summarizePath(pathKey, probe);
      if (!row) continue;
      report.results.push(row);
      const key = row.status === "skipped" ? "skipped" : row.verdict;
      if (report.summary[key] == null) report.summary[key] = 0;
      report.summary[key] += 1;
    }

    report.ok =
      report.summary.regression === 0 && report.summary.structural_regression === 0;
    report.printable = buildPrintable(report.results, report.thresholds);

    window.__perfRegressionLastReport = report;
    window.__perfRegressionBaseline = BASELINE;
    console.log("[perf-regression]\n" + report.printable);
    console.log("[perf-regression] ok=" + report.ok + " summary=", report.summary);
    console.log("[perf-regression] full → window.__perfRegressionLastReport");
    return report;
  }

  window.runPerfRegressionCheck = runPerfRegressionCheck;
  window.__perfRegressionBaseline = BASELINE;
  console.log(
    "[perf-regression] ready. Run:\n" +
      "  await runPerfRegressionCheck({ hotIterations: 3, switchIterations: 5 })\n" +
      "Output columns: current | baseline | change% | verdict"
  );
})();
