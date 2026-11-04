# 每半月自动性能体检（入口说明）

自动化实现位于 `perf/ci/`，由 **GitHub Actions 云端**驱动（不依赖本机）。

- 工作流：`.github/workflows/pwa-performance-check.yml`
- 说明：[`perf/ci/README.md`](../perf/ci/README.md)
- 体验黄金基准（只读）：[`PERFORMANCE_GOLDEN_BASELINE.md`](./PERFORMANCE_GOLDEN_BASELINE.md)
- 风险管理：[`RISK_PREVENTION.md`](./RISK_PREVENTION.md)
- CI 同环境基线：[`perf/ci/ci-baseline.json`](../perf/ci/ci-baseline.json)
- 历史：[`performance-history/`](./performance-history/)

**定时**：每月 1日、16日 **北京时间 08:17**（cron `17 0 1,16 * *` UTC）。  
**本系统不修改业务代码，不自动优化，不自动 commit/push。**
