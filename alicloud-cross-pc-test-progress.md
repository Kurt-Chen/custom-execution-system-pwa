# 阿里云同步 · 核心高频模块迁移进度

> 测试分支：`cursor/aliyun-dhf-integrate-d4ec`  
> 稳定业务基线：`71b89a3` · tag：`stable/aliyun-dhf-integrate-go`  
> Firebase 全程保留回退；**不动 `main`**，直至正式切换方案落地。

更新时间：2026-09-29（正式切换 Step1：总开关 + 启动拉取 · 待本机一轮验证）

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

## 正式切换（进行中）

| Step | 内容 | 状态 |
|---|---|---|
| **1** | 持久化总开关 + 开则启用 6 域 + 启动串行拉取 | **已接入（默认关）· 待一轮验证** |
| 2 | Firebase 写入优先级 / 可选双写 | 未开工 |
| 3 | soak → 议合入 `main` | 未开工 |

### Step1 用法（控制台 · 无新 UI）
```js
window.setAliyunSyncPrimaryEnabled(true)   // 持久化；刷新后自动开 6 域并拉取
// Ctrl+F5，角标含 v20260929sp1
// 控制台期望：[aliyun-sync-primary] boot pull start → boot pull done
window.__aliyunSyncPrimaryBootPullReport   // 6 域 ok
window.setAliyunSyncPrimaryEnabled(false)  // 回滚关总开关
```
键：`localStorage["todo-app-aliyun-sync-primary-v1"]`（仅 `"1"` 为开；缺省/其它 = 关）

## 约束（继续有效）

- 不动 `main`
- 不改无关 UI / 不重构
- 不为测试而扩测
- 正式切换前保留 Firebase 全路径；Step1 **未改** Firebase 写入优先级
