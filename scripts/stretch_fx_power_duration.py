#!/usr/bin/env python3
"""
将力量庆祝 WebP 的「有效内容时长」拉伸到 ≥2000ms。

- 不冻末帧凑时间：只拉长仍有可见像素的帧的 duration
- 去掉末尾全透明空帧（或保留 1 帧短透明收尾）
- loop=1，总时长对齐 2016ms（32×63 或等价）
- 警告素材不处理
"""

from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

FX_DIR = Path("/workspace/icons/fx")
TARGET_MS = 2016
MIN_CONTENT_MS = 2000
BACKUP = FX_DIR / "_backup_pre_duration_stretch_20261026"


def webpmux_info(path: Path) -> tuple[int, list[int]]:
    info = subprocess.check_output(["webpmux", "-info", str(path)], text=True)
    loop = 0
    m = re.search(r"Loop Count\s*:\s*(\d+)", info)
    if m:
        loop = int(m.group(1))
    rows = re.findall(
        r"^\s*(\d+):\s+(\d+)\s+(\d+)\s+\w+\s+(\d+)\s+(\d+)\s+(\d+)", info, re.M
    )
    durs = [int(r[5]) for r in rows]
    return loop, durs


def extract_frames(path: Path) -> list[Image.Image]:
    loop, durs = webpmux_info(path)
    frames: list[Image.Image] = []
    with tempfile.TemporaryDirectory(prefix="fxstretch_") as td:
        td = Path(td)
        for i in range(1, len(durs) + 1):
            w = td / f"f{i}.webp"
            p = td / f"f{i}.png"
            subprocess.check_call(
                ["webpmux", "-get", "frame", str(i), str(path), "-o", str(w)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            subprocess.check_call(
                ["dwebp", str(w), "-o", str(p)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            frames.append(Image.open(p).convert("RGBA").copy())
    return frames


def frame_mean_alpha(im: Image.Image) -> float:
    a = np.array(im.split()[-1], dtype=np.float32)
    return float(a.mean())


def frame_cover(im: Image.Image, thr: int = 16) -> float:
    a = np.array(im.split()[-1], dtype=np.uint8)
    return float((a > thr).mean())


def encode(frames: list[Image.Image], durs: list[int], out: Path, loop: int = 1) -> dict:
    assert len(frames) == len(durs)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="fxenc_") as td:
        td = Path(td)
        parts = []
        for i, (fr, dur) in enumerate(zip(frames, durs)):
            png = td / f"f{i:03d}.png"
            webp = td / f"f{i:03d}.webp"
            fr.save(png)
            subprocess.check_call(
                ["cwebp", "-q", "90", "-alpha_q", "100", "-m", "4", str(png), "-o", str(webp)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            parts.append((webp, max(10, int(dur))))
        cmd = ["webpmux"]
        for p, dur in parts:
            cmd += ["-frame", str(p), f"+{dur}+0+0+1"]
        cmd += ["-loop", str(loop), "-o", str(out)]
        subprocess.check_call(cmd)
    loop2, durs2 = webpmux_info(out)
    return {"file": out.name, "frames": len(durs2), "total_ms": sum(durs2), "loop": loop2}


def stretch_one(path: Path) -> dict:
    frames = extract_frames(path)
    loop, old_durs = webpmux_info(path)
    covers = [frame_cover(fr) for fr in frames]
    means = [frame_mean_alpha(fr) for fr in frames]
    max_cover = max(covers) if covers else 0.0
    # 有效内容：覆盖或平均 alpha 仍明显高于噪声
    thr_cover = max(0.006, max_cover * 0.10)
    thr_mean = max(0.35, max(means) * 0.08)
    last_vis = 0
    for i, (c, m) in enumerate(zip(covers, means)):
        if c >= thr_cover or m >= thr_mean:
            last_vis = i
    active = frames[: last_vis + 1]
    # 若末帧仍较亮，把原素材末尾透明帧（若有）一并纳入 2016ms 预算，不额外加长
    out_frames = list(active)
    if last_vis + 1 < len(frames):
        # 保留原透明收尾帧，参与总时长分配
        out_frames.append(frames[-1] if frame_cover(frames[-1]) < 0.002 else Image.new("RGBA", active[0].size, (0, 0, 0, 0)))
    elif frame_cover(active[-1]) > 0.02 or frame_mean_alpha(active[-1]) > 2.0:
        out_frames.append(Image.new("RGBA", active[0].size, (0, 0, 0, 0)))

    n = len(out_frames)
    body_n = min(len(active), n)
    # 整段（含透明收尾）总时长 = TARGET_MS；有效内容帧合计必须 ≥ MIN_CONTENT_MS
    old_body = old_durs[: len(active)]
    while len(old_body) < body_n:
        old_body.append(old_durs[-1] if old_durs else 63)
    old_sum = sum(old_body) or body_n
    # 透明尾帧最多占 48ms，其余全部给内容帧
    has_tail = n > body_n
    tail_ms = 32 if has_tail else 0
    body_target = TARGET_MS - tail_ms
    if body_target < MIN_CONTENT_MS:
        tail_ms = max(0, TARGET_MS - MIN_CONTENT_MS)
        body_target = TARGET_MS - tail_ms

    new_durs = []
    for d in old_body:
        new_durs.append(max(20, int(round(d * body_target / old_sum))))
    drift = body_target - sum(new_durs)
    if new_durs:
        new_durs[-1] = max(20, new_durs[-1] + drift)
    if has_tail:
        new_durs.append(tail_ms)

    content_ms = sum(new_durs[:body_n])
    BACKUP.mkdir(parents=True, exist_ok=True)
    (BACKUP / path.name).write_bytes(path.read_bytes())
    meta = encode(out_frames, new_durs, path, loop=1)
    meta.update(
        {
            "old_total": sum(old_durs),
            "old_loop": loop,
            "old_last_vis": last_vis,
            "old_content_est": sum(old_durs[: last_vis + 1]),
            "new_content_ms": content_ms,
            "thr_cover": round(thr_cover, 4),
            "max_cover": round(max_cover, 4),
            "ok": meta["total_ms"] >= MIN_CONTENT_MS and content_ms >= MIN_CONTENT_MS,
        }
    )
    return meta


def main() -> None:
    paths = sorted(FX_DIR.glob("fx-power-*.webp"))
    rows = []
    for p in paths:
        meta = stretch_one(p)
        rows.append(meta)
        flag = "OK" if meta["ok"] else "FAIL"
        print(
            f"{flag} {meta['file']}: {meta['old_total']}→{meta['total_ms']}ms "
            f"content {meta['old_content_est']}→{meta['new_content_ms']} "
            f"frames {meta['frames']} loop={meta['loop']}"
        )
    fail = [r for r in rows if not r["ok"]]
    if fail:
        raise SystemExit(f"{len(fail)} assets still under {MIN_CONTENT_MS}ms")


if __name__ == "__main__":
    main()
