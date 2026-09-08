/**
 * P1.5 探针：Sprint 壳 Closed/Life/Work/Open — warm 常驻 DOM（无搬家/无 rebuild）
 * 用法（应用已加载并解锁）：
 *   const s = await (await fetch('./perf/probe-sprint-shell-switch.js')).text(); eval(s);
 *   console.log((await runSprintShellSwitchProbe()).printable);
 */
(function () {
  "use strict";

  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }
  function round2(n) {
    return Math.round(n * 100) / 100;
  }
  function rAF2() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }
  function snap() {
    return typeof getCloudSyncPerfSnapshot === "function" ? getCloudSyncPerfSnapshot() : {};
  }
  function resetPerf() {
    if (typeof resetCloudSyncPerfCounters === "function") resetCloudSyncPerfCounters();
  }
  function ensureKinetic() {
    if (typeof setPrimaryModuleFocus === "function") setPrimaryModuleFocus("dynamic");
    if (typeof activateKineticTab === "function") activateKineticTab("weekly");
  }
  function clickShell(shell) {
    const id =
      shell === "closed"
        ? "weeklyPlanShellClosedBtn"
        : shell === "life"
          ? "weeklyPlanLaneLifeBtn"
          : shell === "work"
            ? "weeklyPlanLaneWorkBtn"
            : "weeklyPlanLaneOpenBtn";
    const btn = document.getElementById(id);
    if (!btn) throw new Error("missing shell btn " + id);
    btn.click();
  }
  function coldReset() {
    if (typeof resetSprintShellPaintForPerf === "function") resetSprintShellPaintForPerf();
  }

  function delta(after, before, key) {
    return (after[key] || 0) - (before[key] || 0);
  }

  function measureFields(label, before, after, totalMs) {
    return {
      label: label,
      totalMs: round2(totalMs),
      jsMs: round2(delta(after, before, "sprintShellSwitchMs")),
      renderCount: delta(after, before, "renderCount"),
      fullRenderCount: delta(after, before, "renderCount"),
      rebuildCount: delta(after, before, "sprintShellListRebuildCount"),
      stashCount: delta(after, before, "sprintShellStashCount"),
      restoreCount: delta(after, before, "sprintShellRestoreCount"),
      domWriteCount: delta(after, before, "sprintShellDomWriteCount"),
      renderWeeklyPlanListCount: delta(after, before, "renderWeeklyPlanListCount"),
      renderClosedListPanelCount: delta(after, before, "renderClosedListPanelCount"),
      syncSprintViewModeUiDomWrites: delta(after, before, "sprintShellDomWriteCount"),
      closedScanCount: delta(after, before, "isgGateClosedScanCount"),
      closedScanSkipCount: delta(after, before, "isgGateClosedScanSkipCount"),
      cacheHitSkipCount: delta(after, before, "sprintShellSwitchSkipCount"),
      sprintShellSwitchCount: delta(after, before, "sprintShellSwitchCount"),
      debug: typeof getSprintShellPaintDebug === "function" ? getSprintShellPaintDebug() : null
    };
  }

  async function measure(label, prep, run) {
    if (prep) await prep();
    await rAF2();
    resetPerf();
    const before = snap();
    const t0 = now();
    await run();
    const totalMs = now() - t0;
    await rAF2();
    const after = snap();
    return measureFields(label, before, after, totalMs);
  }

  function warmCleanPass(s) {
    return (
      s.renderCount === 0 &&
      s.rebuildCount === 0 &&
      s.stashCount === 0 &&
      s.restoreCount === 0 &&
      s.renderWeeklyPlanListCount === 0 &&
      s.renderClosedListPanelCount === 0 &&
      s.closedScanCount === 0 &&
      s.cacheHitSkipCount >= 1
    );
  }

  async function runSprintShellSwitchProbe() {
    ensureKinetic();
    await rAF2();

    /* 预热：各壳走一遍（建立常驻宿主 + paint） */
    const shells = ["closed", "life", "work", "open"];
    for (let i = 0; i < shells.length; i++) {
      clickShell(shells[i]);
      await rAF2();
    }

    const cold = await measure(
      "Sprint 壳 cold（reset 后 closed→life）",
      async function () {
        clickShell("closed");
        await rAF2();
        coldReset();
      },
      async function () {
        clickShell("life");
      }
    );

    const warmLifeWorkLife = await measure(
      "Sprint 壳 warm（life→work→life）",
      async function () {
        clickShell("life");
        await rAF2();
        clickShell("work");
        await rAF2();
      },
      async function () {
        clickShell("life");
      }
    );

    const warmClosed = await measure(
      "Sprint 壳 warm（life→closed）",
      async function () {
        clickShell("life");
        await rAF2();
      },
      async function () {
        clickShell("closed");
      }
    );

    /* 模拟优化前：强制 render() */
    const beforeSim = await measure(
      "模拟优化前 warm（setShell+render）",
      async function () {
        clickShell("life");
        await rAF2();
        clickShell("work");
        await rAF2();
      },
      async function () {
        if (typeof setWeeklyPlanShell === "function") setWeeklyPlanShell("life");
        if (typeof render === "function") render();
      }
    );

    /* 验收循环：Closed → Life → Work → Open → Life ×10 */
    resetPerf();
    const beforeBurst = snap();
    const burstT0 = now();
    const cycle = ["closed", "life", "work", "open", "life"];
    for (let round = 0; round < 10; round++) {
      for (let i = 0; i < cycle.length; i++) {
        clickShell(cycle[i]);
      }
    }
    const burstMs = now() - burstT0;
    await rAF2();
    const afterBurst = snap();
    const burst = measureFields(
      "连续 Closed→Life→Work→Open→Life ×10",
      beforeBurst,
      afterBurst,
      burstMs
    );

    const samples = [cold, warmLifeWorkLife, warmClosed, beforeSim, burst];
    const lines = [
      "Sprint shell switch P1.5 probe",
      "label | totalMs | jsMs | fullRender | rebuild | stash/restore | list/panel | closedScan | skip | domWrite",
      "----- | ------- | ---- | ---------- | ------- | ------------- | ---------- | ---------- | ---- | --------"
    ];
    samples.forEach(function (s) {
      let notes = "";
      if (s.label.indexOf("warm（life→work→life）") >= 0) {
        notes = warmCleanPass(s) ? "PASS warm+clean" : "CHECK warm";
      }
      if (s.label.indexOf("×10") >= 0) {
        notes =
          s.fullRenderCount === 0 &&
          s.rebuildCount === 0 &&
          s.stashCount === 0 &&
          s.restoreCount === 0 &&
          s.renderWeeklyPlanListCount === 0 &&
          s.renderClosedListPanelCount === 0
            ? "PASS burst warm"
            : "CHECK burst";
      }
      if (s.label.indexOf("模拟优化前") >= 0) {
        notes = "baseline-like fullRender=" + s.fullRenderCount;
      }
      lines.push(
        [
          s.label,
          s.totalMs,
          s.jsMs,
          s.fullRenderCount,
          s.rebuildCount,
          s.stashCount + "/" + s.restoreCount,
          s.renderWeeklyPlanListCount + "/" + s.renderClosedListPanelCount,
          s.closedScanCount + "(skip " + s.closedScanSkipCount + ")",
          s.cacheHitSkipCount,
          s.domWriteCount,
          notes
        ].join(" | ")
      );
    });

    const printable = lines.join("\n");
    const result = { samples: samples, printable: printable };
    window.__sprintShellSwitchProbeLast = result;
    return result;
  }

  window.runSprintShellSwitchProbe = runSprintShellSwitchProbe;
})();
