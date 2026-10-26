/**
 * 金色中心爆发烟花 · Canvas 粒子原型（独立模块，不依赖正式 WebP）。
 * 粒子由坐标 / 速度 / 透明度 / 生命周期驱动；约 2s 完整爆发→消散。
 */
(function (global) {
  "use strict";

  var DEFAULTS = {
    durationMs: 2000,
    /* 逻辑画布边长（CSS px）；实际缓冲按 devicePixelRatio 放大 */
    sizeCss: 512,
    rayCount: 140,
    sparkCount: 220,
    starCount: 28,
    emberCount: 90
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

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @returns {{ play: function(): Promise<void>, stop: function(): void, destroy: function(): void }}
   */
  function createGoldBurstCanvas(canvas, opts) {
    opts = opts || {};
    var durationMs = opts.durationMs != null ? opts.durationMs : DEFAULTS.durationMs;
    var sizeCss = opts.sizeCss != null ? opts.sizeCss : DEFAULTS.sizeCss;
    var rayCount = opts.rayCount != null ? opts.rayCount : DEFAULTS.rayCount;
    var sparkCount = opts.sparkCount != null ? opts.sparkCount : DEFAULTS.sparkCount;
    var starCount = opts.starCount != null ? opts.starCount : DEFAULTS.starCount;
    var emberCount = opts.emberCount != null ? opts.emberCount : DEFAULTS.emberCount;

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

    var GOLD = [
      [255, 250, 220],
      [255, 236, 140],
      [255, 214, 72],
      [251, 191, 36],
      [245, 158, 11],
      [252, 211, 77]
    ];
    var WHITE_HOT = [255, 255, 245];

    function resize() {
      dpr = Math.min(2.5, Math.max(1, global.devicePixelRatio || 1));
      /* 若宿主已用百分比铺满，勿写死 px，以免冲掉 fillHost 布局 */
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

    function makeRay(angle, speedBoost) {
      var speed = rand(95, 210) * (speedBoost || 1);
      var c = pick(GOLD);
      return {
        kind: "ray",
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: rand(0.85, 1.55),
        size: rand(1.1, 2.4),
        length: rand(18, 42),
        r: c[0],
        g: c[1],
        b: c[2],
        trail: []
      };
    }

    function makeSpark(angle) {
      var speed = rand(40, 160);
      var c = Math.random() < 0.25 ? WHITE_HOT : pick(GOLD);
      return {
        kind: "spark",
        x: cx + rand(-2, 2),
        y: cy + rand(-2, 2),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: rand(0.7, 1.7),
        size: rand(0.7, 1.8),
        r: c[0],
        g: c[1],
        b: c[2],
        trail: []
      };
    }

    function makeStar(angle) {
      var speed = rand(55, 130);
      var c = pick(GOLD);
      return {
        kind: "star",
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: rand(1.0, 1.8),
        size: rand(3.2, 6.5),
        spin: rand(-4, 4),
        rot: rand(0, Math.PI * 2),
        r: c[0],
        g: c[1],
        b: c[2],
        trail: []
      };
    }

    function makeEmber(angle) {
      var speed = rand(20, 70);
      var c = pick(GOLD);
      return {
        kind: "ember",
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: rand(1.1, 1.95),
        size: rand(1.4, 3.2),
        r: c[0],
        g: c[1],
        b: c[2],
        trail: []
      };
    }

    function spawnBurst() {
      particles = [];
      var i;
      for (i = 0; i < rayCount; i++) {
        var a = (i / rayCount) * Math.PI * 2 + rand(-0.04, 0.04);
        particles.push(makeRay(a, i % 3 === 0 ? 1.15 : 1));
      }
      /* 第二层稍慢的密集射线，增强层次 */
      for (i = 0; i < (rayCount * 0.45) | 0; i++) {
        particles.push(makeRay(rand(0, Math.PI * 2), 0.72));
      }
      for (i = 0; i < sparkCount; i++) {
        particles.push(makeSpark(rand(0, Math.PI * 2)));
      }
      for (i = 0; i < starCount; i++) {
        particles.push(makeStar(rand(0, Math.PI * 2)));
      }
      for (i = 0; i < emberCount; i++) {
        particles.push(makeEmber(rand(0, Math.PI * 2)));
      }
      coreFlash = {
        life: 0,
        maxLife: 0.55,
        peak: 1
      };
    }

    function pushTrail(p) {
      p.trail.push({ x: p.x, y: p.y, a: 1 });
      var max = p.kind === "ray" ? 10 : p.kind === "spark" ? 6 : 4;
      if (p.trail.length > max) p.trail.shift();
    }

    function drawStarShape(x, y, spikes, outer, inner, rot) {
      var step = Math.PI / spikes;
      var i;
      ctx.beginPath();
      for (i = 0; i < spikes * 2; i++) {
        var r = i % 2 === 0 ? outer : inner;
        var ang = rot + i * step - Math.PI / 2;
        var px = x + Math.cos(ang) * r;
        var py = y + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }

    function clearFrame() {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawCore(tNorm, flashAge) {
      if (!coreFlash) return;
      var flashT = clamp(flashAge / coreFlash.maxLife, 0, 1);
      /* 前 12% 极亮爆发，其后缓慢收 */
      var intensity;
      if (tNorm < 0.08) intensity = tNorm / 0.08;
      else if (tNorm < 0.22) intensity = 1;
      else intensity = Math.max(0, 1 - (tNorm - 0.22) / 0.55);
      intensity *= 1 - flashT * 0.35;

      var r0 = 10 + intensity * 28;
      var r1 = 36 + intensity * 70;
      var r2 = 70 + intensity * 120;

      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r2);
      g.addColorStop(0, "rgba(255,255,250," + (0.95 * intensity).toFixed(3) + ")");
      g.addColorStop(0.12, "rgba(255,240,160," + (0.85 * intensity).toFixed(3) + ")");
      g.addColorStop(0.35, "rgba(251,191,36," + (0.45 * intensity).toFixed(3) + ")");
      g.addColorStop(0.65, "rgba(245,158,11," + (0.18 * intensity).toFixed(3) + ")");
      g.addColorStop(1, "rgba(245,158,11,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r2, 0, Math.PI * 2);
      ctx.fill();

      /* 白热内核 */
      var g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r0);
      g2.addColorStop(0, "rgba(255,255,255," + (1 * intensity).toFixed(3) + ")");
      g2.addColorStop(0.5, "rgba(255,250,220," + (0.9 * intensity).toFixed(3) + ")");
      g2.addColorStop(1, "rgba(255,214,72,0)");
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(cx, cy, r1, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawParticle(p, fadeOut) {
      var u = p.life / p.maxLife;
      if (u >= 1) return;
      /* 出生快亮 → 中段稳 → 末段消散 */
      var alpha;
      if (u < 0.08) alpha = u / 0.08;
      else if (u < 0.55) alpha = 1;
      else alpha = 1 - (u - 0.55) / 0.45;
      alpha *= fadeOut;
      if (alpha <= 0.01) return;

      var i;
      var tr;
      /* 拖尾 */
      if (p.trail.length > 1) {
        for (i = 0; i < p.trail.length; i++) {
          tr = p.trail[i];
          var ta = alpha * (i / p.trail.length) * 0.55;
          if (ta < 0.02) continue;
          ctx.fillStyle =
            "rgba(" + p.r + "," + p.g + "," + p.b + "," + ta.toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(tr.x, tr.y, p.size * (0.35 + 0.4 * (i / p.trail.length)), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (p.kind === "ray") {
        var spd = Math.hypot(p.vx, p.vy) || 1;
        var dx = (p.vx / spd) * p.length;
        var dy = (p.vy / spd) * p.length;
        var grad = ctx.createLinearGradient(p.x - dx, p.y - dy, p.x + dx * 0.15, p.y + dy * 0.15);
        grad.addColorStop(0, "rgba(" + p.r + "," + p.g + "," + p.b + ",0)");
        grad.addColorStop(0.55, "rgba(" + p.r + "," + p.g + "," + p.b + "," + (alpha * 0.85).toFixed(3) + ")");
        grad.addColorStop(1, "rgba(255,255,245," + (alpha * 0.95).toFixed(3) + ")");
        ctx.strokeStyle = grad;
        ctx.lineWidth = p.size;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x - dx, p.y - dy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        /* 头点高光 */
        ctx.fillStyle = "rgba(255,255,250," + (alpha * 0.95).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.85, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "star") {
        ctx.fillStyle =
          "rgba(" + p.r + "," + p.g + "," + p.b + "," + (alpha * 0.95).toFixed(3) + ")";
        drawStarShape(p.x, p.y, 5, p.size, p.size * 0.42, p.rot);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,245," + (alpha * 0.7).toFixed(3) + ")";
        drawStarShape(p.x, p.y, 5, p.size * 0.55, p.size * 0.22, p.rot);
        ctx.fill();
      } else {
        var rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.2);
        rg.addColorStop(0, "rgba(255,255,245," + (alpha).toFixed(3) + ")");
        rg.addColorStop(0.35, "rgba(" + p.r + "," + p.g + "," + p.b + "," + (alpha * 0.9).toFixed(3) + ")");
        rg.addColorStop(1, "rgba(" + p.r + "," + p.g + "," + p.b + ",0)");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function step(dt, tNorm) {
      var drag = 0.985;
      var gravity = 18;
      var fadeOut = tNorm < 0.75 ? 1 : 1 - (tNorm - 0.75) / 0.25;
      var i;
      var p;
      for (i = 0; i < particles.length; i++) {
        p = particles[i];
        p.life += dt;
        pushTrail(p);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(drag, dt * 60);
        p.vy *= Math.pow(drag, dt * 60);
        p.vy += gravity * dt * (p.kind === "ember" ? 1.2 : 0.35);
        if (p.kind === "star") p.rot += p.spin * dt;
        /* 轻微随机抖动，避免机械放射感 */
        if (p.kind === "spark" || p.kind === "ember") {
          p.vx += rand(-8, 8) * dt;
          p.vy += rand(-8, 8) * dt;
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
      var dt = Math.min(0.033, (frame._last ? (ts - frame._last) : 16) / 1000);
      frame._last = ts;

      var fadeOut = step(dt, tNorm);
      clearFrame();
      ctx.globalCompositeOperation = "lighter";
      drawCore(tNorm, coreFlash ? coreFlash.life : 0);
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

  /**
   * 挂到宿主元素（正方形壳），返回控制器。
   * @param {HTMLElement} host
   * @param {object} [opts]
   */
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
    /* fillHost：按宿主实测边长驱动粒子坐标系，避免逻辑 512 被压成糊点 */
    if (fillHost) {
      var rect = host.getBoundingClientRect();
      var side = Math.max(120, Math.round(Math.min(rect.width || 0, rect.height || 0) || sizeCss));
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
