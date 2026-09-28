# 阿里云三域 · 跨电脑闭环测试进度

> 仅记录测试状态，不涉及业务代码变更。  
> 测试分支：`cursor/aliyun-dhf-integrate-d4ec`  
> 稳定业务基线：`71b89a3` · tag：`stable/aliyun-dhf-integrate-go`  
> （本文件之上的提交仅为进度文档，不改同步逻辑 / UI）

更新时间：2026-09-28 下午（电脑 A 收工前）

## 当前总览

| 域 | 电脑 A → 云端写入 | 电脑 B 拉取 | 电脑 B → 云端写入 | 电脑 A 拉取收尾 |
|---|---|---|---|---|
| **Done** | 已有历史数据 | **已通过**（含 09/25） | 待做 | 待做 |
| **Habit** | **已通过** | 待今晚电脑 B | 待做 | 待做 |
| **Forge** | **已通过**（Body+Mind） | 待今晚电脑 B | 待做 | 待做 |

## 电脑 A 已确认事实（勿清理云端测试文档）

### Done
- A→B 跨电脑读取已通过

### Habit
- 电脑 A 已成功首次写入阿里云
- 文档：`aliyun-habit-real-v1-default-room`
- 日志：`POST status=201` / `ok=true`

### Forge
- 电脑 A 已成功写入阿里云
- 文档：`aliyun-forge-real-v1-default-room`
- Body 与 Mind 打卡均成功
- 日志：`POST status=201` / `ok=true` / `HTTP=201`
- 注意：必须在稳定版页面（含 `runAliyunForgeRealPullAndMerge`）操作；`main` 无此钩子

## 今晚电脑 B · 执行顺序（严格按序，不扩测）

1. `git pull`，检出分支 **`cursor/aliyun-dhf-integrate-d4ec`**，打开本地页；若刚从 `main` 切过，**Ctrl+F5**
2. **Habit A→B 拉取验证**
   ```js
   window.__ALIYUN_HABIT_REAL_SYNC_ENABLED = true
   await window.runAliyunHabitRealPullAndMerge()
   ```
   确认电脑 A 的 Habit 打卡能正确显示
3. **Forge A→B 拉取验证**
   ```js
   window.__ALIYUN_FORGE_REAL_SYNC_ENABLED = true
   await window.runAliyunForgeRealPullAndMerge()
   ```
   确认电脑 A 的 Forge Body/Mind 打卡能正确显示
4. **在电脑 B 分别制造 Done / Habit / Forge 新测试数据**，确认各自写入阿里云（见 POST / ok=true）
5. **回电脑 A 一次性完成 B→A 收尾**（三域拉取/合并）
6. **全程检查**：卡顿、覆盖、丢失、重复

三域双向一过 → 不再重复长测，进入「正式主同步候选」迁移（Firebase 保留回退）。

## 约束

- 不动 `main`
- 不改同步逻辑 / UI（本文件仅进度）
- 不清理云端 Habit / Forge 测试文档，直至闭环确认
- 目标：最快安全迁移，不为测试而扩测
