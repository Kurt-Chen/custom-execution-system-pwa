/**
 * solar-flare：VP8L → VP8+ALPH（对齐 trophy 编码族）
 * 输入：当前正式减雾后的 solar-flare（不得回退到减雾前）
 * 不改 index.html / 其它特效 / trophy
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SRC = path.join(ROOT, "icons", "fx", "fx-power-solar-flare.webp");
const BACKUP = path.join(
  ROOT,
  "icons",
  "fx",
  "_backup_pre_solar_flare_vp8_reencode",
  "fx-power-solar-flare.webp"
);
const OUT_DIR = path.join(ROOT, "_tmp_fx_compare_20261030", "solar_flare_vp8");
const FRAME_DIR = path.join(OUT_DIR, "frames");
const CANDIDATE = path.join(OUT_DIR, "fx-power-solar-flare.vp8alph.webp");
const FFMPEG =
  process.env.FFMPEG_PATH ||
  "C:\\Users\\ASUS\\AppData\\Local\\Temp\\ffmpeg-essentials\\ffmpeg-9.0.2-essentials_build\\bin\\ffmpeg.exe";

function chunkInfo(buf) {
  const s = buf.toString("binary");
  const out = {};
  for (const tag of ["VP8 ", "VP8L", "VP8X", "ANIM", "ANMF", "ALPH"]) {
    let i = 0;
    let n = 0;
    while ((i = s.indexOf(tag, i)) >= 0) {
      n++;
      i += 4;
    }
    if (n) out[tag.trim()] = n;
  }
  return out;
}

async function fogCoreMetrics(src, page = 12) {
  const { data, info } = await sharp(src, { animated: true, page, pages: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const R = w / 2;
  let coreBright = 0;
  let corePix = 0;
  let outerHaze = 0;
  let outerPix = 0;
  let transparent = 0;
  let opaque = 0;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const rn = Math.hypot(x + 0.5 - R, y + 0.5 - R) / R;
      if (a < 8) transparent++;
      else opaque++;
      if (rn < 0.28) {
        corePix++;
        if (a >= 16 && lum > 170 && a > 80) coreBright++;
      } else if (rn >= 0.62 && rn <= 1) {
        outerPix++;
        if (a >= 28 && a <= 200 && lum >= 40 && lum <= 210) outerHaze++;
      }
    }
  }
  return {
    coreBrightPct: +((coreBright / Math.max(1, corePix)) * 100).toFixed(2),
    outerHazePct: +((outerHaze / Math.max(1, outerPix)) * 100).toFixed(2),
    transparentPct: +((transparent / (w * w)) * 100).toFixed(2),
    opaquePct: +((opaque / (w * w)) * 100).toFixed(2)
  };
}

async function peakPng(src, dest, page = 12) {
  await sharp(src, { animated: true, page, pages: 1 })
    .resize(320, 320, {
      fit: "contain",
      background: { r: 248, g: 250, b: 252, alpha: 1 }
    })
    .flatten({ background: { r: 248, g: 250, b: 252 } })
    .png()
    .toFile(dest);
}

async function frameDiffStats(beforeWebp, afterWebp, page = 12) {
  const a = await sharp(beforeWebp, { animated: true, page, pages: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const b = await sharp(afterWebp, { animated: true, page, pages: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  let n = 0;
  let alphaDiff = 0;
  let maxA = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const dr = a.data[i] - b.data[i];
    const dg = a.data[i + 1] - b.data[i + 1];
    const db = a.data[i + 2] - b.data[i + 2];
    const da = a.data[i + 3] - b.data[i + 3];
    sum += dr * dr + dg * dg + db * db;
    alphaDiff += Math.abs(da);
    maxA = Math.max(maxA, Math.abs(da));
    n++;
  }
  const mse = sum / (n * 3);
  const psnr = mse < 1e-6 ? 99 : 10 * Math.log10((255 * 255) / mse);
  return {
    psnr: +psnr.toFixed(2),
    avgAbsAlphaDiff: +(alphaDiff / n).toFixed(2),
    maxAbsAlphaDiff: maxA
  };
}

function encodeVp8Alph(frameDir, outFile, quality) {
  if (!fs.existsSync(FFMPEG)) throw new Error("ffmpeg missing: " + FFMPEG);
  const args = [
    "-y",
    "-framerate",
    "1000/65",
    "-i",
    path.join(frameDir, "seq_%03d.png"),
    "-c:v",
    "libwebp",
    "-lossless",
    "0",
    "-compression_level",
    "4",
    "-quality",
    String(quality),
    "-loop",
    "1",
    "-an",
    outFile
  ];
  const r = spawnSync(FFMPEG, args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-2000));
    throw new Error("ffmpeg failed q=" + quality);
  }
}

async function main() {
  fs.mkdirSync(FRAME_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
  if (!fs.existsSync(BACKUP)) fs.copyFileSync(SRC, BACKUP);
  else fs.copyFileSync(SRC, BACKUP); // refresh backup of "current before this run"

  const beforeBuf = fs.readFileSync(SRC);
  const beforeChunks = chunkInfo(beforeBuf);
  const beforeMeta = await sharp(SRC, { animated: true, pages: -1 }).metadata();
  const pages = beforeMeta.pages || 31;
  console.log("source pages", pages, "chunks", beforeChunks);

  if (!beforeChunks.VP8L) {
    console.warn("source is not VP8L; continuing anyway from current frames");
  }

  for (let p = 0; p < pages; p++) {
    const png = await sharp(SRC, { animated: true, page: p, pages: 1 }).png().toBuffer();
    fs.writeFileSync(path.join(FRAME_DIR, `seq_${String(p).padStart(3, "0")}.png`), png);
  }

  const beforeM = await fogCoreMetrics(SRC);
  const qualities = [92, 88, 85];
  let chosen = null;

  for (const q of qualities) {
    const outQ = path.join(OUT_DIR, `candidate_q${q}.webp`);
    encodeVp8Alph(FRAME_DIR, outQ, q);
    const buf = fs.readFileSync(outQ);
    const chunks = chunkInfo(buf);
    const meta = await sharp(outQ, { animated: true, pages: -1 }).metadata();
    const m = await fogCoreMetrics(outQ);
    const diff = await frameDiffStats(SRC, outQ);
    const row = {
      quality: q,
      bytes: buf.length,
      pages: meta.pages,
      delay: meta.delay && meta.delay[0],
      chunks,
      metrics: m,
      diff,
      path: outQ
    };
    console.log("candidate", JSON.stringify(row));

    const okCodec = (chunks.VP8 || 0) >= pages && (chunks.ALPH || 0) >= pages && !chunks.VP8L;
    const okPages = meta.pages === pages;
    const okCore = Math.abs(m.coreBrightPct - beforeM.coreBrightPct) <= 3;
    // 外圈雾不得明显回升（相对减雾后基线）
    const okFog = m.outerHazePct <= beforeM.outerHazePct + 1.5;
    const okAlpha = diff.avgAbsAlphaDiff < 12 && diff.maxAbsAlphaDiff < 80;
    const okPsnr = diff.psnr >= 28;
    const ok = okCodec && okPages && okCore && okFog && okAlpha && okPsnr;
    row.accept = ok;
    row.gates = { okCodec, okPages, okCore, okFog, okAlpha, okPsnr };
    fs.writeFileSync(path.join(OUT_DIR, `candidate_q${q}.json`), JSON.stringify(row, null, 2));
    if (ok) {
      chosen = row;
      break;
    }
  }

  if (!chosen) {
    console.error("NO_ACCEPTABLE_CANDIDATE — formal asset NOT overwritten");
    process.exit(2);
  }

  fs.copyFileSync(chosen.path, CANDIDATE);
  fs.copyFileSync(chosen.path, SRC);

  await peakPng(BACKUP, path.join(OUT_DIR, "before_peak_white.png"));
  await peakPng(SRC, path.join(OUT_DIR, "after_peak_white.png"));
  await sharp({
    create: { width: 680, height: 360, channels: 3, background: { r: 248, g: 250, b: 252 } }
  })
    .composite([
      { input: path.join(OUT_DIR, "before_peak_white.png"), left: 20, top: 30 },
      { input: path.join(OUT_DIR, "after_peak_white.png"), left: 360, top: 30 }
    ])
    .png()
    .toFile(path.join(OUT_DIR, "compare_before_after_white.png"));

  const afterChunks = chunkInfo(fs.readFileSync(SRC));
  const afterM = await fogCoreMetrics(SRC);
  const report = {
    before: {
      bytes: beforeBuf.length,
      chunks: beforeChunks,
      metrics: beforeM,
      pages,
      delay: beforeMeta.delay && beforeMeta.delay[0]
    },
    after: {
      bytes: fs.statSync(SRC).size,
      chunks: afterChunks,
      metrics: afterM,
      quality: chosen.quality,
      diff: chosen.diff,
      pages: chosen.pages,
      delay: chosen.delay
    },
    backup: BACKUP,
    compare: path.join(OUT_DIR, "compare_before_after_white.png")
  };
  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log("PROMOTED", JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
