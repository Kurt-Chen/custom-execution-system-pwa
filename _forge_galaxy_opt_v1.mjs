/**
 * 银河（galaxy）视觉品质对齐奖杯光层 · 第 1 轮
 * 目标：中心高亮核 + Soft Bloom + 粒子边缘更亮；保留紫蓝主题与 spiral 特色
 * 约束：31 帧 / ~2016ms；不堆粒子；不改 trophy / 其它 kind / 业务逻辑
 */
import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";
import sharp from "sharp";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "icons", "fx", "fx-power-galaxy.webp");
const PREVIEW_DIR = path.join(__dirname, "_tmp_fx_compare_20261030", "galaxy_opt_v1");

const SIZE = 512;
const CX = SIZE / 2;
const CY = SIZE / 2;
const PAGES = 31;
/** 与现网 trophy/galaxy 对齐：29×67 + 57 + 16 = 2016ms */
const DELAYS = [...Array(29).fill(67), 57, 16];

const PALETTE = [
  [190, 170, 255], // soft lilac
  [120, 140, 255], // indigo
  [80, 200, 255], // cyan spark
  [160, 110, 255], // violet
  [210, 200, 255], // pale star
  [100, 90, 220] // deep purple
];

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

/**
 * 粒子预算刻意克制（≈奖杯级「光层」为主，星点为辅）：
 * 主星 36 + 辅星 28 + 尘埃 24 ≈ 88（远低于 fireworks 194）
 */
function buildParticles(rng) {
  const particles = [];
  const mainN = 36;
  for (let i = 0; i < mainN; i++) {
    const a = (i / mainN) * Math.PI * 2 + (rng() - 0.5) * 0.12;
    const c = pick(rng, PALETTE);
    particles.push({
      kind: "star",
      ang: a,
      speed: lerp(120, 210, rng()),
      birth: i < 12 ? 0 : rng() * 0.04,
      life: lerp(0.7, 0.96, rng()),
      size: lerp(2.8, 4.8, rng()),
      r: c[0],
      g: c[1],
      b: c[2],
      wobble: (rng() - 0.5) * 14,
      spiral: 0.55 + rng() * 0.35
    });
  }
  const sparkN = 28;
  for (let i = 0; i < sparkN; i++) {
    const a = rng() * Math.PI * 2;
    const c = pick(rng, PALETTE);
    particles.push({
      kind: "spark",
      ang: a,
      speed: lerp(70, 180, rng()),
      birth: rng() * 0.08,
      life: lerp(0.55, 0.9, rng()),
      size: lerp(1.7, 3.2, rng()),
      r: c[0],
      g: c[1],
      b: c[2],
      wobble: (rng() - 0.5) * 22,
      spiral: 0.4 + rng() * 0.5
    });
  }
  const dustN = 24;
  for (let i = 0; i < dustN; i++) {
    const a = rng() * Math.PI * 2;
    const c = pick(rng, PALETTE);
    particles.push({
      kind: "dust",
      ang: a,
      speed: lerp(40, 110, rng()),
      birth: 0.04 + rng() * 0.16,
      life: lerp(0.6, 1.0, rng()),
      size: lerp(1.0, 1.9, rng()),
      r: c[0],
      g: c[1],
      b: c[2],
      wobble: (rng() - 0.5) * 18,
      spiral: 0.7 + rng() * 0.4
    });
  }
  return particles;
}

function envelope(tNorm) {
  /* 奖杯式：快亮 → 中段持光 → 尾段干净淡出；末帧由调用方清空 */
  if (tNorm <= 0) return 0.82;
  if (tNorm < 0.08) return lerp(0.82, 1, tNorm / 0.08);
  if (tNorm < 0.55) return 1;
  if (tNorm < 0.86) return lerp(1, 0.55, (tNorm - 0.55) / 0.31);
  return lerp(0.55, 0, (tNorm - 0.86) / 0.14);
}

function particleState(p, tNorm) {
  if (tNorm < p.birth) return null;
  const u = (tNorm - p.birth) / Math.max(0.001, p.life - p.birth);
  if (u >= 1) return null;
  const ease = 1 - Math.pow(1 - clamp(u, 0, 1), 1.45);
  const drag = 1 - 0.18 * ease;
  const dist = p.speed * ease * drag;
  /* 轻微螺旋角偏，保留银河特色 */
  const ang = p.ang + p.spiral * ease * 0.85 + (p.wobble * ease * Math.PI) / 180;
  const x = CX + Math.cos(ang) * dist;
  const y = CY + Math.sin(ang) * dist;
  let alpha;
  if (u < 0.07) alpha = u / 0.07;
  else if (u < 0.58) alpha = 1;
  else alpha = 1 - (u - 0.58) / 0.42;
  alpha = clamp(alpha, 0, 1) * envelope(tNorm);
  if (alpha < 0.02) return null;
  const size = p.size * (1 - 0.18 * ease);
  return { x, y, alpha, size, r: p.r, g: p.g, b: p.b, kind: p.kind, u };
}

/** Soft Bloom：半透明径向晕（奖杯光层核心，非粒子堆叠）；中心抬亮、外圈收紧 */
function drawSoftBloom(ctx, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.02) return;
  const bloom = 0.55 + 0.45 * Math.min(1, tNorm / 0.12);
  const rad = lerp(95, 210, bloom) * (0.92 + 0.08 * e);

  /* 高亮内盘加宽：保证中环仍偏亮紫白（不对齐金色） */
  const g0 = ctx.createRadialGradient(CX, CY, 0, CX, CY, rad * 0.62);
  g0.addColorStop(0, `rgba(255,255,255,${(0.95 * e).toFixed(3)})`);
  g0.addColorStop(0.18, `rgba(245,242,255,${(0.88 * e).toFixed(3)})`);
  g0.addColorStop(0.4, `rgba(220,215,255,${(0.72 * e).toFixed(3)})`);
  g0.addColorStop(0.62, `rgba(185,180,255,${(0.42 * e).toFixed(3)})`);
  g0.addColorStop(0.82, `rgba(150,155,255,${(0.18 * e).toFixed(3)})`);
  g0.addColorStop(1, "rgba(120,130,245,0)");
  ctx.fillStyle = g0;
  ctx.beginPath();
  ctx.arc(CX, CY, rad * 0.62, 0, Math.PI * 2);
  ctx.fill();

  /* 外晕：更快落到透明，减少大面积极淡毛边 */
  const g = ctx.createRadialGradient(CX, CY, rad * 0.4, CX, CY, rad);
  g.addColorStop(0, `rgba(140,150,255,${(0.2 * e).toFixed(3)})`);
  g.addColorStop(0.45, `rgba(95,110,240,${(0.09 * e).toFixed(3)})`);
  g.addColorStop(0.78, `rgba(70,85,200,${(0.03 * e).toFixed(3)})`);
  g.addColorStop(1, "rgba(55,70,170,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(CX, CY, rad, 0, Math.PI * 2);
  ctx.fill();
}

/** 中心高亮核：白紫热核，保证主体可辨 */
function drawCore(ctx, tNorm) {
  const e = envelope(tNorm);
  let flash = 1;
  if (tNorm < 0.06) flash = lerp(0.95, 1.25, tNorm / 0.06);
  else if (tNorm < 0.22) flash = lerp(1.25, 1, (tNorm - 0.06) / 0.16);
  else if (tNorm > 0.62) flash = lerp(1, 0.3, clamp((tNorm - 0.62) / 0.32, 0, 1));
  const intensity = e * flash;
  if (intensity < 0.02) return;

  const rOuter = 28 + intensity * 52;
  const g1 = ctx.createRadialGradient(CX, CY, 0, CX, CY, rOuter);
  g1.addColorStop(0, `rgba(255,255,255,${(0.98 * intensity).toFixed(3)})`);
  g1.addColorStop(0.2, `rgba(235,230,255,${(0.88 * intensity).toFixed(3)})`);
  g1.addColorStop(0.48, `rgba(180,170,255,${(0.5 * intensity).toFixed(3)})`);
  g1.addColorStop(0.78, `rgba(120,120,255,${(0.2 * intensity).toFixed(3)})`);
  g1.addColorStop(1, "rgba(90,100,230,0)");
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.arc(CX, CY, rOuter, 0, Math.PI * 2);
  ctx.fill();

  const rCore = 8 + intensity * 16;
  const g2 = ctx.createRadialGradient(CX, CY, 0, CX, CY, rCore);
  g2.addColorStop(0, `rgba(255,255,255,${(1.0 * intensity).toFixed(3)})`);
  g2.addColorStop(0.4, `rgba(230,225,255,${(0.9 * intensity).toFixed(3)})`);
  g2.addColorStop(1, "rgba(170,160,255,0)");
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(CX, CY, rCore, 0, Math.PI * 2);
  ctx.fill();
}

/** 2 条淡 spiral 臂：银河辨识，用柔光带而非大量粒子 */
function drawSpiralArms(ctx, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.18, 0, 1);
  const maxR = lerp(40, 195, grow);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let arm = 0; arm < 2; arm++) {
    const base = arm * Math.PI + tNorm * 0.35;
    for (let s = 0; s < 18; s++) {
      const t = s / 17;
      const r = maxR * t;
      const ang = base + t * 2.4;
      const x = CX + Math.cos(ang) * r;
      const y = CY + Math.sin(ang) * r;
      const a = e * (0.38 - t * 0.22) * (0.6 + 0.4 * grow);
      if (a < 0.01) continue;
      const rad = lerp(12, 5, t);
      const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(235,230,255,${a.toFixed(3)})`);
      grd.addColorStop(0.45, `rgba(150,150,255,${(a * 0.55).toFixed(3)})`);
      grd.addColorStop(1, "rgba(90,100,230,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawGlowDot(ctx, x, y, size, r, g, b, alpha) {
  const rad = size * 2.35;
  const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
  /* 边缘更亮：中心近白，外圈保留主题色 */
  grd.addColorStop(
    0,
    `rgba(${Math.min(255, r + 90)},${Math.min(255, g + 80)},${Math.min(255, b + 70)},${(
      alpha * 0.98
    ).toFixed(3)})`
  );
  grd.addColorStop(0.32, `rgba(${r},${g},${b},${(alpha * 0.72).toFixed(3)})`);
  grd.addColorStop(0.72, `rgba(${r},${g},${b},${(alpha * 0.28).toFixed(3)})`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(${Math.min(255, r + 55)},${Math.min(255, g + 45)},${Math.min(
    255,
    b + 40
  )},${(alpha * 0.95).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.0, size * 0.58), 0, Math.PI * 2);
  ctx.fill();
}

function renderFrame(particles, tNorm) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, SIZE, SIZE);
  drawSoftBloom(ctx, tNorm);
  drawSpiralArms(ctx, tNorm);
  drawCore(ctx, tNorm);

  const states = [];
  for (let i = 0; i < particles.length; i++) {
    const s = particleState(particles[i], tNorm);
    if (s) states.push(s);
  }
  states.sort((a, b) => {
    const order = { dust: 0, spark: 1, star: 2 };
    return (order[a.kind] || 0) - (order[b.kind] || 0);
  });
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < states.length; i++) {
    const s = states[i];
    drawGlowDot(ctx, s.x, s.y, s.size, s.r, s.g, s.b, s.alpha);
  }
  ctx.restore();
  return canvas.toBuffer("image/png");
}

/** 清除极淡毛边，避免编码后大面积「脏透明」抬高 opaque */
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
    path.join(
      process.env.LOCALAPPDATA || "",
      "Temp",
      "ffmpeg-essentials",
      "ffmpeg-9.0.2-essentials_build",
      "bin",
      "ffmpeg.exe"
    ),
    "ffmpeg"
  ].filter(Boolean);
  for (const c of candidates) {
    if (c === "ffmpeg") return c;
    if (fs.existsSync(c)) return c;
  }
  /* 扫描 download 目录 */
  const root = path.join(process.env.LOCALAPPDATA || "", "Temp", "ffmpeg-essentials");
  if (fs.existsSync(root)) {
    const stack = [root];
    while (stack.length) {
      const d = stack.pop();
      for (const name of fs.readdirSync(d)) {
        const full = path.join(d, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) stack.push(full);
        else if (name.toLowerCase() === "ffmpeg.exe") return full;
      }
    }
  }
  return null;
}

async function encodeAnimatedWebp(frameDir) {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg not found");
  /*
   * 与 fireworks v7 同路径：恒定帧率 + lossless WebP，保留真透明与高光。
   * 31 × (1000/65) ≈ 2015ms，贴近业务 hold 2016ms。
   */
  void DELAYS;
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
      OUT
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-2000));
    throw new Error("ffmpeg webp encode failed: " + r.status);
  }
}

function analyzePng(pngBuf) {
  return sharp(pngBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      const n = info.width * info.height;
      let opaque = 0;
      let bright = 0;
      let softGlow = 0;
      let core = 0;
      let cx = 0;
      let cy = 0;
      let mass = 0;
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
          if (a > 16 && a < 140 && lum > 90) softGlow++;
          const dx = x - info.width / 2;
          const dy = y - info.height / 2;
          if (dx * dx + dy * dy <= coreR2) core++;
          cx += x * a;
          cy += y * a;
          mass += a;
        }
      }
      return {
        opaquePct: +(opaque / n * 100).toFixed(2),
        brightPct: +(bright / n * 100).toFixed(2),
        softGlowPct: +(softGlow / n * 100).toFixed(2),
        corePct: +(core / n * 100).toFixed(2),
        centroid: mass
          ? [Math.round(cx / mass), Math.round(cy / mass)]
          : [0, 0]
      };
    });
}

async function main() {
  const rng = mulberry32(0x6a12026 ^ 0x20261030);
  const particles = buildParticles(rng);
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  console.log("particles", particles.length);

  for (let i = 0; i < PAGES; i++) {
    const tNorm = i / (PAGES - 1);
    let png = renderFrame(particles, tNorm);
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
    const fp = path.join(PREVIEW_DIR, `seq_${String(i).padStart(3, "0")}.png`);
    fs.writeFileSync(fp, png);
    if ([0, 6, 12, 18, 24, 30].includes(i)) {
      const st = await analyzePng(png);
      console.log("frame", i, st);
    }
  }

  await encodeAnimatedWebp(PREVIEW_DIR);

  const meta = await sharp(OUT, { animated: true, pages: -1 }).metadata();
  const delaySum = Array.isArray(meta.delay)
    ? meta.delay.reduce((a, b) => a + (b || 0), 0)
    : 0;
  console.log("wrote", OUT);
  console.log({
    bytes: fs.statSync(OUT).size,
    pages: meta.pages,
    delaySum,
    delayHead: meta.delay?.slice(0, 3),
    delayTail: meta.delay?.slice(-3)
  });

  const peak = await sharp(OUT, { animated: true, page: 12, pages: 1 }).png().toBuffer();
  fs.writeFileSync(path.join(PREVIEW_DIR, "peak_after.png"), peak);
  const dark = await sharp(peak)
    .resize(320, 320, { fit: "contain", background: { r: 10, g: 14, b: 24, alpha: 1 } })
    .flatten({ background: { r: 10, g: 14, b: 24 } })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(PREVIEW_DIR, "peak_after_preview.png"), dark);
  console.log("peak_after", await analyzePng(peak));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
