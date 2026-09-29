# 阿里云三域 · 跨电脑闭环测试进度

> 仅记录测试状态，不涉及业务代码变更（进度段）；实现段见下方「迁移阶段」。  
> 测试分支：`cursor/aliyun-dhf-integrate-d4ec`  
> 稳定业务基线：`71b89a3` · tag：`stable/aliyun-dhf-integrate-go`  
> （本文件之上的提交含进度与可用级迁移钩子；Firebase 保留回退）

更新时间：2026-09-29（电脑 A · 3-Day Sprint 轻验证通过 → 接入今日计划聚合层）

## 当前总览（Done / Habit / Forge）

| 域 | 电脑 A → 云端写入 | 电脑 B 拉取 | 电脑 B → 云端写入 | 电脑 A 拉取收尾 |
|---|---|---|---|---|
| **Done** | 已有历史数据 | **已通过** | **已通过** | **已通过**（闭环完成） |
| **Habit** | **已通过** | **已通过** | **已通过** | **已通过**（闭环完成） |
| **Forge** | **已通过** | **已通过** | **已通过** | **已通过**（闭环完成） |

> 以上三域停止重复验证，进入下一阶段快速迁移。

## 迁移阶段（优先序）

原则：复用阿里云后台异步同步（80ms 队列 · GET 信封 · mutation · POST）；不重构、不改 UI、不动 `main`；Firebase 暂留回退；每模块一轮轻验证（增/改/删/连续操作/切模块）无卡顿覆盖丢失重复即 Go；每阶段 commit + push。

| 模块 | 状态 | 文档 / 开关 | 轻验证 |
|---|---|---|---|
| **十二周年** | **已通过** | `aliyun-anniv-real-v1-{room}` · `__ALIYUN_ANNIV_REAL_SYNC_ENABLED` | POST 201 / ok=true / longTask>50=0 |
| **3-Day Sprint** | **已通过** | `aliyun-sprint-real-v1-{room}` · `__ALIYUN_SPRINT_REAL_SYNC_ENABLED` | POST 201 / ok=true / longTask>50=0 |
| **今日计划** | **已接入（默认关）· 待本机轻验证** | `aliyun-today-plan-real-v1-{room}` · `__ALIYUN_TODAY_PLAN_REAL_SYNC_ENABLED` · `runAliyunTodayPlanRealPullAndMerge` | 待跑 |

### 十二周年 · 已通过要点
- 模板：Forge（items + tombstones）
- 写钩：`saveStateAfterAnniversaryWeekChange` / 删除 tombstone
- 本机轻验证：新增/修改/删除/连续操作正常，无明显卡顿覆盖丢失重复

### 3-Day Sprint · 已通过要点
- 模板：Forge / Anniv（items + tombstones）
- 域：`state.weeklyPlan`（sprint 起始日桶 + 任务 / microTasks）
- 写钩：`saveWeeklyPlanTasksForWeek` → week upsert；`deleteWeeklyPlanTask` → Aliyun tombstone
- 本机轻验证：新增/修改/删除/连续操作正常，POST 201 / ok=true / longTask>50=0

### 今日计划 · 实现要点（聚合层）
- **不复制** Closed List / Sprint 任务正文；信封只含 `marks`：`{ taskId → { date, updatedAt } }`
- 写钩：`noteCloudSyncTodayPlanPulseTaskId` → `notifyAliyunTodayPlanRealMarkUpsert`（加入/移出/其他任务快捷添加均经此）
- 拉取：对本地已有 `weeklyPlan` 任务写回 `todayPlanDate`；来源缺失则跳过（不造实体）
- Firebase `todayPlanMarks` pulse 路径不变（回退保留）

### 今日计划 · 轻验证（本机，一轮即可）
```js
window.__ALIYUN_TODAY_PLAN_REAL_SYNC_ENABLED = true
// Ctrl+F5 确认角标含 v20260929tp
// 今日计划：Sprint/Closed 加入今日 → 移出 → 「其他」快捷添加 → 移出 → 连续切换 → 切模块
// 日志期望：[aliyun-today-plan-real] / [today-plan] schedule ok → flush POST status=201 / ok=true / longTask>50=0
await window.runAliyunTodayPlanRealPullAndMerge()
```
通过后立刻 Go → **核心高频模块迁移阶段结束**。

## 约束

- 不动 `main`（本次迁移仅测试分支）
- 不改无关 UI
- 不清理云端 Habit / Forge / Done / Anniv / Sprint / TodayPlan 测试文档，直至对应闭环确认
- 目标：最快安全迁移，不为测试而扩测
