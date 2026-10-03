/**
 * 第二轮诊断自动化：只采 MODULE SWITCH / CHECKIN→DONE 日志，不改业务逻辑。
 * 用法：node _run_flow_diag_browser.mjs
 */
import puppeteer from "puppeteer-core";
import fs from "fs";

const URL =
  "http://127.0.0.1:8765/index.html?perf=1&switchPerf=1&flowDiag=1&jankCapture=1";
const OUT = "/opt/cursor/artifacts/flow-diag-run.json";
const LOG_OUT = "/opt/cursor/artifacts/flow-diag-console.txt";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome-stable",
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--window-size=1280,900"
    ],
    defaultViewport: { width: 1280, height: 900 }
  });

  const page = await browser.newPage();
  const consoleLines = [];
  page.on("console", (msg) => {
    try {
      const text = msg.text();
      consoleLines.push({
        type: msg.type(),
        text,
        at: Date.now()
      });
    } catch (_e) {}
  });
  page.on("pageerror", (err) => {
    consoleLines.push({ type: "pageerror", text: String(err), at: Date.now() });
  });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(2500);

  // unlock / diag boot sanity
  const boot = await page.evaluate(() => {
    const locked = document.body.classList.contains("app-locked");
    const gateHidden = !!(
      document.getElementById("loginGate") &&
      document.getElementById("loginGate").classList.contains("hidden")
    );
    try {
      if (window.__switchPerf && typeof window.__switchPerf.enable === "function") {
        window.__switchPerf.enable();
      }
      if (window.__flowDiag && typeof window.__flowDiag.enable === "function") {
        window.__flowDiag.enable();
      }
      if (typeof window.resetAliyunOtsTrafficDiag === "function") {
        window.resetAliyunOtsTrafficDiag();
      }
    } catch (_e) {}
    return {
      locked,
      gateHidden,
      hasSwitchPerf: typeof window.__switchPerf !== "undefined",
      hasFlowDiag: typeof window.__flowDiag !== "undefined",
      cache:
        (window.__APP_CACHE_NAME_FOR_BADGE || "") +
        "" ||
        document.body.innerText.match(/v20261002\w/)?.[0] ||
        ""
    };
  });

  async function clickModule(key) {
    const sel = `#primaryModuleBottomNav button[data-module-key="${key}"]`;
    await page.waitForSelector(sel, { timeout: 15000 });
    await page.click(sel);
    await sleep(1200); // cover 1s contention window
  }

  // Warm / cold style switches
  const switchPlan = [
    "habit",
    "forge",
    "dynamic",
    "habit",
    "forge",
    "habit",
    "forge",
    "habit",
    "forge",
    "dynamic",
    "habit",
    "forge",
    "dynamic"
  ];
  for (const key of switchPlan) {
    await clickModule(key);
  }

  // Habit check-in: find a simple habit checkbox-like control
  await clickModule("habit");
  await sleep(800);
  const habitHit = await page.evaluate(async () => {
    const out = { clicked: false, how: "", key: "" };
    // Prefer explicit habit row toggle / checkbox buttons
    const candidates = Array.from(
      document.querySelectorAll(
        "#habitRoutineModule [data-habit-key] button, #habitRoutineModule .habit-check-btn, #habitRoutineModule input[type='checkbox'], #habitRoutineModule .manual-item-more-btn"
      )
    );
    // Try toggling via known API if present
    try {
      if (typeof window.toggleHabitCheckin === "function") {
        // pick a common simple key from DOM
        const row = document.querySelector("#habitRoutineModule [data-habit-key]");
        const key = row ? row.getAttribute("data-habit-key") : "";
        if (key && typeof toggleHabitCheckin === "function") {
          toggleHabitCheckin(key);
          out.clicked = true;
          out.how = "toggleHabitCheckin";
          out.key = key;
          return out;
        }
      }
    } catch (_e) {}
    for (const el of candidates) {
      const row = el.closest("[data-habit-key]");
      const key = row ? row.getAttribute("data-habit-key") : "";
      if (!key) continue;
      // skip numeric-entry habits that open dialogs
      try {
        if (typeof isHabitNumericInputKey === "function" && isHabitNumericInputKey(key)) continue;
      } catch (_n) {}
      try {
        el.click();
        out.clicked = true;
        out.how = "dom-click";
        out.key = key;
        return out;
      } catch (_c) {}
    }
    // fallback: first data-habit-key + toggleHabitCheckin
    const row2 = document.querySelector("#habitRoutineModule [data-habit-key]");
    if (row2 && typeof toggleHabitCheckin === "function") {
      const key = row2.getAttribute("data-habit-key") || "";
      toggleHabitCheckin(key);
      out.clicked = true;
      out.how = "fallback-api";
      out.key = key;
    }
    return out;
  });
  await sleep(800);
  // second habit checkin via API to ensure CHECKIN→DONE metrics
  await page.evaluate(() => {
    try {
      const rows = Array.from(document.querySelectorAll('#habitRoutineModule [data-habit-key]'));
      for (const row of rows) {
        const key = row.getAttribute('data-habit-key') || '';
        if (!key) continue;
        if (typeof isHabitNumericInputKey === 'function' && isHabitNumericInputKey(key)) continue;
        if (typeof isHabitMinutesKey === 'function' && isHabitMinutesKey(key)) continue;
        if (key === 'handwriteMissionGoalsWhatIWant') continue;
        if (typeof toggleHabitCheckin === 'function') {
          toggleHabitCheckin(key);
          return key;
        }
      }
      if (typeof toggleHabitCheckin === 'function') toggleHabitCheckin('earlyRise');
    } catch (_e) {}
    return '';
  });
  await sleep(2500);

  // Forge check-in attempt
  await clickModule("forge");
  await sleep(800);
  const forgeHit = await page.evaluate(() => {
    const out = { clicked: false, how: "" };
    try {
      // Prefer existing helper if exposed; else click a forge check control
      const btn =
        document.querySelector("#forgeModule .forge-task-card-icon--body") ||
        document.querySelector("#forgeModule .forge-task-card-mind-check") ||
        document.querySelector("#forgeModule button.forge-task-check") ||
        document.querySelector("#forgeModule .forge-task-card-check-label");
      if (btn) {
        btn.click();
        out.clicked = true;
        out.how = "dom-click";
        return out;
      }
    } catch (_e) {}
    return out;
  });
  // If a dialog/input appeared for forge amount, try type and confirm
  await sleep(500);
  await page.evaluate(() => {
    const input =
      document.querySelector("#forgeModule input[type='number']") ||
      document.querySelector("#forgeModule input.forge-checkin-input") ||
      document.querySelector("input[placeholder*='数量']") ||
      document.querySelector("dialog input, .modal input");
    if (input) {
      input.focus();
      input.value = "1";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const ok =
      document.querySelector("button#forgeCheckinConfirmBtn") ||
      Array.from(document.querySelectorAll("button")).find((b) =>
        /确认|打卡|记录|保存/.test(String(b.textContent || ""))
      );
    if (ok) ok.click();
  });
  await sleep(2200);

  // More switches after check-in (contention window more likely)
  for (const key of ["habit", "forge", "habit", "forge", "dynamic"]) {
    await clickModule(key);
  }

  await sleep(1500);

  const dump = await page.evaluate(() => {
    const switches =
      window.__flowDiag && typeof window.__flowDiag.dumpSwitch === "function"
        ? window.__flowDiag.dumpSwitch()
        : [];
    const checkins =
      window.__flowDiag && typeof window.__flowDiag.dumpCheckin === "function"
        ? window.__flowDiag.dumpCheckin()
        : [];
    const switchPerf =
      window.__switchPerf && typeof window.__switchPerf.dump === "function"
        ? window.__switchPerf.dump()
        : [];
    const traffic =
      typeof window.getAliyunOtsTrafficDiag === "function"
        ? window.getAliyunOtsTrafficDiag()
        : null;
    return {
      switches,
      checkins,
      switchPerf,
      traffic,
      activeModule:
        typeof activePrimaryModuleKey !== "undefined" ? activePrimaryModuleKey : null
    };
  });

  // parse MODULE SWITCH / CHECKIN blocks from console
  const blocks = [];
  let buf = [];
  let mode = null;
  for (const line of consoleLines) {
    const t = line.text || "";
    if (t.includes("===== MODULE SWITCH =====")) {
      mode = "switch";
      buf = [t];
      continue;
    }
    if (t.includes("===== CHECKIN -> DONE =====")) {
      mode = "checkin";
      buf = [t];
      continue;
    }
    if (mode && (t.includes("=========================") || t.includes("==========================="))) {
      buf.push(t);
      blocks.push({ kind: mode, text: buf.join("\n") });
      mode = null;
      buf = [];
      continue;
    }
    if (mode) buf.push(t);
  }

  const result = {
    boot,
    habitHit,
    forgeHit,
    blockCount: blocks.length,
    blocks,
    dumpSummary: {
      switchCount: (dump.switches || []).length,
      checkinCount: (dump.checkins || []).length,
      switchPerfCount: (dump.switchPerf || []).length,
      trafficPullCount: dump.traffic && dump.traffic.pullCount,
      trafficGetCount: dump.traffic && dump.traffic.getCount,
      trafficPostCount: dump.traffic && dump.traffic.postCount
    },
    switches: dump.switches || [],
    checkins: dump.checkins || [],
    switchPerf: dump.switchPerf || [],
    traffic: dump.traffic
  };

  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  fs.writeFileSync(
    LOG_OUT,
    consoleLines.map((l) => `[${l.type}] ${l.text}`).join("\n")
  );

  console.log(
    JSON.stringify(
      {
        boot,
        habitHit,
        forgeHit,
        blockCount: blocks.length,
        dumpSummary: result.dumpSummary,
        out: OUT
      },
      null,
      2
    )
  );

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
