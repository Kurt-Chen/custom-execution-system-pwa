/**
 * 验证 Habit/Forge warm 切换 + 打卡后切 Done（只采日志）。
 */
import puppeteer from "puppeteer-core";
import fs from "fs";

const URL =
  "http://127.0.0.1:8765/index.html?perf=1&switchPerf=1&flowDiag=1";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1280, height: 900 }
  });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);
  await page.evaluate(() => {
    if (window.__switchPerf) window.__switchPerf.enable();
    if (window.__flowDiag) window.__flowDiag.enable();
  });

  async function clickModule(key) {
    await page.click(`#primaryModuleBottomNav button[data-module-key="${key}"]`);
    await sleep(1100);
  }

  // Home → Habit → Forge cold
  await clickModule("dynamic");
  await clickModule("habit");
  await clickModule("forge");

  // Habit ↔ Forge × 10
  for (let i = 0; i < 10; i++) {
    await clickModule(i % 2 === 0 ? "habit" : "forge");
  }

  // Checkin on Habit then switch Done (dynamic)
  await clickModule("habit");
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("#habitRoutineModule [data-habit-key]"));
    for (const row of rows) {
      const key = row.getAttribute("data-habit-key") || "";
      if (!key) continue;
      try {
        if (typeof isHabitNumericInputKey === "function" && isHabitNumericInputKey(key)) continue;
      } catch (_e) {}
      if (typeof toggleHabitCheckin === "function") {
        toggleHabitCheckin(key);
        return key;
      }
    }
    return "";
  });
  await sleep(800);
  await clickModule("dynamic");
  await page.evaluate(() => {
    if (typeof activateKineticTab === "function") activateKineticTab("done");
  });
  await sleep(1200);

  const dump = await page.evaluate(() => ({
    switches: window.__flowDiag ? window.__flowDiag.dumpSwitch() : [],
    checkins: window.__flowDiag ? window.__flowDiag.dumpCheckin() : [],
    switchPerf: window.__switchPerf ? window.__switchPerf.dump() : []
  }));
  fs.writeFileSync(
    "/opt/cursor/artifacts/warm-switch-verify.json",
    JSON.stringify(dump, null, 2)
  );

  const hf = [];
  for (const s of dump.switches) {
    if (s.label !== "primary:habit" && s.label !== "primary:forge") continue;
    const tl = s.timeline || {};
    const fr = s.from || {};
    const to = s.to || {};
    hf.push({
      route: (fr.primary || "") + "→" + (to.primary || ""),
      warm: s.warmOrCold,
      needsPaint: s.needsPaint,
      total: s.totalSwitchMs,
      local: s.localRenderMs,
      dom: s.domRebuildCount
    });
  }

  // skip first habit + first forge cold
  let seenH = false;
  let seenF = false;
  const subsequent = [];
  for (const r of hf) {
    const isH = r.route.endsWith("→habit") || r.route === "habit→habit";
    // classify by target
    const to = r.route.split("→")[1];
    if (to === "habit") {
      if (!seenH) {
        seenH = true;
        r.phase = "cold1";
      } else r.phase = "sub";
    } else if (to === "forge") {
      if (!seenF) {
        seenF = true;
        r.phase = "cold1";
      } else r.phase = "sub";
    } else r.phase = "sub";
    subsequent.push(r);
  }
  const loop = subsequent.filter((r) => r.phase === "sub");
  // Habit↔Forge 10 次在打卡前：取 cold 之后、checkin 前的连续段
  // 简化：所有 sub 且 needsPaint false 的占比
  const beforeCheckin = loop.slice(0, 10);
  const summary = {
    cache: "v20261002t",
    cold: subsequent.filter((r) => r.phase === "cold1"),
    habitForgeLoop10: beforeCheckin,
    loopAllWarmCss: beforeCheckin.every(
      (r) => r.needsPaint === false && (r.local || 0) < 5 && (r.dom || 0) < 20
    ),
    loopAvgTotal:
      beforeCheckin.reduce((a, b) => a + (b.total || 0), 0) / (beforeCheckin.length || 1),
    loopAvgLocal:
      beforeCheckin.reduce((a, b) => a + (b.local || 0), 0) / (beforeCheckin.length || 1),
    checkins: (dump.checkins || []).map((c) => ({
      source: c.sourceModule,
      clickToDoneVisibleMs: c.clickToDoneVisibleMs,
      waitedForCloud: c.waitedForCloudBeforeDoneVisible,
      sourceRenderMs: c.sourceRenderMs
    })),
    allHf: hf
  };
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
  if (!summary.loopAllWarmCss) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
