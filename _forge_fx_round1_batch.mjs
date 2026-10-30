/**
 * Done Victory FX · 第一轮批量优化（剩余 14 款）
 * DNA：中心高亮核 + Soft Bloom + 主体体量 + 居中 + 中段持光 + 干净收束
 * 禁止：改 trophy / galaxy / phoenix；堆粒子；改业务触发映射
 */
import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";
import sharp from "sharp";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIZE = 512;
const CX = SIZE / 2;
const CY = SIZE / 2;
const PAGES = 31;
const ROOT = __dirname;
const OUT_ROOT = path.join(ROOT, "_tmp_fx_compare_20261030", "round1_batch");
const BACKUP_ROOT = path.join(ROOT, "icons", "fx", "_backup_pre_round1_batch_20261030");

function clamp(n, a, b) {
  return n < a ? a : n > b ? b : n;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) {
  return arr[(rng() * arr.length) | 0];
}
function rgba(r, g, b, a) {
  return `rgba(${r|0},${g|0},${b|0},${(+a).toFixed(3)})`;
}

/** kind → 业务文件名（历史命名） */
const KIND_FILE = {
  wings: "fx-power-wings.webp",
  "energy-burst": "fx-power-burst.webp",
  meteor: "fx-power-meteor.webp",
  crystal: "fx-power-crystal.webp",
  prism: "fx-power-prism.webp",
  thunder: "fx-power-thunder.webp",
  fireworks: "fx-power-fireworks.webp",
  hearts: "fx-power-hearts.webp",
  stars: "fx-power-stars.webp",
  "solar-flare": "fx-power-solar-flare.webp",
  sigil: "fx-power-sigil.webp",
  blossom: "fx-power-blossoms.webp",
  victory: "fx-power-done.webp",
  "energy-ring": "fx-power-ring.webp"
};

/**
 * 主题配置：保留各自特色；粒子预算克制（约 55–80）
 */
const THEMES = {
  wings: {
    seed: 0xa11e01,
    palette: [
      [255, 210, 230],
      [255, 140, 190],
      [255, 180, 120],
      [255, 110, 160],
      [255, 230, 200]
    ],
    bloom: [
      [255, 245, 250],
      [255, 170, 200],
      [244, 100, 160],
      [200, 60, 120]
    ],
    core: [
      [255, 255, 255],
      [255, 230, 240],
      [255, 160, 190]
    ],
    particles: { main: 24, spark: 20, dust: 16 },
    shape: "wings"
  },
  "energy-burst": {
    seed: 0xeb0001,
    palette: [
      [230, 210, 255],
      [180, 140, 255],
      [140, 120, 255],
      [100, 180, 255],
      [200, 160, 255]
    ],
    bloom: [
      [245, 240, 255],
      [180, 160, 255],
      [120, 90, 240],
      [80, 60, 180]
    ],
    core: [
      [255, 255, 255],
      [230, 220, 255],
      [160, 140, 255]
    ],
    particles: { main: 32, spark: 24, dust: 16 },
    shape: "burst"
  },
  meteor: {
    seed: 0x7e7e01,
    palette: [
      [255, 230, 160],
      [255, 160, 60],
      [255, 110, 40],
      [255, 200, 100],
      [255, 80, 30]
    ],
    bloom: [
      [255, 245, 220],
      [255, 180, 90],
      [255, 110, 40],
      [200, 60, 20]
    ],
    core: [
      [255, 255, 255],
      [255, 230, 160],
      [255, 160, 70]
    ],
    particles: { main: 22, spark: 26, dust: 18 },
    shape: "meteor"
  },
  crystal: {
    seed: 0xc45501,
    palette: [
      [220, 250, 255],
      [120, 230, 245],
      [80, 200, 230],
      [180, 240, 255],
      [100, 180, 220]
    ],
    bloom: [
      [240, 255, 255],
      [140, 230, 245],
      [40, 180, 210],
      [20, 120, 160]
    ],
    core: [
      [255, 255, 255],
      [210, 250, 255],
      [120, 220, 240]
    ],
    particles: { main: 26, spark: 20, dust: 14 },
    shape: "crystal"
  },
  prism: {
    seed: 0x151501,
    palette: [
      [255, 120, 160],
      [255, 200, 80],
      [120, 220, 140],
      [100, 160, 255],
      [190, 120, 255]
    ],
    bloom: [
      [250, 245, 255],
      [180, 160, 255],
      [140, 100, 220],
      [90, 70, 180]
    ],
    core: [
      [255, 255, 255],
      [240, 230, 255],
      [180, 160, 255]
    ],
    particles: { main: 28, spark: 22, dust: 14 },
    shape: "prism"
  },
  thunder: {
    seed: 0x770001,
    palette: [
      [255, 250, 180],
      [255, 220, 60],
      [255, 200, 40],
      [180, 220, 255],
      [255, 240, 120]
    ],
    bloom: [
      [255, 255, 240],
      [255, 230, 120],
      [250, 200, 40],
      [180, 140, 20]
    ],
    core: [
      [255, 255, 255],
      [255, 250, 200],
      [255, 220, 80]
    ],
    particles: { main: 20, spark: 24, dust: 16 },
    shape: "thunder"
  },
  fireworks: {
    seed: 0xf17e01,
    palette: [
      [255, 210, 40],
      [255, 80, 100],
      [80, 220, 255],
      [160, 120, 255],
      [50, 255, 170],
      [255, 140, 40]
    ],
    bloom: [
      [255, 245, 200],
      [255, 190, 80],
      [255, 120, 50],
      [180, 60, 30]
    ],
    core: [
      [255, 255, 255],
      [255, 230, 140],
      [255, 170, 50]
    ],
    particles: { main: 36, spark: 28, dust: 16 },
    shape: "fireworks"
  },
  hearts: {
    seed: 0xea0701,
    palette: [
      [255, 180, 210],
      [255, 110, 160],
      [255, 80, 130],
      [255, 200, 220],
      [255, 140, 100]
    ],
    bloom: [
      [255, 240, 245],
      [255, 160, 190],
      [244, 90, 150],
      [180, 40, 100]
    ],
    core: [
      [255, 255, 255],
      [255, 220, 235],
      [255, 140, 180]
    ],
    particles: { main: 22, spark: 18, dust: 14 },
    shape: "hearts"
  },
  stars: {
    seed: 0x57a001,
    palette: [
      [255, 240, 180],
      [255, 200, 80],
      [255, 220, 120],
      [255, 180, 60],
      [255, 250, 220]
    ],
    bloom: [
      [255, 250, 230],
      [255, 210, 120],
      [245, 160, 40],
      [180, 100, 20]
    ],
    core: [
      [255, 255, 255],
      [255, 245, 200],
      [255, 200, 80]
    ],
    particles: { main: 30, spark: 22, dust: 14 },
    shape: "stars"
  },
  "solar-flare": {
    seed: 0x501a01,
    palette: [
      [255, 240, 160],
      [255, 180, 60],
      [255, 120, 30],
      [255, 210, 100],
      [255, 250, 200]
    ],
    bloom: [
      [255, 250, 220],
      [255, 200, 100],
      [255, 140, 40],
      [200, 80, 20]
    ],
    core: [
      [255, 255, 255],
      [255, 240, 180],
      [255, 180, 70]
    ],
    particles: { main: 26, spark: 22, dust: 16 },
    shape: "solar"
  },
  sigil: {
    seed: 0x516001,
    palette: [
      [180, 255, 210],
      [80, 230, 170],
      [50, 200, 140],
      [220, 255, 180],
      [120, 220, 160]
    ],
    bloom: [
      [230, 255, 240],
      [120, 230, 180],
      [40, 180, 130],
      [20, 120, 90]
    ],
    core: [
      [255, 255, 255],
      [210, 255, 230],
      [100, 230, 170]
    ],
    particles: { main: 20, spark: 18, dust: 14 },
    shape: "sigil"
  },
  blossom: {
    seed: 0xb10501,
    palette: [
      [255, 210, 230],
      [255, 140, 180],
      [255, 100, 150],
      [255, 180, 200],
      [255, 120, 140]
    ],
    bloom: [
      [255, 245, 250],
      [255, 180, 210],
      [236, 90, 160],
      [180, 40, 110]
    ],
    core: [
      [255, 255, 255],
      [255, 230, 240],
      [255, 150, 190]
    ],
    particles: { main: 24, spark: 18, dust: 14 },
    shape: "blossom"
  },
  victory: {
    seed: 0xc1c701,
    palette: [
      [255, 230, 140],
      [245, 170, 40],
      [220, 130, 20],
      [255, 210, 100],
      [255, 250, 200]
    ],
    bloom: [
      [255, 250, 220],
      [255, 200, 100],
      [217, 130, 20],
      [160, 80, 10]
    ],
    core: [
      [255, 255, 255],
      [255, 235, 160],
      [245, 180, 60]
    ],
    particles: { main: 20, spark: 16, dust: 12 },
    shape: "victory"
  },
  "energy-ring": {
    seed: 0xe10001,
    palette: [
      [255, 230, 140],
      [255, 180, 60],
      [255, 150, 40],
      [255, 210, 100],
      [255, 240, 180]
    ],
    bloom: [
      [255, 250, 220],
      [255, 200, 100],
      [245, 150, 40],
      [180, 90, 20]
    ],
    core: [
      [255, 255, 255],
      [255, 240, 180],
      [255, 190, 70]
    ],
    particles: { main: 18, spark: 20, dust: 14 },
    shape: "ring"
  }
};

const ORDER = [
  "wings",
  "energy-burst",
  "meteor",
  "crystal",
  "prism",
  "thunder",
  "fireworks",
  "hearts",
  "stars",
  "solar-flare",
  "sigil",
  "blossom",
  "victory",
  "energy-ring"
];

function envelope(tNorm) {
  if (tNorm <= 0) return 0.82;
  if (tNorm < 0.08) return lerp(0.82, 1, tNorm / 0.08);
  if (tNorm < 0.55) return 1;
  if (tNorm < 0.86) return lerp(1, 0.55, (tNorm - 0.55) / 0.31);
  return lerp(0.55, 0, (tNorm - 0.86) / 0.14);
}

function buildParticles(theme, rng) {
  const particles = [];
  const { main, spark, dust } = theme.particles;
  for (let i = 0; i < main; i++) {
    const c = pick(rng, theme.palette);
    particles.push({
      kind: "main",
      ang: (i / main) * Math.PI * 2 + (rng() - 0.5) * 0.12,
      speed: lerp(110, 200, rng()),
      birth: i < main * 0.4 ? 0 : rng() * 0.05,
      life: lerp(0.68, 0.95, rng()),
      size: lerp(2.6, 4.6, rng()),
      r: c[0],
      g: c[1],
      b: c[2],
      rise: theme.shape === "meteor" ? lerp(10, 40, rng()) : lerp(0, 12, rng())
    });
  }
  for (let i = 0; i < spark; i++) {
    const c = pick(rng, theme.palette);
    particles.push({
      kind: "spark",
      ang: rng() * Math.PI * 2,
      speed: lerp(60, 165, rng()),
      birth: rng() * 0.1,
      life: lerp(0.5, 0.9, rng()),
      size: lerp(1.5, 3.0, rng()),
      r: c[0],
      g: c[1],
      b: c[2],
      rise: theme.shape === "meteor" ? lerp(20, 70, rng()) : lerp(0, 16, rng())
    });
  }
  for (let i = 0; i < dust; i++) {
    const c = pick(rng, theme.palette);
    particles.push({
      kind: "dust",
      ang: rng() * Math.PI * 2,
      speed: lerp(35, 105, rng()),
      birth: 0.04 + rng() * 0.16,
      life: lerp(0.55, 1.0, rng()),
      size: lerp(1.0, 1.9, rng()),
      r: c[0],
      g: c[1],
      b: c[2],
      rise: lerp(0, 20, rng())
    });
  }
  return particles;
}

function particleState(p, tNorm) {
  if (tNorm < p.birth) return null;
  const u = (tNorm - p.birth) / Math.max(0.001, p.life - p.birth);
  if (u >= 1) return null;
  const ease = 1 - Math.pow(1 - clamp(u, 0, 1), 1.42);
  const drag = 1 - 0.17 * ease;
  const dist = p.speed * ease * drag;
  const x = CX + Math.cos(p.ang) * dist;
  const y = CY + Math.sin(p.ang) * dist - p.rise * ease * ease;
  let alpha;
  if (u < 0.07) alpha = u / 0.07;
  else if (u < 0.58) alpha = 1;
  else alpha = 1 - (u - 0.58) / 0.42;
  alpha = clamp(alpha, 0, 1) * envelope(tNorm);
  if (alpha < 0.02) return null;
  return {
    x,
    y,
    alpha,
    size: p.size * (1 - 0.16 * ease),
    r: p.r,
    g: p.g,
    b: p.b,
    kind: p.kind
  };
}

function drawSoftBloom(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.02) return;
  const bloom = 0.55 + 0.45 * Math.min(1, tNorm / 0.12);
  const rad = lerp(95, 215, bloom) * (0.92 + 0.08 * e);
  const [c0, c1, c2, c3] = theme.bloom;
  const g0 = ctx.createRadialGradient(CX, CY, 0, CX, CY, rad * 0.6);
  g0.addColorStop(0, rgba(c0[0], c0[1], c0[2], 0.9 * e));
  g0.addColorStop(0.22, rgba(c1[0], c1[1], c1[2], 0.72 * e));
  g0.addColorStop(0.5, rgba(c2[0], c2[1], c2[2], 0.38 * e));
  g0.addColorStop(0.78, rgba(c3[0], c3[1], c3[2], 0.12 * e));
  g0.addColorStop(1, rgba(c3[0], c3[1], c3[2], 0));
  ctx.fillStyle = g0;
  ctx.beginPath();
  ctx.arc(CX, CY, rad * 0.6, 0, Math.PI * 2);
  ctx.fill();
  const g1 = ctx.createRadialGradient(CX, CY, rad * 0.35, CX, CY, rad);
  g1.addColorStop(0, rgba(c2[0], c2[1], c2[2], 0.18 * e));
  g1.addColorStop(0.55, rgba(c3[0], c3[1], c3[2], 0.07 * e));
  g1.addColorStop(1, rgba(c3[0], c3[1], c3[2], 0));
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.arc(CX, CY, rad, 0, Math.PI * 2);
  ctx.fill();
}

function drawCore(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  let flash = 1;
  if (tNorm < 0.06) flash = lerp(0.95, 1.22, tNorm / 0.06);
  else if (tNorm < 0.22) flash = lerp(1.22, 1, (tNorm - 0.06) / 0.16);
  else if (tNorm > 0.62) flash = lerp(1, 0.32, clamp((tNorm - 0.62) / 0.32, 0, 1));
  const intensity = e * flash;
  if (intensity < 0.02) return;
  const [a, b, c] = theme.core;
  const rOuter = 26 + intensity * 50;
  const g1 = ctx.createRadialGradient(CX, CY, 0, CX, CY, rOuter);
  g1.addColorStop(0, rgba(a[0], a[1], a[2], 0.98 * intensity));
  g1.addColorStop(0.25, rgba(b[0], b[1], b[2], 0.85 * intensity));
  g1.addColorStop(0.55, rgba(c[0], c[1], c[2], 0.45 * intensity));
  g1.addColorStop(1, rgba(c[0], c[1], c[2], 0));
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.arc(CX, CY, rOuter, 0, Math.PI * 2);
  ctx.fill();
  const rCore = 7 + intensity * 14;
  const g2 = ctx.createRadialGradient(CX, CY, 0, CX, CY, rCore);
  g2.addColorStop(0, rgba(255, 255, 255, 1.0 * intensity));
  g2.addColorStop(0.45, rgba(b[0], b[1], b[2], 0.85 * intensity));
  g2.addColorStop(1, rgba(c[0], c[1], c[2], 0));
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(CX, CY, rCore, 0, Math.PI * 2);
  ctx.fill();
}

function drawGlowDot(ctx, x, y, size, r, g, b, alpha) {
  const rad = size * 2.25;
  const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
  grd.addColorStop(
    0,
    rgba(Math.min(255, r + 70), Math.min(255, g + 60), Math.min(255, b + 40), alpha * 0.98)
  );
  grd.addColorStop(0.35, rgba(r, g, b, alpha * 0.68));
  grd.addColorStop(0.75, rgba(r, g, b, alpha * 0.24));
  grd.addColorStop(1, rgba(r, g, b, 0));
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(
    Math.min(255, r + 45),
    Math.min(255, g + 35),
    Math.min(255, b + 25),
    alpha * 0.94
  );
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.0, size * 0.55), 0, Math.PI * 2);
  ctx.fill();
}

function drawWingsShape(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.16, 0, 1);
  const scale = lerp(0.55, 1.05, grow);
  const [c0, c1, c2] = theme.bloom;
  function strokeWing(side) {
    const s = side;
    const ox = CX;
    const oy = CY + 6;
    ctx.beginPath();
    ctx.moveTo(ox, oy - 16 * scale);
    ctx.bezierCurveTo(
      ox + s * 30 * scale,
      oy - 65 * scale,
      ox + s * 105 * scale,
      oy - 35 * scale,
      ox + s * 150 * scale,
      oy + 8 * scale
    );
    ctx.bezierCurveTo(
      ox + s * 120 * scale,
      oy + 50 * scale,
      ox + s * 65 * scale,
      oy + 65 * scale,
      ox + s * 16 * scale,
      oy + 24 * scale
    );
    ctx.bezierCurveTo(
      ox + s * 36 * scale,
      oy + 6 * scale,
      ox + s * 18 * scale,
      oy - 6 * scale,
      ox,
      oy - 16 * scale
    );
    ctx.closePath();
  }
  ctx.save();
  for (const side of [-1, 1]) {
    const fill = ctx.createRadialGradient(
      CX + side * 36 * scale,
      CY,
      6,
      CX + side * 70 * scale,
      CY,
      125 * scale
    );
    fill.addColorStop(0, rgba(c0[0], c0[1], c0[2], 0.65 * e));
    fill.addColorStop(0.45, rgba(c1[0], c1[1], c1[2], 0.4 * e));
    fill.addColorStop(1, rgba(c2[0], c2[1], c2[2], 0.05 * e));
    strokeWing(side);
    ctx.fillStyle = fill;
    ctx.fill();
    strokeWing(side);
    ctx.strokeStyle = rgba(255, 240, 245, 0.8 * e);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    strokeWing(side);
    ctx.strokeStyle = rgba(c1[0], c1[1], c1[2], 0.45 * e);
    ctx.lineWidth = 5.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawBurstRays(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.14, 0, 1);
  const len = lerp(40, 190, grow);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const c = theme.palette[i % theme.palette.length];
    const x2 = CX + Math.cos(ang) * len;
    const y2 = CY + Math.sin(ang) * len;
    const grd = ctx.createLinearGradient(CX, CY, x2, y2);
    grd.addColorStop(0, rgba(255, 255, 255, 0.55 * e));
    grd.addColorStop(0.35, rgba(c[0], c[1], c[2], 0.35 * e));
    grd.addColorStop(1, rgba(c[0], c[1], c[2], 0));
    ctx.strokeStyle = grd;
    ctx.lineWidth = 5.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMeteorTrail(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.15, 0, 1);
  const [c0, c1, c2] = theme.bloom;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  /* 主斜向拖尾 + 放射次级 */
  const ang = (-Math.PI * 2) / 5;
  const len = lerp(60, 210, grow);
  const x2 = CX + Math.cos(ang) * len;
  const y2 = CY + Math.sin(ang) * len;
  const grd = ctx.createLinearGradient(CX, CY, x2, y2);
  grd.addColorStop(0, rgba(c0[0], c0[1], c0[2], 0.85 * e));
  grd.addColorStop(0.4, rgba(c1[0], c1[1], c1[2], 0.45 * e));
  grd.addColorStop(1, rgba(c2[0], c2[1], c2[2], 0));
  ctx.strokeStyle = grd;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(CX, CY);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  for (let i = -2; i <= 2; i++) {
    if (!i) continue;
    const a2 = ang + i * 0.22;
    const l2 = len * (0.55 + Math.abs(i) * 0.08);
    const xx = CX + Math.cos(a2) * l2;
    const yy = CY + Math.sin(a2) * l2;
    const g2 = ctx.createLinearGradient(CX, CY, xx, yy);
    g2.addColorStop(0, rgba(255, 240, 180, 0.4 * e));
    g2.addColorStop(1, rgba(c2[0], c2[1], c2[2], 0));
    ctx.strokeStyle = g2;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(xx, yy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCrystalShards(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.15, 0, 1);
  const rad = lerp(30, 160, grow);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 + 0.1;
    const c = theme.palette[i % theme.palette.length];
    const x = CX + Math.cos(ang) * rad * 0.55;
    const y = CY + Math.sin(ang) * rad * 0.55;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(ang) * 12, CY + Math.sin(ang) * 12);
    ctx.lineTo(
      x + Math.cos(ang + 1.2) * 18 * grow,
      y + Math.sin(ang + 1.2) * 18 * grow
    );
    ctx.lineTo(
      CX + Math.cos(ang) * rad,
      CY + Math.sin(ang) * rad
    );
    ctx.closePath();
    ctx.fillStyle = rgba(c[0], c[1], c[2], 0.35 * e);
    ctx.fill();
    ctx.strokeStyle = rgba(255, 255, 255, 0.55 * e);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.restore();
}

function drawPrismFans(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.14, 0, 1);
  const rad = lerp(40, 175, grow);
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const a1 = a0 + Math.PI / 8;
    const c = theme.palette[i % theme.palette.length];
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.arc(CX, CY, rad, a0, a1);
    ctx.closePath();
    ctx.fillStyle = rgba(c[0], c[1], c[2], 0.22 * e);
    ctx.fill();
  }
  ctx.strokeStyle = rgba(255, 255, 255, 0.35 * e);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CX, CY, rad * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawThunderBolts(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.12, 0, 1);
  const [c0, c1] = theme.bloom;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const bolts = [
    [0, -1],
    [0.35, -0.85],
    [-0.35, -0.85],
    [0.55, 0.2],
    [-0.55, 0.2]
  ];
  for (const [dx, dy] of bolts) {
    const len = lerp(50, 180, grow);
    const x2 = CX + dx * len;
    const y2 = CY + dy * len;
    const midX = CX + dx * len * 0.45 + (dy > 0 ? 18 : -12);
    const midY = CY + dy * len * 0.45;
    ctx.strokeStyle = rgba(c0[0], c0[1], c0[2], 0.75 * e);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(midX, midY);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = rgba(255, 255, 255, 0.65 * e);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  /* 瞬时横展 bloom 感 */
  ctx.fillStyle = rgba(c1[0], c1[1], c1[2], 0.12 * e * grow);
  ctx.beginPath();
  ctx.ellipse(CX, CY, 160 * grow, 70 * grow, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHeart(ctx, x, y, s, fill, stroke, e) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s, y, x - s, y + s * 0.35);
  ctx.bezierCurveTo(x - s, y + s * 0.75, x, y + s * 1.05, x, y + s * 1.25);
  ctx.bezierCurveTo(x, y + s * 1.05, x + s, y + s * 0.75, x + s, y + s * 0.35);
  ctx.bezierCurveTo(x + s, y, x, y, x, y + s * 0.3);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawHeartsShape(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.15, 0, 1);
  const [c0, c1, c2] = theme.bloom;
  drawHeart(
    ctx,
    CX,
    CY - 20 * grow,
    42 * grow,
    rgba(c1[0], c1[1], c1[2], 0.55 * e),
    rgba(255, 255, 255, 0.7 * e),
    e
  );
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const d = 95 * grow;
    drawHeart(
      ctx,
      CX + Math.cos(ang) * d,
      CY + Math.sin(ang) * d - 10,
      16 * grow,
      rgba(c2[0], c2[1], c2[2], 0.4 * e),
      rgba(c0[0], c0[1], c0[2], 0.5 * e),
      e
    );
  }
}

function drawStar(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    const px = x + Math.cos(ang) * rr;
    const py = y + Math.sin(ang) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
}

function drawStarsShape(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.15, 0, 1);
  const [c0, c1] = theme.bloom;
  drawStar(
    ctx,
    CX,
    CY,
    48 * grow,
    rgba(c1[0], c1[1], c1[2], 0.65 * e),
    rgba(255, 255, 255, 0.75 * e)
  );
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2;
    drawStar(
      ctx,
      CX + Math.cos(ang) * 105 * grow,
      CY + Math.sin(ang) * 105 * grow,
      14 * grow,
      rgba(c0[0], c0[1], c0[2], 0.5 * e),
      rgba(255, 255, 255, 0.45 * e)
    );
  }
}

function drawSolarCorona(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.14, 0, 1);
  const [c0, c1, c2] = theme.bloom;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    const len = lerp(50, 195, grow) * (0.75 + (i % 3) * 0.1);
    const x2 = CX + Math.cos(ang) * len;
    const y2 = CY + Math.sin(ang) * len;
    const grd = ctx.createLinearGradient(CX, CY, x2, y2);
    grd.addColorStop(0, rgba(c0[0], c0[1], c0[2], 0.5 * e));
    grd.addColorStop(0.5, rgba(c1[0], c1[1], c1[2], 0.28 * e));
    grd.addColorStop(1, rgba(c2[0], c2[1], c2[2], 0));
    ctx.strokeStyle = grd;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(ang) * 20, CY + Math.sin(ang) * 20);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSigil(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.15, 0, 1);
  const [c0, c1, c2] = theme.bloom;
  const r = 95 * grow;
  ctx.save();
  ctx.strokeStyle = rgba(c1[0], c1[1], c1[2], 0.7 * e);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(CX, CY, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(255, 255, 255, 0.55 * e);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CX, CY, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(CX + Math.cos(ang) * r, CY + Math.sin(ang) * r);
    ctx.strokeStyle = rgba(c2[0], c2[1], c2[2], 0.45 * e);
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = rgba(c0[0], c0[1], c0[2], 0.35 * e);
  ctx.beginPath();
  ctx.arc(CX, CY, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBlossomPetals(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.15, 0, 1);
  const [c0, c1, c2] = theme.bloom;
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, -55 * grow, 28 * grow, 55 * grow, 0, 0, Math.PI * 2);
    const grd = ctx.createRadialGradient(0, -40 * grow, 4, 0, -55 * grow, 55 * grow);
    grd.addColorStop(0, rgba(c0[0], c0[1], c0[2], 0.7 * e));
    grd.addColorStop(0.55, rgba(c1[0], c1[1], c1[2], 0.4 * e));
    grd.addColorStop(1, rgba(c2[0], c2[1], c2[2], 0.05 * e));
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.strokeStyle = rgba(255, 255, 255, 0.45 * e);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawVictoryBadge(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.14, 0, 1);
  const [c0, c1, c2] = theme.bloom;
  const r = 70 * grow;
  ctx.save();
  ctx.fillStyle = rgba(c1[0], c1[1], c1[2], 0.55 * e);
  ctx.beginPath();
  ctx.arc(CX, CY, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(255, 255, 255, 0.75 * e);
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = rgba(c2[0], c2[1], c2[2], 0.55 * e);
  ctx.lineWidth = 8;
  ctx.stroke();
  /* 简易勾选 / 胜利标记 */
  ctx.strokeStyle = rgba(c0[0], c0[1], c0[2], 0.9 * e);
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(CX - 22 * grow, CY + 2 * grow);
  ctx.lineTo(CX - 4 * grow, CY + 20 * grow);
  ctx.lineTo(CX + 28 * grow, CY - 22 * grow);
  ctx.stroke();
  ctx.restore();
}

function drawEnergyRing(ctx, theme, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.14, 0, 1);
  const [c0, c1, c2] = theme.bloom;
  const r = lerp(40, 150, grow);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  /* 体积盘 */
  const fill = ctx.createRadialGradient(CX, CY, r * 0.2, CX, CY, r);
  fill.addColorStop(0, rgba(c0[0], c0[1], c0[2], 0.35 * e));
  fill.addColorStop(0.55, rgba(c1[0], c1[1], c1[2], 0.18 * e));
  fill.addColorStop(1, rgba(c2[0], c2[1], c2[2], 0));
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(CX, CY, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(255, 255, 255, 0.75 * e);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(CX, CY, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(c1[0], c1[1], c1[2], 0.55 * e);
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.strokeStyle = rgba(c0[0], c0[1], c0[2], 0.35 * e);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(CX, CY, r * 1.18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawThemeShape(ctx, theme, tNorm) {
  switch (theme.shape) {
    case "wings":
      drawWingsShape(ctx, theme, tNorm);
      break;
    case "burst":
      drawBurstRays(ctx, theme, tNorm);
      break;
    case "meteor":
      drawMeteorTrail(ctx, theme, tNorm);
      break;
    case "crystal":
      drawCrystalShards(ctx, theme, tNorm);
      break;
    case "prism":
      drawPrismFans(ctx, theme, tNorm);
      break;
    case "thunder":
      drawThunderBolts(ctx, theme, tNorm);
      break;
    case "fireworks":
      drawBurstRays(ctx, theme, tNorm);
      break;
    case "hearts":
      drawHeartsShape(ctx, theme, tNorm);
      break;
    case "stars":
      drawStarsShape(ctx, theme, tNorm);
      break;
    case "solar":
      drawSolarCorona(ctx, theme, tNorm);
      break;
    case "sigil":
      drawSigil(ctx, theme, tNorm);
      break;
    case "blossom":
      drawBlossomPetals(ctx, theme, tNorm);
      break;
    case "victory":
      drawVictoryBadge(ctx, theme, tNorm);
      break;
    case "ring":
      drawEnergyRing(ctx, theme, tNorm);
      break;
    default:
      break;
  }
}

function renderFrame(theme, particles, tNorm) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, SIZE, SIZE);
  drawSoftBloom(ctx, theme, tNorm);
  drawThemeShape(ctx, theme, tNorm);
  drawCore(ctx, theme, tNorm);
  const states = [];
  for (let i = 0; i < particles.length; i++) {
    const s = particleState(particles[i], tNorm);
    if (s) states.push(s);
  }
  states.sort((a, b) => {
    const order = { dust: 0, spark: 1, main: 2 };
    return (order[a.kind] || 0) - (order[b.kind] || 0);
  });
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const s of states) {
    drawGlowDot(ctx, s.x, s.y, s.size, s.r, s.g, s.b, s.alpha);
  }
  ctx.restore();
  return canvas.toBuffer("image/png");
}

async function scrubFaintAlpha(pngBuf) {
  const { data, info } = await sharp(pngBuf).ensureAlpha().raw().toBuffer({
    resolveWithObject: true
  });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 12) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .png()
    .toBuffer();
}

function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    "C:\\Users\\ASUS\\AppData\\Local\\Temp\\ffmpeg-essentials\\ffmpeg-9.0.2-essentials_build\\bin\\ffmpeg.exe",
    "ffmpeg"
  ].filter(Boolean);
  for (const c of candidates) {
    if (c === "ffmpeg") return c;
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function encodeAnimatedWebp(frameDir, outFile) {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg not found");
  const r = spawnSync(
    ffmpeg,
    [
      "-y",
      "-framerate",
      "1000/65",
      "-i",
      path.join(frameDir, "seq_%03d.png"),
      "-c:v",
      "libwebp",
      "-lossless",
      "1",
      "-compression_level",
      "4",
      "-loop",
      "1",
      "-an",
      outFile
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-1500));
    throw new Error("ffmpeg failed for " + outFile);
  }
}

async function metricsOf(src, page = 12) {
  const { data, info } = await sharp(src, { animated: true, page, pages: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  let opaque = 0;
  let bright = 0;
  let soft = 0;
  let core = 0;
  let cx = 0;
  let cy = 0;
  let mass = 0;
  let rS = 0;
  let gS = 0;
  let bS = 0;
  const coreR2 = (info.width * 0.22) ** 2;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const a = data[i + 3];
      if (a < 16) continue;
      opaque++;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > 170 && a > 60) bright++;
      if (a > 16 && a < 140 && lum > 90) soft++;
      const dx = x - info.width / 2;
      const dy = y - info.height / 2;
      if (dx * dx + dy * dy <= coreR2) core++;
      cx += x * a;
      cy += y * a;
      mass += a;
      rS += r;
      gS += g;
      bS += b;
    }
  }
  return {
    opaquePct: +(opaque / n * 100).toFixed(2),
    brightPct: +(bright / n * 100).toFixed(2),
    softGlowPct: +(soft / n * 100).toFixed(2),
    corePct: +(core / n * 100).toFixed(2),
    centroid: mass ? [Math.round(cx / mass), Math.round(cy / mass)] : [0, 0],
    avgRGB: opaque
      ? [Math.round(rS / opaque), Math.round(gS / opaque), Math.round(bS / opaque)]
      : [0, 0, 0]
  };
}

async function previewPair(before, after, trophy, outDir, kind) {
  fs.mkdirSync(outDir, { recursive: true });
  async function one(src, name) {
    await sharp(src, { animated: true, page: 12, pages: 1 })
      .resize(280, 280, { fit: "contain", background: { r: 10, g: 14, b: 24, alpha: 1 } })
      .flatten({ background: { r: 10, g: 14, b: 24 } })
      .png()
      .toFile(path.join(outDir, name));
  }
  await one(before, "before_peak.png");
  await one(after, "after_peak.png");
  await one(trophy, "trophy_peak.png");
  await sharp({
    create: { width: 840, height: 300, channels: 3, background: { r: 10, g: 14, b: 24 } }
  })
    .composite([
      { input: path.join(outDir, "before_peak.png"), left: 0, top: 10 },
      { input: path.join(outDir, "after_peak.png"), left: 280, top: 10 },
      { input: path.join(outDir, "trophy_peak.png"), left: 560, top: 10 }
    ])
    .png()
    .toFile(path.join(outDir, "compare_peak_before_after_trophy.png"));
}

async function processKind(kind, log) {
  const theme = THEMES[kind];
  const fileName = KIND_FILE[kind];
  const srcPath = path.join(ROOT, "icons", "fx", fileName);
  const backupDir = path.join(BACKUP_ROOT, kind);
  const frameDir = path.join(OUT_ROOT, kind, "frames");
  const reportDir = path.join(OUT_ROOT, kind);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(frameDir, { recursive: true });
  fs.copyFileSync(srcPath, path.join(backupDir, fileName));

  const beforeMeta = await sharp(srcPath, { animated: true, pages: -1 }).metadata();
  const beforePeak = await metricsOf(srcPath, Math.min(12, (beforeMeta.pages || 1) - 1));

  const rng = mulberry32(theme.seed ^ 0x20261030);
  const particles = buildParticles(theme, rng);
  console.log(`\n=== ${kind} particles=${particles.length} ===`);

  for (let i = 0; i < PAGES; i++) {
    const tNorm = i / (PAGES - 1);
    let png = renderFrame(theme, particles, tNorm);
    if (i === PAGES - 1) {
      png = await sharp({
        create: {
          width: SIZE,
          height: SIZE,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .png()
        .toBuffer();
    } else {
      png = await scrubFaintAlpha(png);
    }
    fs.writeFileSync(path.join(frameDir, `seq_${String(i).padStart(3, "0")}.png`), png);
  }

  await encodeAnimatedWebp(frameDir, srcPath);
  const afterMeta = await sharp(srcPath, { animated: true, pages: -1 }).metadata();
  const afterPeak = await metricsOf(srcPath, 12);
  const trophyPath = path.join(ROOT, "icons", "fx", "fx-power-trophy.webp");
  await previewPair(path.join(backupDir, fileName), srcPath, trophyPath, reportDir, kind);

  const entry = {
    kind,
    file: fileName,
    backup: path.join("icons/fx/_backup_pre_round1_batch_20261030", kind, fileName),
    particles: particles.length,
    before: {
      bytes: fs.statSync(path.join(backupDir, fileName)).size,
      pages: beforeMeta.pages,
      peak: beforePeak
    },
    after: {
      bytes: fs.statSync(srcPath).size,
      pages: afterMeta.pages,
      delayMs: Array.isArray(afterMeta.delay)
        ? afterMeta.delay.reduce((a, b) => a + (b || 0), 0)
        : 0,
      peak: afterPeak
    },
    deltas: {
      bright: +(afterPeak.brightPct - beforePeak.brightPct).toFixed(2),
      opaque: +(afterPeak.opaquePct - beforePeak.opaquePct).toFixed(2),
      softGlow: +(afterPeak.softGlowPct - beforePeak.softGlowPct).toFixed(2),
      core: +(afterPeak.corePct - beforePeak.corePct).toFixed(2)
    },
    compare: path.join("_tmp_fx_compare_20261030/round1_batch", kind, "compare_peak_before_after_trophy.png"),
    debug: `__debugPlayVictoryFx('${kind}')`,
    summary: `中心核/柔光/体量提升；主题=${theme.shape}；粒子=${particles.length}`
  };
  fs.writeFileSync(path.join(reportDir, "report.json"), JSON.stringify(entry, null, 2));
  log.push(entry);
  console.log(
    kind,
    "bright",
    beforePeak.brightPct,
    "->",
    afterPeak.brightPct,
    "opaque",
    beforePeak.opaquePct,
    "->",
    afterPeak.opaquePct,
    "core",
    beforePeak.corePct,
    "->",
    afterPeak.corePct
  );
  return entry;
}

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const list = only.length ? only : ORDER;
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  const log = [];
  const trophyBefore = fs.statSync(path.join(ROOT, "icons", "fx", "fx-power-trophy.webp")).size;
  const galaxyBefore = fs.statSync(path.join(ROOT, "icons", "fx", "fx-power-galaxy.webp")).size;
  const phoenixBefore = fs.statSync(path.join(ROOT, "icons", "fx", "fx-power-phoenix.webp")).size;

  for (const kind of list) {
    if (!THEMES[kind]) throw new Error("unknown kind " + kind);
    await processKind(kind, log);
  }

  const trophyAfter = fs.statSync(path.join(ROOT, "icons", "fx", "fx-power-trophy.webp")).size;
  const galaxyAfter = fs.statSync(path.join(ROOT, "icons", "fx", "fx-power-galaxy.webp")).size;
  const phoenixAfter = fs.statSync(path.join(ROOT, "icons", "fx", "fx-power-phoenix.webp")).size;
  if (trophyBefore !== trophyAfter) throw new Error("trophy mutated!");
  if (galaxyBefore !== galaxyAfter) throw new Error("galaxy mutated!");
  if (phoenixBefore !== phoenixAfter) throw new Error("phoenix mutated!");

  const summary = {
    finishedAt: new Date().toISOString(),
    count: log.length,
    protected: {
      trophyBytes: trophyAfter,
      galaxyBytes: galaxyAfter,
      phoenixBytes: phoenixAfter
    },
    items: log
  };
  fs.writeFileSync(path.join(OUT_ROOT, "BATCH_LOG.json"), JSON.stringify(summary, null, 2));
  console.log("\nDONE batch", log.length, "->", path.join(OUT_ROOT, "BATCH_LOG.json"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
