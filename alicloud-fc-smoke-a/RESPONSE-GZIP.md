# FC 响应 gzip（唯一变量）

> **目标**：在**不改前端同步协议 / merge / tombstone / poll** 的前提下，缩小 Function URL → 浏览器的 **CDT 计费字节**。  
> **代码提交 ≠ 线上生效**：必须在阿里云函数计算 **WebIDE / 控制台重新部署** `app.py` 后才生效。

---

## 1. 链路与计费（先读）

```text
浏览器 fetch(Accept-Encoding: gzip)
  → FC Function URL（*.fcapp.run，Custom Runtime + Flask）
      → after_request：可选 gzip 压缩 JSON 响应体
  ← Content-Encoding: gzip（线缆字节 ↓）  ← CDT「函数请求响应流量」按此计费
  → 浏览器自动解压 → 业务 JSON 不变
FC → OTS（VPC）与本变量无关
```

| 项 | 结论 |
|----|------|
| 部署形态 | FC **Web / Custom Runtime**（`FC_CUSTOM_LISTEN_PORT` + Flask） |
| 网关 | Function URL；**当前线上不自动 gzip**（2026-10-17 实测无 `Content-Encoding`） |
| 压缩位置 | **函数内** `after_request`（本目录 `app.py`） |
| 客户端 | 现代浏览器 / `fetch` **默认**带 `Accept-Encoding: gzip` 且**自动解压**；前端 `index.html` **无需改** |
| 计费 | CDT 按 **实际上行响应字节**；压缩后 `Content-Length` 变小才可能省费 |
| 离线 gzip ≠ 账单 | 本地压缩比只作上界；以部署后 `curl` 线缆字节与账单为准 |

---

## 2. 开关与阈值

| 环境变量 | 默认 | 含义 |
|----------|------|------|
| **`RESPONSE_GZIP`** | `1`（开启） | `0` / `false` / `off` → **立即关闭压缩**（回退路径） |
| `RESPONSE_GZIP_MIN_BYTES` | `1024` | 小于此值的响应原样（meta/health 不压） |
| `RESPONSE_GZIP_LEVEL` | `1` | zlib level；1=优先延迟，6=更高压缩比 |
| `RESPONSE_GZIP_DEBUG` | `0` | `1` 时加 `X-Response-Gzip*` 头 |

`/health` 增加只读字段 `responseGzip: { enabled, minBytes, level, ... }`，**不改**业务文档 JSON。

---

## 3. 部署步骤（线上生效）

1. 打开函数计算控制台 → 函数 `exec-smoke-a`（或当前 WebIDE 工程）→ **在线编辑 / 上传** 本仓库 `alicloud-fc-smoke-a/app.py`。  
2. （可选）确认环境变量：`RESPONSE_GZIP=1`；保留现有 `OTS_ENDPOINT`（VPC）不动。  
3. **部署 / 发布** 并等待实例刷新（冷启动一次即可）。  
4. 验证（压缩开启）：

```bash
# health 应含 responseGzip.enabled=true
curl -sS "https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run/health" | python3 -m json.tool | head

# 大包应有 Content-Encoding: gzip，且 Content-Length << 原文
curl -sS -D - -o /tmp/amb.gz -H "Accept-Encoding: gzip" \
  "https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run/smoke/aliyun-amb-real-v1-default-room" \
  | grep -iE 'HTTP/|Content-Encoding|Content-Length|Vary'
python3 -c "import gzip; d=gzip.decompress(open('/tmp/amb.gz','rb').read()); import json; json.loads(d); print('ok bytes', len(d))"

# 不支持 gzip 仍应为原文 JSON
curl -sS -H "Accept-Encoding: identity" \
  "https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run/smoke/aliyun-rule100-real-v1-default-room" | head -c 80
```

5. 前端：手机 + 电脑各开一页，快速操作 Forge / 子任务 / Done；确认同步延迟与流畅度无退化。  
6. 对比部署前后：同一 `GET` 的 `Content-Length`、控制台 CDT 日用量。

---

## 4. 回退（立刻关压缩）

**不必回滚代码**，优先：

1. 控制台将环境变量 **`RESPONSE_GZIP=0`** → 保存 → 重新部署/重启实例。  
2. `/health` 中 `responseGzip.enabled` 应为 `false`。  
3. 大包 `Accept-Encoding: gzip` 亦无 `Content-Encoding: gzip`。

若需代码回退：恢复部署 gzip 之前的 `app.py`。

---

## 5. 本地验证（不部署）

```bash
cd alicloud-fc-smoke-a
python3 _test_endpoint_classify.py
python3 _test_response_gzip.py
python3 _bench_response_gzip_local.py
```

---

## 6. 明确未做

- 未改 `index.html` 同步逻辑、版本号、merge、tombstone、retry、heal、poll、保存时机  
- 未裁剪 AMB tombstones  
- 未改 OTS Endpoint / VPC  
- **未**在本 Agent 环境直接部署阿里云 FC（无控制台写权限）
