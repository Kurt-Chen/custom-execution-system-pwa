# 阿里云三域 · 跨电脑闭环测试进度

> 仅记录测试状态，不涉及业务代码变更。  
> 基线分支：`cursor/aliyun-dhf-integrate-d4ec` · 稳定 commit：`71b89a3` · tag：`stable/aliyun-dhf-integrate-go`

更新时间：2026-09-28

## 当前进度

| 域 | 状态 | 说明 |
|---|---|---|
| **Done** | **已通过** | 跨电脑读取已通过（电脑 B 能正确显示电脑 A 侧历史，含 09/25 Done） |
| **Habit** | **进行中** | 电脑 A 已成功首次写入阿里云；待电脑 B 拉取验证 |
| **Forge** | 未开始 | Habit 验证完成后再做 Forge 跨电脑闭环 |

## Habit 已确认事实（电脑 A）

- Habit 阿里云真实同步已开启并完成一次简单打卡写入
- Habit 文档：`aliyun-habit-real-v1-default-room`
- 日志确认：`POST status=201` / `ok=true`
- **请勿清理或覆盖** 该 Habit 测试文档，供晚上电脑 B 拉取

## 晚上电脑 B · 下一步

1. `git pull` 后检出分支 `cursor/aliyun-dhf-integrate-d4ec`（确认停在 `71b89a3`）
2. 打开本地页面，Console 执行：
   ```js
   window.__ALIYUN_HABIT_REAL_SYNC_ENABLED = true
   ```
3. 再执行：
   ```js
   await window.runAliyunHabitRealPullAndMerge()
   ```
4. 验证电脑 A 的 Habit 打卡是否正确显示
5. 检查：卡顿、覆盖、丢失、重复

## Habit 通过后

- 继续 **Forge** 跨电脑闭环验证
- 全程同样检查：卡顿、覆盖、丢失、重复

## 约束提醒

- 不动 `main`
- 不改同步逻辑 / UI（本文件仅进度记录）
- 不清理云端 Habit 测试数据，直至闭环确认
