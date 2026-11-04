# 性能体检历史归档

- **黄金基准（只读）**：[`../PERFORMANCE_GOLDEN_BASELINE.md`](../PERFORMANCE_GOLDEN_BASELINE.md) · `golden-v1`
- **CI 同环境基线**：[`../../perf/ci/ci-baseline.json`](../../perf/ci/ci-baseline.json)
- **工作流**：[`.github/workflows/pwa-performance-check.yml`](../../.github/workflows/pwa-performance-check.yml)

## 归档位置

| 位置 | 说明 |
|------|------|
| GitHub Actions **Artifact** `perf-healthcheck-<run_id>` | 主归档，保留 **90 天** |
| 本目录 `entries/`、`INDEX.md`、`latest-summary.md` | 本地或 CI 工作区内生成；CI 不自动 commit（防擅自改仓） |
| `perf/ci/reports/` | 单次运行原始 JSON（本地 / runner 临时） |

## 通知策略

- `PASS` / `PASS_WITH_WARNINGS`：**不发 Issue**
- `REGRESSION` / `INFRA_OR_SCRIPT_FAILURE`：自动开 Issue

## 无人值守说明

定时任务跑在 **GitHub Actions `ubuntu-latest`**，不依赖本机、Cursor 或本地浏览器。
