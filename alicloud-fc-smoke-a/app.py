# -*- coding: utf-8 -*-
"""阿里云 A：FC Web(Python3.10) → Tablestore 隔离 CRUD。仅用函数角色 STS，无长期 AK。

Endpoint 配置（优先 OTS_ENDPOINT，兼容旧键 OTSENDPOINT）：
- 公网回退值（仅人工回退用，失败时绝不静默自动切回）：见 OTS_ENDPOINT_PUBLIC_ROLLBACK
- 经典网内网候选：OTS_ENDPOINT_INTERNAL_CANDIDATE
- VPC 候选：OTS_ENDPOINT_VPC_CANDIDATE
"""
from __future__ import print_function

import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone

_VENDOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vendor")
if _VENDOR not in sys.path:
    sys.path.insert(0, _VENDOR)
# WebIDE 部署后需显式加入 flatbuffer，否则 import dataprotocol 失败
_FLATBUFFER = os.path.join(_VENDOR, "tablestore", "flatbuffer")
if _FLATBUFFER not in sys.path:
    sys.path.insert(0, _FLATBUFFER)

from flask import Flask, request, jsonify
from tablestore import OTSClient, Row, Condition, OTSServiceError

app = Flask(__name__)

OTS_INSTANCE = os.environ.get("OTSINSTANCE", "execsmokea")
OTS_TABLE = os.environ.get("OTSTABLE", "aliyun_exec_smoke_a")

# 人工快速回退公网时使用；业务失败路径禁止自动切回此值
OTS_ENDPOINT_PUBLIC_ROLLBACK = "https://execsmokea.cn-hangzhou.ots.aliyuncs.com"
# 同地域已解析确认的候选（实例 execsmokea / cn-hangzhou）
OTS_ENDPOINT_INTERNAL_CANDIDATE = "https://execsmokea.cn-hangzhou.ots-internal.aliyuncs.com"
OTS_ENDPOINT_VPC_CANDIDATE = "https://execsmokea.cn-hangzhou.vpc.tablestore.aliyuncs.com"


def _read_configured_ots_endpoint():
    """优先 OTS_ENDPOINT；兼容历史 OTSENDPOINT；都未设时用公网默认（未切换前兼容）。"""
    raw = os.environ.get("OTS_ENDPOINT")
    if raw is None or not str(raw).strip():
        raw = os.environ.get("OTSENDPOINT")
    if raw is None or not str(raw).strip():
        return OTS_ENDPOINT_PUBLIC_ROLLBACK
    return str(raw).strip().rstrip("/")


def classify_ots_endpoint_type(endpoint):
    """返回 public | internal | vpc | unknown（供日志与 /health，不只打印 URL）。"""
    ep = str(endpoint or "").lower()
    if ".vpc.tablestore.aliyuncs.com" in ep:
        return "vpc"
    if "ots-internal.aliyuncs.com" in ep:
        return "internal"
    if ".ots.aliyuncs.com" in ep or ".tablestore.aliyuncs.com" in ep:
        return "public"
    return "unknown"


OTS_ENDPOINT = _read_configured_ots_endpoint()
OTS_ENDPOINT_TYPE = classify_ots_endpoint_type(OTS_ENDPOINT)

_client = None


def _log_endpoint_boot():
    try:
        print(
            "[ots-endpoint] type=%s endpoint=%s instance=%s table=%s "
            "(no silent public fallback on failure)"
            % (OTS_ENDPOINT_TYPE, OTS_ENDPOINT, OTS_INSTANCE, OTS_TABLE)
        )
    except Exception:
        pass


_log_endpoint_boot()


def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _cred_snapshot():
    ak = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_ID") or os.environ.get("ACCESS_KEY_ID")
    sk = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_SECRET") or os.environ.get("ACCESS_KEY_SECRET")
    token = os.environ.get("ALIBABA_CLOUD_SECURITY_TOKEN") or os.environ.get("SECURITY_TOKEN")
    return {
        "hasAccessKeyId": bool(ak),
        "hasAccessKeySecret": bool(sk),
        "hasSecurityToken": bool(token),
        "stsMode": bool(ak and sk and token),
    }


def _read_sts_creds():
    ak = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_ID") or os.environ.get("ACCESS_KEY_ID")
    sk = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_SECRET") or os.environ.get("ACCESS_KEY_SECRET")
    token = os.environ.get("ALIBABA_CLOUD_SECURITY_TOKEN") or os.environ.get("SECURITY_TOKEN")
    if not ak or not sk:
        raise RuntimeError("missing STS AK env from function role")
    if not token:
        raise RuntimeError("missing SECURITY_TOKEN — role STS required; no long-term AccessKey")
    return ak, sk, token


def _make_ots_client(endpoint):
    ak, sk, token = _read_sts_creds()
    return OTSClient(
        endpoint,
        ak,
        sk,
        OTS_INSTANCE,
        sts_token=token,
        socket_timeout=20,
        max_connection=4,
    )


def get_ots_client():
    """使用配置的唯一 Endpoint；连接/读写失败时不静默改用公网。"""
    global _client
    if _client is not None:
        return _client
    _client = _make_ots_client(OTS_ENDPOINT)
    try:
        print(
            "[ots-endpoint] client_init ok type=%s endpoint=%s"
            % (OTS_ENDPOINT_TYPE, OTS_ENDPOINT)
        )
    except Exception:
        pass
    return _client


def _endpoint_info_dict():
    return {
        "otsEndpoint": OTS_ENDPOINT,
        "otsEndpointType": OTS_ENDPOINT_TYPE,
        "otsInstance": OTS_INSTANCE,
        "otsTable": OTS_TABLE,
        "publicRollbackEndpoint": OTS_ENDPOINT_PUBLIC_ROLLBACK,
        "internalCandidateEndpoint": OTS_ENDPOINT_INTERNAL_CANDIDATE,
        "vpcCandidateEndpoint": OTS_ENDPOINT_VPC_CANDIDATE,
        "envKeys": {
            "OTS_ENDPOINT": bool(str(os.environ.get("OTS_ENDPOINT") or "").strip()),
            "OTSENDPOINT": bool(str(os.environ.get("OTSENDPOINT") or "").strip()),
        },
        "silentPublicFallback": False,
    }


def _row_to_dict(row):
    if row is None:
        return None
    out = {"id": None, "attrs": {}}
    for k, v in row.primary_key or []:
        if k == "id":
            out["id"] = v
        else:
            out["attrs"][k] = v
    for item in row.attribute_columns or []:
        out["attrs"][item[0]] = item[1]
    return out


def _error_response(err, status=500):
    body = {
        "ok": False,
        "errorType": type(err).__name__,
        "error": str(err),
        "otsEndpointType": OTS_ENDPOINT_TYPE,
        "otsEndpoint": OTS_ENDPOINT,
    }
    if isinstance(err, OTSServiceError):
        body["httpStatus"] = getattr(err, "http_status", None)
        body["errorCode"] = getattr(err, "code", None)
        body["requestId"] = getattr(err, "request_id", None)
    return jsonify(body), status


@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    return resp


@app.route("/", methods=["GET"])
def root():
    body = {
        "service": "exec-smoke-a",
        "phase": "A",
        "credentials": _cred_snapshot(),
    }
    body.update(_endpoint_info_dict())
    return jsonify(body)


@app.route("/health", methods=["GET"])
def health():
    body = {
        "ok": True,
        "credentials": _cred_snapshot(),
    }
    body.update(_endpoint_info_dict())
    return jsonify(body)


@app.route("/admin/ots-endpoint-probe", methods=["GET", "POST", "OPTIONS"])
def ots_endpoint_probe():
    """
    在不切换当前业务 Endpoint 的前提下，从 FC 内探测候选内网/VPC 是否可达。
    query/body: target=internal|vpc|public|<full-url>
    成功标准：能完成一次 get_row（404/not_found 也算网络与签名成功）。
    """
    if request.method == "OPTIONS":
        return ("", 204)
    target = ""
    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        target = str(body.get("target") or "").strip()
    if not target:
        target = str(request.args.get("target") or "internal").strip()

    if target == "internal":
        probe_ep = OTS_ENDPOINT_INTERNAL_CANDIDATE
    elif target == "vpc":
        probe_ep = OTS_ENDPOINT_VPC_CANDIDATE
    elif target == "public":
        probe_ep = OTS_ENDPOINT_PUBLIC_ROLLBACK
    elif target.startswith("https://"):
        probe_ep = target.rstrip("/")
    else:
        return jsonify({
            "ok": False,
            "error": "bad target; use internal|vpc|public|https://...",
            "activeEndpointType": OTS_ENDPOINT_TYPE,
        }), 400

    probe_type = classify_ots_endpoint_type(probe_ep)
    doc_id = "aliyun-meta-v1-domains-default-room"
    report = {
        "ok": False,
        "probeTarget": target,
        "probeEndpoint": probe_ep,
        "probeEndpointType": probe_type,
        "activeEndpoint": OTS_ENDPOINT,
        "activeEndpointType": OTS_ENDPOINT_TYPE,
        "docId": doc_id,
        "note": "probe does not change active OTS client; no silent fallback",
    }
    t0 = time.time()
    try:
        print(
            "[ots-endpoint] probe_start type=%s endpoint=%s"
            % (probe_type, probe_ep)
        )
        client = _make_ots_client(probe_ep)
        _, row, _ = client.get_row(OTS_TABLE, [("id", doc_id)], None, None, 1)
        data = _row_to_dict(row)
        report["ok"] = True
        report["rowFound"] = bool(data and data.get("id") is not None)
        report["ms"] = int((time.time() - t0) * 1000)
        print(
            "[ots-endpoint] probe_ok type=%s ms=%s rowFound=%s"
            % (probe_type, report["ms"], report["rowFound"])
        )
        return jsonify(report), 200
    except Exception as e:
        report["ms"] = int((time.time() - t0) * 1000)
        report["errorType"] = type(e).__name__
        report["error"] = str(e)
        if isinstance(e, OTSServiceError):
            report["httpStatus"] = getattr(e, "http_status", None)
            report["errorCode"] = getattr(e, "code", None)
            report["requestId"] = getattr(e, "request_id", None)
            # 鉴权/权限类错误也说明网络已通到 OTS
            if getattr(e, "http_status", None) in (403, 404) or getattr(e, "code", None):
                report["networkReachableLikely"] = True
        print(
            "[ots-endpoint] probe_fail type=%s err=%s"
            % (probe_type, report.get("error"))
        )
        return jsonify(report), 500


@app.route("/smoke", methods=["OPTIONS"])
@app.route("/smoke/<path:_any>", methods=["OPTIONS"])
def smoke_options(_any=None):
    return ("", 204)


@app.route("/smoke/_selftest", methods=["GET", "POST"])
def smoke_selftest():
    doc_id = "aliyun-smoke-a-" + uuid.uuid4().hex[:12]
    report = {
        "ok": False,
        "docId": doc_id,
        "endpoint": OTS_ENDPOINT,
        "otsEndpointType": OTS_ENDPOINT_TYPE,
        "instance": OTS_INSTANCE,
        "table": OTS_TABLE,
        "credentials": _cred_snapshot(),
        "steps": [],
        "longTermAccessKeyUsed": False,
    }
    t_all = time.time()

    def step(name, fn):
        t0 = time.time()
        entry = {"name": name, "ok": False, "ms": 0}
        try:
            entry["result"] = fn()
            entry["ok"] = True
        except Exception as e:
            entry["errorType"] = type(e).__name__
            entry["error"] = str(e)
            if isinstance(e, OTSServiceError):
                entry["errorCode"] = getattr(e, "code", None)
                entry["httpStatus"] = getattr(e, "http_status", None)
        entry["ms"] = int((time.time() - t0) * 1000)
        report["steps"].append(entry)
        return entry["ok"]

    try:
        client = get_ots_client()
    except Exception as e:
        report["steps"].append({
            "name": "init_client", "ok": False,
            "errorType": type(e).__name__, "error": str(e),
        })
        report["totalMs"] = int((time.time() - t_all) * 1000)
        return jsonify(report), 500

    def do_post():
        row = Row([("id", doc_id)], [
            ("payload", json.dumps({"hello": "aliyun-a", "n": 1}, ensure_ascii=False)),
            ("updated_at", _now_iso()),
            ("phase", "A"),
        ])
        client.put_row(OTS_TABLE, row, Condition("EXPECT_NOT_EXIST"))
        return {"id": doc_id}

    def do_get1():
        _, row, _ = client.get_row(OTS_TABLE, [("id", doc_id)], None, None, 1)
        data = _row_to_dict(row)
        if not data or data.get("id") != doc_id:
            raise RuntimeError("get after post: row missing")
        return data

    def do_patch():
        row = Row([("id", doc_id)], {
            "put": [
                ("payload", json.dumps({"hello": "aliyun-a", "n": 2, "patched": True}, ensure_ascii=False)),
                ("updated_at", _now_iso()),
            ]
        })
        client.update_row(OTS_TABLE, row, Condition("EXPECT_EXIST"))
        return {"id": doc_id, "n": 2}

    def do_get2():
        _, row, _ = client.get_row(OTS_TABLE, [("id", doc_id)], None, None, 1)
        data = _row_to_dict(row)
        payload = data["attrs"].get("payload") if data else None
        if not payload or "patched" not in str(payload):
            raise RuntimeError("get after patch: payload not updated")
        return data

    def do_delete():
        client.delete_row(OTS_TABLE, Row([("id", doc_id)]), Condition("IGNORE"))
        return {"deleted": doc_id}

    def do_get3():
        _, row, _ = client.get_row(OTS_TABLE, [("id", doc_id)], None, None, 1)
        if row is not None and getattr(row, "primary_key", None):
            raise RuntimeError("get after delete: row still exists")
        return {"exists": False}

    step("POST", do_post)
    step("GET", do_get1)
    step("PATCH", do_patch)
    step("GET2", do_get2)
    step("DELETE", do_delete)
    step("GET3_absent", do_get3)

    report["ok"] = all(s.get("ok") for s in report["steps"])
    report["totalMs"] = int((time.time() - t_all) * 1000)
    report["testRowDeleted"] = any(s.get("name") == "DELETE" and s.get("ok") for s in report["steps"])
    return jsonify(report), (200 if report["ok"] else 500)


@app.route("/smoke", methods=["POST"])
def smoke_create():
    try:
        body = request.get_json(silent=True) or {}
        doc_id = str(body.get("id") or ("aliyun-smoke-a-" + uuid.uuid4().hex[:12]))
        payload = body.get("payload", body)
        client = get_ots_client()
        client.put_row(
            OTS_TABLE,
            Row([("id", doc_id)], [
                ("payload", json.dumps(payload, ensure_ascii=False)),
                ("updated_at", _now_iso()),
                ("phase", "A"),
            ]),
            Condition("IGNORE"),
        )
        return jsonify({
            "ok": True,
            "id": doc_id,
            "otsEndpointType": OTS_ENDPOINT_TYPE,
        }), 201
    except Exception as e:
        return _error_response(e)


@app.route("/smoke/<doc_id>", methods=["GET"])
def smoke_get(doc_id):
    if doc_id == "_selftest":
        return smoke_selftest()
    try:
        client = get_ots_client()
        _, row, _ = client.get_row(OTS_TABLE, [("id", doc_id)], None, None, 1)
        data = _row_to_dict(row)
        if not data or data.get("id") is None:
            return jsonify({
                "ok": False,
                "error": "not_found",
                "id": doc_id,
                "otsEndpointType": OTS_ENDPOINT_TYPE,
            }), 404
        return jsonify({
            "ok": True,
            "data": data,
            "otsEndpointType": OTS_ENDPOINT_TYPE,
        })
    except Exception as e:
        return _error_response(e)


@app.route("/smoke/<doc_id>", methods=["PUT", "PATCH"])
def smoke_update(doc_id):
    try:
        body = request.get_json(silent=True) or {}
        payload = body.get("payload", body)
        client = get_ots_client()
        client.update_row(
            OTS_TABLE,
            Row([("id", doc_id)], {
                "put": [
                    ("payload", json.dumps(payload, ensure_ascii=False)),
                    ("updated_at", _now_iso()),
                ]
            }),
            Condition("EXPECT_EXIST"),
        )
        return jsonify({
            "ok": True,
            "id": doc_id,
            "otsEndpointType": OTS_ENDPOINT_TYPE,
        })
    except Exception as e:
        return _error_response(e)


@app.route("/smoke/<doc_id>", methods=["DELETE"])
def smoke_delete(doc_id):
    try:
        client = get_ots_client()
        client.delete_row(OTS_TABLE, Row([("id", doc_id)]), Condition("IGNORE"))
        return jsonify({
            "ok": True,
            "deleted": doc_id,
            "otsEndpointType": OTS_ENDPOINT_TYPE,
        })
    except Exception as e:
        return _error_response(e)


if __name__ == "__main__":
    port = int(os.environ.get("FC_CUSTOM_LISTEN_PORT") or os.environ.get("PORT") or "9000")
    app.run(host="0.0.0.0", port=port)
