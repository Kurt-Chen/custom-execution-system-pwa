/**
 * solar-flare（日晕）第二轮减雾：仅处理本资产，保中心核与太阳主体。
 * - 外圈 bloom alpha 明显下降
 * - 外晕半径略收
 * - 70%～100% 半径更快衰减
 * 不改其它 kind / 触发 / 时长（仍 31×65ms ≈ 2.015s）
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
  "_backup_pre_solar_flare_r2",
  "fx-power-solar-flare.webp"
);
const OUT_DIR = path.join(ROOT, "_tmp_fx_compare_20261030", "solar_flare_r2");
const FRAME_DIR = path.join(OUT_DIR, "frames");
const SIZE = 512;
const CX = SIZE / 2;
const CY = SIZE / 2;

function clamp(n, a, b) {
  return n < a ? a : n > b ? b : n;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
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

/**
 * 实测本资产雾罩集中在 r≈0.45～0.70（更外几乎无像素）。
 * 减雾重心：压该环带 alpha，并把雾外沿从 ~0.70 收到 ~0.60；
 * 在该环带内再按相对位置做 70%～100% 更快衰减。
 */
function radialMul(rn) {
  // 亮核/太阳主体环：不动
  if (rn <= 0.42) return 1;
  // 过渡带：开始轻压
  if (rn <= 0.48) return lerp(1, 0.7, (rn - 0.42) / 0.06);
  // 主雾带（原磁盘主体）：相对位置 0～1 对应 0.48～0.66（外沿再收）
  const fogStart = 0.48;
  const fogEnd = 0.66;
  if (rn >= fogEnd) return 0;
  const t = (rn - fogStart) / (fogEnd - fogStart); // 0..1
  // 前 70% 降到 ~0.18；后 30%（相对 70%～100%）幂次加速到 0
  if (t <= 0.7) {
    return lerp(0.7, 0.18, t / 0.7);
  }
  const u = (t - 0.7) / 0.3;
  return 0.18 * Math.pow(1 - u, 2.5);
}

/** 雾罩像素额外衰减；亮核 / 硬射线保护 */
function hazeExtra(rn, lum, a, sat) {
  const hardCore = rn < 0.42 && lum > 185 && a > 100;
  if (hardCore) return 1;
  // 放射细芒：尽量保留，仅外沿略淡
  const hardRay = lum > 170 && a > 90 && sat > 0.3;
  if (hardRay) {
    if (rn <= 0.5) return 1;
    if (rn <= 0.62) return lerp(1, 0.75, (rn - 0.5) / 0.12);
    return lerp(0.75, 0.2, clamp((rn - 0.62) / 0.1, 0, 1));
  }
  // 半透明橙雾盘（主因）：强压；0.48～0.58 是玻璃罩主体
  if (a >= 24 && lum >= 30 && lum <= 230) {
    if (rn <= 0.44) return 0.95;
    if (rn <= 0.5) return lerp(0.7, 0.4, (rn - 0.44) / 0.06);
    if (rn <= 0.56) return lerp(0.4, 0.16, (rn - 0.5) / 0.06);
    if (rn <= 0.62) return lerp(0.16, 0.05, (rn - 0.56) / 0.06);
    return lerp(0.05, 0.01, clamp((rn - 0.62) / 0.08, 0, 1));
  }
  return 1;
}

function defogFrame(data, w, h) {
  const out = Buffer.from(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a0 = out[i + 3];
      if (a0 < 8) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
        continue;
      }
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx ? (mx - mn) / mx : 0;
      const dx = x + 0.5 - CX;
      const dy = y + 0.5 - CY;
      const rn = Math.sqrt(dx * dx + dy * dy) / (SIZE / 2);

      let mul = radialMul(rn) * hazeExtra(rn, lum, a0, sat);
      // 中心亮核：强制不削弱 RGB，alpha 不低于原值
      if (rn < 0.32 && lum > 160 && a0 > 80) {
        mul = Math.max(mul, 1);
      }
      const a1 = Math.round(a0 * mul);
      if (a1 < 10) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 0;
      } else {
        out[i + 3] = clamp(a1, 0, 255);
      }
    }
  }
  return out;
}

async function fogMetrics(src, page = 12) {
  const { data, info } = await sharp(src, { animated: true, page, pages: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const R = w / 2;
  let outerFog = 0;
  let outerHaze = 0;
  let outerPix = 0;
  let outerA = 0;
  let coreBright = 0;
  let corePix = 0;
  const ring = { r55: [], r70: [], r85: [], r95: [] };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const dx = x - R + 0.5;
      const dy = y - R + 0.5;
      const rn = Math.sqrt(dx * dx + dy * dy) / R;
      if (rn > 1.02) continue;
      if (rn < 0.28) {
        corePix++;
        if (a >= 16 && lum > 170 && a > 80) coreBright++;
      } else if (rn <= 1) {
        if (rn >= 0.62) {
          outerPix++;
          if (a >= 16) {
            outerFog++;
            outerA += a;
            if (a >= 28 && a <= 200 && lum >= 40 && lum <= 210) outerHaze++;
          }
        }
      }
      if (Math.abs(rn - 0.55) < 0.025 && a > 0) ring.r55.push(a);
      if (Math.abs(rn - 0.7) < 0.025 && a > 0) ring.r70.push(a);
      if (Math.abs(rn - 0.85) < 0.025 && a > 0) ring.r85.push(a);
      if (Math.abs(rn - 0.95) < 0.025 && a > 0) ring.r95.push(a);
    }
  }
  const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  return {
    coreBrightPct: +((coreBright / Math.max(1, corePix)) * 100).toFixed(2),
    outerFogCoverPct: +((outerFog / Math.max(1, outerPix)) * 100).toFixed(2),
    outerHazePct: +((outerHaze / Math.max(1, outerPix)) * 100).toFixed(2),
    avgOuterAlpha: +(outerFog ? outerA / outerFog : 0).toFixed(1),
    ringAvgA: {
      r55: +avg(ring.r55).toFixed(1),
      r70: +avg(ring.r70).toFixed(1),
      r85: +avg(ring.r85).toFixed(1),
      r95: +avg(ring.r95).toFixed(1)
    }
  };
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
    console.error(r.stderr?.slice(-2000));
    throw new Error("ffmpeg encode failed");
  }
}

async function writeCompare(beforeSrc, afterSrc) {
  const beforePeak = path.join(OUT_DIR, "before_peak.png");
  const afterPeak = path.join(OUT_DIR, "after_peak.png");
  const onWhiteBefore = path.join(OUT_DIR, "before_on_white.png");
  const onWhiteAfter = path.join(OUT_DIR, "after_on_white.png");
  async function peak(src, dest, bg) {
    await sharp(src, { animated: true, page: 12, pages: 1 })
      .resize(320, 320, { fit: "contain", background: bg })
      .flatten({ background: bg })
      .png()
      .toFile(dest);
  }
  await peak(beforeSrc, beforePeak, { r: 10, g: 14, b: 24, alpha: 1 });
  await peak(afterSrc, afterPeak, { r: 10, g: 14, b: 24, alpha: 1 });
  await peak(beforeSrc, onWhiteBefore, { r: 248, g: 250, b: 252, alpha: 1 });
  await peak(afterSrc, onWhiteAfter, { r: 248, g: 250, b: 252, alpha: 1 });

  await sharp({
    create: { width: 680, height: 360, channels: 3, background: { r: 10, g: 14, b: 24 } }
  })
    .composite([
      { input: beforePeak, left: 20, top: 30 },
      { input: afterPeak, left: 360, top: 30 }
    ])
    .png()
    .toFile(path.join(OUT_DIR, "compare_before_after_dark.png"));

  await sharp({
    create: { width: 680, height: 360, channels: 3, background: { r: 248, g: 250, b: 252 } }
  })
    .composite([
      { input: onWhiteBefore, left: 20, top: 30 },
      { input: onWhiteAfter, left: 360, top: 30 }
    ])
    .png()
    .toFile(path.join(OUT_DIR, "compare_before_after_white.png"));
}

async function main() {
  fs.mkdirSync(FRAME_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP)) {
    fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
    fs.copyFileSync(SRC, BACKUP);
  }
  // 始终从备份读取，避免重复跑脚本叠压
  const input = BACKUP;
  const meta = await sharp(input, { animated: true, pages: -1 }).metadata();
  const pages = meta.pages || 1;
  console.log("pages", pages, "from backup", BACKUP);

  const beforeM = await fogMetrics(input, Math.min(12, pages - 1));
  console.log("BEFORE", beforeM);

  for (let p = 0; p < pages; p++) {
    const { data, info } = await sharp(input, { animated: true, page: p, pages: 1 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const defogged = defogFrame(data, info.width, info.height);
    const png = await sharp(defogged, {
      raw: { width: info.width, height: info.height, channels: 4 }
    })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(FRAME_DIR, `seq_${String(p).padStart(3, "0")}.png`), png);
    if (p % 5 === 0) console.log("frame", p);
  }

  const tmpOut = path.join(OUT_DIR, "fx-power-solar-flare.webp");
  await encodeAnimatedWebp(FRAME_DIR, tmpOut);
  fs.copyFileSync(tmpOut, SRC);

  const afterM = await fogMetrics(SRC, Math.min(12, pages - 1));
  console.log("AFTER", afterM);
  await writeCompare(input, SRC);

  const report = {
    kind: "solar-flare",
    pages,
    delayMs: 65,
    durationMsApprox: pages * 65,
    before: beforeM,
    after: afterM,
    backup: BACKUP,
    out: SRC,
    compare: {
      dark: path.join(OUT_DIR, "compare_before_after_dark.png"),
      white: path.join(OUT_DIR, "compare_before_after_white.png")
    }
  };
  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log("DONE", OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
