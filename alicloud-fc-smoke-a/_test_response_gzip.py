# -*- coding: utf-8 -*-
"""
FC 响应 gzip 单测（不连 OTS / 不改同步业务）。
Run: cd alicloud-fc-smoke-a && python3 _test_response_gzip.py

覆盖：
- Accept-Encoding: gzip → 大 JSON 压缩 + Content-Encoding/Vary/Length
- 小响应原样
- 无 gzip / identity → 未压缩回退
- 解压后 JSON 与原文一致
- 错误响应仍可读
- RESPONSE_GZIP=0 关闭
- 已有 Content-Encoding 不重复压缩
"""
from __future__ import print_function

import gzip
import json
import os
import sys
import types


def _install_tablestore_stub():
    """无 vendor 时仍可 import app.py。"""
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


def _load_app(env=None):
    _install_tablestore_stub()
    # 清掉旧模块以便按 env 重载开关
    for name in list(sys.modules.keys()):
        if name == "app" or name.startswith("app."):
            del sys.modules[name]
    os.environ.setdefault("OTS_ENDPOINT", "https://execsmokea.cn-hangzhou.vpc.tablestore.aliyuncs.com")
    # STS stubs so get_ots_client path never runs in these tests
    os.environ.setdefault("ALIBABA_CLOUD_ACCESS_KEY_ID", "test")
    os.environ.setdefault("ALIBABA_CLOUD_ACCESS_KEY_SECRET", "test")
    os.environ.setdefault("ALIBABA_CLOUD_SECURITY_TOKEN", "test")
    if env:
        for k, v in env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = str(v)
    import app as app_mod

    return app_mod


def _assert(cond, msg):
    if not cond:
        raise AssertionError(msg)


def test_gzip_large_json_roundtrip():
    app_mod = _load_app({"RESPONSE_GZIP": "1", "RESPONSE_GZIP_MIN_BYTES": "1024", "RESPONSE_GZIP_LEVEL": "1"})
    client = app_mod.app.test_client()

    payload = {"ok": True, "items": [{"id": "x%d" % i, "text": "hello" * 20} for i in range(200)]}
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    _assert(len(raw) >= 1024, "fixture must exceed min bytes")

    @app_mod.app.route("/_test/large-json")
    def _large():
        return app_mod.jsonify(payload)

    r = client.get("/_test/large-json", headers={"Accept-Encoding": "gzip"})
    _assert(r.status_code == 200, "status=%s" % r.status_code)
    _assert(r.headers.get("Content-Encoding") == "gzip", "missing Content-Encoding: %s" % dict(r.headers))
    _assert("Accept-Encoding" in (r.headers.get("Vary") or ""), "missing Vary")
    wire = r.get_data()  # Flask test client does NOT auto-gunzip by default for get_data
    # Werkzeug may auto-decompress depending on version — detect magic
    if wire[:2] == b"\x1f\x8b":
        decoded = gzip.decompress(wire)
        wire_len = len(wire)
    else:
        # some test clients decompress; still require Content-Encoding advertised
        decoded = wire
        wire_len = int(r.headers.get("Content-Length") or len(wire))
    got = json.loads(decoded.decode("utf-8"))
    _assert(got == payload, "decompressed JSON mismatch")
    _assert(wire_len < len(raw), "wire should be smaller than raw (%s vs %s)" % (wire_len, len(raw)))
    print("ok: large json gzip roundtrip wire=%s raw=%s ratio=%.1f%%" % (wire_len, len(raw), 100.0 * wire_len / len(raw)))


def test_small_response_passthrough():
    app_mod = _load_app({"RESPONSE_GZIP": "1", "RESPONSE_GZIP_MIN_BYTES": "1024"})
    client = app_mod.app.test_client()
    r = client.get("/health", headers={"Accept-Encoding": "gzip"})
    _assert(r.status_code == 200, "health status")
    body = r.get_data()
    # health ~600B < 1024 → no gzip
    _assert(r.headers.get("Content-Encoding") in (None, ""), "small should not gzip: %s" % r.headers.get("Content-Encoding"))
    data = json.loads(body.decode("utf-8"))
    _assert(data.get("ok") is True, "health ok")
    _assert(isinstance(data.get("responseGzip"), dict), "health exposes responseGzip")
    _assert(data["responseGzip"].get("enabled") is True, "enabled flag")
    print("ok: small health passthrough + responseGzip in /health")


def test_identity_accept_encoding_no_gzip():
    app_mod = _load_app({"RESPONSE_GZIP": "1", "RESPONSE_GZIP_MIN_BYTES": "100"})
    client = app_mod.app.test_client()
    payload = {"n": list(range(500))}

    @app_mod.app.route("/_test/mid-json")
    def _mid():
        return app_mod.jsonify(payload)

    r = client.get("/_test/mid-json", headers={"Accept-Encoding": "identity"})
    _assert(r.headers.get("Content-Encoding") in (None, ""), "identity must not gzip")
    got = json.loads(r.get_data().decode("utf-8"))
    _assert(got == payload, "identity body mismatch")
    print("ok: identity Accept-Encoding uncompressed fallback")


def test_gzip_disabled_env():
    app_mod = _load_app({"RESPONSE_GZIP": "0", "RESPONSE_GZIP_MIN_BYTES": "100"})
    client = app_mod.app.test_client()
    payload = {"n": list(range(500))}

    @app_mod.app.route("/_test/mid-json-off")
    def _mid_off():
        return app_mod.jsonify(payload)

    r = client.get("/_test/mid-json-off", headers={"Accept-Encoding": "gzip"})
    _assert(r.headers.get("Content-Encoding") in (None, ""), "RESPONSE_GZIP=0 must disable")
    h = client.get("/health")
    info = json.loads(h.get_data().decode("utf-8"))
    _assert(info["responseGzip"]["enabled"] is False, "health should show disabled")
    print("ok: RESPONSE_GZIP=0 disables compression")


def test_error_response_readable():
    app_mod = _load_app({"RESPONSE_GZIP": "1", "RESPONSE_GZIP_MIN_BYTES": "1024"})
    client = app_mod.app.test_client()

    @app_mod.app.route("/_test/err")
    def _err():
        return app_mod._error_response(RuntimeError("boom"), 500)

    r = client.get("/_test/err", headers={"Accept-Encoding": "gzip"})
    _assert(r.status_code == 500, "status 500")
    # small error body → likely uncompressed
    raw = r.get_data()
    if r.headers.get("Content-Encoding") == "gzip" and raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    data = json.loads(raw.decode("utf-8"))
    _assert(data.get("ok") is False, "error ok=false")
    _assert("boom" in str(data.get("error")), "error message present")
    print("ok: error response still readable")


def test_no_double_compression():
    app_mod = _load_app({"RESPONSE_GZIP": "1", "RESPONSE_GZIP_MIN_BYTES": "10"})
    from flask import Response

    inner = gzip.compress(b'{"ok":true,"pad":"' + (b"x" * 200) + b'"}', compresslevel=1)

    @app_mod.app.route("/_test/pre-gzipped")
    def _pre():
        resp = Response(inner, mimetype="application/json")
        resp.headers["Content-Encoding"] = "gzip"
        return resp

    client = app_mod.app.test_client()
    r = client.get("/_test/pre-gzipped", headers={"Accept-Encoding": "gzip"})
    wire = r.get_data()
    # should still be valid single gzip layer
    if wire[:2] == b"\x1f\x8b":
        once = gzip.decompress(wire)
        _assert(once[:1] == b"{", "should not be double-gzipped")
    print("ok: no double compression when Content-Encoding already set")


def test_compress_cpu_budget_on_amb_sized():
    """离线对照：level=1 对 ~2MB JSON 的 CPU 预算（非线上）。"""
    import time

    # synthetic ~2MB JSON-like
    blob = json.dumps({"tombstones": {("k%08d" % i): i for i in range(40000)}}, ensure_ascii=False).encode("utf-8")
    t0 = time.perf_counter()
    out = gzip.compress(blob, compresslevel=1)
    ms = (time.perf_counter() - t0) * 1000
    ratio = 100.0 * len(out) / len(blob)
    _assert(ms < 200, "level=1 compress too slow: %.1fms" % ms)
    _assert(len(out) < len(blob), "should shrink")
    print("ok: amb-sized compress cpu=%.1fms raw=%s wire=%s ratio=%.1f%%" % (ms, len(blob), len(out), ratio))


def main():
    test_gzip_large_json_roundtrip()
    test_small_response_passthrough()
    test_identity_accept_encoding_no_gzip()
    test_gzip_disabled_env()
    test_error_response_readable()
    test_no_double_compression()
    test_compress_cpu_budget_on_amb_sized()
    # contract: app.py still has switch docs
    src = open("app.py", "r", encoding="utf-8").read()
    _assert("RESPONSE_GZIP" in src, "missing RESPONSE_GZIP")
    _assert("_maybe_gzip_response" in src, "missing helper")
    _assert("Content-Encoding" in src, "missing Content-Encoding handling")
    print("ok: all response gzip tests passed")


if __name__ == "__main__":
    main()
