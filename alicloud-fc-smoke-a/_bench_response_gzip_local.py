# -*- coding: utf-8 -*-
"""
本地 Flask 压测：gzip vs 原文的线缆字节、压缩 CPU、客户端解压+JSON.parse。
不部署阿里云；用合成 / 可选拉取的大 JSON。
Run: python3 _bench_response_gzip_local.py
"""
from __future__ import print_function

import gzip
import json
import os
import sys
import threading
import time
import types
from http.client import HTTPConnection


def _install_tablestore_stub():
    if "tablestore" in sys.modules:
        return
    mod = types.ModuleType("tablestore")

    class OTSClient(object):
        def __init__(self, *a, **k):
            pass

    class Row(object):
        def __init__(self, *a, **k):
            pass

    class Condition(object):
        def __init__(self, *a, **k):
            pass

    class OTSServiceError(Exception):
        pass

    mod.OTSClient = OTSClient
    mod.Row = Row
    mod.Condition = Condition
    mod.OTSServiceError = OTSServiceError
    sys.modules["tablestore"] = mod


def _build_payload(approx_bytes=2_200_000):
    # 类似 AMB tombstone 字典形态（高重复数字值 → 接近线上可压比）
    n = 50000
    tombs = {}
    i = 0
    while True:
        tombs["k%08d" % i] = i % 1000
        i += 1
        if i >= n and i % 1000 == 0:
            raw = json.dumps({"ok": True, "data": {"attrs": {"payload": json.dumps({"tombstones": tombs})}}}, ensure_ascii=False)
            if len(raw.encode("utf-8")) >= approx_bytes or i > 200000:
                return json.loads(raw)


def main():
    _install_tablestore_stub()
    os.environ["RESPONSE_GZIP"] = "1"
    os.environ["RESPONSE_GZIP_MIN_BYTES"] = "1024"
    os.environ["RESPONSE_GZIP_LEVEL"] = "1"
    os.environ["RESPONSE_GZIP_DEBUG"] = "1"
    os.environ.setdefault("OTS_ENDPOINT", "https://execsmokea.cn-hangzhou.vpc.tablestore.aliyuncs.com")
    os.environ.setdefault("ALIBABA_CLOUD_ACCESS_KEY_ID", "t")
    os.environ.setdefault("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "t")
    os.environ.setdefault("ALIBABA_CLOUD_SECURITY_TOKEN", "t")

    for name in list(sys.modules.keys()):
        if name == "app" or name.startswith("app."):
            del sys.modules[name]
    import app as app_mod

    payload = _build_payload()
    raw_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    print("fixture_raw_bytes", len(raw_bytes))

    @app_mod.app.route("/_bench/payload")
    def _payload():
        return app_mod.jsonify(payload)

    # compress CPU only
    t0 = time.perf_counter()
    gz = gzip.compress(raw_bytes, compresslevel=1)
    cpu_ms = (time.perf_counter() - t0) * 1000
    print("gzip_level1_cpu_ms", round(cpu_ms, 2), "wire", len(gz), "ratio_pct", round(100.0 * len(gz) / len(raw_bytes), 1))

    port = 8765
    server = threading.Thread(
        target=lambda: app_mod.app.run(host="127.0.0.1", port=port, threaded=True, use_reloader=False),
        daemon=True,
    )
    server.start()
    time.sleep(0.6)

    def fetch(accept_encoding):
        conn = HTTPConnection("127.0.0.1", port, timeout=60)
        t1 = time.perf_counter()
        conn.request("GET", "/_bench/payload", headers={"Accept-Encoding": accept_encoding, "Accept": "application/json"})
        resp = conn.getresponse()
        headers = {k.lower(): v for k, v in resp.getheaders()}
        body = resp.read()
        e2e_ms = (time.perf_counter() - t1) * 1000
        conn.close()
        enc = headers.get("content-encoding", "")
        if enc == "gzip":
            t2 = time.perf_counter()
            plain = gzip.decompress(body)
            dec_ms = (time.perf_counter() - t2) * 1000
        else:
            plain = body
            dec_ms = 0.0
        t3 = time.perf_counter()
        obj = json.loads(plain.decode("utf-8"))
        parse_ms = (time.perf_counter() - t3) * 1000
        return {
            "accept": accept_encoding,
            "status": resp.status,
            "contentEncoding": enc or None,
            "wireBytes": len(body),
            "plainBytes": len(plain),
            "e2eMs": round(e2e_ms, 2),
            "decompressMs": round(dec_ms, 2),
            "parseMs": round(parse_ms, 2),
            "jsonOk": isinstance(obj, dict) and obj.get("ok") is True,
        }

    gzip_res = fetch("gzip")
    identity_res = fetch("identity")
    print("result_gzip", json.dumps(gzip_res, ensure_ascii=False))
    print("result_identity", json.dumps(identity_res, ensure_ascii=False))

    assert gzip_res["jsonOk"] and identity_res["jsonOk"]
    assert gzip_res["contentEncoding"] == "gzip"
    assert not identity_res["contentEncoding"]
    assert gzip_res["plainBytes"] == identity_res["plainBytes"]
    assert gzip_res["wireBytes"] < identity_res["wireBytes"]

    saved = identity_res["wireBytes"] - gzip_res["wireBytes"]
    print(
        "SUMMARY saved_wire_bytes=%s saved_pct=%.1f e2e_delta_ms=%.1f (gzip-identity) parse_delta_ms=%.1f"
        % (
            saved,
            100.0 * saved / identity_res["wireBytes"],
            gzip_res["e2eMs"] - identity_res["e2eMs"],
            gzip_res["parseMs"] - identity_res["parseMs"],
        )
    )
    print("ok: local gzip bench passed")


if __name__ == "__main__":
    main()
