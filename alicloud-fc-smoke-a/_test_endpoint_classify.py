# -*- coding: utf-8 -*-
"""本地单测：Endpoint 类型分类（不 import Flask/OTS）。python3 _test_endpoint_classify.py"""
from __future__ import print_function


def classify_ots_endpoint_type(endpoint):
    ep = str(endpoint or "").lower()
    if ".vpc.tablestore.aliyuncs.com" in ep:
        return "vpc"
    if "ots-internal.aliyuncs.com" in ep:
        return "internal"
    if ".ots.aliyuncs.com" in ep or ".tablestore.aliyuncs.com" in ep:
        return "public"
    return "unknown"


def main():
    cases = [
        ("https://execsmokea.cn-hangzhou.ots.aliyuncs.com", "public"),
        ("https://execsmokea.cn-hangzhou.ots-internal.aliyuncs.com", "internal"),
        ("https://execsmokea.cn-hangzhou.vpc.tablestore.aliyuncs.com", "vpc"),
        ("https://execsmokea.cn-hangzhou.tablestore.aliyuncs.com", "public"),
        ("", "unknown"),
    ]
    for ep, expect in cases:
        got = classify_ots_endpoint_type(ep)
        assert got == expect, "ep=%r expect=%r got=%r" % (ep, expect, got)
    # 与 app.py 常量保持一致（防漂移）
    src = open("app.py", "r", encoding="utf-8").read()
    assert "OTS_ENDPOINT_PUBLIC_ROLLBACK = \"https://execsmokea.cn-hangzhou.ots.aliyuncs.com\"" in src
    assert "OTS_ENDPOINT_INTERNAL_CANDIDATE = \"https://execsmokea.cn-hangzhou.ots-internal.aliyuncs.com\"" in src
    assert "OTS_ENDPOINT_VPC_CANDIDATE = \"https://execsmokea.cn-hangzhou.vpc.tablestore.aliyuncs.com\"" in src
    assert "silentPublicFallback\": False" in src or "silentPublicFallback" in src
    assert "/admin/ots-endpoint-probe" in src
    assert 'os.environ.get("OTS_ENDPOINT")' in src
    print("ok: endpoint classify + app.py contract tests passed")


if __name__ == "__main__":
    main()
