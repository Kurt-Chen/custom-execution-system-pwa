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
    expand = L.ease_out_quart(min(1.0, t / 0.55))
    fade = 1.0 if t < 0.55 else max(0.0, 1 - ((t - 0.55) / 0.45) ** 1.35)
    r = 14 + 48 * expand
    a = int(160 * strength * fade * (0.5 + 0.5 * (1 - t)))
    cx = cy = SIZE / 2
    for mul, amul in ((1.0, 1.0), (1.45, 0.38), (2.0, 0.14)):
        rr = r * mul
        aa = int(a * amul)
        col = (*rgb, max(0, min(255, aa)))
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)
    layer = layer.filter(ImageFilter.GaussianBlur(radius=2.4))
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
        fr = add_core_glow(fr, t, cfg["core"], strength=float(cfg.get("core_alpha", 0.5)))
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
