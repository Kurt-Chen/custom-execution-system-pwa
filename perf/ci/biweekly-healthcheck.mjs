/**
 * 每半月 PWA 性能体检（只读 · 测正式 GitHub Pages）
 * - 不改业务代码、不写云端破坏性操作、不自动 commit
 * - 超时保护，禁止无限等待
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { compareToCiBaseline, fingerprintEnv } from "./compare.mjs";
import {
  loadStreakState,
  saveStreakState,
  updateStreakAndEscalate,
  writeHistoryEntry,
  writeDiagnosisMarkdown
} from "./history.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_URL = "https://kurt-chen.github.io/custom-execution-system-pwa/";
const GLOBAL_TIMEOUT_MS = Number(process.env.PERF_CI_GLOBAL_TIMEOUT_MS || 12 * 60 * 1000);
const NAV_TIMEOUT_MS = 90_000;
const STEP_TIMEOUT_MS = 120_000;
const CHECK_MODE = String(process.env.PERF_CI_MODE || "biweekly").toLowerCase();
const HISTORY_DIR = process.env.PERF_HISTORY_DIR || path.join(ROOT, "docs/performance-history");
const STATE_DIR = process.env.PERF_CI_STATE_DIR || path.join(__dirname, ".ci-state");

function argUrl() {
  const i = process.argv.indexOf("--url");
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env.PERF_CI_URL || DEFAULT_URL;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nowIso() {
  return new Date().toISOString();
}

async function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`timeout:${label}:${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

async function unlock(page) {
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem("todo-app-auth-session-lock-v1");
    } catch (_e) {}
    try {
      if (typeof unlockApp === "function") unlockApp();
    } catch (_u) {}
  });
  const pwd = process.env.PERF_UNLOCK_PASSWORD;
  if (pwd) {
    try {
      const input = page.locator("#loginPasswordInput");
      if (await input.count()) {
        await input.fill(pwd);
        const btn = page.locator("button", { hasText: /解锁|进入|登录/ }).first();
        if (await btn.count()) await btn.click({ timeout: 3000 }).catch(() => {});
        await page.evaluate(() => {
          try {
            if (typeof unlockApp === "function") unlockApp();
          } catch (_e) {}
        });
      }
    } catch (_login) {}
  }
}

async function waitAppReady(page) {
  await page.waitForFunction(
    () => typeof window.__APP_CACHE_NAME_FOR_BADGE !== "undefined" || typeof saveState === "function",
    null,
    { timeout: NAV_TIMEOUT_MS }
  );
  await unlock(page);
  await sleep(800);
  await unlock(page);
}

function pageHelpers() {
  return {
    async sampleFps(sec) {
      sec = Math.max(1, Number(sec) || 3);
      return await new Promise((resolve) => {
        const start = performance.now();
        let last = start;
        let frames = 0;
        const gaps = [];
        function tick(t) {
          frames += 1;
          const g = t - last;
          last = t;
          if (g > 50) gaps.push(Math.round(g));
          if (t - start < sec * 1000) requestAnimationFrame(tick);
          else {
            resolve({
              fps: Math.round((frames / ((t - start) / 1000)) * 10) / 10,
              frames,
              longFrameGapMax: gaps.reduce((m, x) => Math.max(m, x), 0)
            });
          }
        }
        requestAnimationFrame(tick);
      });
    },
    observeLongTasks(bucket) {
      try {
        const obs = new PerformanceObserver((list) => {
          list.getEntries().forEach((e) => {
            const d = Number(e.duration) || 0;
            bucket.count += 1;
            if (d > bucket.maxMs) bucket.maxMs = d;
            bucket.samples.push(Math.round(d * 10) / 10);
          });
        });
        obs.observe({ type: "longtask", buffered: false });
        return obs;
      } catch (_e) {
        return null;
      }
    }
  };
}

async function main() {
  const started = Date.now();
  const url = argUrl().replace(/\/?$/, "/");
  const baselinePath = path.join(__dirname, "ci-baseline.json");
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const reportsDir = path.join(__dirname, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    ok: false,
    kind: "pwa-perf-healthcheck",
    mode: CHECK_MODE,
    at: nowIso(),
    targetUrl: url,
    infraError: null,
    measured: {},
    comparison: null,
    goldenReference: baseline.formalReference || null,
    unverifiable: [
      "aliyun_monthly_bill_cny",
      "true_dual_device_sync",
      "github_actions_schedule_disabled_status"
    ],
    note: "只读体检；不修改业务代码；不自动 commit；阿里云账单等项在 CI 中标记为不可验证"
  };

  let browser;
  const deadline = started + GLOBAL_TIMEOUT_MS;

  function remain() {
    return Math.max(5_000, deadline - Date.now());
  }

  try {
    browser = await withTimeout(
      chromium.launch({
        headless: true,
        args: ["--disable-dev-shm-usage", "--no-sandbox"]
      }),
      60_000,
      "chromium.launch"
    );
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS);
    const chromeVer = await browser.version();

    const bootT0 = Date.now();
    const resp = await withTimeout(
      page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }),
      NAV_TIMEOUT_MS + 5_000,
      "goto"
    );
    if (!resp || !resp.ok()) {
      throw new Error(`infra:http_status:${resp && resp.status()}`);
    }
    await withTimeout(waitAppReady(page), remain(), "waitAppReady");
    const bootMs = Date.now() - bootT0;

    const bootInfo = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      return {
        cacheName: window.__APP_CACHE_NAME_FOR_BADGE || null,
        readyState: document.readyState,
        domContentLoaded:
          nav && nav.domContentLoadedEventEnd
            ? Math.round(nav.domContentLoadedEventEnd)
            : null,
        loadEventEnd: nav && nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
        machine:
          typeof getCloudSyncMachineStatus === "function" ? getCloudSyncMachineStatus() : null
      };
    });

    report.measured.boot = {
      toInteractiveMs: bootMs,
      httpStatus: resp.status(),
      ...bootInfo
    };
    report.measured.cacheName = bootInfo.cacheName;

    /* ---- 场景 A：轻量同步观察（单次 near-realtime，避免打满正文） ---- */
    const scenarioA = await withTimeout(
      page.evaluate(async () => {
        function sleep(ms) {
          return new Promise((r) => setTimeout(r, ms));
        }
        if (typeof setCloudSyncPerfEnabled === "function") setCloudSyncPerfEnabled(true);
        if (typeof resetCloudSyncPerfCounters === "function") resetCloudSyncPerfCounters();
        const lt = { count: 0, maxMs: 0, samples: [] };
        let obs = null;
        try {
          obs = new PerformanceObserver((list) => {
            list.getEntries().forEach((e) => {
              const d = Number(e.duration) || 0;
              lt.count += 1;
              if (d > lt.maxMs) lt.maxMs = d;
              lt.samples.push(Math.round(d * 10) / 10);
            });
          });
          obs.observe({ type: "longtask", buffered: false });
        } catch (_o) {}
        const netBefore = performance.getEntriesByType("resource").length;
        const t0 = performance.now();
        try {
          if (typeof __diagClearAliyunPullInFlight === "function") __diagClearAliyunPullInFlight();
        } catch (_c) {}
        try {
          if (typeof scheduleAliyunSyncPrimaryNearRealtimePull === "function") {
            scheduleAliyunSyncPrimaryNearRealtimePull("perf-ci-A");
          } else if (typeof runAliyunSyncPrimaryNearRealtimePull === "function") {
            await runAliyunSyncPrimaryNearRealtimePull("poll");
          }
        } catch (_p) {}
        let waited = 0;
        while (waited < 20000) {
          let inflight = false;
          try {
            inflight = !!aliyunSyncPrimaryPullInFlight;
          } catch (_i) {}
          const m =
            typeof getCloudSyncMachineStatus === "function" ? getCloudSyncMachineStatus() : "";
          if (!inflight && m !== "syncing") break;
          await sleep(400);
          waited += 400;
        }
        await sleep(1500);
        if (obs) {
          try {
            obs.disconnect();
          } catch (_d) {}
        }
        const perf =
          typeof getCloudSyncPerfSnapshot === "function" ? getCloudSyncPerfSnapshot() : null;
        const aliyunReqs = performance
          .getEntriesByType("resource")
          .slice(netBefore)
          .filter((e) => /aliyun|oss|fc\.|execute-api|sync|rooms/i.test(String(e.name || "")));
        return {
          elapsedMs: Math.round(performance.now() - t0),
          waitedMs: waited,
          longTaskMaxMs: Math.round(lt.maxMs * 10) / 10,
          longTaskCount: lt.count,
          stringifyCount: perf && perf.stringifyCount,
          stringifyMs: perf && perf.stringifyMs,
          persistCount: perf && perf.persistCount,
          persistMs: perf && perf.persistMs,
          aliyunReqCount: aliyunReqs.length,
          machine:
            typeof getCloudSyncMachineStatus === "function" ? getCloudSyncMachineStatus() : null
        };
      }),
      Math.min(remain(), 90_000),
      "scenarioA"
    );
    report.measured.scenarioA = scenarioA;

    /* ---- Habit / Forge 探针（本地计算，不写云） ---- */
    const habitForge = await page.evaluate(() => {
      const out = { habit: null, forge: null };
      try {
        if (window.__habitDoneDayIndex && typeof window.__habitDoneDayIndex.stats === "function") {
          const st0 = window.__habitDoneDayIndex.stats();
          const t0 = performance.now();
          let n = 0;
          /* 索引通过 getHabitDoneRowsForDay 命中；无独立 query API */
          if (typeof getHabitDoneRowsForDay === "function") {
            const keys = ["weightAndBodyFat", "pushups", "reading", "meditation", "walk"];
            for (let i = 0; i < 40; i++) {
              getHabitDoneRowsForDay(keys[i % keys.length], "2099-01-01");
              n++;
            }
          }
          const sampleQueryMs = Math.round(((performance.now() - t0) / Math.max(1, n)) * 1000) / 1000;
          out.habit = {
            stats: st0,
            sampleQueryMs,
            queries: n
          };
        }
      } catch (e) {
        out.habit = { error: String(e && e.message ? e.message : e) };
      }
      try {
        if (window.__forgeWpCanonKeyCache) {
          if (typeof window.__forgeWpCanonKeyCache.resetStats === "function") {
            window.__forgeWpCanonKeyCache.resetStats();
          }
          if (typeof window.__forgeWpCanonKeyCache.clear === "function") {
            window.__forgeWpCanonKeyCache.clear();
          }
          const labels = ["深蹲", "卧推", "硬拉", "引体向上", "绕颈", "深蹲", "卧推", "硬拉"];
          for (let i = 0; i < 2000; i++) {
            if (typeof forgeWpCanonicalPrimaryTaskKey === "function") {
              forgeWpCanonicalPrimaryTaskKey(labels[i % labels.length]);
            }
          }
          const st =
            typeof window.__forgeWpCanonKeyCache.stats === "function"
              ? window.__forgeWpCanonKeyCache.stats()
              : null;
          const hits = (st && st.hits) || 0;
          const misses = (st && st.misses) || 0;
          const total = hits + misses;
          out.forge = {
            stats: st,
            hitRatePct: total ? Math.round((hits / total) * 100000) / 1000 : null
          };
        }
      } catch (e2) {
        out.forge = { error: String(e2 && e2.message ? e2.message : e2) };
      }
      return out;
    });
    report.measured.habit = habitForge.habit;
    report.measured.forge = habitForge.forge;

    /* ---- 场景 B：本地 save 突发（测 stringify/persist 去重；不强制全量云下载） ---- */
    const scenarioB = await withTimeout(
      page.evaluate(async () => {
        function sleep(ms) {
          return new Promise((r) => setTimeout(r, ms));
        }
        if (typeof setCloudSyncPerfEnabled === "function") setCloudSyncPerfEnabled(true);
        if (typeof resetCloudSyncPerfCounters === "function") resetCloudSyncPerfCounters();
        const lt = { count: 0, maxMs: 0 };
        let obs = null;
        try {
          obs = new PerformanceObserver((list) => {
            list.getEntries().forEach((e) => {
              const d = Number(e.duration) || 0;
              lt.count += 1;
              if (d > lt.maxMs) lt.maxMs = d;
            });
          });
          obs.observe({ type: "longtask", buffered: false });
        } catch (_o) {}
        const mem0 =
          performance.memory && performance.memory.usedJSHeapSize
            ? performance.memory.usedJSHeapSize
            : null;
        /* 尽量在 pull 窗口内触发 coalesce：短拉 + 突发 save */
        try {
          if (typeof __diagClearAliyunPullInFlight === "function") __diagClearAliyunPullInFlight();
        } catch (_c) {}
        let pullP = null;
        try {
          if (typeof runAliyunSyncPrimaryNearRealtimePull === "function") {
            pullP = runAliyunSyncPrimaryNearRealtimePull("poll");
          }
        } catch (_p) {}
        for (let i = 0; i < 12; i++) {
          try {
            if (typeof saveState === "function") saveState();
          } catch (_s) {}
          await sleep(350);
        }
        try {
          if (pullP) await pullP;
        } catch (_e) {}
        try {
          if (typeof flushLocalPersistedState === "function") flushLocalPersistedState("force");
          await (typeof statePersistQueue !== "undefined" ? statePersistQueue : Promise.resolve());
        } catch (_f) {}
        await sleep(800);
        /* FPS 取样 3s */
        const fps = await new Promise((resolve) => {
          const start = performance.now();
          let last = start;
          let frames = 0;
          function tick(t) {
            frames += 1;
            last = t;
            if (t - start < 3000) requestAnimationFrame(tick);
            else resolve({ fps: Math.round((frames / ((t - start) / 1000)) * 10) / 10 });
          }
          requestAnimationFrame(tick);
        });
        if (obs) {
          try {
            obs.disconnect();
          } catch (_d) {}
        }
        const perf =
          typeof getCloudSyncPerfSnapshot === "function" ? getCloudSyncPerfSnapshot() : null;
        const mem1 =
          performance.memory && performance.memory.usedJSHeapSize
            ? performance.memory.usedJSHeapSize
            : null;
        return {
          longTaskMaxMs: Math.round(lt.maxMs * 10) / 10,
          longTaskCount: lt.count,
          stringifyCount: perf && perf.stringifyCount,
          stringifyMs: perf && perf.stringifyMs,
          persistCount: perf && perf.persistCount,
          persistMs: perf && perf.persistMs,
          persistCoalesceRescheduleCount: perf && perf.persistCoalesceRescheduleCount,
          persistDeferredCount: perf && perf.persistDeferredCount,
          saveStateCount: perf && perf.saveStateCount,
          fps: fps.fps,
          heapUsed0: mem0,
          heapUsed1: mem1
        };
      }),
      Math.min(remain(), 100_000),
      "scenarioB"
    );
    report.measured.scenarioB = scenarioB;

    /* ---- 场景 C：烟花（显式 kind，避免随机；测缓存/重放网络） ---- */
    const scenarioC = await withTimeout(
      page.evaluate(async () => {
        function sleep(ms) {
          return new Promise((r) => setTimeout(r, ms));
        }
        const kinds = [
          "fireworks",
          "hearts",
          "trophy",
          "stars",
          "victory",
          "energy-ring",
          "blossom",
          "energy-burst",
          "meteor",
          "phoenix",
          "galaxy",
          "thunder",
          "crystal",
          "wings",
          "prism",
          "sigil",
          "solar-flare"
        ];
        const treason = ["-1", "-2", "-10"];
        const plays = [];
        async function playOne(kind, mode) {
          const netBefore = performance.getEntriesByType("resource").length;
          const t0 = performance.now();
          let readyMs = null;
          try {
            if (typeof playDoneVictoryFx === "function") {
              if (mode === "treason") playDoneVictoryFx({ mode: "treason", score: Number(kind) });
              else playDoneVictoryFx({ mode: "power", kind: kind });
            }
          } catch (e) {
            return { kind, error: String(e && e.message ? e.message : e) };
          }
          /* 等待 img 出现 */
          for (let i = 0; i < 40; i++) {
            const img = document.querySelector(".victory-celebration img, .done-victory-fx img, img[src*='fx-power'], img[src*='fx-warning'], img[src^='blob:']");
            if (img) {
              if (img.complete) {
                readyMs = Math.round(performance.now() - t0);
                break;
              }
              await new Promise((res) => {
                img.addEventListener("load", () => res(), { once: true });
                setTimeout(res, 200);
              });
              readyMs = Math.round(performance.now() - t0);
              break;
            }
            await sleep(50);
          }
          await sleep(400);
          const net = performance
            .getEntriesByType("resource")
            .slice(netBefore)
            .filter((e) => /fx-power|fx-warning|\.webp/i.test(String(e.name || "")));
          const bytes = net.reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0);
          const bust = net.some((e) => /\?t=/.test(String(e.name || "")));
          try {
            if (typeof clearDoneVictoryFx === "function") clearDoneVictoryFx();
          } catch (_c) {}
          await sleep(100);
          return {
            kind,
            mode: mode || "power",
            mountToReadyMs: readyMs,
            netBytes: bytes,
            netCount: net.length,
            cacheBustQuery: bust,
            blobSrc: !!(document.querySelector && false)
          };
        }
        /* 预热一轮 fireworks，再测重放网络 */
        const warm = await playOne("fireworks", "power");
        const replay = await playOne("fireworks", "power");
        const sampleKinds = [];
        for (const k of kinds.slice(0, 8)) {
          sampleKinds.push(await playOne(k, "power"));
        }
        for (const k of treason) {
          sampleKinds.push(await playOne(k, "treason"));
        }
        const readyVals = sampleKinds
          .map((x) => x.mountToReadyMs)
          .filter((x) => typeof x === "number");
        const avg =
          readyVals.length > 0
            ? Math.round(readyVals.reduce((a, b) => a + b, 0) / readyVals.length)
            : null;
        return {
          warm,
          replay,
          sampleCount: sampleKinds.length,
          kindsTried: kinds.length + treason.length,
          mountToReadyMsAvg: avg,
          repeatNetBytes: replay && typeof replay.netBytes === "number" ? replay.netBytes : null,
          replayCacheBust: !!(replay && replay.cacheBustQuery),
          samples: sampleKinds
        };
      }),
      Math.min(remain(), 180_000),
      "scenarioC"
    );
    report.measured.scenarioC = scenarioC;

    /* ---- 场景 D 轻量：烟花 hold 期间点一次模块切换，看 LT ---- */
    const scenarioD = await withTimeout(
      page.evaluate(async () => {
        function sleep(ms) {
          return new Promise((r) => setTimeout(r, ms));
        }
        const lt = { count: 0, maxMs: 0 };
        let obs = null;
        try {
          obs = new PerformanceObserver((list) => {
            list.getEntries().forEach((e) => {
              const d = Number(e.duration) || 0;
              lt.count += 1;
              if (d > lt.maxMs) lt.maxMs = d;
            });
          });
          obs.observe({ type: "longtask", buffered: false });
        } catch (_o) {}
        try {
          if (typeof playDoneVictoryFx === "function") {
            playDoneVictoryFx({ mode: "power", kind: "fireworks" });
          }
        } catch (_p) {}
        await sleep(200);
        try {
          if (typeof activateKineticTab === "function") activateKineticTab("habit");
          else if (typeof setPrimaryModuleFocus === "function") setPrimaryModuleFocus("habit");
        } catch (_a) {}
        await sleep(1200);
        try {
          if (typeof clearDoneVictoryFx === "function") clearDoneVictoryFx();
        } catch (_c) {}
        if (obs) {
          try {
            obs.disconnect();
          } catch (_d) {}
        }
        return {
          longTaskMaxMs: Math.round(lt.maxMs * 10) / 10,
          longTaskCount: lt.count,
          note: "qualitative companion to golden D"
        };
      }),
      Math.min(remain(), 60_000),
      "scenarioD"
    );
    report.measured.scenarioD = scenarioD;

    /* 内存快照 */
    report.measured.memory = await page.evaluate(() => {
      const m = performance.memory;
      return m
        ? {
            usedJSHeapSize: m.usedJSHeapSize,
            totalJSHeapSize: m.totalJSHeapSize,
            jsHeapSizeLimit: m.jsHeapSizeLimit
          }
        : null;
    });

    const env = fingerprintEnv({
      runnerOs: process.env.RUNNER_OS || process.platform,
      browser: "chromium",
      chromiumVersion: chromeVer,
      targetUrl: url
    });
    report.environment = env;
    report.comparison = compareToCiBaseline(baseline, report.measured, env);

    /* 连续退化升级 + 归档（不 commit） */
    const streak = loadStreakState(STATE_DIR);
    updateStreakAndEscalate(streak, report.comparison.findings || [], 2);
    saveStreakState(STATE_DIR, streak);
    report.comparison.streak = streak;
    let sev = "ok";
    for (const f of report.comparison.findings || []) {
      if (f.severity === "regression" || f.severity === "infra") sev = f.severity === "infra" ? "infra" : "regression";
      else if (f.severity === "warning" && sev === "ok") sev = "warning";
    }
    report.comparison.severity = sev;

    report.ok = sev === "ok" || sev === "warning";
    report.verdict =
      sev === "ok"
        ? "PASS"
        : sev === "warning"
          ? "PASS_WITH_WARNINGS"
          : sev === "regression"
            ? "REGRESSION"
            : "FAIL";

    /* monthly/full：轻量稳定性探针（只读，不写云） */
    if (CHECK_MODE === "monthly" || CHECK_MODE === "full") {
      report.measured.stabilitySpotcheck = await page.evaluate(() => {
        const out = { ok: true, notes: [] };
        try {
          if (typeof state === "undefined" || !state) {
            out.ok = false;
            out.notes.push("state missing");
          } else {
            out.notes.push(`doneLen=${Array.isArray(state.done) ? state.done.length : "?"}`);
            out.notes.push(`hasSyncTombstones=${!!state.syncTombstones}`);
          }
          if (typeof saveState !== "function") {
            out.ok = false;
            out.notes.push("saveState missing");
          }
        } catch (e) {
          out.ok = false;
          out.notes.push(String(e && e.message ? e.message : e));
        }
        return out;
      });
      report.measured.aliyunCost = {
        status: "unverifiable_in_ci",
        hardCapCny: 30,
        note: "CI 无账单 API；不得用模拟金额冒充真实费用。请在阿里云控制台人工核对。"
      };
    }

    await browser.close();
    browser = null;
  } catch (err) {
    report.ok = false;
    report.verdict = "INFRA_OR_SCRIPT_FAILURE";
    report.infraError = String(err && err.stack ? err.stack : err);
    report.comparison = {
      severity: "infra",
      findings: [
        {
          kind: "infra",
          severity: "infra",
          message: "测试环境/脚本失败，不判定为 PWA 性能退化",
          error: String(err && err.message ? err.message : err)
        }
      ]
    };
    try {
      if (browser) await browser.close();
    } catch (_e) {}
  }

  const stamp = nowIso().replace(/[:.]/g, "-");
  const outName = `healthcheck-${stamp}.json`;
  const outPath = path.join(reportsDir, outName);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(reportsDir, "latest.json"), JSON.stringify(report, null, 2));

  try {
    writeHistoryEntry(HISTORY_DIR, report, stamp);
  } catch (histErr) {
    console.warn("[perf-ci] history write failed:", histErr && histErr.message ? histErr.message : histErr);
  }
  if (report.verdict === "REGRESSION" || report.verdict === "INFRA_OR_SCRIPT_FAILURE") {
    try {
      writeDiagnosisMarkdown(reportsDir, report, stamp);
    } catch (_d) {}
  }

  /* GitHub Step Summary */
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const lines = [
      `# PWA 性能体检 · ${report.verdict}`,
      "",
      `- 模式: ${report.mode}`,
      `- 时间: ${report.at}`,
      `- 目标: ${report.targetUrl}`,
      `- 缓存: ${(report.measured && report.measured.cacheName) || "?"}`,
      `- 严重度: ${(report.comparison && report.comparison.severity) || "?"}`,
      `- 不可验证: ${(report.unverifiable || []).join(", ")}`,
      "",
      "## Findings",
      ""
    ];
    const findings = (report.comparison && report.comparison.findings) || [];
    if (!findings.length) lines.push("- （无）");
    for (const f of findings) {
      lines.push(`- **${f.severity}** · ${f.message || f.kind}`);
    }
    lines.push("", `报告文件: \`perf/ci/reports/${outName}\``);
    fs.appendFileSync(summaryPath, lines.join("\n") + "\n");
  }

  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        mode: report.mode,
        outPath,
        severity: report.comparison && report.comparison.severity
      },
      null,
      2
    )
  );

  if (report.verdict === "INFRA_OR_SCRIPT_FAILURE") process.exit(2);
  if (report.verdict === "REGRESSION") process.exit(1);
  process.exit(0);
}

main();
