# 阿里云同步 · 核心高频模块迁移进度

> 测试分支：`cursor/aliyun-dhf-integrate-d4ec`  
> 稳定业务基线：`71b89a3` · tag：`stable/aliyun-dhf-integrate-go`  
> Firebase 全程保留回退；**不动 `main`**，直至正式切换方案落地。

更新时间：2026-09-29（电脑 A · 今日计划轻验证通过 → **核心高频迁移阶段结束**）

---

## 阶段结论

**6 个核心高频模块全部通过轻验证**（增/改/删/连续操作 · POST 201 / ok=true / longTask>50=0 · 无明显卡顿、覆盖、丢失、重复）。

| # | 模块 | 状态 | 文档 / 开关 |
|---|---|---|---|
| 1 | **Done** | **已通过**（跨机闭环） | Done 域信封 · 既有开关 |
| 2 | **Habit** | **已通过**（跨机闭环） | Habit 域信封 · 既有开关 |
| 3 | **Forge** | **已通过**（跨机闭环） | Forge 域信封 · 既有开关 |
| 4 | **十二周年** | **已通过** | `aliyun-anniv-real-v1-{room}` · `__ALIYUN_ANNIV_REAL_SYNC_ENABLED` |
| 5 | **3-Day Sprint** | **已通过** | `aliyun-sprint-real-v1-{room}` · `__ALIYUN_SPRINT_REAL_SYNC_ENABLED` |
| 6 | **今日计划** | **已通过**（聚合层 marks-only） | `aliyun-today-plan-real-v1-{room}` · `__ALIYUN_TODAY_PLAN_REAL_SYNC_ENABLED` |

> **实验验证阶段到此冻结。** 不再扩大测试范围、不清理云端测试文档、不额外加模块。下一阶段见文末「正式切换」。

---

## 实现摘要（已冻结）

| 模块 | 信封策略 | 写钩 |
|---|---|---|
| Done / Habit / Forge | 分域 items（+ tombstones 视实现） | 各域既有 save / 删除路径 |
| 十二周年 | items + tombstones | `saveStateAfterAnniversaryWeekChange` |
| 3-Day Sprint | weeklyPlan items + tombstones | `saveWeeklyPlanTasksForWeek` / `deleteWeeklyPlanTask` |
| 今日计划 | **仅 marks**（不复制来源正文） | `noteCloudSyncTodayPlanPulseTaskId` |

共同模式：默认关 → 80ms 队列 → GET 信封 → mutate → POST `/smoke`；拉取 `runAliyun*RealPullAndMerge`；Firebase 路径未删。

---

## 下一阶段（未开工 · 仅方案占位）

**目标**：阿里云成为主要同步路径，Firebase 降级为回退。  
**最小方案见本会话回复**；落地前仍保持开关默认关、双写可选、不动 `main`。

## 约束（继续有效）

- 不动 `main`
- 不改无关 UI / 不重构
- 不为测试而扩测
- 正式切换前保留 Firebase 全路径
