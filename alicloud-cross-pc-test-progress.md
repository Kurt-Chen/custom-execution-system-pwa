# 阿里云三域 · 跨电脑闭环测试进度

> 仅记录测试状态，不涉及业务代码变更（进度段）；实现段见下方「迁移阶段」。  
> 测试分支：`cursor/aliyun-dhf-integrate-d4ec`  
> 稳定业务基线：`71b89a3` · tag：`stable/aliyun-dhf-integrate-go`  
> （本文件之上的提交含进度与可用级迁移钩子；Firebase 保留回退）

更新时间：2026-09-29（电脑 A · Done/Habit/Forge 闭环通过 → 进入十二周年迁移）

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
| **十二周年** | **已接入（默认关）· 待本机轻验证** | `aliyun-anniv-real-v1-{room}` · `__ALIYUN_ANNIV_REAL_SYNC_ENABLED` · `runAliyunAnnivRealPullAndMerge` | 待跑 |
| 3-Day Sprint | 未开始 | — | — |
| 今日计划 | 未开始 | — | — |

### 十二周年 · 实现要点
- 模板：Forge（items + tombstones）
- 域：`anniversaryTw020/021/022.weeks` 任务树（含 subs）
- 写钩：`saveStateAfterAnniversaryWeekChange` → week upsert；删除 → `recordAnniversaryTwTaskDeleteTombstones` → Aliyun tombstone
- Firebase 路径不变

### 十二周年 · 轻验证（本机，一轮即可）
```js
window.__ALIYUN_ANNIV_REAL_SYNC_ENABLED = true
// 在十二周年：新增 → 改文案 → 勾选 → 删任务 → 连续操作 → 切模块
// 日志期望：schedule ok → flush POST status=201 / ok=true
await window.runAliyunAnnivRealPullAndMerge()
```
通过后立刻 Go → 下一模块 3-Day Sprint。

## 约束

- 不动 `main`
- 不改无关 UI
- 不清理云端 Habit / Forge / Done / Anniv 测试文档，直至对应闭环确认
- 目标：最快安全迁移，不为测试而扩测
