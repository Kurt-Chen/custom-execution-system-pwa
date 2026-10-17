# 线上 FC 基线快照（gzip 部署前）

- 捕获：`BASELINE.json` / `health.json` / AMB 响应头  
- **未**纳入 2MB 响应正文（仅 sha256 + 字节数）  
- 用途：阶段 A（`RESPONSE_GZIP=0`）对照；代码回退参考 `d1e6c2b:alicloud-fc-smoke-a/app.py`
