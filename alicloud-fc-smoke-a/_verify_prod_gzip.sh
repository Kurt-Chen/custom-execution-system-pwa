#!/usr/bin/env bash
# 部署 FC 后在本机验证线上 gzip（代码提交不会自动跑此脚本）
# Usage: bash _verify_prod_gzip.sh
set -euo pipefail
BASE="${FC_BASE_URL:-https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run}"
ROOM="${FC_ROOM:-default-room}"
DOC="aliyun-amb-real-v1-${ROOM}"

echo "== health =="
health=$(curl -sS "$BASE/health")
echo "$health" | python3 -c "
import sys, json
d = json.load(sys.stdin)
g = d.get('responseGzip') or {}
print('otsEndpointType', d.get('otsEndpointType'))
print('responseGzip', g)
if 'enabled' not in g:
    print('STATUS: app.py with gzip NOT deployed yet (no responseGzip in /health)')
    sys.exit(2)
print('STATUS: gzip-capable build present; enabled=', g.get('enabled'))
"
health_rc=$?
if [[ "$health_rc" -eq 2 ]]; then
  echo "Baseline OK: production still uncompressed. Deploy alicloud-fc-smoke-a/app.py then re-run."
  exit 0
fi
if [[ "$health_rc" -ne 0 ]]; then
  exit "$health_rc"
fi

echo "== large GET with Accept-Encoding: gzip =="
hdr=$(mktemp)
body=$(mktemp)
curl -sS -D "$hdr" -o "$body" -H "Accept-Encoding: gzip" "$BASE/smoke/$DOC"
echo "--- response headers ---"
grep -iE 'HTTP/|Content-Encoding|Content-Length|Vary|X-Response-Gzip' "$hdr" || true
enc=$(grep -i '^Content-Encoding:' "$hdr" | awk '{print tolower($2)}' | tr -d '\r' || true)
cl=$(grep -i '^Content-Length:' "$hdr" | awk '{print $2}' | tr -d '\r' || true)
echo "Content-Encoding=${enc:-none} Content-Length=${cl:-?} file=$(wc -c <"$body")"

if [[ "${enc:-}" == "gzip" ]]; then
  python3 - "$body" <<'PY'
import gzip, json, sys
path = sys.argv[1]
raw = open(path, "rb").read()
assert raw[:2] == b"\x1f\x8b", "not gzip magic"
plain = gzip.decompress(raw)
obj = json.loads(plain)
assert obj.get("ok") is True
print(
    "ok: gzip decompress + json parse plain_bytes",
    len(plain),
    "wire",
    len(raw),
    "ratio_pct",
    round(100 * len(raw) / len(plain), 1),
)
PY
else
  echo "WARN: no Content-Encoding:gzip — 若刚部署请确认 RESPONSE_GZIP!=0 且实例已刷新"
  python3 -c "import json; json.load(open('$body')); print('body still valid json, bytes', $(wc -c <"$body"))"
fi

echo "== identity must stay plain JSON =="
idbody=$(mktemp)
curl -sS -o "$idbody" -H "Accept-Encoding: identity" "$BASE/smoke/aliyun-rule100-real-v1-${ROOM}"
python3 -c "import json; d=json.load(open('$idbody')); print('identity ok', d.get('ok'), 'keys', list(d)[:5])"

echo "== small health should stay uncompressed even with gzip accept =="
hh=$(mktemp); hb=$(mktemp)
curl -sS -D "$hh" -o "$hb" -H "Accept-Encoding: gzip" "$BASE/health"
grep -i '^Content-Encoding:' "$hh" && echo "NOTE: health unexpectedly gzipped (still ok if JSON parses)" || echo "health uncompressed (expected if < minBytes)"
python3 -c "import json; assert json.load(open('$hb')).get('ok') is True; print('health json ok')"

rm -f "$hdr" "$body" "$idbody" "$hh" "$hb"
echo "DONE: verify finished (compare Content-Length to pre-deploy ~2.2MB for AMB)"
