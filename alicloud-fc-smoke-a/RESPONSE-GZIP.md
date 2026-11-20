# FC 响应 gzip（唯一变量）

> **目标**：缩小 Function URL → 浏览器的 CDT 计费字节；**不改**前端同步协议。  
> **代码提交 ≠ 线上生效**。  
> **上线状态：待验证** — 完整步骤见 `docs/aliyun-fc-gzip-deploy-checklist-20261017.md`。

---

## 首次部署硬性顺序

1. **备份** WebIDE 当前 `app.py`  
2. 环境变量 **显式** `RESPONSE_GZIP=0`（即使代码默认开，也必须先关）  
3. 整文件替换 `alicloud-fc-smoke-a/app.py` → **部署**  
4. `EXPECT_MODE=off bash _verify_prod_gzip.sh`  
5. 通过后再设 `RESPONSE_GZIP=1` → **部署/重启** → `EXPECT_MODE=on bash _verify_prod_gzip.sh`  
6. 手机+电脑人工验收（清单文档第 5 节）  
7. 异常 → `RESPONSE_GZIP=0`；无效则恢复备份代码

### 环境变量何时生效？

本函数在 **进程 import 时**读取 `RESPONSE_GZIP`。  
**仅改控制台环境变量不够**：必须 **部署或重启实例** 后新 worker 才生效。

---

## 开关

| 变量 | 默认 | 含义 |
|------|------|------|
| **`RESPONSE_GZIP`** | 未设视为开 | **`0`/`false`/`off` 关闭** |
| `RESPONSE_GZIP_MIN_BYTES` | `1024` | 小响应不压 |
| `RESPONSE_GZIP_LEVEL` | `1` | 延迟优先 |
| `RESPONSE_GZIP_DEBUG` | 关 | 诊断响应头 |

`/health.responseGzip`：`{ enabled, minBytes, level, ... }`

---

## 目标文件

- **部署**：`alicloud-fc-smoke-a/app.py`（唯一运行时改动）  
- **验证**：`alicloud-fc-smoke-a/_verify_prod_gzip.sh`  
- **基线**：`docs/fc-gzip-baseline-20261017/BASELINE.json`

---

## 本地（不部署）

```bash
cd alicloud-fc-smoke-a
python3 _test_endpoint_classify.py
python3 _test_response_gzip.py
python3 _bench_response_gzip_local.py
```

---

## 明确未做

- 未改 `index.html` / poll / merge / tombstone / retry / heal  
- 未裁 AMB tombstones  
- **未**在本环境直接部署 FC（无控制台凭证）
