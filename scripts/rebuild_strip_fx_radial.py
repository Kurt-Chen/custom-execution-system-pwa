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
BACKUP = Path("/workspace/icons/fx/_backup_pre_strip_fix_20261026")

SPECS = {
    "wings": {
        "file": "fx-power-wings.webp",
        "colors": [
            (255, 210, 120),
            (255, 180, 70),
            (255, 230, 170),
            (240, 150, 60),
            (255, 200, 90),
        ],
        "seed": 7101,
        "counts": (52, 78, 68, 38),
        "speeds": (130, 200, 230, 250),
        "core": (255, 220, 140),
    },
    "galaxy": {
        "file": "fx-power-galaxy.webp",
        "colors": [
            (120, 200, 255),
            (160, 120, 255),
            (90, 230, 220),
            (200, 140, 255),
            (100, 170, 255),
        ],
        "seed": 7102,
        "counts": (56, 84, 72, 40),
        "speeds": (140, 210, 240, 260),
        "core": (180, 160, 255),
    },
    "phoenix": {
        "file": "fx-power-phoenix.webp",
        "colors": [
            (255, 120, 60),
            (255, 80, 40),
            (255, 180, 70),
            (255, 90, 70),
            (255, 150, 50),
        ],
        "seed": 7103,
        "counts": (54, 80, 70, 38),
        "speeds": (135, 205, 235, 255),
        "core": (255, 160, 80),
    },
}


def add_core_glow(base: Image.Image, t: float, rgb: tuple[int, int, int]) -> Image.Image:
    """中心柔光（圆形，非矩形）。"""
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    expand = L.ease_out_quart(min(1.0, t / 0.55))
    fade = 1.0 if t < 0.55 else max(0.0, 1 - ((t - 0.55) / 0.45) ** 1.35)
    r = 18 + 70 * expand
    a = int(210 * fade * (0.55 + 0.45 * (1 - t)))
    cx = cy = SIZE / 2
    for mul, amul in ((1.0, 1.0), (1.55, 0.42), (2.25, 0.16)):
        rr = r * mul
        aa = int(a * amul)
        col = (*rgb, max(0, min(255, aa)))
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)
    layer = layer.filter(ImageFilter.GaussianBlur(radius=3.2))
    return Image.alpha_composite(base, layer)


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
        t = i / (n - 1)
        fr = empty.copy()
        fr = add_core_glow(fr, t, cfg["core"])
        if t < 0.12:
            u = t / 0.12
            fr = L.add_radial_particles(fr, u * 0.35, rng, colors, count=c0, speed=s0)
        elif t < 0.42:
            u = (t - 0.12) / 0.3
            fr = L.add_radial_particles(fr, 0.25 + 0.45 * u, rng, colors, count=c1, speed=s1)
        elif t < 0.72:
            u = (t - 0.42) / 0.3
            fr = L.add_radial_particles(fr, 0.5 + 0.35 * u, rng, colors, count=c2, speed=s2)
        else:
            u = (t - 0.72) / 0.28
            fr = L.add_radial_particles(fr, 0.7 + 0.3 * u, rng, colors, count=c3, speed=s3)
            # 末段再叠一层淡化：降低整体 alpha
            arr = __import__("numpy").array(fr)
            fade_t = max(0.0, (u - 0.2) / 0.8)
            fade = max(0.0, 1.0 - fade_t**1.2)
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
