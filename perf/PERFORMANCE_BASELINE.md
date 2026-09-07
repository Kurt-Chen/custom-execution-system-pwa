# Performance Baseline / Regression Checklist

> 保护线版本：**v1.1**（2026-09-08）  
> **原则：Measure First — 升级前后跑同一套检查；不改业务逻辑来“配合测试”。**

## 阶段锁定（Phase 1 · LOCKED）

| 项 | 内容 |
|----|------|
| 状态 | **已锁定**（体感验证通过，2026-09-08） |
| 代码提交 | `4efaceb` — 底栏按需 paint + Life4000 去重 |
| 缓存 | `exec-system-pwa-v20260908b` |
| 成果 | `setPrimaryModuleFocus` 无脏 warm 不再整链 `render()`；Life4000 同签名复用 |
| 明确不做 | **不进入第二阶段大改**（十二周年/提醒/垃圾箱强制补渲整链重构等） |

**后续第二阶段约定（未开工）**：仅针对重内容模块的 DOM/布局成本做**局部、低风险**优化；每次改动前后必须跑本目录回归检查，防止热路径与 warm 切换回退。不动 Firebase / merge / hygiene / persist / 数据结构，除非另有明确需求。

相关文件：

- `perf/baseline-v1.json` — 机器可读基线 + 阈值 + 结构期望  
- `perf/run-regression-check.js` — Console 半自动检查（复用 `getCloudSyncPerfSnapshot` / stall / `uiPaintDirty` / `renderCount`）

---

## 1. 如何跑

1. 打开应用（如 `http://localhost:8765/`），解锁。  
2. DevTools Console：

```js
const s = await (await fetch("./perf/run-regression-check.js")).text();
eval(s);
const report = await runPerfRegressionCheck({ hotIterations: 3, switchIterations: 5 });
copy(JSON.stringify(report, null, 2));
```

3. 看 `report.printable`：

```text
path | current | baseline | change% | verdict
```

完整对象：`window.__perfRegressionLastReport`。`report.ok === true` 表示无 regression / structural_regression。

可选子集：`runPerfRegressionCheck({ paths: ["addMemo", "habitSwitchWarm"] })`。

---

## 2. 判定规则

| 级别 | 条件 |
|------|------|
| **pass** | 慢 ≤20%（相对 effectiveBaseline），且无结构性问题 |
| **warning** | 慢 **>20%** 且 **≤40%** |
| **regression** | 慢 **>40%** |
| **structural_regression** | 见下（可与耗时无关） |

- `changePct = (currentAvg - baseline.avg) / baseline.avg × 100`（展示）  
- 判定用 `measured.median` vs `effectiveBaseline = max(baseline.median, noiseFloorMs)`（默认 noiseFloorMs=**5**）  
- 单次抖动：连续 **2 次**同路径 regression 再认定硬失败；单次 warning 可观察

### 结构性回归

1. 热路径 **markAll**  
2. 本轮**新增** stall 且 domain=**full**（历史 stall 忽略；stall 通常仅 >1s 才落盘）  
3. addMemo 期望 skip 却 **hygienePass>0**  
4. warm 底栏 **`warmNoFullRender` 却 `renderCount>0`**（局部退化成完整 render）

---

## 3. 基线覆盖

| 路径 ID | 主指标 | avg（保护线） |
|---------|--------|----------------|
| `addMemo` | renderMs | 5.66 |
| `closedListPlainToggle` | renderMs | 20.38 |
| `habitSimpleCheckin` | renderMs | 23.36 |
| `habitSwitchCold` / `Warm` | totalMs | 100 / 20 |
| `forgeSwitchCold` / `Warm` | totalMs | 70 / 2 |
| `goalsSwitchCold` / `Warm` | totalMs | 220 / 10 |
| `purposeSwitchCold` / `Warm` | totalMs | 20 / 2 |
| `dynamicSwitchCold` / `Warm` | totalMs | 55 / 3 |
| `anniversarySwitchCold` / `Warm` | totalMs | 25 / 22 |

热路径三数字保留优化成果（偏紧）。切换类为同探针冷机保护线（含 cold 重置 `primaryModulePaintedOnce`）；安静 Chrome 下若持续更快可再收紧。自动化/高负载下单次抖动属正常，**连续 2 次**同路径 regression 再硬认定。

---

## 4. 接受改动

1. 全部 **pass** → 可接受。  
2. 仅 **warning** → 可接受，说明原因。  
3. **regression** / **structural_regression** → 默认拒绝，除非有意改行为并更新 JSON。  
4. 优化后明显更快 → **收紧**基线。

---

## 5. 明确不做什么

- 不引入复杂测试框架。  
- 不把 sealGap / 纯网络当 UI 回归。  
- 不清 localStorage / IndexedDB / Firebase。  
- **不修改业务代码**配合测试。
