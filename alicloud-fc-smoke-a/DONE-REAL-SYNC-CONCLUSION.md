# 阿里云 Done List 最小真实接管 — 测试结论

**日期**：2026-09-24  
**分支**：`test/alicloud-sync`（未 merge `main`）  
**稳定点**：tag `stable/aliyun-done-real-sync-pass`  
**前回滚点**：`stable/before-aliyun-done-real-sync`

## 范围

仅 Done List（`manualDone` 手动条目）临时走阿里云 FC → Tablestore；Firebase / IndexedDB / localStorage 主路径完整保留。

## 结果：Go

| 项 | 结果 |
|----|------|
| add | PASS |
| toggle（恢复 → tombstone） | PASS |
| delete（软删 tombstone） | PASS |
| manual pull 合并 | PASS |
| 跨浏览器 / 跨端拉取 | PASS |
| HTTP 写入 | 201 |
| Long Task >50ms | 0 |
| mainWork | 数十 ms 级 |
| 同步期间 UI | 可操作 |

## 开关

- `ALIYUN_DONE_REAL_SYNC_ENABLED = false`（默认关）
- 实验时面板勾选，或 `window.__ALIYUN_DONE_REAL_SYNC_ENABLED = true`

## 明确未做

- 未扩第三个模块 / 未全量迁移  
- 未删 Firebase 数据  
- 未部署正式 Pages 实验入口为默认开启  
