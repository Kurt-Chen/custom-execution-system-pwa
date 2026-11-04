/**
 * CI 同环境基线对比（只读）。不修改业务代码。
 */
export function fingerprintEnv(info) {
  return {
    runnerOs: info.runnerOs || process.platform,
    browser: info.browser || "chromium",
    chromiumVersion: info.chromiumVersion || null,
    targetUrl: info.targetUrl || null
  };
}

export function envDrift(baseline, current) {
  if (!baseline || !baseline.environment) return { drifted: false, reasons: [] };
  const reasons = [];
  const be = baseline.environment;
  if (be.runnerOs && current.runnerOs && be.runnerOs !== current.runnerOs) {
    reasons.push(`runnerOs ${be.runnerOs} → ${current.runnerOs}`);
  }
  if (be.browser && current.browser && be.browser !== current.browser) {
    reasons.push(`browser ${be.browser} → ${current.browser}`);
  }
  if (
    baseline.chromiumVersion &&
    current.chromiumVersion &&
    baseline.chromiumVersion !== current.chromiumVersion
  ) {
    reasons.push(`chromium ${baseline.chromiumVersion} → ${current.chromiumVersion}`);
  }
  if (be.targetUrl && current.targetUrl && be.targetUrl !== current.targetUrl) {
    reasons.push(`targetUrl changed`);
  }
  return { drifted: reasons.length > 0, reasons };
}

function ratio(current, base) {
  if (base == null || !(base > 0)) return null;
  if (current == null || Number.isNaN(Number(current))) return null;
  return Number(current) / Number(base);
}

/**
 * @returns {{ severity: 'ok'|'warning'|'regression'|'infra', findings: object[], proposedMetrics: object }}
 */
export function compareToCiBaseline(baseline, measured, env) {
  const findings = [];
  const ceilings = (baseline.thresholds && baseline.thresholds.absoluteCeilings) || {};
  const warnR = (baseline.thresholds && baseline.thresholds.warningRatio) || 1.25;
  const regR = (baseline.thresholds && baseline.thresholds.regressionRatio) || 1.6;
  const drift = envDrift(baseline, env);

  function ceil(name, value, higherIsWorse = true) {
    const limit = ceilings[name];
    if (limit == null || value == null) return;
    const bad = higherIsWorse ? value > limit : value < limit;
    if (bad) {
      findings.push({
        kind: "absolute_ceiling",
        severity: "regression",
        metric: name,
        current: value,
        limit,
        message: `${name}=${value} 超过 CI 绝对上限 ${limit}`
      });
    }
  }

  ceil("bootToInteractiveMs", measured.boot && measured.boot.toInteractiveMs);
  ceil("longTaskMaxMs_A", measured.scenarioA && measured.scenarioA.longTaskMaxMs);
  ceil("longTaskMaxMs_B", measured.scenarioB && measured.scenarioB.longTaskMaxMs);
  ceil("stringifyCount_B", measured.scenarioB && measured.scenarioB.stringifyCount);
  ceil("persistCount_B", measured.scenarioB && measured.scenarioB.persistCount);
  ceil("stringifyMs_B", measured.scenarioB && measured.scenarioB.stringifyMs);
  ceil("persistMs_B", measured.scenarioB && measured.scenarioB.persistMs);
  ceil("fxMountToReadyMs_avg", measured.scenarioC && measured.scenarioC.mountToReadyMsAvg);
  ceil("fxRepeatNetBytes", measured.scenarioC && measured.scenarioC.repeatNetBytes);
  ceil("aliyunReqCount_A", measured.scenarioA && measured.scenarioA.aliyunReqCount);
  ceil("habitIndexQueryMs_sample", measured.habit && measured.habit.sampleQueryMs);

  if (measured.cacheName && baseline.formalReference && baseline.formalReference.expectedCacheName) {
    if (measured.cacheName !== baseline.formalReference.expectedCacheName) {
      findings.push({
        kind: "cache_mismatch",
        severity: "warning",
        metric: "cacheName",
        current: measured.cacheName,
        expected: baseline.formalReference.expectedCacheName,
        message: `线上缓存名与黄金基准记录不一致（可能已发新版）：${measured.cacheName}`
      });
    }
  }

  const proposedMetrics = {
    bootToInteractiveMs: measured.boot && measured.boot.toInteractiveMs,
    longTaskMaxMs_A: measured.scenarioA && measured.scenarioA.longTaskMaxMs,
    longTaskMaxMs_B: measured.scenarioB && measured.scenarioB.longTaskMaxMs,
    stringifyCount_B: measured.scenarioB && measured.scenarioB.stringifyCount,
    persistCount_B: measured.scenarioB && measured.scenarioB.persistCount,
    stringifyMs_B: measured.scenarioB && measured.scenarioB.stringifyMs,
    persistMs_B: measured.scenarioB && measured.scenarioB.persistMs,
    fps_B: measured.scenarioB && measured.scenarioB.fps,
    fxMountToReadyMs_avg: measured.scenarioC && measured.scenarioC.mountToReadyMsAvg,
    fxRepeatNetBytes: measured.scenarioC && measured.scenarioC.repeatNetBytes,
    forgeHitRatePct: measured.forge && measured.forge.hitRatePct,
    habitSampleQueryMs: measured.habit && measured.habit.sampleQueryMs,
    aliyunReqCount_A: measured.scenarioA && measured.scenarioA.aliyunReqCount
  };

  const baseMetrics = baseline.metrics;
  if (baseMetrics && typeof baseMetrics === "object" && !drift.drifted) {
    const pairs = [
      ["bootToInteractiveMs", proposedMetrics.bootToInteractiveMs],
      ["longTaskMaxMs_A", proposedMetrics.longTaskMaxMs_A],
      ["longTaskMaxMs_B", proposedMetrics.longTaskMaxMs_B],
      ["stringifyCount_B", proposedMetrics.stringifyCount_B],
      ["persistCount_B", proposedMetrics.persistCount_B],
      ["stringifyMs_B", proposedMetrics.stringifyMs_B],
      ["persistMs_B", proposedMetrics.persistMs_B],
      ["fxMountToReadyMs_avg", proposedMetrics.fxMountToReadyMs_avg],
      ["fxRepeatNetBytes", proposedMetrics.fxRepeatNetBytes],
      ["habitSampleQueryMs", proposedMetrics.habitSampleQueryMs]
    ];
    for (const [key, cur] of pairs) {
      const base = baseMetrics[key];
      const r = ratio(cur, base);
      if (r == null) continue;
      if (r >= regR) {
        findings.push({
          kind: "relative",
          severity: "regression",
          metric: key,
          current: cur,
          baseline: base,
          ratio: Math.round(r * 100) / 100,
          message: `${key} 相对 CI 基线 ×${r.toFixed(2)}（≥${regR}）`
        });
      } else if (r >= warnR) {
        findings.push({
          kind: "relative",
          severity: "warning",
          metric: key,
          current: cur,
          baseline: base,
          ratio: Math.round(r * 100) / 100,
          message: `${key} 相对 CI 基线 ×${r.toFixed(2)}（≥${warnR}）`
        });
      }
    }
    if (baseMetrics.fps_B != null && proposedMetrics.fps_B != null && baseMetrics.fps_B > 0) {
      const dropPct = ((baseMetrics.fps_B - proposedMetrics.fps_B) / baseMetrics.fps_B) * 100;
      const warnPct = (baseline.thresholds && baseline.thresholds.fpsDropWarningPct) || 10;
      if (dropPct >= warnPct * 1.6) {
        findings.push({
          kind: "relative_fps",
          severity: "regression",
          metric: "fps_B",
          current: proposedMetrics.fps_B,
          baseline: baseMetrics.fps_B,
          dropPct: Math.round(dropPct * 10) / 10,
          message: `CI 同环境 FPS 下降 ${dropPct.toFixed(1)}%`
        });
      } else if (dropPct >= warnPct) {
        findings.push({
          kind: "relative_fps",
          severity: "warning",
          metric: "fps_B",
          current: proposedMetrics.fps_B,
          baseline: baseMetrics.fps_B,
          dropPct: Math.round(dropPct * 10) / 10,
          message: `CI 同环境 FPS 下降 ${dropPct.toFixed(1)}%`
        });
      }
    }
    if (baseMetrics.forgeHitRatePct != null && proposedMetrics.forgeHitRatePct != null) {
      const drop = baseMetrics.forgeHitRatePct - proposedMetrics.forgeHitRatePct;
      if (drop >= 5) {
        findings.push({
          kind: "relative",
          severity: drop >= 15 ? "regression" : "warning",
          metric: "forgeHitRatePct",
          current: proposedMetrics.forgeHitRatePct,
          baseline: baseMetrics.forgeHitRatePct,
          message: `Forge 缓存命中率下降 ${drop.toFixed(2)} 个百分点`
        });
      }
    }
  } else if (!baseMetrics) {
    findings.push({
      kind: "bootstrap",
      severity: "ok",
      message: "CI 相对基线 metrics 尚未写入；本次仅绝对上限 + 结构检查。请审阅 proposedCiBaseline。"
    });
  }

  if (drift.drifted) {
    findings.push({
      kind: "env_drift",
      severity: "warning",
      reasons: drift.reasons,
      message: "运行环境相对 CI 基线已变化；相对退化不作为代码回归硬失败依据"
    });
  }

  let severity = "ok";
  for (const f of findings) {
    if (f.severity === "regression") severity = "regression";
    else if (f.severity === "warning" && severity === "ok") severity = "warning";
    else if (f.severity === "infra") severity = "infra";
  }

  return {
    severity,
    findings,
    envDrift: drift,
    proposedCiBaseline: {
      baselineId: baseline.baselineId || "ci-ubuntu-chromium-v1",
      environment: env,
      chromiumVersion: env.chromiumVersion,
      metrics: proposedMetrics,
      note: "手工审阅后写入 perf/ci/ci-baseline.json 的 metrics / chromiumVersion 字段"
    }
  };
}
