#!/usr/bin/env python3
"""逐款构建：python scripts/build_one_fx_v8.py hearts"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fx_v8_lib as L

ASSETS = Path("/opt/cursor/artifacts/assets")
OUT = Path("/workspace/icons/fx")
QA = Path("/opt/cursor/artifacts/fx-v8-qa")
TROPHY_BAK = OUT / "_backup_v8_baseline_20261026" / "fx-power-trophy.webp"

KINDS = {
    "fireworks": {
        "file": "fx-power-fireworks.webp",
        "keys": ("v8-fw-01-ignite.jpg", "v8-fw-02-peak.jpg", "v8-fw-03-expand.jpg", "v8-fw-04-fade.jpg"),
        "n": 40,
        "dur": 50,
        "colors": [(255, 210, 70), (70, 180, 255), (255, 120, 190), (255, 170, 80)],
        "mode": "power",
    },
    "hearts": {
        "file": "fx-power-hearts.webp",
        "keys": (
            "v8-hearts-01-ignite.jpg",
            "v8-hearts-02-peak.jpg",
            "v8-hearts-03-expand.jpg",
            "v8-hearts-04-fade.jpg",
        ),
        "n": 30,
        "dur": 67,
        "colors": [(255, 140, 180), (255, 90, 140), (255, 190, 210), (255, 120, 160)],
        "mode": "power",
    },
    "stars": {
        "file": "fx-power-stars.webp",
        "keys": (
            "v8-stars-01-ignite.jpg",
            "v8-stars-02-peak.jpg",
            "v8-stars-03-expand.jpg",
            "v8-stars-04-fade.jpg",
        ),
        "n": 30,
        "dur": 67,
        "colors": [(255, 210, 80), (255, 180, 40), (255, 240, 160), (255, 160, 60)],
        "mode": "power",
    },
    "confetti": {
        "file": "fx-power-confetti.webp",
        "keys": (
            "v8-confetti-01-ignite.jpg",
            "v8-confetti-02-peak.jpg",
            "v8-confetti-03-expand.jpg",
            "v8-confetti-04-fade.jpg",
        ),
        "n": 30,
        "dur": 67,
        "colors": [(255, 210, 80), (60, 200, 255), (255, 120, 190), (180, 120, 255)],
        "mode": "power",
    },
    "done": {
        "file": "fx-power-done.webp",
        "keys": (
            "v8-done-01-ignite.jpg",
            "v8-done-02-peak.jpg",
            "v8-done-03-expand.jpg",
            "v8-done-04-fade.jpg",
        ),
        "n": 30,
        "dur": 67,
        "colors": [(255, 210, 80), (255, 180, 40), (255, 240, 140), (255, 160, 60)],
        "mode": "power",
    },
    "ring": {
        "file": "fx-power-ring.webp",
        "keys": (
            "v8-ring-01-ignite.jpg",
            "v8-ring-02-peak.jpg",
            "v8-ring-03-expand.jpg",
            "v8-ring-04-fade.jpg",
        ),
        "n": 30,
        "dur": 67,
        "colors": [(80, 180, 255), (160, 100, 255), (255, 200, 80), (100, 220, 255)],
        "mode": "power",
    },
    "blossoms": {
        "file": "fx-power-blossoms.webp",
        "keys": (
            "v8-blossoms-01-ignite.jpg",
            "v8-blossoms-02-peak.jpg",
            "v8-blossoms-03-expand.jpg",
            "v8-blossoms-04-fade.jpg",
        ),
        "n": 30,
        "dur": 67,
        "colors": [(255, 150, 190), (255, 180, 210), (255, 120, 160), (255, 200, 220)],
        "mode": "power",
    },
    "burst": {
        "file": "fx-power-burst.webp",
        "keys": (
            "v8-burst-01-ignite.jpg",
            "v8-burst-02-peak.jpg",
            "v8-burst-03-expand.jpg",
            "v8-burst-04-fade.jpg",
        ),
        "n": 30,
        "dur": 67,
        "colors": [(80, 160, 255), (160, 90, 255), (255, 200, 80), (100, 220, 255)],
        "mode": "power",
    },
    "minus1": {
        "file": "fx-warning-minus1.webp",
        "keys": (
            "v8-m1-01-ignite.jpg",
            "v8-m1-02-peak.jpg",
            "v8-m1-03-expand.jpg",
            "v8-m1-04-fade.jpg",
        ),
        "n": 30,
        "dur": 33,
        "colors": [(255, 90, 70), (255, 140, 60), (255, 70, 80)],
        "mode": "warn",
    },
    "minus2": {
        "file": "fx-warning-minus2.webp",
        "keys": (
            "v8-m2-01-ignite.jpg",
            "v8-m2-02-peak.jpg",
            "v8-m2-03-expand.jpg",
            "v8-m2-04-fade.jpg",
        ),
        "n": 30,
        "dur": 33,
        "colors": [(255, 70, 50), (255, 120, 40), (255, 50, 70), (255, 160, 50)],
        "mode": "warn",
    },
    "minus10": {
        "file": "fx-warning-minus10.webp",
        "keys": (
            "v8-m10-01-ignite.jpg",
            "v8-m10-02-peak.jpg",
            "v8-m10-03-expand.jpg",
            "v8-m10-04-fade.jpg",
        ),
        "n": 30,
        "dur": 33,
        "colors": [(255, 40, 40), (255, 90, 30), (200, 20, 40), (255, 140, 40)],
        "mode": "warn",
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
    rng = random.Random(hash(name) % 10_000)
    frames = []
    n, colors = cfg["n"], cfg["colors"]
    mode = cfg.get("mode", "power")
    for i in range(n):
        t = i / (n - 1)
        if mode == "warn":
            # 约 1s：更快进入与消散，强度由 key 图本身区分
            if t < 0.15:
                u = t / 0.15
                fr = L.lerp_img(empty, ign, u)
                fr = L.add_radial_particles(fr, u * 0.4, rng, colors, count=28, speed=140)
            elif t < 0.55:
                u = (t - 0.15) / 0.4
                fr = L.lerp_img(ign, peak, u**0.85)
                fr = L.add_radial_particles(fr, 0.3 + 0.45 * u, rng, colors, count=44, speed=190)
            else:
                u = (t - 0.55) / 0.45
                fr = L.lerp_img(peak, fade, u)
                fr = L.lerp_img(fr, empty, max(0, (u - 0.3) / 0.7))
                fr = L.add_radial_particles(fr, 0.6 + 0.4 * u, rng, colors, count=24, speed=220)
        elif t < 0.12:
            u = t / 0.12
            fr = L.lerp_img(empty, ign, u**0.75)
            fr = L.add_radial_particles(fr, u * 0.3, rng, colors, count=36, speed=100)
        elif t < 0.42:
            u = (t - 0.12) / 0.3
            fr = L.lerp_img(ign, peak, u**0.8)
            fr = L.add_radial_particles(fr, 0.25 + 0.4 * u, rng, colors, count=52, speed=170)
        elif t < 0.72:
            u = (t - 0.42) / 0.3
            fr = L.lerp_img(peak, exp, u)
            fr = L.add_radial_particles(fr, 0.5 + 0.35 * u, rng, colors, count=48, speed=200)
        else:
            u = (t - 0.72) / 0.28
            fr = L.lerp_img(exp, fade, min(1, u * 1.05))
            fr = L.lerp_img(fr, empty, max(0, (u - 0.4) / 0.6))
            fr = L.add_radial_particles(fr, 0.7 + 0.3 * u, rng, colors, count=28, speed=220)
        frames.append(fr)
    dest = OUT / cfg["file"]
    meta = L.encode_full_webp(frames, cfg["dur"], dest, loop=1)
    L.export_qa(dest, QA / name)
    # trophy lock
    if TROPHY_BAK.exists():
        cur = (OUT / "fx-power-trophy.webp").read_bytes()
        if cur != TROPHY_BAK.read_bytes():
            (OUT / "fx-power-trophy.webp").write_bytes(TROPHY_BAK.read_bytes())
            meta["trophy_restored"] = True
        else:
            meta["trophy_locked"] = True
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    return meta


if __name__ == "__main__":
    kind = sys.argv[1] if len(sys.argv) > 1 else ""
    if kind not in KINDS:
        print("usage: build_one_fx_v8.py <" + "|".join(KINDS) + ">")
        sys.exit(2)
    build_kind(kind)
