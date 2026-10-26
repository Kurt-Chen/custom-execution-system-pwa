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
    /* 层1：较粗短光束（再减数量，拉开间距） */
    beamCount: 18,
    /* 层2：外扩独立亮点 */
    sparkCount: 80,
    /* 层3：带彩色拖尾的慢粒子 */
    trailCount: 52
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
    if (roll < 0.34) return pick(PALETTE.gold);
    if (roll < 0.58) return pick(PALETTE.orange);
    if (roll < 0.78) return pick(PALETTE.violet);
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

    /** 层1：较粗短光束 — 明显离开中心再起步，避免核区细线堆叠 */
    function makeBeam(angle) {
      var s = scale();
      var c = pickSaturated();
      var speed = rand(85, 155) * s;
      var birth = rand(0.02, 0.12);
      var startR = rand(12, 22) * s;
      return {
        kind: "beam",
        x: cx + Math.cos(angle) * startR,
        y: cy + Math.sin(angle) * startR,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: -birth,
        maxLife: rand(0.7, 1.15),
        size: rand(3.2, 5.2) * Math.min(1.15, s),
        length: rand(12, 22) * s,
        r: c[0],
        g: c[1],
        b: c[2],
        trail: [],
        delayTrail: true
      };
    }

    /** 层2：外扩独立亮点（饱和色头点，几乎无白核） */
    function makeSpark(angle) {
      var s = scale();
      var c = pickSaturated();
      var speed = rand(100, 210) * s;
      var birth = rand(0.06, 0.22);
      var startR = rand(10, 20) * s;
      return {
        kind: "spark",
        x: cx + Math.cos(angle) * startR,
        y: cy + Math.sin(angle) * startR,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: -birth,
        maxLife: rand(1.05, 1.7),
        size: rand(2.0, 3.6) * Math.min(1.1, s),
        r: c[0],
        g: c[1],
        b: c[2],
        trail: [],
        delayTrail: false
      };
    }

    /** 层3：彩色拖尾粒子（更慢、拖尾更长，贯穿中后段） */
    function makeTrailDot(angle) {
      var s = scale();
      var c = pickSaturated();
      var speed = rand(55, 140) * s;
      var birth = rand(0.1, 0.3);
      var startR = rand(14, 26) * s;
      return {
        kind: "trail",
        x: cx + Math.cos(angle) * startR,
        y: cy + Math.sin(angle) * startR,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: -birth,
        maxLife: rand(1.25, 1.9),
        size: rand(1.6, 2.8) * Math.min(1.1, s),
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
      coreFlash = { life: 0, maxLife: 0.22 };
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

    /** 点状核心：短促、小半径、低不透明度，只点亮一瞬间 */
    function drawCore(tNorm) {
      if (!coreFlash) return;
      var intensity;
      if (tNorm < 0.03) intensity = tNorm / 0.03;
      else if (tNorm < 0.07) intensity = 1;
      else intensity = Math.max(0, 1 - (tNorm - 0.07) / 0.2);
      if (intensity <= 0.01) return;

      var s = scale();
      var rCore = (3.5 + intensity * 5.5) * s;
      var rMid = (8 + intensity * 12) * s;

      ctx.globalCompositeOperation = "source-over";
      var gGold = ctx.createRadialGradient(cx, cy, 0, cx, cy, rMid);
      gGold.addColorStop(0, "rgba(255,180,40," + (0.4 * intensity).toFixed(3) + ")");
      gGold.addColorStop(0.6, "rgba(249,115,22," + (0.14 * intensity).toFixed(3) + ")");
      gGold.addColorStop(1, "rgba(249,115,22,0)");
      ctx.fillStyle = gGold;
      ctx.beginPath();
      ctx.arc(cx, cy, rMid, 0, Math.PI * 2);
      ctx.fill();

      var gCore = ctx.createRadialGradient(cx, cy, 0, cx, cy, rCore);
      gCore.addColorStop(0, "rgba(255,255,255," + (0.55 * intensity).toFixed(3) + ")");
      gCore.addColorStop(0.55, "rgba(255,200,80," + (0.35 * intensity).toFixed(3) + ")");
      gCore.addColorStop(1, "rgba(255,180,40,0)");
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
      /* 先拖尾、再亮点、最后短光束，避免核区细线叠成白团 */
      var i;
      var p;
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        if (p.kind === "trail") drawParticle(p, fadeOut);
      }
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        if (p.kind === "spark") drawParticle(p, fadeOut);
      }
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        if (p.kind === "beam") drawParticle(p, fadeOut);
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
