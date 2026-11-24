# FC 响应 gzip · 上线验证清单（2026-10-17）

**状态：待验证**（本 Agent **无法**直接部署阿里云 FC；无控制台写权限 / 无 `aliyun` CLI 凭证。）  
**唯一变量**：响应 gzip。未改 poll / merge / tombstone / retry / heal / 前端。

---

## 0. PR #328 预审（已完成）

| 检查 | 结果 |
|------|------|
| 触及 `index.html` / `sw.js` | **否** |
| 触及同步 poll/merge/tombstone | **否** |
| PR 文件 | 仅 `alicloud-fc-smoke-a/**` + `docs/**` |
| 相对仓库内上一版 FC `app.py`（`d1e6c2b`） | **仅** gzip helpers + `/health.responseGzip` + `after_request` 改名；CRUD 路由未改 |

---

## 1. 部署前线上基线（已冻结，可回退对照）

目录：`docs/fc-gzip-baseline-20261017/`

| 项 | 值 |
|----|----|
| 捕获时间 UTC | `2026-10-17T10:15:23Z` |
| Function URL | `https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run` |
| `otsEndpointType` | **vpc** |
| `OTS_ENDPOINT` | `https://execsmokea.cn-hangzhou.vpc.tablestore.aliyuncs.com` |
| `/health.responseGzip` | **无**（旧代码） |
| AMB `aliyun-amb-real-v1-default-room` | **2 235 595** bytes |
| AMB sha256 | `fc3f3b888f825eca94279329e33c5b43e12bfd3ec1f5bc6d66d65f9775ec4b41` |
| `Accept-Encoding: gzip` | **无** `Content-Encoding`；正文与 identity **相同** |

**回退材料**

1. **开关回退（优先）**：环境变量 `RESPONSE_GZIP=0` → 部署/重启实例。  
2. **代码回退**：WebIDE 粘贴前先另存当前 `app.py`；或恢复 `git show d1e6c2b:alicloud-fc-smoke-a/app.py`。  
3. **配置勿动**：保留现有 `OTS_ENDPOINT` / `OTSENDPOINT`（VPC）、实例名、表名、函数角色 STS。

---

## 2. WebIDE 最少手动步骤（首次必须关压缩）

> 代码默认 `RESPONSE_GZIP` 未设时视为开启。**首次部署必须显式设 `RESPONSE_GZIP=0`**，先证明开关生效与行为不变，再开 `1`。

### 2.1 打开位置

1. 登录 [阿里云函数计算控制台](https://fcnext.console.aliyun.com/)（地域 **华东1 杭州**）。  
2. 找到函数（历史名：**exec-smoke-a** / Function URL 对应 `exec-smoke-a-*.fcapp.run`）。  
3. 进入 **函数详情 → 代码（WebIDE）** 与 **配置 → 环境变量**。

### 2.2 备份当前线上代码

1. WebIDE 中全选当前 `app.py` → 复制到本地文件，命名如 `app.PROD-BACKUP-20261017.py`。  
2. （可选）控制台「版本/别名」若已用版本发布，记下当前版本号。

### 2.3 环境变量（配置页）

| 键 | 首次部署值 | 说明 |
|----|------------|------|
| **`RESPONSE_GZIP`** | **`0`** | 强制关闭压缩 |
| `OTS_ENDPOINT` | **保持现有 VPC URL** | 勿改 |
| `OTSENDPOINT` | 保持 | 兼容旧键 |

可选暂不设：`RESPONSE_GZIP_MIN_BYTES`（默认 1024）、`RESPONSE_GZIP_LEVEL`（默认 1）、`RESPONSE_GZIP_DEBUG`（默认关）。

### 2.4 环境变量改完要不要重新部署？

| 动作 | 是否需要 |
|------|----------|
| **仅改环境变量** | **需要「部署/发布」或重启实例** 后新进程才读到（本函数在 **import 时**读 `RESPONSE_GZIP`，热改 env 不保证立刻生效） |
| **改代码 `app.py`** | 必须 **部署** |
| 建议 | 改 env + 贴代码后点一次 **部署**，再冷触发 `/health` |

### 2.5 粘贴目标文件

1. 打开仓库（PR #328 分支）文件：  
   **`alicloud-fc-smoke-a/app.py`**  
2. WebIDE **整文件替换**（不要只贴片段）。  
3. **不要**上传 `vendor/`（线上应已有）；本变量不依赖新第三方包（标准库 `gzip`）。  
4. 点 **部署 Deploy**。  
5. 等待实例就绪后执行阶段 A。

---

## 3. 阶段 A — `RESPONSE_GZIP=0`（必须先过）

本机：

```bash
EXPECT_MODE=off bash alicloud-fc-smoke-a/_verify_prod_gzip.sh
```

**通过标准**

- `/health` 出现 `responseGzip.enabled === false`  
- AMB 带 `Accept-Encoding: gzip` 时：**无** `Content-Encoding: gzip`  
- 正文仍为 JSON；与 `identity` 正文一致  
- sha256 尽量对比基线（房间数据若已变，以「双 Accept-Encoding 正文一致」为准）

失败 → 检查 env 是否真为 `0`、是否已部署/重启；**不要**进入阶段 B。

---

## 4. 阶段 B — `RESPONSE_GZIP=1`

1. 控制台将 **`RESPONSE_GZIP=1`** → **部署/重启**。  
2. 本机：

```bash
EXPECT_MODE=on bash alicloud-fc-smoke-a/_verify_prod_gzip.sh
```

**通过标准**

- `responseGzip.enabled === true`  
- AMB + `Accept-Encoding: gzip` → `Content-Encoding: gzip`，wire << plain  
- 解压后 JSON **等于** identity 响应  
- **无**双层 gzip  
- 记录脚本打印的 `wire_gz` / `wire_id` / `ratio_pct` / `t_gz_s` / `t_id_s`

异常（卡顿、延迟、数据不对）→ **立刻 `RESPONSE_GZIP=0` 并部署/重启**；若仍异常 → WebIDE 恢复备份 `app.py`。

---

## 5. 双端人工验收（短步骤）

**状态在全部完成前保持「待验证」**；不得宣称已保证流畅或已实现账单降幅。

### 电脑

1. 打开正式站 PWA，确认角标可同步。  
2. 同步进行中：快速切换 Forge 分区、改数字、展开折叠。  
3. Done List：新增 / 打卡 / 撤销 / 删除各 1 次。  
4. 子任务：新增、编辑、完成、删除各 1 次。  
5. 感受：有无明显新增卡顿、同步是否明显变慢。

### 手机

1. 同上路径各做一遍（触控）。  
2. 与电脑对开：一侧打卡，另一侧约 5–10s 内应看到；删除后对端不复活。  
3. 旧设备：关掉很久的一页重新打开 / 硬刷新，确认不丢、不整包旧数据覆盖。

任一步失败 → `RESPONSE_GZIP=0`（或恢复备份代码）。

---

## 6. 本轮 Agent 结论

| 项 | 结论 |
|----|------|
| PR 范围 | 干净（仅 gzip + 文档） |
| 线上基线 | 已记录 |
| 直接部署 | **未能执行** |
| 生产 gzip | **未开启** |
| 总状态 | **待验证** |
| 账单降幅 | **未验证、不宣称** |
