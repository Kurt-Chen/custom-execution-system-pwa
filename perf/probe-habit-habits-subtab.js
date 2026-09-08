/**
 * P0 探针：Habit「习惯」子 Tab cold / warm / 往返 / 打卡后刷新 / 快速切换 ×10
 * 用法（应用已加载）：
 *   const s = await (await fetch('./perf/probe-habit-habits-subtab.js')).text(); eval(s);
 *   const r = await runHabitHabitsSubTabProbe();
 *   console.log(r.printable);
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
  function ensureHabitModule() {
    if (typeof setPrimaryModuleFocus === "function") setPrimaryModuleFocus("habit");
  }
  function goHabits() {
    if (typeof activateHabitRoutineSubTab === "function") {
      activateHabitRoutineSubTab("habit-group-habits");
    }
  }
  function goLife4000() {
    if (typeof activateHabitRoutineSubTab === "function") {
      activateHabitRoutineSubTab("habit-group-life4000");
    }
  }
  function goMeasure() {
    if (typeof activateHabitRoutineSubTab === "function") {
      activateHabitRoutineSubTab("habit-group-measure");
    }
  }
  function coldReset() {
    if (typeof resetHabitCheckinsSubTabPaintForPerf === "function") {
      resetHabitCheckinsSubTabPaintForPerf();
    } else if (typeof markHabitCheckinsSubTabDirty === "function") {
      markHabitCheckinsSubTabDirty();
    }
  }

  async function measureSwitch(label, prepFn, runFn) {
    if (prepFn) await prepFn();
    await rAF2();
    resetPerf();
    const before = snap();
    const t0 = now();
    await runFn();
    const totalMs = now() - t0;
    await rAF2();
    const after = snap();
    return {
      label: label,
      totalMs: round2(totalMs),
      renderCount: (after.renderCount || 0) - (before.renderCount || 0),
      habitCheckinsRenderCount:
        (after.habitCheckinsRenderCount || 0) - (before.habitCheckinsRenderCount || 0),
      habitCheckinsSkippedCount:
        (after.habitCheckinsSkippedCount || 0) - (before.habitCheckinsSkippedCount || 0),
      habitCheckinsRenderMs: round2(
        (after.habitCheckinsRenderMs || 0) - (before.habitCheckinsRenderMs || 0)
      ),
      paintDebug:
        typeof getHabitCheckinsSubTabPaintDebug === "function"
          ? getHabitCheckinsSubTabPaintDebug()
          : null
    };
  }

  async function findAndPunchSimpleHabit() {
    const preferred = ["makeBed", "floss", "drinkWater", "morningLight", "coldShower"];
    let key = null;
    for (let i = 0; i < preferred.length; i++) {
      const k = preferred[i];
      if (document.querySelector('#habitHabitsBundle .habit-en-row[data-habit-key="' + k + '"]')) {
        key = k;
        break;
      }
    }
    if (!key) {
      const row = document.querySelector("#habitHabitsBundle .habit-en-row[data-habit-key]");
      if (row) key = row.getAttribute("data-habit-key");
    }
    if (!key) return { ok: false, reason: "no habit row" };
    const btn = document.querySelector(
      '#habitHabitsBundle .habit-en-row[data-habit-key="' + key + '"] .habit-check-btn'
    );
    if (!btn) return { ok: false, reason: "no check btn", key: key };
    const beforeChecked = btn.classList.contains("checked");
    btn.click();
    await rAF2();
    await rAF2();
    const afterBtn = document.querySelector(
      '#habitHabitsBundle .habit-en-row[data-habit-key="' + key + '"] .habit-check-btn'
    );
    const afterChecked = afterBtn && afterBtn.classList.contains("checked");
    return {
      ok: beforeChecked !== afterChecked,
      key: key,
      beforeChecked: beforeChecked,
      afterChecked: afterChecked
    };
  }

  async function runHabitHabitsSubTabProbe() {
    ensureHabitModule();
    await rAF2();

    /* 先 warm 刷一遍，再测 cold（reset paint） */
    goHabits();
    await rAF2();
    goLife4000();
    await rAF2();

    const cold = await measureSwitch(
      "Habit→习惯 cold",
      async function () {
        goLife4000();
        await rAF2();
        coldReset();
      },
      async function () {
        goHabits();
      }
    );

    /* warm：已 paint 且无 dirty */
    const warm = await measureSwitch(
      "Habit→习惯 warm",
      async function () {
        goHabits();
        await rAF2();
        goLife4000();
        await rAF2();
      },
      async function () {
        goHabits();
      }
    );

    const roundTrip = await measureSwitch(
      "习惯→衡量→习惯",
      async function () {
        goHabits();
        await rAF2();
      },
      async function () {
        goMeasure();
        await rAF2();
        goHabits();
      }
    );

    /* 打卡后离开再回：应 renderHabitCheckins ≥1 */
    goHabits();
    await rAF2();
    const punch = await findAndPunchSimpleHabit();
    goLife4000();
    await rAF2();
    const afterPunch = await measureSwitch(
      "打卡后离开→再回习惯",
      null,
      async function () {
        goHabits();
      }
    );
    afterPunch.punch = punch;

    /* 快速切换 10 次（life4000 ↔ habits），期望后 9 次多为 skip */
    goLife4000();
    await rAF2();
    goHabits();
    await rAF2();
    resetPerf();
    const beforeBurst = snap();
    const burstT0 = now();
    for (let i = 0; i < 10; i++) {
      goLife4000();
      goHabits();
    }
    const burstMs = now() - burstT0;
    await rAF2();
    const afterBurst = snap();
    const burst = {
      label: "连续快速切换×10",
      totalMs: round2(burstMs),
      renderCount: (afterBurst.renderCount || 0) - (beforeBurst.renderCount || 0),
      habitCheckinsRenderCount:
        (afterBurst.habitCheckinsRenderCount || 0) - (beforeBurst.habitCheckinsRenderCount || 0),
      habitCheckinsSkippedCount:
        (afterBurst.habitCheckinsSkippedCount || 0) - (beforeBurst.habitCheckinsSkippedCount || 0)
    };

    /* 模拟优化前 warm：强制每次 renderHabitCheckins */
    const beforeSim = await measureSwitch(
      "模拟优化前 warm（强制 renderHabitCheckins）",
      async function () {
        goHabits();
        await rAF2();
        goLife4000();
        await rAF2();
      },
      async function () {
        goHabits();
        if (typeof renderHabitCheckins === "function") renderHabitCheckins();
      }
    );

    const samples = [cold, warm, roundTrip, afterPunch, burst, beforeSim];
    const lines = [
      "Habit「习惯」子 Tab P0 probe",
      "label | totalMs | habitCheckinsRender | skipped | renderCount | notes",
      "----- | ------- | ------------------- | ------- | ----------- | -----"
    ];
    samples.forEach(function (s) {
      let notes = "";
      if (s.punch) {
        notes =
          "punch=" +
          (s.punch.ok ? "ok" : "fail") +
          (s.punch.key ? ":" + s.punch.key : "") +
          " " +
          s.punch.beforeChecked +
          "→" +
          s.punch.afterChecked;
      }
      if (s.label.indexOf("warm") >= 0 && s.label.indexOf("模拟") < 0) {
        notes +=
          (notes ? "; " : "") +
          (s.habitCheckinsRenderCount === 0 && s.habitCheckinsSkippedCount >= 1
            ? "PASS warm skip"
            : "CHECK warm");
      }
      if (s.label.indexOf("打卡后") >= 0) {
        notes +=
          (notes ? "; " : "") +
          (s.habitCheckinsRenderCount >= 1 ? "PASS dirty repaint" : "FAIL no repaint");
      }
      if (s.label.indexOf("×10") >= 0) {
        notes +=
          (notes ? "; " : "") +
          (s.habitCheckinsRenderCount === 0 && s.habitCheckinsSkippedCount >= 9
            ? "PASS burst skip"
            : "CHECK burst");
      }
      lines.push(
        s.label +
          " | " +
          s.totalMs +
          " | " +
          s.habitCheckinsRenderCount +
          " | " +
          s.habitCheckinsSkippedCount +
          " | " +
          s.renderCount +
          " | " +
          notes
      );
    });
    const report = {
      samples: samples,
      printable: lines.join("\n"),
      viewport: {
        w: window.innerWidth,
        h: window.innerHeight,
        coarse:
          typeof window.matchMedia === "function" &&
          window.matchMedia("(pointer: coarse)").matches
      }
    };
    window.__habitHabitsSubTabProbeLast = report;
    return report;
  }

  window.runHabitHabitsSubTabProbe = runHabitHabitsSubTabProbe;
})();
