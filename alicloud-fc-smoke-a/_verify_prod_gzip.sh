#!/usr/bin/env bash
# 生产 gzip 验证（两阶段）。代码提交不会自动部署。
#
# Usage:
#   EXPECT_MODE=off bash _verify_prod_gzip.sh   # 首次部署且 RESPONSE_GZIP=0
#   EXPECT_MODE=on  bash _verify_prod_gzip.sh   # 确认关闭正常后再开 RESPONSE_GZIP=1
#   bash _verify_prod_gzip.sh                   # auto：有 responseGzip 则按 enabled 推断
#
set -euo pipefail
BASE="${FC_BASE_URL:-https://exec-smoke-a-gbhrcsrizq.cn-hangzhou.fcapp.run}"
ROOM="${FC_ROOM:-default-room}"
DOC="aliyun-amb-real-v1-${ROOM}"
EXPECT_MODE="${EXPECT_MODE:-auto}"   # off | on | auto
BASELINE_SHA="${BASELINE_AMB_SHA256:-fc3f3b888f825eca94279329e33c5b43e12bfd3ec1f5bc6d66d65f9775ec4b41}"
BASELINE_BYTES="${BASELINE_AMB_BYTES:-2235595}"

echo "BASE=$BASE EXPECT_MODE=$EXPECT_MODE"

health=$(curl -sS "$BASE/health")
meta_json=$(echo "$health" | python3 -c "
import sys, json
d = json.load(sys.stdin)
g = d.get('responseGzip') or {}
print(json.dumps({
  'otsEndpointType': d.get('otsEndpointType'),
  'hasGzipField': 'enabled' in g,
  'enabled': bool(g.get('enabled')) if 'enabled' in g else None,
  'minBytes': g.get('minBytes'),
  'level': g.get('level'),
}, ensure_ascii=False))
")
echo "== health meta =="
echo "$meta_json"

HAS_GZIP_FIELD=$(echo "$meta_json" | python3 -c "import sys,json; print('1' if json.load(sys.stdin)['hasGzipField'] else '0')")
GZIP_ENABLED=$(echo "$meta_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d.get('enabled') else '0')")

if [[ "$HAS_GZIP_FIELD" != "1" ]]; then
  echo "STATUS: 待验证 / 未部署 — /health 无 responseGzip（仍为旧 app.py）"
  if [[ "$EXPECT_MODE" == "off" || "$EXPECT_MODE" == "on" ]]; then
    echo "FAIL: EXPECT_MODE=$EXPECT_MODE 但新 app.py 尚未部署"
    exit 1
  fi
  exit 0
fi

mode="$EXPECT_MODE"
if [[ "$mode" == "auto" ]]; then
  if [[ "$GZIP_ENABLED" == "1" ]]; then mode=on; else mode=off; fi
  echo "AUTO → EXPECT_MODE=$mode"
fi

if [[ "$mode" == "off" && "$GZIP_ENABLED" != "0" ]]; then
  echo "FAIL: 期望 RESPONSE_GZIP=0（enabled=false），实际 enabled=true"
  echo "→ 控制台确认环境变量 RESPONSE_GZIP=0 后重新部署/重启实例"
  exit 1
fi
if [[ "$mode" == "on" && "$GZIP_ENABLED" != "1" ]]; then
  echo "FAIL: 期望 RESPONSE_GZIP=1（enabled=true），实际 enabled=false"
  exit 1
fi

hdr_gz=$(mktemp); body_gz=$(mktemp); timing_gz=$(mktemp)
hdr_id=$(mktemp); body_id=$(mktemp); timing_id=$(mktemp)

echo "== AMB GET Accept-Encoding: gzip =="
curl -sS -D "$hdr_gz" -o "$body_gz" -H "Accept-Encoding: gzip" \
  -w "%{time_total}" "$BASE/smoke/$DOC" >"$timing_gz"
grep -iE 'HTTP/|Content-Encoding|Content-Length|Vary|X-Response-Gzip' "$hdr_gz" || true
enc=$(grep -i '^Content-Encoding:' "$hdr_gz" | awk '{print tolower($2)}' | tr -d '\r' || true)
echo "enc=${enc:-none} wire=$(wc -c <"$body_gz" | tr -d ' ') time_s=$(cat "$timing_gz")"

echo "== AMB GET Accept-Encoding: identity =="
curl -sS -D "$hdr_id" -o "$body_id" -H "Accept-Encoding: identity" \
  -w "%{time_total}" "$BASE/smoke/$DOC" >"$timing_id"
enc_id=$(grep -i '^Content-Encoding:' "$hdr_id" | awk '{print tolower($2)}' | tr -d '\r' || true)
echo "enc=${enc_id:-none} wire=$(wc -c <"$body_id" | tr -d ' ') time_s=$(cat "$timing_id")"

python3 - "$mode" "$body_gz" "$body_id" "${enc:-}" "${enc_id:-}" "$BASELINE_SHA" "$BASELINE_BYTES" \
  "$(cat "$timing_gz")" "$(cat "$timing_id")" <<'PY'
import gzip, hashlib, json, sys

mode, path_gz, path_id, enc, enc_id, base_sha, base_bytes, t_gz, t_id = sys.argv[1:10]
raw_gz = open(path_gz, "rb").read()
raw_id = open(path_id, "rb").read()
base_bytes = int(base_bytes)
enc = (enc or "").strip().lower()
enc_id = (enc_id or "").strip().lower()

if mode == "off":
    assert enc in ("", "none"), "off mode must not Content-Encoding:gzip, got %r" % enc
    assert raw_gz[:2] != b"\x1f\x8b", "off mode body must not be gzip magic"
    assert raw_gz == raw_id, "gzip-accept vs identity body mismatch while off"
    obj = json.loads(raw_id)
    assert obj.get("ok") is True
    sha = hashlib.sha256(raw_id).hexdigest()
    print(
        "OFF_OK plain_bytes=%s sha256=%s baseline_sha_match=%s"
        % (len(raw_id), sha, sha == base_sha)
    )
    if len(raw_id) != base_bytes:
        print(
            "NOTE: plain size %s != baseline %s (room data may have changed)"
            % (len(raw_id), base_bytes)
        )
    print(
        "METRICS mode=off wire_gz=%s wire_id=%s t_gz_s=%s t_id_s=%s"
        % (len(raw_gz), len(raw_id), t_gz, t_id)
    )
else:
    assert enc == "gzip", "on mode expects Content-Encoding:gzip, got %r" % enc
    assert enc_id in ("", "none"), "identity must stay uncompressed, got %r" % enc_id
    assert raw_gz[:2] == b"\x1f\x8b", "on mode wire must be gzip magic"
    plain_gz = gzip.decompress(raw_gz)
    try:
        gzip.decompress(plain_gz)
        raise SystemExit("FAIL: double-gzip detected")
    except OSError:
        pass
    assert raw_id[:2] != b"\x1f\x8b", "identity body unexpectedly gzip"
    obj_gz = json.loads(plain_gz)
    obj_id = json.loads(raw_id)
    assert obj_gz == obj_id, "decompressed gzip body != identity body"
    assert obj_gz.get("ok") is True
    ratio = 100.0 * len(raw_gz) / max(1, len(plain_gz))
    print(
        "ON_OK plain_bytes=%s wire_gz=%s wire_id=%s ratio_pct=%.1f saved_pct=%.1f"
        % (len(plain_gz), len(raw_gz), len(raw_id), ratio, 100.0 - ratio)
    )
    print(
        "METRICS mode=on t_gz_s=%s t_id_s=%s delta_s=%.3f (gz-id)"
        % (t_gz, t_id, float(t_gz) - float(t_id))
    )
PY

echo "== small health with Accept-Encoding: gzip =="
hh=$(mktemp); hb=$(mktemp)
curl -sS -D "$hh" -o "$hb" -H "Accept-Encoding: gzip" "$BASE/health" >/dev/null
henc=$(grep -i '^Content-Encoding:' "$hh" | awk '{print tolower($2)}' | tr -d '\r' || true)
if [[ "${henc:-}" == "gzip" ]]; then
  echo "NOTE: health gzipped (unusual if < minBytes)"
  python3 -c "import gzip,json; assert json.loads(gzip.decompress(open('$hb','rb').read())).get('ok') is True"
else
  echo "health uncompressed (expected)"
  python3 -c "import json; assert json.load(open('$hb')).get('ok') is True"
fi

rm -f "$hdr_gz" "$body_gz" "$timing_gz" "$hdr_id" "$body_id" "$timing_id" "$hh" "$hb"
echo "DONE: EXPECT_MODE=$mode PASS — 状态仍为「待验证」直至双端人工验收"
