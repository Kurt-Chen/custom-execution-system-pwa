#!/usr/bin/env python3
"""V9 高密度候选：输出到 dist/fx-candidates-v9，不直接覆盖正式 icons/fx。"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fx_v8_lib as L

ASSETS = Path("/opt/cursor/artifacts/assets")
OUT = Path("/workspace/dist/fx-candidates-v9")
QA = Path("/opt/cursor/artifacts/fx-v9-qa")

KINDS = {
    "blossoms": {
        "file": "fx-power-blossoms.webp",
        "keys": (
            "v9-blossoms-01-ignite.jpg",
            "v9-blossoms-02-peak.jpg",
            "v9-blossoms-03-expand.jpg",
            "v9-blossoms-04-fade.jpg",
        ),
        "n": 32,
        "dur": 63,
        "colors": [(255, 150, 190), (255, 180, 210), (255, 120, 160), (255, 200, 220), (255, 100, 140)],
        "mode": "power",
        "counts": (48, 72, 64, 36),
        "speeds": (120, 190, 220, 240),
    },
    "confetti": {
        "file": "fx-power-confetti.webp",
        "keys": (
            "v9-confetti-01-ignite.jpg",
            "v9-confetti-02-peak.jpg",
            "v9-confetti-03-expand.jpg",
            "v9-confetti-04-fade.jpg",
        ),
        "n": 32,
        "dur": 63,
        "colors": [(255, 210, 80), (60, 200, 255), (255, 120, 190), (180, 120, 255), (80, 230, 180)],
        "mode": "power",
        "counts": (52, 80, 70, 40),
        "speeds": (130, 200, 230, 250),
    },
    "done": {
        "file": "fx-power-done.webp",
        "keys": (
            "v9-done-01-ignite.jpg",
            "v9-done-02-peak.jpg",
            "v9-done-03-expand.jpg",
            "v9-done-04-fade.jpg",
        ),
        "n": 32,
        "dur": 63,
        "colors": [(255, 210, 80), (255, 180, 40), (255, 240, 140), (255, 160, 60)],
        "mode": "power",
        "counts": (44, 68, 60, 34),
        "speeds": (110, 180, 210, 230),
    },
    "ring": {
        "file": "fx-power-ring.webp",
        "keys": (
            "v9-ring-01-ignite.jpg",
            "v9-ring-02-peak.jpg",
            "v9-ring-03-expand.jpg",
            "v9-ring-04-fade.jpg",
        ),
        "n": 32,
        "dur": 63,
        "colors": [(80, 180, 255), (160, 100, 255), (255, 200, 80), (100, 220, 255)],
        "mode": "power",
        "counts": (40, 64, 58, 32),
        "speeds": (100, 160, 190, 210),
    },
    "burst": {
        "file": "fx-power-burst.webp",
        "keys": (
            "v9-burst-01-ignite.jpg",
            "v9-burst-02-peak.jpg",
            "v9-burst-03-expand.jpg",
            "v9-burst-04-fade.jpg",
        ),
        "n": 32,
        "dur": 63,
        "colors": [(80, 160, 255), (160, 90, 255), (255, 200, 80), (100, 220, 255), (200, 120, 255)],
        "mode": "power",
        "counts": (56, 84, 72, 40),
        "speeds": (140, 210, 240, 260),
    },
    "minus1": {
        "file": "fx-warning-minus1.webp",
        "keys": (
            "v9-m1-01-ignite.jpg",
            "v9-m1-02-peak.jpg",
            "v9-m1-03-expand.jpg",
            "v9-m1-04-fade.jpg",
        ),
        "n": 30,
        "dur": 33,
        "colors": [(255, 90, 70), (255, 140, 60), (255, 70, 80)],
        "mode": "warn",
        "counts": (24, 36, 28, 16),
        "speeds": (120, 160, 190, 200),
    },
    "minus2": {
        "file": "fx-warning-minus2.webp",
        "keys": (
            "v9-m2-01-ignite.jpg",
            "v9-m2-02-peak.jpg",
            "v9-m2-03-expand.jpg",
            "v9-m2-04-fade.jpg",
        ),
        "n": 30,
        "dur": 33,
        "colors": [(255, 70, 50), (255, 120, 40), (255, 50, 70), (255, 160, 50)],
        "mode": "warn",
        "counts": (32, 48, 40, 22),
        "speeds": (140, 180, 210, 220),
    },
    "minus10": {
        "file": "fx-warning-minus10.webp",
        "keys": (
            "v9-m10-01-ignite.jpg",
            "v9-m10-02-peak.jpg",
            "v9-m10-03-expand.jpg",
            "v9-m10-04-fade.jpg",
        ),
        "n": 30,
        "dur": 33,
        "colors": [(255, 40, 40), (255, 90, 30), (200, 20, 40), (255, 140, 40)],
        "mode": "warn",
        "counts": (40, 64, 52, 28),
        "speeds": (160, 210, 240, 250),
    },
}


def build_kind(name: str) -> dict:
    cfg = KINDS[name]
    paths = []
    for k in cfg["keys"]:
        p = ASSETS / k
        if not p.exists():
            raise FileNotFoundError(p)
        paths.append(p)
    ign = L.key_black_to_alpha(Image.open(paths[0]))
    peak = L.key_black_to_alpha(Image.open(paths[1]))
    exp = L.key_black_to_alpha(Image.open(paths[2]))
    fade = L.key_black_to_alpha(Image.open(paths[3]))
    empty = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    rng = random.Random(hash("v9-" + name) % 10_000)
    frames = []
    n, colors = cfg["n"], cfg["colors"]
    mode = cfg.get("mode", "power")
    c0, c1, c2, c3 = cfg["counts"]
    s0, s1, s2, s3 = cfg["speeds"]
    for i in range(n):
        t = i / (n - 1)
        if mode == "warn":
            if t < 0.15:
                u = t / 0.15
                fr = L.lerp_img(empty, ign, u)
                fr = L.add_radial_particles(fr, u * 0.45, rng, colors, count=c0, speed=s0)
            elif t < 0.55:
                u = (t - 0.15) / 0.4
                fr = L.lerp_img(ign, peak, u**0.85)
                fr = L.add_radial_particles(fr, 0.3 + 0.5 * u, rng, colors, count=c1, speed=s1)
            else:
                u = (t - 0.55) / 0.45
                fr = L.lerp_img(peak, fade, u)
                fr = L.lerp_img(fr, empty, max(0, (u - 0.25) / 0.75))
                fr = L.add_radial_particles(fr, 0.55 + 0.45 * u, rng, colors, count=c2, speed=s2)
        elif t < 0.12:
            u = t / 0.12
            fr = L.lerp_img(empty, ign, u**0.75)
            fr = L.add_radial_particles(fr, u * 0.35, rng, colors, count=c0, speed=s0)
        elif t < 0.42:
            u = (t - 0.12) / 0.3
            fr = L.lerp_img(ign, peak, u**0.8)
            fr = L.add_radial_particles(fr, 0.25 + 0.45 * u, rng, colors, count=c1, speed=s1)
        elif t < 0.72:
            u = (t - 0.42) / 0.3
            fr = L.lerp_img(peak, exp, u)
            fr = L.add_radial_particles(fr, 0.5 + 0.35 * u, rng, colors, count=c2, speed=s2)
        else:
            u = (t - 0.72) / 0.28
            fr = L.lerp_img(exp, fade, min(1, u * 1.05))
            fr = L.lerp_img(fr, empty, max(0, (u - 0.35) / 0.65))
            fr = L.add_radial_particles(fr, 0.7 + 0.3 * u, rng, colors, count=c3, speed=s3)
        frames.append(fr)
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / cfg["file"]
    meta = L.encode_full_webp(frames, cfg["dur"], dest, loop=1)
    L.export_qa(dest, QA / name)
    meta["candidate"] = str(dest)
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    return meta


if __name__ == "__main__":
    kind = sys.argv[1] if len(sys.argv) > 1 else ""
    if kind not in KINDS:
        print("usage: build_dense_fx_v9.py <" + "|".join(KINDS) + ">")
        sys.exit(2)
    build_kind(kind)
