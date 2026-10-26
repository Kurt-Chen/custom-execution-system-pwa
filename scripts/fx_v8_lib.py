#!/usr/bin/env python3
"""V8 FX 共用：抠黑、整幅 ANMF 编码、验收导出。"""

from __future__ import annotations

import math
import random
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIZE = 512


def key_black_to_alpha(im: Image.Image, thr: int = 42, soft: int = 24) -> Image.Image:
    rgba = im.convert("RGBA").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    a = np.array(rgba)
    rgb = a[:, :, :3].astype(np.float32)
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    mean, sat = rgb.mean(axis=2), mx - mn
    keep = np.maximum(mx - thr, 0) + sat * 0.7
    alpha = np.clip(keep * (255.0 / max(1, soft)), 0, 255).astype(np.uint8)
    alpha[(mean < 50) & (sat < 22)] = 0
    mid = (mean < 78) & (sat < 30) & (alpha > 0)
    alpha[mid] = (alpha[mid].astype(np.float32) * 0.28).astype(np.uint8)
    a[:, :, 3] = alpha
    mask = alpha < 10
    a[:, :, 0:3][mask] = 0
    return Image.fromarray(a, "RGBA")


def lerp_img(a: Image.Image, b: Image.Image, t: float) -> Image.Image:
    t = float(np.clip(t, 0, 1))
    aa, bb = np.array(a, np.float32), np.array(b, np.float32)
    return Image.fromarray(np.clip(aa * (1 - t) + bb * t, 0, 255).astype(np.uint8), "RGBA")


def radial_scale(im: Image.Image, scale: float, alpha_mul: float = 1.0) -> Image.Image:
    w, h = im.size
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    scaled = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(scaled, ((w - nw) // 2, (h - nh) // 2), scaled)
    if abs(alpha_mul - 1.0) > 1e-3:
        arr = np.array(canvas)
        arr[:, :, 3] = np.clip(arr[:, :, 3].astype(np.float32) * alpha_mul, 0, 255).astype(np.uint8)
        canvas = Image.fromarray(arr, "RGBA")
    return canvas


def ease_out_quart(t: float) -> float:
    u = 1 - t
    return 1 - u * u * u * u


def add_radial_particles(
    base: Image.Image,
    t: float,
    rng: random.Random,
    colors: list[tuple[int, int, int]],
    count: int = 56,
    speed: float = 210,
    trail: float = 0.14,
) -> Image.Image:
    """独立粒子：位移 + 拖尾 + 透明度消散（非整图缩放）。"""
    img = base.copy()
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx = cy = SIZE / 2
    for i in range(count):
        ang = (i / count) * math.tau + rng.uniform(-0.06, 0.06)
        expand = ease_out_quart(min(1.0, t / 0.62))
        fade = 1.0 if t < 0.5 else max(0.0, 1 - ((t - 0.5) / 0.5) ** 1.4)
        dist = speed * (0.55 + 0.45 * ((i % 5) / 4)) * expand
        x = cx + math.cos(ang) * dist
        y = cy + math.sin(ang) * dist + 22 * (t**1.6)
        a = int(255 * fade * (0.55 + 0.45 * (1 - t)))
        if a < 8:
            continue
        back = max(0.0, t - trail)
        be = ease_out_quart(min(1.0, back / 0.62))
        bx = cx + math.cos(ang) * (speed * (0.55 + 0.45 * ((i % 5) / 4)) * be)
        by = cy + math.sin(ang) * (speed * (0.55 + 0.45 * ((i % 5) / 4)) * be) + 22 * (back**1.6)
        col = colors[i % len(colors)]
        d.line([(bx, by), (x, y)], fill=(*col, int(a * 0.55)), width=max(1, 2 + (i % 2)))
        r = 1.6 + (i % 4) * 0.55
        d.ellipse([x - r, y - r, x + r, y + r], fill=(*col, a))
    return Image.alpha_composite(img, layer)


def encode_full_webp(frames: list[Image.Image], dur_ms: int, out_path: Path, loop: int = 1) -> dict:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="fxv8_") as td:
        td = Path(td)
        parts = []
        for i, fr in enumerate(frames):
            assert fr.size == (SIZE, SIZE)
            png, webp = td / f"f{i:03d}.png", td / f"f{i:03d}.webp"
            fr.save(png)
            subprocess.check_call(
                ["cwebp", "-q", "90", "-alpha_q", "100", "-m", "4", str(png), "-o", str(webp)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            parts.append(webp)
        cmd = ["webpmux"]
        for p in parts:
            cmd += ["-frame", str(p), f"+{dur_ms}+0+0+1"]
        cmd += ["-loop", str(loop), "-o", str(out_path)]
        subprocess.check_call(cmd)
    return inspect_webp(out_path)


def inspect_webp(path: Path) -> dict:
    info = subprocess.check_output(["webpmux", "-info", str(path)], text=True)
    rows = re.findall(
        r"^\s*(\d+):\s+(\d+)\s+(\d+)\s+\w+\s+(\d+)\s+(\d+)\s+(\d+)", info, re.M
    )
    total = sum(int(r[5]) for r in rows)
    full = sum(1 for r in rows if r[1] == "512" and r[2] == "512" and r[3] == "0" and r[4] == "0")
    loop = [l for l in info.splitlines() if "Loop" in l]
    feat = [l for l in info.splitlines() if "Features" in l]
    return {
        "file": path.name,
        "frames": len(rows),
        "total_ms": total,
        "full512": full,
        "loop": loop[0] if loop else "",
        "features": feat[0] if feat else "",
        "bytes": path.stat().st_size,
    }


def export_qa(path: Path, out_dir: Path, picks: list[int] | None = None) -> list[Path]:
    """导出开始/中段/结束 + app220 预览。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    info = inspect_webp(path)
    n = info["frames"]
    if picks is None:
        picks = sorted(set([1, max(1, n // 4), n // 2, (3 * n) // 4, n]))
    written = []
    for i in picks:
        if i < 1 or i > n:
            continue
        subprocess.check_call(
            ["webpmux", "-get", "frame", str(i), str(path), "-o", f"/tmp/qa_{path.stem}_{i}.webp"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.check_call(
            ["dwebp", f"/tmp/qa_{path.stem}_{i}.webp", "-o", f"/tmp/qa_{path.stem}_{i}.png"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        im = Image.open(f"/tmp/qa_{path.stem}_{i}.png").convert("RGBA")
        for bgname, bg in [("dark", (18, 18, 22, 255)), ("light", (248, 249, 251, 255))]:
            dest = out_dir / f"{path.stem}_f{i:02d}_{bgname}.png"
            Image.alpha_composite(Image.new("RGBA", (SIZE, SIZE), bg), im).convert("RGB").save(dest)
            written.append(dest)
        app = out_dir / f"{path.stem}_f{i:02d}_app220.png"
        Image.alpha_composite(Image.new("RGBA", (SIZE, SIZE), (248, 249, 251, 255)), im).resize(
            (220, 220), Image.Resampling.LANCZOS
        ).convert("RGB").save(app)
        written.append(app)
    return written
