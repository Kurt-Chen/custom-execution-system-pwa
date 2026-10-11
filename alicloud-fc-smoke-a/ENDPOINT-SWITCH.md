# FC → Tablestore Endpoint 切换（公网 → 内网/VPC）

> 目标：在**不改前端同步协议**的前提下，让 FC→OTS 不再走公网，消除 Tablestore 外网下行计费。  
> 成功标准：用户体验与同步行为基本不变；`/health` 的 `otsEndpointType` 为 `internal` 或 `vpc`。

## 已确认（不要猜）

| 项 | 结果 |
|----|------|
| 实例 | `execsmokea` / 表 `aliyun_exec_smoke_a` / 地域 **cn-hangzhou** |
| 当前线上 | `https://execsmokea.cn-hangzhou.ots.aliyuncs.com` → **public**（`/health` 实测） |
| 经典网内网 DNS | `https://execsmokea.cn-hangzhou.ots-internal.aliyuncs.com` → 解析到 `100.100.*`（**已确认存在**） |
| VPC DNS | `https://execsmokea.cn-hangzhou.vpc.tablestore.aliyuncs.com` → 解析到 `100.103.*`（**已确认存在**） |
| 浏览器三端 | **不**直连 OTS；只打 FC Function URL |
| SDK | 仅换 Endpoint；实例名 / region / STS 签名方式不变 |
| 静默回退 | **禁止**：读写失败不得自动改回公网 |

## 选哪个 Endpoint？（改动最小）

依据阿里云官方说明：

1. **FC 未绑 VPC（经典侧）** → 优先  
   `OTS_ENDPOINT=https://execsmokea.cn-hangzhou.ots-internal.aliyuncs.com`  
   → `otsEndpointType=internal`  
   **通常无需额外绑 VPC**（同地域经典网内网地址）。

2. **FC 已配置 VPC / vSwitch / 安全组** → 用  
   `OTS_ENDPOINT=https://execsmokea.cn-hangzhou.vpc.tablestore.aliyuncs.com`  
   → `otsEndpointType=vpc`  
   且 OTS 实例网络侧需允许该 VPC 访问（控制台「网络管理」）。

**上线前必须在 FC 内探测**（本仓库新增）：

```bash
# 探测经典网内网（不切换业务 Endpoint）
curl -sS "https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run/admin/ots-endpoint-probe?target=internal"

# 探测 VPC
curl -sS "https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run/admin/ots-endpoint-probe?target=vpc"
```

选 `ok:true` 的那个写入环境变量。两者都失败才考虑绑 VPC / 查安全组，**不要**盲切。

## 环境变量

| 键 | 作用 |
|----|------|
| **`OTS_ENDPOINT`** | **首选**业务 Endpoint |
| `OTSENDPOINT` | 兼容旧键（仅当 `OTS_ENDPOINT` 未设时读取） |
| （未设） | 默认公网回退值（兼容未切换部署） |

人工回退公网值（保留）：

```text
https://execsmokea.cn-hangzhou.ots.aliyuncs.com
```

## 推荐上线步骤（低风险）

1. **部署本目录新代码**（含 `/admin/ots-endpoint-probe` 与 `otsEndpointType` 日志），**暂不改** Endpoint 环境变量。  
2. 调 probe：`internal` / `vpc`，记下成功项。  
3. 在函数计算控制台为函数设置：  
   - `OTS_ENDPOINT=<成功的内网或 VPC URL>`  
   - （可选）同步写旧键 `OTSENDPOINT` 同值，避免旧进程读错  
4. **重启/等待实例冷启动**后检查：

```bash
curl -sS "https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run/health"
# 期望：otsEndpointType 为 "internal" 或 "vpc"（不是 "public"）
```

5. 最小闭环：  
   - `GET/POST /smoke/_selftest`  
   - Done / Habit / Forge 各读写一次  
   - 两设备同步增删改  
   - 确认 5s meta poll、无卡顿、无覆盖、无异常重试风暴  
6. 函数日志应出现：`[ots-endpoint] type=internal|vpc ...`

## 快速回退（公网）

控制台把环境变量改回：

```text
OTS_ENDPOINT=https://execsmokea.cn-hangzhou.ots.aliyuncs.com
```

（或删掉 `OTS_ENDPOINT` / `OTSENDPOINT`，代码默认即公网。）  
保存后触发新实例，再查 `/health` → `otsEndpointType=public`。

## 本轮明确不做

- 不改前端 sync / 5s poll / domains meta / merge / Lists RMW  
- 不自动失败回退公网  
- 不做无关 UI / 重构
