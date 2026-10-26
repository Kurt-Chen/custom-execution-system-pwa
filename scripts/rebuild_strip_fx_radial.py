#!/usr/bin/env python3
"""将扁长/竖条庆祝素材重做为 512² 透明径向粒子爆发（力量 hold≈2s）。"""

from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fx_v8_lib as L

SIZE = 512
OUT_DIR = Path("/workspace/icons/fx")
QA = Path("/opt/cursor/artifacts/fx-strip-rebuild")
BACKUP = Path("/workspace/icons/fx/_backup_pre_duration_strip_20261026")

SPECS = {
    "wings": {
        "file": "fx-power-wings.webp",
        "colors": [
            (255, 196, 72),
            (255, 160, 40),
            (255, 230, 120),
            (255, 120, 50),
            (255, 210, 80),
            (255, 140, 70),
        ],
        "seed": 7101,
        "counts": (64, 96, 80, 44),
        "speeds": (150, 220, 250, 270),
        "core": (255, 200, 90),
        "core_alpha": 0.55,
    },
    "galaxy": {
        "file": "fx-power-galaxy.webp",
        "colors": [
            (80, 190, 255),
            (150, 100, 255),
            (60, 230, 210),
            (200, 120, 255),
            (100, 160, 255),
            (255, 120, 220),
        ],
        "seed": 7102,
        "counts": (68, 100, 84, 46),
        "speeds": (155, 230, 255, 275),
        "core": (150, 130, 255),
        "core_alpha": 0.5,
    },
    "phoenix": {
        "file": "fx-power-phoenix.webp",
        "colors": [
            (255, 90, 40),
            (255, 60, 30),
            (255, 170, 50),
            (255, 110, 70),
            (255, 140, 40),
            (255, 200, 80),
        ],
        "seed": 7103,
        "counts": (66, 98, 82, 46),
        "speeds": (150, 225, 250, 270),
        "core": (255, 120, 50),
        "core_alpha": 0.5,
    },
}


def add_core_glow(
    base: Image.Image, t: float, rgb: tuple[int, int, int], strength: float = 0.5
) -> Image.Image:
    """中心柔光（圆形，非矩形）；强度可控，避免大块半透明圆盘盖住 UI。"""
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # 爆发→巡航→末段消散；消散从 ~0.86 起，保证可见内容铺满约 2s
    expand = L.ease_out_quart(min(1.0, t / 0.45))
    fade = 1.0 if t < 0.86 else max(0.0, 1 - ((t - 0.86) / 0.14) ** 1.2)
    r = 14 + 48 * expand
    a = int(160 * strength * fade * (0.55 + 0.45 * (1 - t * 0.85)))
    cx = cy = SIZE / 2
    for mul, amul in ((1.0, 1.0), (1.45, 0.38), (2.0, 0.14)):
        rr = r * mul
        aa = int(a * amul)
        col = (*rgb, max(0, min(255, aa)))
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)
    layer = layer.filter(ImageFilter.GaussianBlur(radius=2.4))
    return Image.alpha_composite(base, layer)


def add_radial_particles_sustained(
    base: Image.Image,
    t: float,
    rng: random.Random,
    colors: list[tuple[int, int, int]],
    count: int,
    speed: float,
) -> Image.Image:
    """
    与 fx_v8_lib.add_radial_particles 同形，但淡出起点推迟到 0.78，
    避免旧版 t≥0.5 即开始消散导致「爆发后半段空窗」。
    """
    import math

    img = base.copy()
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx = cy = SIZE / 2
    expand = L.ease_out_quart(min(1.0, t / 0.55))
    fade = 1.0 if t < 0.86 else max(0.0, 1 - ((t - 0.86) / 0.14) ** 1.15)
    for i in range(count):
        ang = (i / count) * math.tau + rng.uniform(-0.05, 0.05)
        dist = speed * (0.5 + 0.5 * ((i % 5) / 4)) * expand
        x = cx + math.cos(ang) * dist
        y = cy + math.sin(ang) * dist + 18 * (t**1.5)
        # 中后段保持可读亮度，仅最后 ~14% 收束
        a = int(255 * fade * (0.72 + 0.28 * (1 - t * 0.75)))
        if a < 10:
            continue
        trail = 0.12
        back = max(0.0, t - trail)
        be = L.ease_out_quart(min(1.0, back / 0.55))
        bx = cx + math.cos(ang) * (speed * (0.5 + 0.5 * ((i % 5) / 4)) * be)
        by = cy + math.sin(ang) * (speed * (0.5 + 0.5 * ((i % 5) / 4)) * be) + 18 * (back**1.5)
        col = colors[i % len(colors)]
        d.line([(bx, by), (x, y)], fill=(*col, int(a * 0.55)), width=max(1, 2 + (i % 2)))
        r = 1.7 + (i % 4) * 0.6
        d.ellipse([x - r, y - r, x + r, y + r], fill=(*col, a))
    return Image.alpha_composite(img, layer)


def build_kind(name: str) -> dict:
    cfg = SPECS[name]
    rng = random.Random(cfg["seed"])
    empty = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    n = 32
    dur = 63  # ≈2016ms，对齐 DONE_FX_POWER_HOLD_MS
    c0, c1, c2, c3 = cfg["counts"]
    s0, s1, s2, s3 = cfg["speeds"]
    colors = cfg["colors"]
    frames: list[Image.Image] = []
    for i in range(n):
        # 全局 t 线性铺满 0→1（约 2s）；粒子参数与 t 同步，禁止分段映射把寿命压到前 1s
        t = i / (n - 1)
        fr = empty.copy()
        fr = add_core_glow(fr, t, cfg["core"], strength=float(cfg.get("core_alpha", 0.5)))
        if t < 0.18:
            count, speed = c0, s0
        elif t < 0.5:
            count, speed = c1, s1
        elif t < 0.86:
            count, speed = c2, s2
        else:
            count, speed = c3, s3
        # 每帧用确定性角向抖动，避免 rng 消耗导致后半段角度漂到看不见
        frame_rng = random.Random(cfg["seed"] + i * 997)
        fr = add_radial_particles_sustained(fr, t, frame_rng, colors, count=count, speed=speed)
        if t > 0.92:
            arr = __import__("numpy").array(fr)
            fade = max(0.0, 1.0 - ((t - 0.92) / 0.08) ** 1.1)
            arr[:, :, 3] = (arr[:, :, 3].astype("float32") * fade).astype("uint8")
            fr = Image.fromarray(arr, "RGBA")
        frames.append(fr)

    BACKUP.mkdir(parents=True, exist_ok=True)
    dest = OUT_DIR / cfg["file"]
    if dest.exists():
        (BACKUP / cfg["file"]).write_bytes(dest.read_bytes())
    meta = L.encode_full_webp(frames, dur, dest, loop=1)
    L.export_qa(dest, QA / name)
    meta["kind"] = name
    meta["dest"] = str(dest)
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    return meta


def main() -> None:
    names = sys.argv[1:] or list(SPECS.keys())
    out = []
    for name in names:
        if name not in SPECS:
            raise SystemExit(f"unknown kind {name}; choose from {list(SPECS)}")
        out.append(build_kind(name))
    (QA / "rebuild_meta.json").write_text(json.dumps(out, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
