# 阿里云同步 · 核心高频模块迁移进度

> 测试分支：`cursor/aliyun-dhf-integrate-d4ec`  
> 稳定业务基线：`71b89a3` · tag：`stable/aliyun-dhf-integrate-go`  
> **正式切换稳定节点（Step1+2）**：`5a8b9c4`（本文件之上的 docs commit 仅记进度）  
> Firebase 全程保留回退；**不动 `main`**；**默认 dualWrite=true**（暂不改默认单写）。

更新时间：2026-09-29（Step2 验证通过 · 冻结 · 下一步：单写 soak 方案）

---

## 阶段结论

**6 个核心高频模块全部通过轻验证**；**正式切换 Step1 + Step2 已通过**。

| # | 模块 | 状态 |
|---|---|---|
| 1 | **Done** | **已通过**（跨机闭环） |
| 2 | **Habit** | **已通过**（跨机闭环） |
| 3 | **Forge** | **已通过**（跨机闭环） |
| 4 | **十二周年** | **已通过** |
| 5 | **3-Day Sprint** | **已通过** |
| 6 | **今日计划** | **已通过**（聚合层 marks-only） |

---

## 正式切换

| Step | 内容 | 状态 |
|---|---|---|
| **1** | 持久化总开关 + 开则启用 6 域 + 启动串行拉取 | **已通过** |
| **2** | Firebase 可选双写（**默认 true**）；关则 6 域仅写阿里云 | **已通过** |
| **3** | 阿里云单写 soak（本机关双写日常用）→ 再议是否改默认 / 合入 `main` | **未开工** |

### Step2 验证记录（2026-09-29）
- `dualWrite=true`：阿里云 + Firebase 双写正常
- `dualWrite=false`：6 域仅写阿里云，POST 201 / ok=true
- 切回 `true`：Firebase 双写立即恢复
- 回退机制有效

### 控制台（无新 UI）

```js
// 总开关（默认关）
window.setAliyunSyncPrimaryEnabled(true|false)
window.isAliyunSyncPrimaryEnabled()

// Firebase 双写（默认 true；暂不改默认）
window.setAliyunSyncPrimaryDualWriteFirebase(true|false)
window.isAliyunSyncPrimaryDualWriteFirebaseEnabled()

// 启动拉取报告
window.__aliyunSyncPrimaryBootPullReport
```

| 键 | 含义 |
|---|---|
| `todo-app-aliyun-sync-primary-v1` | 总开关；仅 `"1"`/`"true"` 为开 |
| `todo-app-aliyun-sync-primary-dual-write-v1` | 双写；缺省/`"1"` = 开；仅 `"0"`/`"false"` = 关 |

### Step3 · 阿里云单写 soak（最小方案 · 未改代码）

目标：在 **不改默认、不动 `main`、不删 Firebase** 的前提下，本机用单写跑一段时间，确认可长期依赖后再议「默认 dualWrite=false」。

1. 保持总开关开：`setAliyunSyncPrimaryEnabled(true)`
2. **仅本机**关双写：`setAliyunSyncPrimaryDualWriteFirebase(false)`（不改仓库默认）
3. 日常用 1～2 天：6 域增删改 + 刷新后 boot pull + 可选第二台只读拉阿里云
4. 通过标准：无丢失/覆盖/重复；阿里云 POST 稳定；随时 `dualWrite=true` 或关总开关可回退
5. soak 通过后再开独立 commit 讨论：是否把缺省改为 `dualWrite=false`（仍保留一键双写）

---

## 实现摘要（已冻结）

| 模块 | 信封 | 写钩 |
|---|---|---|
| Done / Habit / Forge | 分域 items（+ tombstones） | 各域既有路径 |
| 十二周年 | items + tombstones | `saveStateAfterAnniversaryWeekChange` |
| 3-Day Sprint | weeklyPlan items + tombstones | `saveWeeklyPlanTasksForWeek` / `deleteWeeklyPlanTask` |
| 今日计划 | 仅 marks | `noteCloudSyncTodayPlanPulseTaskId` |

共同：默认域开关关；总开关开则启用；80ms 队列 → GET → mutate → POST；Firebase 代码保留。

## 约束

- 不动 `main`
- 不改无关 UI / 不重构 / 不为测试扩测
- **默认 dualWrite 保持 true**，直至 soak 明确结论
- 不清理云端测试文档
