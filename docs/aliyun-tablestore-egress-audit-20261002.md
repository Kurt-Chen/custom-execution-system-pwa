# 阿里云 Tablestore 外网下行流量审计（2026-10-02）

> **范围**：只审计、加临时诊断日志；**不**改同步架构 / merge / local-first 基线。  
> **账单事实**（用户已确认，非猜测）：Tablestore 下行 **17.3101 GB / ¥13.85** 为首要费用；读写 CU / 存储 ≈ ¥0；云数据传输 1.31 GB；函数计算 ¥0.74。

---

## 0. 结论摘要

| # | 事实 |
|---|------|
| 1 | **浏览器 / 手机 / 平板从不直接访问 Tablestore**；全部经 FC Function URL：`https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run` |
| 2 | **线上 FC→OTS 使用公网 Endpoint**（已用 `/health` 实测）：`https://execsmokea.cn-hangzhou.ots.aliyuncs.com` → 计费项 **外网下行流量** |
| 3 | **不是** VPC / internal Endpoint（后者形如 `*.cn-hangzhou.ots-internal.aliyuncs.com`） |
| 4 | 准实时：**页面可见时每 5s** 拉一轮；Phase 1b 先 GET 房间 `domains-meta`，未变则跳过 10 域正文 |
| 5 | **`main` 上安全全量仍是 12 分钟**（PR #155 Phase 1c「12→60 分钟」合入了旁支 `cursor/aliyun-sync-meta-traffic-d84a`，**未进 main**） |
| 6 | **最大正文：`lists` ≈ 1.27 MB / 次**；十域全量 ≈ **1.64 MB / 次**（live GET 实测） |
| 7 | 每次域 **flush（写）都是 RMW：先 GET 全文再 POST**；改 Lists 一次 ≈ 再吞 1.27 MB OTS 下行 |
| 8 | 多设备同时开着页面 → **各自 5s 轮询 + 各自 safety-full**，流量近似 ×N |
| 9 | 账单「OTS 下行 ≫ 云数据传输」与 **FC→浏览器 gzip / 浏览器侧统计口径** 一致：OTS→FC 公网常为未压缩行数据 |

**降一个数量级的主杠杆（按影响，下一轮再改，本轮不动架构）**：

1. **FC→OTS 改 VPC/内网 Endpoint**（同区 cn-hangzhou）→ 直接砍掉「外网下行」计费（需 FC 开 VPC 访问 + 改 `OTSENDPOINT`）  
2. **压缩 / 分片 Lists（1.27MB）与 AMB（273KB）**，禁止整包 RMW  
3. **把 Phase 1c 合入 main**（safety 12m→60m）+ 评估是否可再拉长  
4. **拉长 poll 间隔**（5s→15–30s）或「仅脏域 / 仅前台活跃」  
5. **写路径改为增量 patch**，避免 Lists 每次编辑 GET 全文  

---

## 1. 所有 Tablestore 读取入口

数据面只有 **FC `app.py` 的 `OTSClient.get_row`**（仓库历史：`alicloud-fc-smoke-a/app.py`，当前目录已不在 tree，但线上仍跑该烟雾服务）。

| 浏览器触发 | HTTP | FC 动作 | OTS API |
|------------|------|---------|---------|
| 各域 pull | `GET /smoke/{docId}` | 读一行 | `get_row` |
| 各域 flush | 先 `GET /smoke/{docId}` 再 `POST /smoke` | RMW | `get_row` + `put_row` |
| domains meta gate | `GET /smoke/aliyun-meta-v1-domains-{room}` | 读 meta | `get_row` |
| Habit Phase 1a meta | `GET /smoke/aliyun-meta-v1-habit-{room}` | 读 meta | `get_row` |
| meta bump / verify | GET → POST → GET | RMW×N | `get_row` ×2–3 + `put_row` |
| 面板烟雾 A/B / 诊断 | GET/POST/DELETE `/smoke/...` | CRUD | 同上 |

**客户端入口函数（均最终 `aliyunExpFetchJson` → FC）**：

- 编排：`runAliyunSyncPrimaryNearRealtimePull` → `runAliyunSyncPrimaryBootPull`
- 正文：`runAliyun*RealPullAndMerge`（done / habit / forge / anniv / sprint / todayPlan / amb / rule100 / lists / goals）
- Meta：`aliyunDomainsMetaFetch` / `aliyunHabitMetaFetch` / bump / seed
- 写：各域 `flushAliyun*RealQueue`（**先 GET 全文**）

---

## 2. 浏览器端是否直连公网 OTS？

**否。** 三端同一套 Vanilla PWA：只配置 Function URL（默认 `*.fcapp.run`），禁止浏览器带 AccessKey。  
OTS 公网 Endpoint 只出现在 **FC 环境变量 / 默认值** 中。

---

## 3. FC 使用的 Endpoint 类型（实测）

```http
GET https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run/health
```

返回：

```json
{
  "otsEndpoint": "https://execsmokea.cn-hangzhou.ots.aliyuncs.com",
  "otsInstance": "execsmokea",
  "otsTable": "aliyun_exec_smoke_a"
}
```

| 类型 | 主机形态 | 当前 |
|------|----------|------|
| 公网 | `*.cn-hangzhou.ots.aliyuncs.com` | **✅ 正在用** |
| 内网 | `*.cn-hangzhou.ots-internal.aliyuncs.com` | ❌ |
| VPC | 控制台 VPC Endpoint | ❌ |

同区（均为 **cn-hangzhou**）时，把 FC 配到与 Tablestore 互通的 VPC，并改 `OTSENDPOINT` 为 **internal/VPC**，通常可避免 OTS **外网下行**计费（仍可能有 CU；以官网计费文档为准）。**本轮只建议，不改线上 FC。**

---

## 4. 每次 pull 实际返回多少？

对 `default-room` live GET（FC JSON 响应 `size_download`，2026-10-02）：

| 文档 | Bytes | ≈ |
|------|------:|---|
| domains meta | 396 | 0.4 KB |
| habit meta | 257 | 0.3 KB |
| done | 14 891 | 15 KB |
| habit | 11 635 | 11 KB |
| forge | 17 233 | 17 KB |
| anniv | 10 476 | 10 KB |
| sprint | 24 192 | 24 KB |
| todayPlan | 3 156 | 3 KB |
| **amb** | **279 094** | **273 KB** |
| rule100 | 2 166 | 2 KB |
| **lists** | **1 327 235** | **1.27 MB** |
| goals | 30 737 | 30 KB |
| **十域正文合计** | **1 720 815** | **1.64 MB** |

→ **单次安全全量 / boot 全量 ≈ 1.64 MB OTS 读（量级）**；其中 **lists 占约 77%**。

---

## 5. 各模块多久 pull 一次？定时轮询？

| 机制 | 间隔 / 条件 | 拉什么 |
|------|-------------|--------|
| 前台 poll | **5000 ms**（仅 `visibilityState===visible`） | Phase 1b：先 domains-meta；变了才拉对应域正文 |
| boot | 启动后 ~1.2s+idle | **强制十域正文**（`forceAllBodies`） |
| visibility / pageshow | 回前台 debounce 300ms | 同 near-realtime |
| safety-full（**main 现状**） | **每 12 分钟** | **强制十域正文** |
| Habit 独立 meta safety | 仍 12 分钟（Habit 域被拉时） | 可能额外 GET habit 正文 |
| 模块切换 | **不**单独为切换发起全量（已并入主轮询） | — |

Phase 1c（60 分钟 safety）在旁支已实现，**main 未合入**。

---

## 6. 刷新 / focus / visibility / 在线恢复是否重复 pull？

| 事件 | 行为 | 是否可能叠乘 |
|------|------|--------------|
| 首次加载 | `scheduleAliyunSyncPrimaryBootPull` → reason=`boot` + 启动 5s interval | boot 与首轮 poll 有 inflight 互斥 |
| `visibilitychange→visible` | `schedule…("visibility")` | 与 poll 共享 `aliyunSyncPrimaryPullInFlight` |
| `pageshow` | `schedule…("pageshow")` | 同上 |
| 隐藏页 | poll **跳过** | 好 |
| 上传 flush 中 | near-realtime **跳过**（`flush-busy`） | 好 |
| 硬刷新 | 再来一次 **boot 十域全量** | 多设备多次刷新会放大 |

**没有**单独的 `window focus` / `online` 阿里云全量钩子（Habit 旧前台拉已转发到主路径）。

---

## 7. 是否「只要一个模块却拉全量」？

- **常态 poll + meta 未变**：只拉 **domains-meta（~0.4KB）**，`skippedFullPull=true`。  
- **boot / safety-full / meta gate 关闭 / meta 解析失败**：仍 **十域全文**。  
- **某个域 version 变了**：只拉该域（正确）；但若 bump 失败导致他端一直 safety-full，会退回全量。  
- **Habit**：在已被 domains-meta 选中后，仍先打 **独立 habit-meta**（多一次小 GET），再决定是否正文。

---

## 8. 多设备同时轮询？

会。每台可见设备独立：

- 5s × domains-meta  
- 12m × 1.64MB 全量（main）  
- 各自写路径 RMW  

粗算（与账单同量级，非精确复算）：

- 2 设备 × 16h 可见 × 12m safety ≈ 160 次全量/天 × 1.64MB ≈ **0.26 GB/天 ≈ 7.7 GB/月**（仅 safety）  
- 再加上 Lists RMW、boot、meta-changed 互拉 → **轻松贴近 17 GB/月**。

---

## 9. 准实时是否造成重复读？

- **Meta 未变**：重复的是 **小 meta GET**（月级百 MB 量级，不是 17GB 主因）。  
- **主因是周期性大正文**：12m safety-full + Lists/AMB 体积 + 写时 RMW。  
- Habit bump：`GET meta → POST → GET verify`，失败最多 3 次，属小流量但会增加 CU/次数。

---

## 10. 一次用户操作是否触发多次相同 GET？

| 场景 | 次数 |
|------|------|
| 一次 Lists 编辑 flush | **≥1× GET 全文（1.27MB）+ 1× POST + domains-meta bump（GET+POST+GET）** |
| Habit 打卡 flush | GET habit 正文 + POST + habit-meta bump（多次 GET）+ domains bump |
| 对端 poll | domains-meta GET；version 变再 GET 该域正文 |
| `diagnoseAliyunHabitPartialSync` | 额外手动 GET（诊断用） |

---

## 临时诊断日志（本 PR）

缓存版本：`v20261002p`。

在控制台：

```js
window.dumpAliyunOtsTrafficDiag()
window.getAliyunOtsTrafficDiag()
window.setAliyunOtsTrafficDiagVerbose(true)
window.resetAliyunOtsTrafficDiag()
```

每条事件字段：`timestamp / device / module / trigger / requestType / responseBytes / elapsedMs / endpointType`。

汇总含：每分钟/每小时 pull 次数、每模块累计字节、单次最大响应、按 trigger 下载量。

**说明**：`responseBytes` 是 **FC→浏览器** 的 JSON 文本长度；OTS 账单字节为 **OTS→FC 公网**。量级同阶，gzip 时浏览器侧会偏小。

---

## 建议落地顺序（保持流畅前提下）

1. **运维开关（最大 ROI）**：FC 同区改 **OTS 内网/VPC Endpoint**（验证 CU/延迟后）  
2. **合入 Phase 1c 到 main**（safety 60m + pending bump）— 已有现成 PR 成果，勿丢  
3. **Lists 专项**：禁止 1.27MB 整包 RMW（增量 / 分片 / 压缩）  
4. **观测一周诊断数据** 后再动 poll 间隔（避免伤跨设备 5–10s 体验预期）  
5. 明确不恢复「每 5s 十域正文」旧路径（`setAliyunSyncMetaGateEnabled(false)` 仅应急）

**优先级不变**：流畅可操作 > 同步稳定 > 同步速度 > 真正实时（见 `alicloud-stable-baseline.mdc`）。
