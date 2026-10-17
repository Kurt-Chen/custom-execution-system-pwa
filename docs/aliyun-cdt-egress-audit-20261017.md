# 阿里云「云数据传输」费用只读排查（2026-10-17）

> **范围**：第一阶段只读排查；**不**改同步策略 / merge / poll / safety / tombstone 生产行为。  
> **最高约束**：流畅度 > 数据准确性 > 现有同步体验 > 省费。  
> **账单事实**（用户提供，非猜测）：10 月累计 **云数据传输 ¥53.58**、表格存储 ¥18.58、函数计算 ¥4.61。

对照文档：`docs/aliyun-tablestore-egress-audit-20261002.md`（当时主因是 OTS **公网**下行）。

---

## 0. Go / No-Go（本轮）

| 结论 | 说明 |
|------|------|
| **第一阶段：完成** | 主因链路与冗余字节已有 live 证据（见下） |
| **第二阶段生产改动：No-Go** | 有明确降费杠杆，但**尚不具备**「一次改一个变量 + 全套正确性/流畅验证」的安全落地条件 |
| **保留** | 当前稳定同步行为（`v20261016f` / main）；不拉长 poll、不删 retry/verify/heal |

**缺失证据（阻止本轮改生产）**：

1. 账单明细里 CDT 是否 100% 来自本 Function URL（需控制台「云数据传输」用量按产品/实例拆分；本机无法读取）。
2. 用户侧设备数 × 可见时长 × AMB flush 频次的真实计数（诊断钩子已有，但无跨设备一周采样）。
3. FC gzip 需改 **FC 运行时并部署**；仓库 `main` **当前无** `alicloud-fc-smoke-a/` 源码树，本轮无法在不引入部署风险的前提下验证。
4. AMB tombstone 裁剪与 Lists #230 同类，但 **#299 已因卡顿撤回（#300）**；未复跑流畅度/防复活验收前不得重做。

---

## 1. 当前版本与已落地降费

| 项 | 状态（2026-10-17 实测 / 代码） |
|----|-------------------------------|
| 前端缓存 | `exec-system-pwa-v20261016f` |
| 阿里云主同步 | 默认开；双写 Firebase 默认关 |
| Phase 1a Habit meta | 默认开 |
| Phase 1b domains meta | 默认开；未变则 `skippedFullPull=true` |
| Phase 1c safety 12m→60m | PR #155 **合入旁支** `cursor/aliyun-sync-meta-traffic-d84a`，**未进 main**；main 仍 `ALIYUN_DOMAINS_META_SAFETY_FULL_MS = 12 * 60 * 1000` |
| FC→OTS Endpoint | **`/health` → `otsEndpointType: "vpc"`**（公网 OTS 外网下行主因已消除） |
| Lists tombstone 膨胀 | #230 已裁；今日 Lists 信封 tombstones ≈ **300 / 9.5KB** |
| AMB tombstone 裁剪 | #299 曾做，**#300 撤回**（更卡） |
| 流量诊断钩子 | `getAliyunOtsTrafficDiag` / `dumpAliyunOtsTrafficDiag`（仍可用；文案仍写 ots-public，**已过时**） |

---

## 2. 账单科目怎么对应链路

```text
浏览器  ←—— CDT「云数据传输」（FC 公网出 / 响应体）——  FC Function URL
FC      ←—— VPC（通常不计 OTS 外网下行）——  Tablestore
```

| 账单项 | 更可能对应 | 证据 |
|--------|------------|------|
| **云数据传输 ¥53.58** | FC→浏览器 **公网出向**（CDT；自 2024-01 起 FC 出流量走 CDT） | 官方：函数请求响应流量计入 CDT；客户端只打 `*.fcapp.run` |
| **表格存储 ¥18.58** | 存储 + 读写 CU（VPC 后外网下行应已大幅下降） | `/health` 已是 VPC；**未能**拆账单 CU vs 存储（缺失） |
| **函数计算 ¥4.61** | CU 调用时长 | 与 5s meta poll + 偶发正文 GET 量级相容 |

按内地 CDT 约 **¥0.80/GB**（阶梯 1）粗算：¥53.58 ≈ **~67 GB** 出向（未计免费额度；免费额度是否仍在 **未确认**）。

---

## 3. Live 响应体积（default-room，2026-10-17）

`Accept-Encoding: gzip` **无效**：响应无 `Content-Encoding`，`Content-Length` = 原文。

| 文档 | Bytes | 备注 |
|------|------:|------|
| domains meta | 435 | 常态 5s poll |
| habit meta | 282 | Habit 独立 gate |
| done | 93 297 | |
| habit | 78 312 | |
| forge | 79 826 | |
| anniv | 17 239 | |
| sprint | 50 566 | |
| todayPlan | 14 458 | |
| **amb** | **2 235 595** | **≈2.18 MB，占十域 ~83%** |
| rule100 | 2 152 | |
| lists | 77 593 | 较 10-02 的 1.27MB **已降**（#230） |
| goals | 32 722 | |
| **十域+双 meta** | **≈2.56 MB** | 单次 safety / boot 量级 |

离线 gzip(level=6) 可压到约 **0.58 MB（~23%）** → 理论少传 **~77%** 正文出向（**未上线**）。

### AMB 内部（关键冗余）

| 字段 | 约 | 说明 |
|------|---:|------|
| `tombstones` | **2001 KB / 63 950 keys** | **≈92% AMB 正文** |
| 其中 bare base36 id | **63 819** | 他域全局删除标记 |
| `timeReflection:*` / `fuelScore:*` 等 | ~120 | 更像 AMB 相关 |
| dailyWin 等业务 | ~40 KB | 正常数据 |

**代码证据**（注释写「AMB 相关」，实现却整包复制全局 `syncTombstones`）：

```text
aliyunAmbRealCloneTombstonesFromState()
  → 遍历 state.syncTombstones 全部 key 写入 AMB 信封
```

与 Lists 修复前同一类泄漏；Lists 已用 `aliyunListsRealScopeTombstonesForEnvelope` 收口。

---

## 4. 请求类型 / 触发 / 是否重复

| 类型 | 触发 | 频次（设计） | 约大小 | 重复？ |
|------|------|--------------|--------|--------|
| `GET-meta` domains | 可见页 5s poll；visibility | 每设备 ~12/min | 0.4 KB | 有意重复；**月级百 MB 内，非 ¥53 主因** |
| `GET-meta` habit | domains 选中 habit 或 skipAll 时 P0-B | 随 poll | 0.3 KB | 小 |
| `GET-body` 十域 | boot / safety-full / meta 失败 / gate 关 | boot 每次加载；**safety 每 12m** | **2.56 MB** | safety 在 meta 未变时仍强制全量 → **已证实冗余**（正确性兜底） |
| `GET-body` 单域 | domains version 变 | 随写入 | 该域大小 | 正常；AMB 变则吞 **2.18 MB** |
| `GET-body` RMW | 各域 flush 先 GET 再 POST | 每次上传 | 同域全文 | **写放大**；AMB 每次编辑 ≈ +2.18 MB 出向 |
| `POST-upsert` | flush / meta bump | 随写入 | 响应通常小；**请求体入向不计 CDT** | — |

**多客户端**：每台可见设备独立 poll + safety + 各自 RMW → 流量近似 ×N（与 10-02 审计一致）。

**日志是否拖流量**：诊断事件只记字节计数，不记任务正文；`verbose` 默认关 → **不是**账单主因。

---

## 5. 粗算：什么能解释 ~67 GB？

仅 safety（2.56 MB × 12m × 可见时长），2 设备 × 16h × 30 天 ≈ **12 GB** —— **不够**单独解释 ¥53。

合理叠乘（量级，非精确复算）：

- safety 全量 × 设备  
- AMB / 其它域 **flush RMW GET**  
- meta 变后的对端拉正文（AMB 一次 2.18 MB）  
- boot / 硬刷新  
- 月初 VPC 切换前若仍有部分公网路径：**未计入本 CDT 科目**（OTS 外网属表格存储侧）

→ **主体积因子已证实为 AMB 信封（全局 tombstone）+ 无 gzip**；  
→ **精确 GB 拆分仍缺**控制台明细与设备侧 `dumpAliyunOtsTrafficDiag()` 周采样。

---

## 6. 正常 vs 浪费（基于证据）

| 类别 | 判定 | 依据 |
|------|------|------|
| 5s domains-meta 轮询 | **正常小流量** | Phase 1b；435B；跳过正文 |
| payload 指纹未变跳过 merge/render | **正常** | 保流畅 |
| safety-full 12m 十域 | **正确性兜底，但字节冗余** | meta 未变仍下 2.56MB；缩短间隔会更贵，拉长属「降频」需另验收 |
| AMB 携带 6 万+ 他域 tombstone | **已证实浪费** | live 拆分 + 代码整包复制 |
| FC 不 gzip | **已证实浪费** | 实测无 Content-Encoding；gzip≈4× 压缩 |
| Lists 整包 tombstone | **已修复** | #230；今日 300 keys |
| 异常重试风暴 | **本轮未证实** | 无用户侧 diag 周样本 |

---

## 7. 第二阶段候选（按约束排序，**本轮均不改生产**）

| 优先级 | 杠杆 | 预期 | 风险 / 回退 | 是否触碰禁止项 |
|--------|------|------|-------------|----------------|
| A | **FC 响应 gzip**（`Accept-Encoding` 时压缩 JSON） | 正文出向约 **÷4**；不改协议语义 | 改 FC + 部署；回退关压缩 / 回滚函数版本 | 否（非降频、非删 heal） |
| B | **AMB tombstone 作用域**（对齐 Lists #230，仅 AMB 相关 id） | AMB 2.18MB → 约几十 KB 量级 | **#299 曾卡顿**；防复活必须全套验收 | 触及删除标记 / 合并周边 → **需独立验证舱** |
| C | 合入 Phase 1c safety 12→60m | safety 出向约 ÷5 | 拉长全量兜底间隔；旁支已有实现 | 接近「为省费降频」→ 仅作正确性窗口评估后做 |
| D | 拉长 5s poll | meta 更少 | **明确禁止**（本轮） | 是 |
| E | 删 retry/verify/heal | — | **禁止** | 是 |

**推荐下一轮唯一变量**：先做 **A（gzip）**（链路已证实未压缩、正确性风险最低）；AMB 裁剪单独立项，不得与 gzip 同轮合并。

---

## 8. 建议观测（不增高频请求）

控制台（已有，可关闭 verbose）：

```js
window.resetAliyunOtsTrafficDiag()
// 使用一段时间后：
window.dumpAliyunOtsTrafficDiag()
```

关注：`byModuleBytes.amb`、`byTriggerBytes["pull:safety-full"]`、`byTriggerBytes["flush:amb"]`、`totalResponseMB`。

账单侧（需用户）：CDT 用量按 **函数计算 / 本 Function** 过滤；对比 gzip 前后日 GB。

---

## 9. 影响端别

Both（诊断与同步路径桌面/手机同一套；本轮无 CSS/端别样式改动）。
