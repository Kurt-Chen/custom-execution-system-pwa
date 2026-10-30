/**
 * 警告特效第一轮（-1 / -2 / -10）
 * 保留警示属性：红光冲击 / 白热闪核 / 数字可读；禁止套用奖杯金色庆祝风格
 * 时长对齐现网 ≈990–1000ms（30×33ms）
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
const PAGES = 30;
const ROOT = __dirname;
const OUT_ROOT = path.join(ROOT, "_tmp_fx_compare_20261030", "warning_round1");
const BACKUP_ROOT = path.join(ROOT, "icons", "fx", "_backup_pre_warning_round1_20261030");

const KINDS = [
  {
    score: "-1",
    file: "fx-warning-minus1.webp",
    label: "-1",
    intensity: 0.72,
    seed: 0x000001
  },
  {
    score: "-2",
    file: "fx-warning-minus2.webp",
    label: "-2",
    intensity: 0.88,
    seed: 0x000002
  },
  {
    score: "-10",
    file: "fx-warning-minus10.webp",
    label: "-10",
    intensity: 1.0,
    seed: 0x000010
  }
];

function clamp(n, a, b) {
  return n < a ? a : n > b ? b : n;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function rgba(r, g, b, a) {
  return `rgba(${r|0},${g|0},${b|0},${(+a).toFixed(3)})`;
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function envelope(tNorm) {
  /* 警告：更快闪入 → 短暂持压 → 急收；约 1s */
  if (tNorm <= 0) return 0.9;
  if (tNorm < 0.1) return lerp(0.9, 1, tNorm / 0.1);
  if (tNorm < 0.55) return 1;
  if (tNorm < 0.85) return lerp(1, 0.45, (tNorm - 0.55) / 0.3);
  return lerp(0.45, 0, (tNorm - 0.85) / 0.15);
}

function drawWarningBloom(ctx, tNorm, intensity) {
  const e = envelope(tNorm) * intensity;
  if (e < 0.02) return;
  const grow = clamp(tNorm / 0.12, 0, 1);
  const rad = lerp(90, 210, grow);
  const g0 = ctx.createRadialGradient(CX, CY, 0, CX, CY, rad * 0.55);
  g0.addColorStop(0, rgba(255, 240, 235, 0.75 * e));
  g0.addColorStop(0.25, rgba(255, 120, 90, 0.55 * e));
  g0.addColorStop(0.55, rgba(220, 40, 40, 0.28 * e));
  g0.addColorStop(1, rgba(140, 20, 20, 0));
  ctx.fillStyle = g0;
  ctx.beginPath();
  ctx.arc(CX, CY, rad * 0.55, 0, Math.PI * 2);
  ctx.fill();
  const g1 = ctx.createRadialGradient(CX, CY, rad * 0.3, CX, CY, rad);
  g1.addColorStop(0, rgba(200, 40, 40, 0.2 * e));
  g1.addColorStop(0.6, rgba(140, 20, 30, 0.08 * e));
  g1.addColorStop(1, rgba(80, 10, 15, 0));
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.arc(CX, CY, rad, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlashCore(ctx, tNorm, intensity) {
  const e = envelope(tNorm) * intensity;
  let flash = 1;
  if (tNorm < 0.08) flash = lerp(1.05, 1.35, tNorm / 0.08);
  else if (tNorm < 0.25) flash = lerp(1.35, 1, (tNorm - 0.08) / 0.17);
  else if (tNorm > 0.6) flash = lerp(1, 0.25, clamp((tNorm - 0.6) / 0.35, 0, 1));
  const I = e * flash;
  if (I < 0.02) return;
  const r = 22 + I * 48;
  const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, r);
  g.addColorStop(0, rgba(255, 255, 255, 0.98 * I));
  g.addColorStop(0.3, rgba(255, 210, 190, 0.8 * I));
  g.addColorStop(0.65, rgba(255, 80, 60, 0.35 * I));
  g.addColorStop(1, rgba(180, 30, 30, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(CX, CY, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawSlashRing(ctx, tNorm, intensity) {
  const e = envelope(tNorm) * intensity;
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.14, 0, 1);
  const r = lerp(40, 145, grow);
  ctx.save();
  ctx.strokeStyle = rgba(255, 80, 70, 0.7 * e);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(CX, CY, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(255, 240, 230, 0.75 * e);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  /* 警示斜杠 */
  ctx.strokeStyle = rgba(255, 230, 220, 0.85 * e);
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(CX - 55 * grow, CY + 55 * grow);
  ctx.lineTo(CX + 55 * grow, CY - 55 * grow);
  ctx.stroke();
  ctx.restore();
}

function drawLabel(ctx, label, tNorm, intensity) {
  const e = envelope(tNorm) * intensity;
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.12, 0, 1);
  const scale = lerp(0.7, 1.05, grow);
  ctx.save();
  ctx.translate(CX, CY);
  ctx.scale(scale, scale);
  ctx.font = "bold 120px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = rgba(80, 10, 15, 0.55 * e);
  ctx.lineWidth = 14;
  ctx.strokeText(label, 0, 4);
  ctx.fillStyle = rgba(255, 245, 240, 0.95 * e);
  ctx.fillText(label, 0, 4);
  ctx.strokeStyle = rgba(255, 100, 80, 0.55 * e);
  ctx.lineWidth = 4;
  ctx.strokeText(label, 0, 4);
  ctx.restore();
}

function drawSparks(ctx, tNorm, intensity, rng) {
  const e = envelope(tNorm) * intensity;
  if (e < 0.03) return;
  const grow = clamp(tNorm / 0.15, 0, 1);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const n = 28;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rng() * 0.2;
    const dist = lerp(40, 175, grow) * (0.55 + rng() * 0.45);
    const x = CX + Math.cos(ang) * dist;
    const y = CY + Math.sin(ang) * dist;
    const a = e * (0.55 + rng() * 0.4);
    const rad = 2.2 + rng() * 2.8;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.2);
    g.addColorStop(0, rgba(255, 240, 220, a));
    g.addColorStop(0.45, rgba(255, 90, 60, a * 0.55));
    g.addColorStop(1, rgba(180, 30, 30, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function renderFrame(kind, tNorm, rng) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, SIZE, SIZE);
  drawWarningBloom(ctx, tNorm, kind.intensity);
  drawSlashRing(ctx, tNorm, kind.intensity);
  drawFlashCore(ctx, tNorm, kind.intensity);
  drawLabel(ctx, kind.label, tNorm, kind.intensity);
  drawSparks(ctx, tNorm, kind.intensity, rng);
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

async function encode(frameDir, outFile) {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg missing");
  const r = spawnSync(
    ffmpeg,
    [
      "-y",
      "-framerate",
      "1000/33",
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
    throw new Error("encode failed " + outFile);
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

async function processOne(kind) {
  const src = path.join(ROOT, "icons", "fx", kind.file);
  const backupDir = path.join(BACKUP_ROOT, kind.score.replace("-", "m"));
  const frameDir = path.join(OUT_ROOT, kind.score.replace("-", "m"), "frames");
  const reportDir = path.join(OUT_ROOT, kind.score.replace("-", "m"));
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(frameDir, { recursive: true });
  fs.copyFileSync(src, path.join(backupDir, kind.file));
  const before = await metricsOf(src, 12);
  const rng = mulberry32(kind.seed ^ 0x20261030);
  for (let i = 0; i < PAGES; i++) {
    const tNorm = i / (PAGES - 1);
    let png = renderFrame(kind, tNorm, rng);
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
  await encode(frameDir, src);
  const after = await metricsOf(src, 12);
  const meta = await sharp(src, { animated: true, pages: -1 }).metadata();
  await sharp(path.join(backupDir, kind.file), { animated: true, page: 12, pages: 1 })
    .resize(280, 280, { fit: "contain", background: { r: 10, g: 14, b: 24, alpha: 1 } })
    .flatten({ background: { r: 10, g: 14, b: 24 } })
    .png()
    .toFile(path.join(reportDir, "before_peak.png"));
  await sharp(src, { animated: true, page: 12, pages: 1 })
    .resize(280, 280, { fit: "contain", background: { r: 10, g: 14, b: 24, alpha: 1 } })
    .flatten({ background: { r: 10, g: 14, b: 24 } })
    .png()
    .toFile(path.join(reportDir, "after_peak.png"));
  await sharp({
    create: { width: 560, height: 300, channels: 3, background: { r: 10, g: 14, b: 24 } }
  })
    .composite([
      { input: path.join(reportDir, "before_peak.png"), left: 0, top: 10 },
      { input: path.join(reportDir, "after_peak.png"), left: 280, top: 10 }
    ])
    .png()
    .toFile(path.join(reportDir, "compare_before_after.png"));

  const entry = {
    kind: kind.score,
    file: kind.file,
    category: "warning",
    before: { peak: before, bytes: fs.statSync(path.join(backupDir, kind.file)).size },
    after: {
      peak: after,
      bytes: fs.statSync(src).size,
      pages: meta.pages,
      delayMs: Array.isArray(meta.delay) ? meta.delay.reduce((a, b) => a + (b || 0), 0) : 0
    },
    deltas: {
      bright: +(after.brightPct - before.brightPct).toFixed(2),
      opaque: +(after.opaquePct - before.opaquePct).toFixed(2),
      softGlow: +(after.softGlowPct - before.softGlowPct).toFixed(2),
      core: +(after.corePct - before.corePct).toFixed(2)
    },
    backup: path.join("icons/fx/_backup_pre_warning_round1_20261030", kind.score.replace("-", "m"), kind.file),
    compare: path.join("_tmp_fx_compare_20261030/warning_round1", kind.score.replace("-", "m"), "compare_before_after.png"),
    debug: `__debugPlayVictoryFx({mode:'treason',score:${kind.score}})`,
    summary: "红警示 bloom + 白热闪核 + 可读数字；非金色庆祝"
  };
  fs.writeFileSync(path.join(reportDir, "report.json"), JSON.stringify(entry, null, 2));
  console.log(kind.score, "bright", before.brightPct, "->", after.brightPct, "opaque", before.opaquePct, "->", after.opaquePct);
  return entry;
}

async function run() {
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  const trophyBefore = fs.statSync(path.join(ROOT, "icons", "fx", "fx-power-trophy.webp")).size;
  const galaxyBefore = fs.statSync(path.join(ROOT, "icons", "fx", "fx-power-galaxy.webp")).size;
  const phoenixBefore = fs.statSync(path.join(ROOT, "icons", "fx", "fx-power-phoenix.webp")).size;
  const log = [];
  for (const k of KINDS) log.push(await processOne(k));
  if (fs.statSync(path.join(ROOT, "icons", "fx", "fx-power-trophy.webp")).size !== trophyBefore)
    throw new Error("trophy mutated");
  if (fs.statSync(path.join(ROOT, "icons", "fx", "fx-power-galaxy.webp")).size !== galaxyBefore)
    throw new Error("galaxy mutated");
  if (fs.statSync(path.join(ROOT, "icons", "fx", "fx-power-phoenix.webp")).size !== phoenixBefore)
    throw new Error("phoenix mutated");
  fs.writeFileSync(path.join(OUT_ROOT, "BATCH_LOG.json"), JSON.stringify({ items: log }, null, 2));
  console.log("DONE warnings", log.length);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
