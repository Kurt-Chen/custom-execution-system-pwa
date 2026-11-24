# FC 响应 gzip · 实现与验证报告（2026-10-17）

> **唯一变量**：Function URL 响应 gzip。  
> **未改**：`index.html` 同步内容、版本号、merge、tombstone、retry、heal、poll、保存时机；未裁 AMB。

详细操作说明见 `alicloud-fc-smoke-a/RESPONSE-GZIP.md`。

---

## 1. 部署形态 / 网关 / 客户端

| 项 | 证据 |
|----|------|
| 运行时 | Flask Custom Runtime（`FC_CUSTOM_LISTEN_PORT`） |
| 入口 | Function URL `https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run` |
| 网关 gzip | **无**（部署前 `Accept-Encoding: gzip` 仍无 `Content-Encoding`） |
| 压缩应发生位置 | **函数内** `after_request`（本 PR） |
| 客户端 | 浏览器 `fetch` 自动带 gzip 并解压；**前端无需改** |
| CDT 计费 | 「函数请求响应流量」按 **线缆响应字节**；只有部署后 `Content-Length` 下降才可能省费 |

**结论**：离线压缩比 ≠ 账单收益；必须以部署后 curl / CDT 日账单为准。

---

## 2. 实现要点

- 开关：`RESPONSE_GZIP`（默认开；`0` 关闭回退）
- 仅当 `Accept-Encoding` 含 `gzip`/`*`
- 仅 `application/json` / `text/*`
- `< RESPONSE_GZIP_MIN_BYTES`（默认 1024）原样
- 已有 `Content-Encoding` 不重复压
- 压缩失败或不更小 → 原样
- 响应头：`Content-Encoding`、`Content-Length`、`Vary: Accept-Encoding`
- level 默认 **1**（延迟优先）

---

## 3. 本地验证结果

### 单元（`_test_response_gzip.py`）

- 大 JSON：gzip 后解压 JSON **全等**
- 小 health：不压
- `identity`：不压
- `RESPONSE_GZIP=0`：关闭
- 错误响应可读
- 已有 Encoding：不双压

### 本地 e2e 压测（`_bench_response_gzip_local.py`，~2.2MB 合成 JSON）

| 指标 | gzip | identity |
|------|------|----------|
| wire | 482 175 | 2 207 852 |
| 节省 | **78.2%** | — |
| 压缩 CPU (level1) | **~9.6 ms** | — |
| e2e（本机 loopback） | 23.2 ms | 6.0 ms（+17 ms，含压缩） |
| JSON.parse | 4.9 ms | 5.2 ms（**无增**） |

### 线上 AMB 原文离线压（部署前对照，level=1）

| 指标 | 值 |
|------|----|
| raw | 2 235 595 B |
| gzip wire | 694 906 B（**31.1%**，省 **68.9%**） |
| CPU | **~20 ms** |

> loopback 上 gzip e2e 略慢属预期（无网络传输优势）。真机 4G/跨网下，少传 ~1.5MB 通常可抵消 ~20ms CPU；**须部署后实测**。

### 前端长任务

解压后业务 JSON 体积与今日相同 → `JSON.parse` 成本不变（本地测 parse delta ≈ 0）。压缩 CPU 在 **FC 侧**，不进主线程。

### 手机 / 电脑

协议为标准 HTTP gzip；双端 `fetch` 行为一致。本 Agent **未能**在已部署 gzip 的线上对真机做 Forge/Done 操作验收（见下）。

---

## 4. 线上状态（本 PR 合并时）

| 检查 | 结果 |
|------|------|
| `/health.responseGzip` | **缺失** → **新 `app.py` 尚未部署** |
| AMB `Content-Encoding` | 无 |
| 代码提交 | **不等于**线上生效 |

---

## 5. 部署与回退

完整清单：`docs/aliyun-fc-gzip-deploy-checklist-20261017.md`。

1. **备份** WebIDE 当前 `app.py`；基线见 `docs/fc-gzip-baseline-20261017/`  
2. **首次必须**环境变量 `RESPONSE_GZIP=0` + 部署新 `app.py` → `EXPECT_MODE=off bash _verify_prod_gzip.sh`  
3. 通过后再 `RESPONSE_GZIP=1` + 部署/重启 → `EXPECT_MODE=on bash _verify_prod_gzip.sh`  
4. 手机+电脑人工验收  
5. 回退：优先 `RESPONSE_GZIP=0`；无效则恢复备份代码  

**环境变量**：本函数 import 时读取；改 env 后须 **部署或重启实例**。

---

## 6. Go / No-Go / 上线状态

| 范围 | 结论 |
|------|------|
| **实现 + 本地正确性** | **Go**（可合并本 PR） |
| **生产开启压缩** | **No-Go / 待验证** — 须按 `docs/aliyun-fc-gzip-deploy-checklist-20261017.md` 两阶段部署 |
| 若部署后卡顿/变慢/数据异常 | **立即 `RESPONSE_GZIP=0`**；无效则恢复备份 `app.py` |

**上线状态：待验证。** 在双端人工验收完成前，**不宣称**已保证流畅或已实现账单降幅。

**影响端别**：Both（仅 FC；前端无改）。
