/**
 * 金色中心爆发烟花 · Canvas 粒子原型 v2
 * 三层：较粗短光束 / 外扩独立亮点 / 彩色衰减拖尾。
 * 弱化中心白光过曝；饱和金/橙/蓝紫/玫红；约 2s 爆发→减速→消散。
 * 不依赖正式 WebP；API：FxProtoGoldBurst.create / .mount
 */
(function (global) {
  "use strict";

  var DEFAULTS = {
    durationMs: 2000,
    sizeCss: 512,
    /* 层1：较粗短光束（数量刻意少，避免细线堆中心） */
    beamCount: 42,
    /* 层2：外扩独立亮点 */
    sparkCount: 96,
    /* 层3：带彩色拖尾的慢粒子 */
    trailCount: 64
  };

  function clamp(n, a, b) {
    return n < a ? a : n > b ? b : n;
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
  }

  /** 高饱和色板：金 / 橙 / 蓝紫 / 玫红（刻意避开过白的浅色） */
  var PALETTE = {
    gold: [
      [255, 196, 36],
      [250, 168, 12],
      [245, 158, 11],
      [234, 179, 8]
    ],
    orange: [
      [249, 115, 22],
      [234, 88, 12],
      [251, 146, 60],
      [220, 80, 20]
    ],
    violet: [
      [129, 140, 248],
      [99, 102, 241],
      [139, 92, 246],
      [167, 139, 250]
    ],
    rose: [
      [244, 63, 94],
      [225, 29, 72],
      [251, 113, 133],
      [232, 72, 120]
    ]
  };

  function pickSaturated() {
    var roll = Math.random();
    if (roll < 0.42) return pick(PALETTE.gold);
    if (roll < 0.68) return pick(PALETTE.orange);
    if (roll < 0.85) return pick(PALETTE.violet);
    return pick(PALETTE.rose);
  }

  function createGoldBurstCanvas(canvas, opts) {
    opts = opts || {};
    var durationMs = opts.durationMs != null ? opts.durationMs : DEFAULTS.durationMs;
    var sizeCss = opts.sizeCss != null ? opts.sizeCss : DEFAULTS.sizeCss;
    /* 兼容旧参数名 rayCount / emberCount / starCount */
    var beamCount =
      opts.beamCount != null
        ? opts.beamCount
        : opts.rayCount != null
          ? Math.min(48, Math.round(opts.rayCount * 0.28))
          : DEFAULTS.beamCount;
    var sparkCount =
      opts.sparkCount != null ? opts.sparkCount : DEFAULTS.sparkCount;
    var trailCount =
      opts.trailCount != null
        ? opts.trailCount
        : opts.emberCount != null
          ? opts.emberCount
          : DEFAULTS.trailCount;

    var ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    var dpr = 1;
    var W = sizeCss;
    var H = sizeCss;
    var cx = W / 2;
    var cy = H / 2;
    var raf = 0;
    var running = false;
    var startTs = 0;
    var resolvePlay = null;
    var particles = [];
    var coreFlash = null;

    function resize() {
      dpr = Math.min(2.5, Math.max(1, global.devicePixelRatio || 1));
      var cs = canvas.style;
      if (cs.width !== "100%" && cs.height !== "100%") {
        cs.width = sizeCss + "px";
        cs.height = sizeCss + "px";
      }
      canvas.width = Math.round(sizeCss * dpr);
      canvas.height = Math.round(sizeCss * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = sizeCss;
      H = sizeCss;
      cx = W / 2;
      cy = H / 2;
    }

    function scale() {
      return Math.max(0.5, sizeCss / 260);
    }

    /** 层1：较粗短光束 — 从中心附近起步，避免细线堆核 */
    function makeBeam(angle) {
      var s = scale();
      var c = pickSaturated();
      var speed = rand(70, 140) * s;
      var birth = rand(0, 0.08);
      var startR = rand(4, 14) * s;
      return {
        kind: "beam",
        x: cx + Math.cos(angle) * startR,
        y: cy + Math.sin(angle) * startR,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: -birth,
        maxLife: rand(0.55, 0.95),
        size: rand(2.6, 4.4) * Math.min(1.15, s),
        length: rand(14, 28) * s,
        r: c[0],
        g: c[1],
        b: c[2],
        trail: [],
        delayTrail: true
      };
    }

    /** 层2：外扩独立亮点 */
    function makeSpark(angle) {
      var s = scale();
      var c = pickSaturated();
      var speed = rand(90, 200) * s;
      var birth = rand(0.02, 0.16);
      var startR = rand(2, 10) * s;
      return {
        kind: "spark",
        x: cx + Math.cos(angle) * startR,
        y: cy + Math.sin(angle) * startR,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: -birth,
        maxLife: rand(0.85, 1.55),
        size: rand(1.6, 3.2) * Math.min(1.1, s),
        r: c[0],
        g: c[1],
        b: c[2],
        trail: [],
        delayTrail: false
      };
    }

    /** 层3：彩色拖尾粒子（更慢、拖尾更长） */
    function makeTrailDot(angle) {
      var s = scale();
      var c = pickSaturated();
      var speed = rand(50, 130) * s;
      var birth = rand(0.05, 0.22);
      var startR = rand(6, 18) * s;
      return {
        kind: "trail",
        x: cx + Math.cos(angle) * startR,
        y: cy + Math.sin(angle) * startR,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: -birth,
        maxLife: rand(1.05, 1.75),
        size: rand(1.4, 2.6) * Math.min(1.1, s),
        r: c[0],
        g: c[1],
        b: c[2],
        trail: [],
        delayTrail: false
      };
    }

    function spawnBurst() {
      particles = [];
      var i;
      var a;
      /* 光束：均匀角度 + 轻微抖动，数量少 */
      for (i = 0; i < beamCount; i++) {
        a = (i / beamCount) * Math.PI * 2 + rand(-0.06, 0.06);
        particles.push(makeBeam(a));
      }
      for (i = 0; i < sparkCount; i++) {
        particles.push(makeSpark(rand(0, Math.PI * 2)));
      }
      for (i = 0; i < trailCount; i++) {
        particles.push(makeTrailDot(rand(0, Math.PI * 2)));
      }
      coreFlash = { life: 0, maxLife: 0.32 };
    }

    function pushTrail(p) {
      if (p.life < 0) return;
      p.trail.push({ x: p.x, y: p.y });
      var max = p.kind === "trail" ? 12 : p.kind === "beam" ? 6 : 5;
      if (p.trail.length > max) p.trail.shift();
    }

    function clearFrame() {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** 小而亮的核心：面积与不透明度都压低，不吞掉周围色 */
    function drawCore(tNorm) {
      if (!coreFlash) return;
      var intensity;
      if (tNorm < 0.05) intensity = tNorm / 0.05;
      else if (tNorm < 0.12) intensity = 1;
      else intensity = Math.max(0, 1 - (tNorm - 0.12) / 0.38);
      if (intensity <= 0.01) return;

      var s = scale();
      var rCore = (5 + intensity * 10) * s;
      var rMid = (14 + intensity * 22) * s;
      var rOuter = (28 + intensity * 36) * s;

      /* 极轻暗晕，只托一点对比，远小于旧版 */
      ctx.globalCompositeOperation = "source-over";
      var veil = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
      veil.addColorStop(0, "rgba(15,23,42," + (0.18 * intensity).toFixed(3) + ")");
      veil.addColorStop(0.55, "rgba(15,23,42," + (0.06 * intensity).toFixed(3) + ")");
      veil.addColorStop(1, "rgba(15,23,42,0)");
      ctx.fillStyle = veil;
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      ctx.fill();

      /* 金色外晕（非大片白） */
      var gGold = ctx.createRadialGradient(cx, cy, 0, cx, cy, rMid);
      gGold.addColorStop(0, "rgba(255,196,36," + (0.55 * intensity).toFixed(3) + ")");
      gGold.addColorStop(0.55, "rgba(249,115,22," + (0.22 * intensity).toFixed(3) + ")");
      gGold.addColorStop(1, "rgba(249,115,22,0)");
      ctx.fillStyle = gGold;
      ctx.beginPath();
      ctx.arc(cx, cy, rMid, 0, Math.PI * 2);
      ctx.fill();

      /* 小白热核：高亮但半径小 */
      var gCore = ctx.createRadialGradient(cx, cy, 0, cx, cy, rCore);
      gCore.addColorStop(0, "rgba(255,255,255," + (0.85 * intensity).toFixed(3) + ")");
      gCore.addColorStop(0.45, "rgba(255,236,140," + (0.55 * intensity).toFixed(3) + ")");
      gCore.addColorStop(1, "rgba(255,196,36,0)");
      ctx.fillStyle = gCore;
      ctx.beginPath();
      ctx.arc(cx, cy, rCore, 0, Math.PI * 2);
      ctx.fill();
    }

    function particleAlpha(p, fadeOut) {
      if (p.life < 0) return 0;
      var u = p.life / p.maxLife;
      if (u >= 1) return 0;
      var alpha;
      if (u < 0.1) alpha = u / 0.1;
      else if (u < 0.5) alpha = 1;
      else alpha = 1 - (u - 0.5) / 0.5;
      return alpha * fadeOut;
    }

    function drawBeam(p, alpha) {
      var spd = Math.hypot(p.vx, p.vy) || 1;
      var dx = (p.vx / spd) * p.length;
      var dy = (p.vy / spd) * p.length;
      /* source-over 保色，头端略亮但不刷白整条 */
      ctx.globalCompositeOperation = "source-over";
      var grad = ctx.createLinearGradient(p.x - dx, p.y - dy, p.x, p.y);
      grad.addColorStop(0, "rgba(" + p.r + "," + p.g + "," + p.b + ",0)");
      grad.addColorStop(0.4, "rgba(" + p.r + "," + p.g + "," + p.b + "," + (alpha * 0.75).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + p.r + "," + p.g + "," + p.b + "," + (alpha * 0.95).toFixed(3) + ")");
      ctx.strokeStyle = grad;
      ctx.lineWidth = p.size;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x - dx, p.y - dy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      /* 头点：同色高亮，少量白 */
      ctx.fillStyle =
        "rgba(" +
        Math.min(255, p.r + 40) +
        "," +
        Math.min(255, p.g + 30) +
        "," +
        Math.min(255, p.b + 10) +
        "," +
        (alpha * 0.9).toFixed(3) +
        ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawSpark(p, alpha) {
      ctx.globalCompositeOperation = "source-over";
      var rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 1.8);
      rg.addColorStop(
        0,
        "rgba(" +
          Math.min(255, p.r + 50) +
          "," +
          Math.min(255, p.g + 35) +
          "," +
          Math.min(255, p.b + 20) +
          "," +
          (alpha * 0.95).toFixed(3) +
          ")"
      );
      rg.addColorStop(0.4, "rgba(" + p.r + "," + p.g + "," + p.b + "," + (alpha * 0.85).toFixed(3) + ")");
      rg.addColorStop(1, "rgba(" + p.r + "," + p.g + "," + p.b + ",0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawTrailLayer(p, alpha) {
      if (p.trail.length < 2) return;
      ctx.globalCompositeOperation = "source-over";
      var i;
      for (i = 0; i < p.trail.length; i++) {
        var tr = p.trail[i];
        var ta = alpha * (i / (p.trail.length - 1)) * (p.kind === "trail" ? 0.7 : 0.4);
        if (ta < 0.03) continue;
        var sz = p.size * (0.35 + 0.55 * (i / (p.trail.length - 1)));
        ctx.fillStyle = "rgba(" + p.r + "," + p.g + "," + p.b + "," + ta.toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, sz, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawParticle(p, fadeOut) {
      var alpha = particleAlpha(p, fadeOut);
      if (alpha <= 0.01) return;
      if (p.kind === "trail" || p.kind === "beam") drawTrailLayer(p, alpha);
      if (p.kind === "beam") drawBeam(p, alpha);
      else if (p.kind === "spark") {
        drawTrailLayer(p, alpha * 0.7);
        drawSpark(p, alpha);
      } else {
        drawSpark(p, alpha);
      }
    }

    function step(dt, tNorm) {
      /* 前段爆发快，中后段明显减速 */
      var drag = tNorm < 0.35 ? 0.988 : 0.972;
      var gravity = 12;
      var fadeOut = tNorm < 0.72 ? 1 : 1 - (tNorm - 0.72) / 0.28;
      var i;
      var p;
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        p.life += dt;
        if (p.life < 0) continue;
        pushTrail(p);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(drag, dt * 60);
        p.vy *= Math.pow(drag, dt * 60);
        p.vy += gravity * dt * (p.kind === "trail" ? 0.9 : 0.35);
        if (p.kind === "spark") {
          p.vx += rand(-12, 12) * dt;
          p.vy += rand(-12, 12) * dt;
        }
      }
      if (coreFlash) coreFlash.life += dt;
      return fadeOut;
    }

    function frame(ts) {
      if (!running) return;
      if (!startTs) startTs = ts;
      var elapsed = ts - startTs;
      var tNorm = clamp(elapsed / durationMs, 0, 1);
      var dt = Math.min(0.033, (frame._last ? ts - frame._last : 16) / 1000);
      frame._last = ts;

      var fadeOut = step(dt, tNorm);
      clearFrame();
      drawCore(tNorm);
      var i;
      for (i = 0; i < particles.length; i++) {
        drawParticle(particles[i], fadeOut);
      }
      ctx.globalCompositeOperation = "source-over";

      if (tNorm >= 1) {
        running = false;
        raf = 0;
        clearFrame();
        if (resolvePlay) {
          var r = resolvePlay;
          resolvePlay = null;
          r();
        }
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      frame._last = 0;
      startTs = 0;
      clearFrame();
      if (resolvePlay) {
        var r = resolvePlay;
        resolvePlay = null;
        r();
      }
    }

    function play() {
      stop();
      resize();
      spawnBurst();
      running = true;
      startTs = 0;
      frame._last = 0;
      return new Promise(function (resolve) {
        resolvePlay = resolve;
        raf = requestAnimationFrame(frame);
      });
    }

    function destroy() {
      stop();
      particles = [];
      coreFlash = null;
    }

    resize();
    return { play: play, stop: stop, destroy: destroy, resize: resize };
  }

  function mountGoldBurstCanvas(host, opts) {
    opts = opts || {};
    var sizeCss = opts.sizeCss != null ? opts.sizeCss : DEFAULTS.sizeCss;
    var fillHost = !!opts.fillHost;
    var canvas = document.createElement("canvas");
    canvas.className = "fx-proto-gold-burst-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = fillHost
      ? "display:block;width:100%;height:100%;margin:0;padding:0;border:0;background:transparent;pointer-events:none;aspect-ratio:1/1;"
      : "display:block;width:" +
        sizeCss +
        "px;height:" +
        sizeCss +
        "px;max-width:100%;max-height:100%;" +
        "margin:0;padding:0;border:0;background:transparent;pointer-events:none;";
    host.appendChild(canvas);
    if (fillHost) {
      var rect = host.getBoundingClientRect();
      var side = Math.max(
        120,
        Math.round(Math.min(rect.width || 0, rect.height || 0) || sizeCss)
      );
      opts = Object.assign({}, opts, { sizeCss: side });
    }
    var ctl = createGoldBurstCanvas(canvas, opts);
    return {
      canvas: canvas,
      play: ctl.play,
      stop: ctl.stop,
      destroy: function () {
        ctl.destroy();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      },
      resize: ctl.resize
    };
  }

  global.FxProtoGoldBurst = {
    DEFAULTS: DEFAULTS,
    create: createGoldBurstCanvas,
    mount: mountGoldBurstCanvas
  };
})(typeof window !== "undefined" ? window : globalThis);
