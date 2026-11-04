# PWA 每半月自动性能体检（GitHub Actions 云端）

**完全运行在 GitHub Actions**，不依赖本机开机、Cursor 或本地浏览器。

对照文档：

- 体验黄金基准（只读）：[`docs/PERFORMANCE_GOLDEN_BASELINE.md`](../../docs/PERFORMANCE_GOLDEN_BASELINE.md)
- 风险管理：[`docs/RISK_PREVENTION.md`](../../docs/RISK_PREVENTION.md)
- CI 同环境基线：[`ci-baseline.json`](./ci-baseline.json)
- 历史归档入口：[`docs/performance-history/`](../../docs/performance-history/)

## 何时跑

| 触发 | 说明 |
|------|------|
| 定时 | 每月 **1 日、16 日** **北京时间 08:17**（UTC `17 0 1,16 * *`） |
| 自动模式 | 1 日 → `monthly`；16 日 → `biweekly` |
| 手动 | Actions → **PWA performance check** → **Run workflow** |

工作流：`.github/workflows/pwa-performance-check.yml`

## 通知

| Verdict | 通知 |
|---------|------|
| `PASS` / `PASS_WITH_WARNINGS` | **不打扰**（仅 Artifact + Summary） |
| `REGRESSION` / `INFRA_OR_SCRIPT_FAILURE` | 失败 + 自动开 Issue |

## 查看结果

1. 仓库 **Actions** → 对应 run  
2. Job Summary  
3. Artifact `perf-healthcheck-<run_id>`（保留 **90 天**）  
4. 异常时看带 `perf-ci` 标签的 Issue  

## 可选 Secret

- `PERF_UNLOCK_PASSWORD`：正式站锁屏密码（没有则尝试 `unlockApp()`）

## 长期禁用风险（GitHub）

若仓库 **超过约 60 天无推送/活动**，GitHub 可能暂停 schedule。有推送或手动跑一次可恢复。体检报告中的 `github_actions_schedule_disabled_status` 标为 **不可在 runner 内验证**，需在 Actions 页人工确认。

## 成本

每月约 2 次短跑；不对生产阿里云做破坏性或打满式请求；月费硬上限仍 **≤30 元**。
