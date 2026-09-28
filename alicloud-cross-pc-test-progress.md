# 阿里云三域 · 跨电脑闭环测试进度

> 仅记录测试状态，不涉及业务代码变更。  
> 测试分支：`cursor/aliyun-dhf-integrate-d4ec`  
> 稳定业务基线：`71b89a3` · tag：`stable/aliyun-dhf-integrate-go`  
> （本文件之上的提交仅为进度文档，不改同步逻辑 / UI）

更新时间：2026-09-28 晚（电脑 B 收工冻结；不再继续操作真实数据）

## 当前总览

| 域 | 电脑 A → 云端写入 | 电脑 B 拉取 | 电脑 B → 云端写入 | 电脑 A 拉取收尾 |
|---|---|---|---|---|
| **Done** | 已有历史数据 | **已通过** | **已通过**（含 delete→tombstone→edit/upsert 清 tombstone） | **待明天电脑 A** |
| **Habit** | **已通过** | **已通过** | **已通过**（POST 201 / ok=true） | **待明天电脑 A** |
| **Forge** | **已通过**（Body+Mind） | **已通过** | **已通过**（POST 201 / ok=true） | **待明天电脑 A** |

## 今晚电脑 B 已确认（冻结点）

### A→B 拉取
- **Done A→B**：通过
- **Habit A→B**：通过
- **Forge A→B**：通过

### B→A 反向数据（已写入阿里云，待明天电脑 A 拉取验证）
- **Done**：B 端反向测试记录已准备；delete 曾 tombstone 成功；随后经 **edit/upsert** 清除 tombstone，日志 `POST 201` / `ok=true`
- **Habit**：B 端写入成功，`POST 201` / `ok=true`
- **Forge**：B 端写入成功，`POST 201` / `ok=true`

### 质量观察
- 全程未观察到明显卡顿、覆盖、丢失或重复

### 冻结说明
- 今晚到此为止，**不再继续操作真实数据**
- **不新打**稳定 tag；等明天 B→A 全部验证通过后再决定

## 电脑 A 历史事实（勿清理云端测试文档）

### Done
- A→B 跨电脑读取已通过（含更早 09/25 数据）

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

## 明天电脑 A · 固定下一步（严格按序，不扩测）

1. `git pull`，检出分支 **`cursor/aliyun-dhf-integrate-d4ec`**，打开本地页；若刚从 `main` 切过，**Ctrl+F5**
2. **依次拉取 Done → Habit → Forge**，确认今晚电脑 B 产生的数据都正确出现：
   - Done：面板开关已开时可点「拉取 Done（阿里云）」；或沿用既有 Done 真实同步拉取路径
   - Habit：
     ```js
     window.__ALIYUN_HABIT_REAL_SYNC_ENABLED = true
     await window.runAliyunHabitRealPullAndMerge()
     ```
   - Forge：
     ```js
     window.__ALIYUN_FORGE_REAL_SYNC_ENABLED = true
     await window.runAliyunForgeRealPullAndMerge()
     ```
3. **全程检查**：卡顿、覆盖、丢失、重复
4. 三域 B→A 全部通过后，再决定是否打新稳定 tag / 进入正式主同步候选（Firebase 保留回退）

## 约束

- 不动 `main`
- 不改同步逻辑 / UI（本文件仅进度）
- 不清理云端 Habit / Forge / Done 测试文档，直至闭环确认
- 目标：最快安全迁移，不为测试而扩测
