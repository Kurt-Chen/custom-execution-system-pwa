/**
 * 凤凰（phoenix）视觉品质对齐奖杯光层 · 第 2 轮
 * 目标：火焰体积光 + 轮廓高光边 + Soft Bloom；保留橙红凤凰形态
 * 约束：31 帧 / ~2015ms；光层为主不堆粒子；不改 trophy / galaxy / 其它 kind
 */
import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";
import sharp from "sharp";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "icons", "fx", "fx-power-phoenix.webp");
const PREVIEW_DIR = path.join(__dirname, "_tmp_fx_compare_20261030", "phoenix_opt_v1");

const SIZE = 512;
const CX = SIZE / 2;
const CY = SIZE / 2;
const PAGES = 31;
const DELAYS = [...Array(29).fill(67), 57, 16];

const PALETTE = [
  [255, 220, 140], // hot gold-white
  [255, 170, 60], // amber
  [255, 110, 40], // orange
  [255, 70, 50], // flame red
  [255, 140, 90], // coral
  [255, 95, 30] // deep ember
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
 * 粒子预算克制：主焰屑 28 + 辅星 22 + 余烬 18 ≈ 68
 * 体积感靠翼形填充与 bloom，不靠堆点
 */
function buildParticles(rng) {
  const particles = [];
  for (let i = 0; i < 28; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const a = -Math.PI / 2 + side * (0.35 + rng() * 1.1) + (rng() - 0.5) * 0.15;
    const c = pick(rng, PALETTE);
    particles.push({
      kind: "ember",
      ang: a,
      speed: lerp(90, 185, rng()),
      birth: i < 10 ? 0 : rng() * 0.05,
      life: lerp(0.65, 0.95, rng()),
      size: lerp(2.4, 4.2, rng()),
      r: c[0],
      g: c[1],
      b: c[2],
      rise: lerp(18, 46, rng())
    });
  }
  for (let i = 0; i < 22; i++) {
    const a = rng() * Math.PI * 2;
    const c = pick(rng, PALETTE);
    particles.push({
      kind: "spark",
      ang: a,
      speed: lerp(55, 150, rng()),
      birth: rng() * 0.1,
      life: lerp(0.5, 0.88, rng()),
      size: lerp(1.5, 2.8, rng()),
      r: c[0],
      g: c[1],
      b: c[2],
      rise: lerp(8, 28, rng())
    });
  }
  for (let i = 0; i < 18; i++) {
    const a = -Math.PI / 2 + (rng() - 0.5) * 2.2;
    const c = pick(rng, PALETTE);
    particles.push({
      kind: "dust",
      ang: a,
      speed: lerp(35, 100, rng()),
      birth: 0.05 + rng() * 0.18,
      life: lerp(0.55, 1.0, rng()),
      size: lerp(1.0, 1.9, rng()),
      r: c[0],
      g: c[1],
      b: c[2],
      rise: lerp(20, 55, rng())
    });
  }
  return particles;
}

function envelope(tNorm) {
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
  const ease = 1 - Math.pow(1 - clamp(u, 0, 1), 1.4);
  const drag = 1 - 0.16 * ease;
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

/** Soft Bloom：半透明橙红径向晕 */
function drawSoftBloom(ctx, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.02) return;
  const bloom = 0.55 + 0.45 * Math.min(1, tNorm / 0.12);
  const rad = lerp(95, 215, bloom) * (0.92 + 0.08 * e);

  const g0 = ctx.createRadialGradient(CX, CY, 0, CX, CY, rad * 0.62);
  g0.addColorStop(0, `rgba(255,252,240,${(0.95 * e).toFixed(3)})`);
  g0.addColorStop(0.18, `rgba(255,235,180,${(0.85 * e).toFixed(3)})`);
  g0.addColorStop(0.4, `rgba(255,190,110,${(0.62 * e).toFixed(3)})`);
  g0.addColorStop(0.65, `rgba(255,120,55,${(0.28 * e).toFixed(3)})`);
  g0.addColorStop(1, "rgba(220,50,35,0)");
  ctx.fillStyle = g0;
  ctx.beginPath();
  ctx.arc(CX, CY, rad * 0.62, 0, Math.PI * 2);
  ctx.fill();

  const g = ctx.createRadialGradient(CX, CY, rad * 0.35, CX, CY, rad);
  g.addColorStop(0, `rgba(255,120,60,${(0.22 * e).toFixed(3)})`);
  g.addColorStop(0.45, `rgba(230,70,45,${(0.1 * e).toFixed(3)})`);
  g.addColorStop(0.78, `rgba(180,40,30,${(0.035 * e).toFixed(3)})`);
  g.addColorStop(1, "rgba(140,30,25,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(CX, CY, rad, 0, Math.PI * 2);
  ctx.fill();
}

/** 中心高亮核：白金→橙（参考奖杯高光层次，色相偏火） */
function drawCore(ctx, tNorm) {
  const e = envelope(tNorm);
  let flash = 1;
  if (tNorm < 0.06) flash = lerp(0.95, 1.25, tNorm / 0.06);
  else if (tNorm < 0.22) flash = lerp(1.25, 1, (tNorm - 0.06) / 0.16);
  else if (tNorm > 0.62) flash = lerp(1, 0.3, clamp((tNorm - 0.62) / 0.32, 0, 1));
  const intensity = e * flash;
  if (intensity < 0.02) return;

  const rOuter = 26 + intensity * 50;
  const g1 = ctx.createRadialGradient(CX, CY, 0, CX, CY, rOuter);
  g1.addColorStop(0, `rgba(255,255,255,${(0.98 * intensity).toFixed(3)})`);
  g1.addColorStop(0.22, `rgba(255,235,180,${(0.9 * intensity).toFixed(3)})`);
  g1.addColorStop(0.5, `rgba(255,170,70,${(0.55 * intensity).toFixed(3)})`);
  g1.addColorStop(0.8, `rgba(255,100,40,${(0.2 * intensity).toFixed(3)})`);
  g1.addColorStop(1, "rgba(230,60,30,0)");
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.arc(CX, CY, rOuter, 0, Math.PI * 2);
  ctx.fill();

  const rCore = 7 + intensity * 15;
  const g2 = ctx.createRadialGradient(CX, CY, 0, CX, CY, rCore);
  g2.addColorStop(0, `rgba(255,255,255,${(1.0 * intensity).toFixed(3)})`);
  g2.addColorStop(0.4, `rgba(255,230,160,${(0.9 * intensity).toFixed(3)})`);
  g2.addColorStop(1, "rgba(255,180,80,0)");
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(CX, CY, rCore, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 凤凰翼形：半透明体积填充 + 高光描边（形态辨识，非粒子堆）
 * grow 控制展开；e 控制整体可见度
 */
function drawPhoenixWings(ctx, tNorm) {
  const e = envelope(tNorm);
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.16, 0, 1);
  const flap = Math.sin(tNorm * Math.PI * 2.2) * 0.04 * (1 - tNorm * 0.5);
  const scale = lerp(0.55, 1.05, grow);

  function strokeWing(side) {
    const s = side;
    const ox = CX;
    const oy = CY + 8;
    ctx.beginPath();
    ctx.moveTo(ox, oy - 18 * scale);
    ctx.bezierCurveTo(
      ox + s * 35 * scale,
      oy - 70 * scale,
      ox + s * (110 + flap * 80) * scale,
      oy - 40 * scale,
      ox + s * (155 + flap * 40) * scale,
      oy + 10 * scale
    );
    ctx.bezierCurveTo(
      ox + s * 130 * scale,
      oy + 55 * scale,
      ox + s * 70 * scale,
      oy + 70 * scale,
      ox + s * 18 * scale,
      oy + 28 * scale
    );
    ctx.bezierCurveTo(
      ox + s * 40 * scale,
      oy + 8 * scale,
      ox + s * 20 * scale,
      oy - 8 * scale,
      ox,
      oy - 18 * scale
    );
    ctx.closePath();
  }

  ctx.save();
  for (const side of [-1, 1]) {
    /* 体积填充：半透明橙红 */
    const fill = ctx.createRadialGradient(
      CX + side * 40 * scale,
      CY,
      8,
      CX + side * 70 * scale,
      CY + 10,
      130 * scale
    );
    fill.addColorStop(0, `rgba(255,240,190,${(0.7 * e).toFixed(3)})`);
    fill.addColorStop(0.3, `rgba(255,175,90,${(0.5 * e).toFixed(3)})`);
    fill.addColorStop(0.6, `rgba(255,110,45,${(0.32 * e).toFixed(3)})`);
    fill.addColorStop(1, `rgba(200,40,30,${(0.05 * e).toFixed(3)})`);
    strokeWing(side);
    ctx.fillStyle = fill;
    ctx.fill();

    /* 高光边缘：外橙晕 + 内近白描边 */
    strokeWing(side);
    ctx.strokeStyle = `rgba(255,150,70,${(0.48 * e).toFixed(3)})`;
    ctx.lineWidth = 6.2;
    ctx.lineJoin = "round";
    ctx.stroke();

    strokeWing(side);
    ctx.strokeStyle = `rgba(255,248,220,${(0.82 * e).toFixed(3)})`;
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }

  /* 躯干 / 羽冠火焰条：强化「凤凰」可读性 */
  const body = ctx.createRadialGradient(CX, CY + 6, 2, CX, CY + 6, 46 * scale);
  body.addColorStop(0, `rgba(255,250,230,${(0.85 * e).toFixed(3)})`);
  body.addColorStop(0.45, `rgba(255,170,70,${(0.55 * e).toFixed(3)})`);
  body.addColorStop(1, "rgba(255,80,40,0)");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(CX, CY + 8, 18 * scale, 42 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  /* 上扬尾羽 / 冠焰 */
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) {
    const ang = -Math.PI / 2 + (i - 2) * 0.18;
    const len = (55 + i * 6) * scale;
    const x1 = CX + Math.cos(ang) * 8;
    const y1 = CY - 10 * scale;
    const x2 = CX + Math.cos(ang) * len;
    const y2 = CY + Math.sin(ang) * len - 20 * scale;
    const grd = ctx.createLinearGradient(x1, y1, x2, y2);
    grd.addColorStop(0, `rgba(255,240,180,${(0.55 * e).toFixed(3)})`);
    grd.addColorStop(0.6, `rgba(255,120,50,${(0.28 * e).toFixed(3)})`);
    grd.addColorStop(1, "rgba(255,60,30,0)");
    ctx.strokeStyle = grd;
    ctx.lineWidth = 4.5 - i * 0.35;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(
      CX + Math.cos(ang + 0.2) * len * 0.45,
      CY + Math.sin(ang) * len * 0.35 - 30 * scale,
      x2,
      y2
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawGlowDot(ctx, x, y, size, r, g, b, alpha) {
  const rad = size * 2.3;
  const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
  grd.addColorStop(
    0,
    `rgba(${Math.min(255, r + 80)},${Math.min(255, g + 70)},${Math.min(255, b + 40)},${(
      alpha * 0.98
    ).toFixed(3)})`
  );
  grd.addColorStop(0.32, `rgba(${r},${g},${b},${(alpha * 0.7).toFixed(3)})`);
  grd.addColorStop(0.72, `rgba(${r},${g},${b},${(alpha * 0.26).toFixed(3)})`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(${Math.min(255, r + 50)},${Math.min(255, g + 40)},${Math.min(
    255,
    b + 25
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
  drawPhoenixWings(ctx, tNorm);
  drawCore(ctx, tNorm);

  const states = [];
  for (let i = 0; i < particles.length; i++) {
    const s = particleState(particles[i], tNorm);
    if (s) states.push(s);
  }
  states.sort((a, b) => {
    const order = { dust: 0, spark: 1, ember: 2 };
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
        centroid: mass ? [Math.round(cx / mass), Math.round(cy / mass)] : [0, 0]
      };
    });
}

async function main() {
  const rng = mulberry32(0xf1a2026 ^ 0x20261030);
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
      console.log("frame", i, await analyzePng(png));
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
  console.log("peak_after", await analyzePng(peak));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
