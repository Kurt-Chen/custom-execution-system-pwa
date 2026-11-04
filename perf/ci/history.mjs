/**
 * 体检历史归档与连续退化 streak（只写报告/状态，不改业务代码）。
 */
import fs from "fs";
import path from "path";

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function loadStreakState(stateDir) {
  const file = path.join(stateDir, "streak-state.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_e) {
    return { metrics: {}, updatedAt: null };
  }
}

export function saveStreakState(stateDir, state) {
  ensureDir(stateDir);
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(stateDir, "streak-state.json"), JSON.stringify(state, null, 2));
}

/**
 * 根据本次 findings 更新连续警告/退化计数。
 * 同一指标连续 ≥2 次 warning/regression → escalateToRegression。
 */
export function updateStreakAndEscalate(streakState, findings, escalateAfter = 2) {
  const metrics = streakState.metrics || (streakState.metrics = {});
  const touched = new Set();
  const escalated = [];

  for (const f of findings || []) {
    if (!f || !f.metric) continue;
    if (f.severity !== "warning" && f.severity !== "regression") continue;
    touched.add(f.metric);
    const prev = metrics[f.metric] || { consecutiveBad: 0, lastSeverity: null };
    prev.consecutiveBad = (prev.consecutiveBad || 0) + 1;
    prev.lastSeverity = f.severity;
    prev.lastMessage = f.message || f.kind;
    prev.lastAt = new Date().toISOString();
    metrics[f.metric] = prev;
    if (f.severity === "warning" && prev.consecutiveBad >= escalateAfter) {
      f.severity = "regression";
      f.escalatedFromStreak = true;
      f.message = `${f.message || f.kind}（连续 ${prev.consecutiveBad} 次退化 → 升级预警）`;
      escalated.push(f.metric);
    }
  }

  for (const key of Object.keys(metrics)) {
    if (!touched.has(key)) {
      metrics[key].consecutiveBad = 0;
    }
  }

  return { streakState, escalated };
}

export function writeHistoryEntry(historyDir, report, stamp) {
  ensureDir(historyDir);
  const entriesDir = path.join(historyDir, "entries");
  ensureDir(entriesDir);

  const summary = {
    at: report.at,
    stamp,
    mode: report.mode,
    verdict: report.verdict,
    severity: report.comparison && report.comparison.severity,
    cacheName: report.measured && report.measured.cacheName,
    targetUrl: report.targetUrl,
    goldenId: (report.goldenReference && report.goldenReference.goldenId) || "golden-v1",
    needsHuman: report.verdict === "REGRESSION" || report.verdict === "INFRA_OR_SCRIPT_FAILURE",
    env: report.environment || null,
    unverifiable: report.unverifiable || [],
    findingCount: ((report.comparison && report.comparison.findings) || []).length
  };

  const entryPath = path.join(entriesDir, `${stamp}.json`);
  fs.writeFileSync(
    entryPath,
    JSON.stringify({ summary, reportRef: `perf/ci/reports/healthcheck-${stamp}.json`, measured: report.measured, comparison: report.comparison }, null, 2)
  );

  const md = [
    `# 最近一次体检摘要`,
    ``,
    `- 时间: ${summary.at}`,
    `- 模式: ${summary.mode}`,
    `- 判定: **${summary.verdict}**`,
    `- 缓存: ${summary.cacheName || "?"}`,
    `- 黄金参照: ${summary.goldenId}（只读）`,
    `- 需人工: ${summary.needsHuman ? "是" : "否"}`,
    `- 不可验证项: ${(summary.unverifiable || []).join(", ") || "无"}`,
    ``,
    `完整 JSON 见 Actions Artifact / \`perf/ci/reports/\`。`,
    ``
  ].join("\n");
  fs.writeFileSync(path.join(historyDir, "latest-summary.md"), md);

  const indexPath = path.join(historyDir, "INDEX.md");
  const line = `| ${summary.at} | ${summary.mode} | ${summary.verdict} | ${summary.cacheName || "?"} | ${summary.needsHuman ? "是" : "否"} | entries/${stamp}.json |\n`;
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(
      indexPath,
      `# 性能体检历史索引\n\n> 由 CI/本地体检追加。golden-v1 永不覆盖。\n\n| 时间 | 模式 | 判定 | 缓存 | 需人工 | 条目 |\n|------|------|------|------|--------|------|\n`
    );
  }
  fs.appendFileSync(indexPath, line);
  return { entryPath, summary };
}

export function writeDiagnosisMarkdown(reportsDir, report, stamp) {
  ensureDir(reportsDir);
  const findings = (report.comparison && report.comparison.findings) || [];
  const lines = [
    `# 性能退化诊断 · ${report.verdict}`,
    ``,
    `- 时间: ${report.at}`,
    `- 模式: ${report.mode}`,
    `- 目标: ${report.targetUrl}`,
    `- 线上缓存: ${(report.measured && report.measured.cacheName) || "?"}`,
    `- 黄金基准: golden-v1 / v20261104m（只读对照，未自动升级）`,
    `- CI 基线: perf/ci/ci-baseline.json`,
    ``,
    `## Findings`,
    ``
  ];
  for (const f of findings) {
    lines.push(`### ${f.severity} · ${f.metric || f.kind}`);
    lines.push(f.message || "");
    if (f.current != null) lines.push(`- current: ${f.current}`);
    if (f.baseline != null) lines.push(`- baseline: ${f.baseline}`);
    if (f.limit != null) lines.push(`- limit: ${f.limit}`);
    if (f.ratio != null) lines.push(`- ratio: ${f.ratio}`);
    lines.push("");
  }
  lines.push(`## 最小修复建议（人工）`);
  lines.push(``);
  lines.push(`1. 下载本轮原始 JSON，确认是否环境漂移（chromium / runner）。`);
  lines.push(`2. 对照 docs/PERFORMANCE_GOLDEN_BASELINE.md 同场景分册，禁止混场景。`);
  lines.push(`3. 只修有证据的模块；禁止为跑分改动画/交互体验。`);
  lines.push(`4. **不要**自动 commit / 自动优化；确认后再手工改业务代码。`);
  lines.push(``);
  const out = path.join(reportsDir, `diagnosis-${stamp}.md`);
  fs.writeFileSync(out, lines.join("\n"));
  return out;
}
