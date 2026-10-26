/**
 * 精致飘带彩带 · Canvas 粒子原型
 * 8–14 条长卷曲丝带（金为主 + 蓝紫/玫红点缀）+ 少量星芒与微闪光。
 * 独立粒子运动；约 2s 中心展开 → 飘落旋转 → 自然淡出。
 * API：FxProtoRibbonConfetti.create / .mount
 */
(function (global) {
  "use strict";

  var DEFAULTS = {
    durationMs: 2016,
    sizeCss: 512,
    ribbonCount: 11,
    starCount: 8,
    sparkCount: 14
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

  /** 高级明亮色：金为主，蓝紫/玫红点缀 */
  var PALETTE = {
    gold: [
      [255, 196, 48],
      [250, 176, 24],
      [245, 158, 11],
      [234, 179, 8],
      [252, 211, 77]
    ],
    violet: [
      [129, 140, 248],
      [99, 102, 241],
      [167, 139, 250]
    ],
    rose: [
      [244, 114, 182],
      [251, 113, 133],
      [236, 72, 153]
    ]
  };

  function pickRibbonColor() {
    var roll = Math.random();
    if (roll < 0.72) return pick(PALETTE.gold);
    if (roll < 0.88) return pick(PALETTE.violet);
    return pick(PALETTE.rose);
  }

  function pickAccentColor() {
    var roll = Math.random();
    if (roll < 0.55) return pick(PALETTE.gold);
    if (roll < 0.8) return pick(PALETTE.violet);
    return pick(PALETTE.rose);
  }

  function createRibbonConfettiCanvas(canvas, opts) {
    opts = opts || {};
    var durationMs = opts.durationMs != null ? opts.durationMs : DEFAULTS.durationMs;
    var sizeCss = opts.sizeCss != null ? opts.sizeCss : DEFAULTS.sizeCss;
    var ribbonCount =
      opts.ribbonCount != null
        ? clamp(opts.ribbonCount | 0, 8, 14)
        : DEFAULTS.ribbonCount;
    var starCount = opts.starCount != null ? opts.starCount : DEFAULTS.starCount;
    var sparkCount = opts.sparkCount != null ? opts.sparkCount : DEFAULTS.sparkCount;

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
    var ribbons = [];
    var stars = [];
    var sparks = [];

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
      return Math.max(0.55, sizeCss / 260);
    }

    /** 长卷曲丝带：脊线 + 扭转宽度，各自速度/弯曲/相位 */
    function makeRibbon(i, total) {
      var s = scale();
      var c = pickRibbonColor();
      var baseAng = (i / total) * Math.PI * 2 + rand(-0.18, 0.18);
      var speed = rand(70, 145) * s;
      var birth = rand(0.02, 0.14);
      var startR = rand(10, 20) * s;
      return {
        kind: "ribbon",
        x: cx + Math.cos(baseAng) * startR,
        y: cy + Math.sin(baseAng) * startR,
        vx: Math.cos(baseAng) * speed + rand(-18, 18) * s,
        vy: Math.sin(baseAng) * speed * 0.85 + rand(-28, 8) * s,
        life: -birth,
        maxLife: rand(1.55, 2.05),
        len: rand(52, 88) * s,
        width: rand(4.2, 6.8) * Math.min(1.15, s),
        rot: baseAng + rand(-0.4, 0.4),
        rotV: rand(-2.4, 2.4),
        curl: rand(0.55, 1.35) * (Math.random() < 0.5 ? 1 : -1),
        curlV: rand(-0.55, 0.55),
        wave: rand(1.2, 2.4),
        phase: rand(0, Math.PI * 2),
        phaseV: rand(2.2, 4.8),
        segs: 18,
        r: c[0],
        g: c[1],
        b: c[2],
        highlight: Math.random() < 0.55
      };
    }

    function makeStar() {
      var s = scale();
      var c = pickAccentColor();
      var ang = rand(0, Math.PI * 2);
      var speed = rand(55, 130) * s;
      var birth = rand(0.08, 0.28);
      var startR = rand(14, 28) * s;
      return {
        kind: "star",
        x: cx + Math.cos(ang) * startR,
        y: cy + Math.sin(ang) * startR,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: -birth,
        maxLife: rand(1.2, 1.85),
        size: rand(2.4, 4.2) * Math.min(1.1, s),
        rot: rand(0, Math.PI),
        rotV: rand(-3, 3),
        r: c[0],
        g: c[1],
        b: c[2]
      };
    }

    function makeSpark() {
      var s = scale();
      var c = pickAccentColor();
      var ang = rand(0, Math.PI * 2);
      var speed = rand(40, 110) * s;
      var birth = rand(0.12, 0.4);
      var startR = rand(16, 34) * s;
      return {
        kind: "spark",
        x: cx + Math.cos(ang) * startR,
        y: cy + Math.sin(ang) * startR,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: -birth,
        maxLife: rand(1.0, 1.7),
        size: rand(1.1, 2.0) * Math.min(1.05, s),
        r: c[0],
        g: c[1],
        b: c[2]
      };
    }

    function spawnBurst() {
      ribbons = [];
      stars = [];
      sparks = [];
      var i;
      for (i = 0; i < ribbonCount; i++) ribbons.push(makeRibbon(i, ribbonCount));
      for (i = 0; i < starCount; i++) stars.push(makeStar());
      for (i = 0; i < sparkCount; i++) sparks.push(makeSpark());
    }

    function clearFrame() {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** 轻中心金晕：短促、小半径，避免白核过曝与碎片堆叠感 */
    function drawSoftCore(tNorm) {
      var intensity;
      if (tNorm < 0.04) intensity = tNorm / 0.04;
      else if (tNorm < 0.12) intensity = 1;
      else intensity = Math.max(0, 1 - (tNorm - 0.12) / 0.28);
      if (intensity <= 0.02) return;
      var s = scale();
      var r = (10 + intensity * 16) * s;
      ctx.globalCompositeOperation = "source-over";
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, "rgba(255,210,80," + (0.28 * intensity).toFixed(3) + ")");
      g.addColorStop(0.55, "rgba(251,191,36," + (0.12 * intensity).toFixed(3) + ")");
      g.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    function particleAlpha(life, maxLife, fadeOut) {
      if (life < 0) return 0;
      var u = life / maxLife;
      if (u >= 1) return 0;
      var a;
      if (u < 0.08) a = u / 0.08;
      else if (u < 0.55) a = 1;
      else a = 1 - (u - 0.55) / 0.45;
      return a * fadeOut;
    }

    function ribbonSpine(p, tSec) {
      var pts = [];
      var segs = p.segs;
      var i;
      var dirX = Math.cos(p.rot);
      var dirY = Math.sin(p.rot);
      var nX = -dirY;
      var nY = dirX;
      var curlNow = p.curl + Math.sin(p.phase + tSec * 1.4) * 0.35;
      for (i = 0; i <= segs; i++) {
        var u = i / segs;
        /* 沿主方向延伸，叠加弧度与侧向波动，形成长卷曲丝带 */
        var along = (u - 0.15) * p.len;
        var arc = curlNow * u * u * p.len * 0.42;
        var side =
          Math.sin(p.phase + u * Math.PI * p.wave + tSec * p.phaseV * 0.35) *
          p.width *
          (0.9 + u * 1.1);
        var x = p.x + dirX * along + nX * (arc + side);
        var y = p.y + dirY * along + nY * (arc + side);
        /* 扭转：宽度沿长度正弦变化 */
        var twist = 0.35 + 0.65 * Math.abs(Math.sin(p.phase * 0.7 + u * Math.PI + tSec * 1.2));
        var w = p.width * (1.05 - u * 0.55) * twist;
        pts.push({ x: x, y: y, w: w, u: u });
      }
      return pts;
    }

    function drawRibbon(p, alpha, tSec) {
      if (alpha <= 0.02) return;
      var pts = ribbonSpine(p, tSec);
      if (pts.length < 2) return;
      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      /* 底色丝带 */
      ctx.beginPath();
      var i;
      for (i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.strokeStyle =
        "rgba(" + p.r + "," + p.g + "," + p.b + "," + (alpha * 0.92).toFixed(3) + ")";
      ctx.lineWidth = Math.max(1.5, pts[0].w);
      ctx.stroke();

      /* 分段收窄，增强立体卷曲感 */
      for (i = 1; i < pts.length; i++) {
        var a = pts[i - 1];
        var b = pts[i];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        var ua = (a.u + b.u) * 0.5;
        var segA = alpha * (0.55 + 0.45 * (1 - ua));
        ctx.strokeStyle =
          "rgba(" +
          Math.min(255, p.r + 28) +
          "," +
          Math.min(255, p.g + 18) +
          "," +
          Math.min(255, p.b + 8) +
          "," +
          segA.toFixed(3) +
          ")";
        ctx.lineWidth = Math.max(1.2, (a.w + b.w) * 0.5);
        ctx.stroke();
      }

      /* 高光细线（非整带刷白） */
      if (p.highlight && alpha > 0.25) {
        ctx.beginPath();
        for (i = 0; i < pts.length; i++) {
          if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
          else ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.strokeStyle =
          "rgba(255,245,200," + (alpha * 0.28).toFixed(3) + ")";
        ctx.lineWidth = Math.max(0.8, pts[0].w * 0.28);
        ctx.stroke();
      }
    }

    function drawStar(p, alpha) {
      if (alpha <= 0.02) return;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalCompositeOperation = "source-over";
      var arm = p.size * 1.8;
      ctx.strokeStyle =
        "rgba(" +
        Math.min(255, p.r + 40) +
        "," +
        Math.min(255, p.g + 30) +
        "," +
        Math.min(255, p.b + 20) +
        "," +
        (alpha * 0.95).toFixed(3) +
        ")";
      ctx.lineWidth = Math.max(1, p.size * 0.35);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-arm, 0);
      ctx.lineTo(arm, 0);
      ctx.moveTo(0, -arm);
      ctx.lineTo(0, arm);
      ctx.stroke();
      ctx.fillStyle =
        "rgba(255,248,220," + (alpha * 0.55).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawSpark(p, alpha) {
      if (alpha <= 0.02) return;
      ctx.globalCompositeOperation = "source-over";
      var rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 1.6);
      rg.addColorStop(
        0,
        "rgba(" +
          Math.min(255, p.r + 40) +
          "," +
          Math.min(255, p.g + 30) +
          "," +
          Math.min(255, p.b + 15) +
          "," +
          (alpha * 0.9).toFixed(3) +
          ")"
      );
      rg.addColorStop(1, "rgba(" + p.r + "," + p.g + "," + p.b + ",0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    function stepItem(p, dt, tNorm, gravityMul) {
      p.life += dt;
      if (p.life < 0) return;
      var drag = tNorm < 0.4 ? 0.992 : 0.978;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(drag, dt * 60);
      p.vy *= Math.pow(drag, dt * 60);
      p.vy += 55 * gravityMul * dt;
      if (p.kind === "ribbon") {
        p.rot += p.rotV * dt;
        p.curl += p.curlV * dt;
        p.phase += p.phaseV * dt;
        p.rotV *= Math.pow(0.985, dt * 60);
      } else if (p.kind === "star") {
        p.rot += p.rotV * dt;
      }
    }

    function step(dt, tNorm) {
      var fadeOut = tNorm < 0.78 ? 1 : 1 - (tNorm - 0.78) / 0.22;
      var i;
      for (i = 0; i < ribbons.length; i++) stepItem(ribbons[i], dt, tNorm, 0.85);
      for (i = 0; i < stars.length; i++) stepItem(stars[i], dt, tNorm, 0.55);
      for (i = 0; i < sparks.length; i++) stepItem(sparks[i], dt, tNorm, 0.7);
      return fadeOut;
    }

    function frame(ts) {
      if (!running) return;
      if (!startTs) startTs = ts;
      var elapsed = ts - startTs;
      var tNorm = clamp(elapsed / durationMs, 0, 1);
      var dt = Math.min(0.033, (frame._last ? ts - frame._last : 16) / 1000);
      frame._last = ts;
      var tSec = elapsed / 1000;

      var fadeOut = step(dt, tNorm);
      clearFrame();
      drawSoftCore(tNorm);

      var i;
      var p;
      var a;
      /* 先微闪光，再星芒，最后丝带（主体清晰在上层） */
      for (i = 0; i < sparks.length; i++) {
        p = sparks[i];
        a = particleAlpha(p.life, p.maxLife, fadeOut);
        drawSpark(p, a);
      }
      for (i = 0; i < stars.length; i++) {
        p = stars[i];
        a = particleAlpha(p.life, p.maxLife, fadeOut);
        drawStar(p, a);
      }
      for (i = 0; i < ribbons.length; i++) {
        p = ribbons[i];
        a = particleAlpha(p.life, p.maxLife, fadeOut);
        drawRibbon(p, a, tSec);
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
      ribbons = [];
      stars = [];
      sparks = [];
    }

    resize();
    return { play: play, stop: stop, destroy: destroy, resize: resize };
  }

  function mountRibbonConfettiCanvas(host, opts) {
    opts = opts || {};
    var sizeCss = opts.sizeCss != null ? opts.sizeCss : DEFAULTS.sizeCss;
    var fillHost = !!opts.fillHost;
    var canvas = document.createElement("canvas");
    canvas.className = "fx-proto-ribbon-confetti-canvas";
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
    var ctl = createRibbonConfettiCanvas(canvas, opts);
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

  global.FxProtoRibbonConfetti = {
    DEFAULTS: DEFAULTS,
    create: createRibbonConfettiCanvas,
    mount: mountRibbonConfettiCanvas
  };
})(typeof window !== "undefined" ? window : globalThis);
