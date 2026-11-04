# PWA 性能黄金基准（Performance Golden Baseline）

> **只读历史参照。** 以后出现卡顿 / 同步变慢 / 动画掉帧 / 响应下降，必须先与本基准对照，再只修有证据的瓶颈。  
> **原则：以本次实际达到的流畅度为标准——系统变慢了，就与它对齐找退化，再精准修复。**  
> **开发约束**：日常改动须遵守 Performance First（[`.cursor/rules/performance-first.mdc`](../.cursor/rules/performance-first.mdc) / [`PERFORMANCE_FIRST.md`](./PERFORMANCE_FIRST.md)），不得轻易使本基准日体验退化。

---

## 0. 基准身份（不可冒充）

| 字段 | 值 |
|------|-----|
| **基准 ID** | `golden-v1` |
| **状态** | **LOCKED（只读）** · 2026-11-04 |
| **正式部署版本（唯一合法对照码）** | **`exec-system-pwa-v20261104m`** |
| **正式站** | https://kurt-chen.github.io/custom-execution-system-pwa/ |
| **Git commit（`origin/main`）** | `cf2376426359def847097c9bcc10c3c2657a4ec4` |
| **关联性能提交** | `8362493`（sync coalesce + persist dedupe + Habit 索引等合入前本体） |
| **发布说明** | 用户跳过人工双设备 H1–H6，改为实际上线使用；此事实已记录，不阻止以本版为体验基准 |

### 硬性规则

1. **黄金基准 = 已部署到 GitHub Pages 的 `v20261104m`（上述 commit）。**  
2. **禁止**把「仅本地未部署构建」写成正式黄金基准。  
3. 下文数值多数来自 **同一缓存名 `v20261104m` 的发布前本地真实阿里云实测**；代码随后以 `cf23764` 推上正式站。对照时须注明「复测环境是否为正式站」。  
4. 旧基线 `perf/PERFORMANCE_BASELINE.md`（v1.1 · 2026-09 · `v20260908b`）仍保留，**不作为本黄金基准**；仅作历史模块热路径参考。

原始报告归档目录：`docs/performance-golden-baseline-v1/`（只增不改）。

---

## 1. 环境档案

| 项 | 内容 |
|----|------|
| 测量日 | 2026-11-04 |
| OS | Windows 10（宿主） |
| 浏览器 / 自动化 | Microsoft Edge + puppeteer-core；部分诊断用 Cursor 内嵌浏览器（**有后台节流，绝对 FPS 仅作相对参考**） |
| 同步 | 阿里云主路径开启 · 真实房间数据 · Phase 1b meta gate 默认开 |
| 网络 | 实测时为本机访问云端（非模拟离线，除非标明 CDP offline） |
| 数据量级（参考） | Done 约 1.9k～9k 量级样本均出现过；stringify 包约 0.5～6MB 历史量级 |

复测时：**同一设备 + 同一浏览器 + 相近网络**；否则只能作定性，不能作硬回归判决。

---

## 2. 场景分册（禁止混用）

| 代号 | 场景 | 用途 |
|------|------|------|
| **A** | 正常同步回归 | 单次真实 pull / 前台可见拉取；看 LT、render 闸、stringify |
| **B** | 多轮同步压力 | `manual-full` + 拉取中连续 `saveState`（模拟多域脏写）；看 stringify/persist 去重 |
| **C** | 烟花动画 | 庆祝 WebP 播放 / 重放；看首帧就绪、网络字节、LT |
| **D** | 在线同步 + 烟花同时 | 播放窗内叠加同步；**本版仅有定性备注，无完整量化黄金数** |
| **E** | 离线 / 恢复网络 | CDP offline 写入再上线；**本版仅有正确性抽样，无完整性能黄金数** |

报告文件与场景映射见 §6。

---

## 3. 黄金数值（按场景）

### 场景 A · 正常同步回归

来源：`_diag_sync_stall_final_report.json`（R2 后 ExpA）+ `_diag_r3_accept_perf.json`（R3 后同 harness 复测）。

| 指标 | 黄金参考 | 备注 |
|------|----------|------|
| 缓存名 | `v20261104m` | 正式站一致 |
| ExpA 成功拉取 Long Task max | **≈422 ms** | hideBadge + 真实 pull；syncing 窗 `renderDuringSyncing=0` |
| ExpA stringifyMs（该次） | **≈72 ms** | 单次样本 |
| R3 复测（manual-full + saveBurst）FPS | **≈59.9** | Edge 前台；勿与内嵌浏览器绝对 FPS 混比 |
| R3 复测 Long Task max | **0 ms**（该次窗口） | 见场景 B 同源报告 |
| 云端请求（该次窗口） | **≈30** | 随 meta/域变化会浮动；对照看量级而非绝对值 |

**退化重点：** 同场景出现**新的持续性** Long Task；或 syncing 期间整页 `render` 再次打开。

### 场景 B · 多轮同步压力（stringify / persist）

来源：`_diag_r3_persist_final_report.json` · after。

| 指标 | 黄金参考（优化后） | 优化前对照（同 harness，非黄金） |
|------|-------------------|----------------------------------|
| stringify 次数 | **1** | 19 |
| stringify 耗时 | **≈4.9～5.4 ms** | ≈216.5 ms |
| persist 次数 | **1** | 19 |
| persist 耗时 | **≈5.0～5.6 ms** | ≈308.1 ms |
| persistCoalesceReschedule | **≈28** | — |
| saveState 次数 | **≈28** | ≈45 |
| Long Task max | **0～209 ms**（样本区间） | 2547 ms |
| FPS | **≈57～60** | ≈43.5 |
| 云端请求 | **≈30～45** | ≈37 |

**退化重点：** 同 harness 下 stringify/persist **次数或耗时明显回升**（例如重新接近优化前量级）。

### 场景 C · 烟花动画

来源：`_tmp_fx_perf_report_20261104m.json` · after（代码已合入 `v20261104m`）。

| 指标 | 黄金参考 |
|------|----------|
| mount→ready 平均 | **≈41 ms**（三轮 37 / 61 / 24） |
| 重放网络下载 | **0 byte**（Blob 缓存命中；禁止再 `?t=` bust） |
| 重放 Long Task total 平均 | **≈40 ms**（样本） |
| 资源释放 | hold 后 DOM 移除 + `revokeObjectURL` |

优化前对照（非黄金）：mount→ready 平均 ≈229 ms；每次重读 ≈2.32MB。

**退化重点：** 首帧就绪 **> 基准 2×**；或重放再次出现大体积 WebP 网络下载。

### 场景 D · 同步 + 烟花同时

| 状态 | **未建立完整量化黄金数** |
|------|-------------------------|
| 已有备注 | 同步叠加时掉帧更差；主因仍偏动画解码；烟花 hold 期可跳过非紧急 5s 拉取 |
| 复测要求 | 必须单独跑 D，不得用 A/C 数字顶替 |

### 场景 E · 离线 / 恢复

| 状态 | **正确性抽样，非性能黄金数** |
|------|------------------------------|
| 已有 | CDP offline 本地写入后恢复，条目仍在（`_diag_r3_integrity_result.json` / accept 机制测） |
| 复测要求 | 性能数字须单独采；正确性失败优先于跑分 |

---

## 4. 专项模块黄金参考（可跨场景引用，但须注明窗口）

### Habit Done 日期索引

来源：`_diag_habit_done_day_index_result.json`（索引合入后；正式版含此逻辑）。

| 指标 | 参考 |
|------|------|
| 真数据 80×6 日查询 | naive ≈143.5 ms → index ≈**2.6 ms**（约 **55×**） |
| 12s 同步窗 | hits ≈11362 / builds **1** / lastBuildMs ≈2.2 |

### Forge Key canonical 缓存

来源：`_diag_r3_forge_canon_report.json`（合入 `_forgeWpCanonKeyCache`）。

| 指标 | 参考 |
|------|------|
| 12s pull 窗函数耗时 | ≈4243 ms → ≈**142 ms**（约 −97%） |
| 命中率（清缓存后重算窗） | hits 1142126 / misses 207 → **≈99.98%** |
| Long Task max（该窗） | 1318 → **509 ms** |

### 内存 / 资源释放

| 项 | 基准期望 |
|----|----------|
| 烟花 | 播放结束 revoke objectURL；DOM 卸下 |
| Forge canon Map | size ≥8192 清空防膨胀 |
| 判定 | **持续增长且不随页面生命周期回落** → 重点检查（单次尖峰不算） |

---

## 5. 卡顿对照流程（强制顺序）

1. **复测**：相同设备、浏览器、网络；选定场景 **A/B/C/D/E 之一**（不可混报）。  
2. **对照**：与本文件对应场景表格逐项比。  
3. **定位**：找出退化最大的函数 / 模块 / 资源（优先 Performance profile + `getCloudSyncPerfSnapshot`）。  
4. **修复**：只改有证据的瓶颈；不顺带重构稳定模块。  
5. **回归**：同一场景重测。  
6. **记录**：修复前后数据追加到新报告；**不得改写** `docs/performance-golden-baseline-v1/` 内原始文件。

---

## 6. 性能退化预警（初始阈值）

| 信号 | 阈值（相对同场景黄金） | 动作 |
|------|------------------------|------|
| FPS | 持续下降 **≥10%** | 重点检查 |
| Long Task | 出现**新的持续性**长任务 | 重点检查 |
| JSON / persist | 次数或耗时**明显增加** | 重点检查 |
| 烟花首帧 | **> 基准 2×**，或重放重复下载素材 | 重点检查 |
| Forge 缓存命中率 | **明显下降** | 重点检查 |
| 同步延迟 | 达基准 **2×**，或 **>60s** 仍未发现对端更新 | 重点检查 |
| 内存 | 持续增长且不能随生命周期释放 | 重点检查 |

**单次异常 ≠ 代码回归。** 先排除设备负载与网络波动；建议同路径连续 2 次异常再认定硬回归。

---

## 7. 严格开发原则

- 不为跑分而优化。  
- 不为省几元钱牺牲流畅度；阿里云月费硬上限 **30 元**（见 `.cursor/rules/pwa-perf-cloud-budget.mdc`）。  
- 不随意重构已稳定模块。  
- 不牺牲同步准确性、离线能力、数据保护（tombstone / LWW / emergency backup）。  
- 优先解决真实用户体感退化。  
- **每次只处理有证据支持的具体问题。**

---

## 8. 基准版本管理

| 规则 | 说明 |
|------|------|
| `golden-v1` | **只读**；对应 `v20261104m` @ `cf23764` |
| 新增基准 | 允许增加 `golden-v2`… 新目录与新文档章节；**禁止覆盖** v1 归档 |
| 升级条件 | 须经**实际使用验证**，且性能与数据准确性均可靠后，才可将「当前推荐对照」指针挪到新版；旧版仍保留 |

归档清单（`docs/performance-golden-baseline-v1/`）：

- `MANIFEST.json` — 本目录索引  
- `_diag_r3_production_release_report.json`  
- `_diag_r3_persist_final_report.json` / `_diag_r3_persist_after.json` / `_diag_r3_persist_before.json`  
- `_diag_r3_accept_perf.json` / `_diag_r3_accept_final_report.json`  
- `_diag_sync_stall_final_report.json`  
- `_diag_r3_forge_canon_report.json`  
- `_tmp_fx_perf_report_20261104m.json`  
- `_diag_habit_done_day_index_result.json`  
- `_diag_r2_perf_report.json` / `_diag_r2_profile_compare.json`  
- `_diag_r3_integrity_result.json`

---

## 9. 与旧 `perf/` 基线的关系

| 文档 | 角色 |
|------|------|
| **本文 `docs/PERFORMANCE_GOLDEN_BASELINE.md`** | **当前体验黄金基准（2026-11 · 正式站 v20261104m）** |
| `perf/PERFORMANCE_BASELINE.md` | 2026-09 模块热路径保护线；勿与黄金基准混用 |

---

*建立日：2026-11-04 · 仅文档与归档 · 未改业务代码 · 未新开性能优化。*
