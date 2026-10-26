/**
 * 精致飘带彩带 · Canvas 粒子原型 v3
 * 8–14 条加宽平滑长丝带（金为主 + 蓝紫/玫红）：S 形飘动，不团成中心乱结。
 * 约 2s 轻展开 → 飘落旋转 → 自然淡出。API：FxProtoRibbonConfetti.mount
 */
(function (global) {
  "use strict";

  var DEFAULTS = {
    durationMs: 2016,
    sizeCss: 512,
    ribbonCount: 11,
    starCount: 6,
    sparkCount: 9
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

  var PALETTE = {
    gold: [
      [255, 200, 55],
      [251, 191, 36],
      [245, 158, 11],
      [250, 204, 21],
      [253, 224, 71]
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
    if (roll < 0.76) return pick(PALETTE.gold);
    if (roll < 0.9) return pick(PALETTE.violet);
    return pick(PALETTE.rose);
  }

  function pickAccentColor() {
    var roll = Math.random();
    if (roll < 0.48) return pick(PALETTE.gold);
    if (roll < 0.76) return pick(PALETTE.violet);
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

    function makeRibbon(i, total) {
      var s = scale();
      var c = pickRibbonColor();
      var baseAng = (i / total) * Math.PI * 2 + rand(-0.12, 0.12);
      var speed = rand(28, 58) * s;
      var birth = rand(0, 0.1);
      var startR = rand(8, 18) * s;
      return {
        kind: "ribbon",
        x: cx + Math.cos(baseAng) * startR,
        y: cy + Math.sin(baseAng) * startR,
        vx: Math.cos(baseAng) * speed + rand(-8, 8) * s,
        vy: Math.sin(baseAng) * speed * 0.55 + rand(-12, 4) * s,
        life: -birth,
        maxLife: rand(1.85, 2.2),
        len: rand(90, 130) * s,
        width: rand(8, 12) * Math.min(1.15, s),
        heading: baseAng,
        headingV: rand(-0.7, 0.7),
        amp: rand(16, 32) * s,
        ampV: rand(-6, 6) * s,
        freq: rand(1.3, 2.1),
        phase: rand(0, Math.PI * 2),
        phaseV: rand(2.4, 4.2),
        twistV: rand(2.0, 3.6),
        segs: 36,
        r: c[0],
        g: c[1],
        b: c[2],
        r2: Math.max(0, c[0] - 36),
        g2: Math.max(0, c[1] - 24),
        b2: Math.max(0, c[2] - 8)
      };
    }

    function makeStar() {
      var s = scale();
      var c = pickAccentColor();
      var ang = rand(0, Math.PI * 2);
      var speed = rand(22, 55) * s;
      var birth = rand(0.12, 0.4);
      var startR = rand(22, 48) * s;
      return {
        kind: "star",
        x: cx + Math.cos(ang) * startR,
        y: cy + Math.sin(ang) * startR,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: -birth,
        maxLife: rand(1.5, 2.0),
        size: rand(2.0, 3.2) * Math.min(1.1, s),
        rot: rand(0, Math.PI),
        rotV: rand(-2.0, 2.0),
        r: c[0],
        g: c[1],
        b: c[2]
      };
    }

    function makeSpark() {
      var s = scale();
      var c = pickAccentColor();
      var ang = rand(0, Math.PI * 2);
      var speed = rand(18, 48) * s;
      var birth = rand(0.18, 0.5);
      var startR = rand(24, 52) * s;
      return {
        kind: "spark",
        x: cx + Math.cos(ang) * startR,
        y: cy + Math.sin(ang) * startR,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: -birth,
        maxLife: rand(1.3, 1.9),
        size: rand(1.0, 1.6) * Math.min(1.05, s),
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

    function drawSoftCore(tNorm) {
      var intensity;
      if (tNorm < 0.04) intensity = tNorm / 0.04;
      else if (tNorm < 0.1) intensity = 1;
      else intensity = Math.max(0, 1 - (tNorm - 0.1) / 0.28);
      if (intensity <= 0.02) return;
      var s = scale();
      var r = (7 + intensity * 12) * s;
      ctx.globalCompositeOperation = "source-over";
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, "rgba(255,205,70," + (0.18 * intensity).toFixed(3) + ")");
      g.addColorStop(0.65, "rgba(251,191,36," + (0.07 * intensity).toFixed(3) + ")");
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
      if (u < 0.05) a = u / 0.05;
      else if (u < 0.68) a = 1;
      else a = 1 - (u - 0.68) / 0.32;
      return a * fadeOut;
    }

    /**
     * S 形飘带脊线：沿 heading 前进 + 法向正弦摆动（卷曲感），
     * 避免多圈螺旋在中心打结。
     */
    function ribbonSpine(p, tSec) {
      var pts = [];
      var segs = p.segs;
      var grow = clamp((p.life < 0 ? 0 : p.life) / 0.22, 0, 1);
      var len = p.len * (0.4 + 0.6 * grow);
      var amp = p.amp * (0.55 + 0.45 * grow);
      var dirX = Math.cos(p.heading);
      var dirY = Math.sin(p.heading);
      var nX = -dirY;
      var nY = dirX;
      var i;
      for (i = 0; i <= segs; i++) {
        var u = i / segs;
        var along = (u - 0.08) * len;
        var wave =
          Math.sin(p.phase + u * Math.PI * p.freq + tSec * p.phaseV * 0.35) * amp * (0.35 + u);
        /* 末端再加一点回弯，形成长卷曲而不是碎纸 */
        var tipCurl =
          Math.sin(p.phase * 0.7 + u * Math.PI * 1.2 + tSec * 1.1) * amp * 0.35 * u * u;
        var x = p.x + dirX * along + nX * (wave + tipCurl);
        var y = p.y + dirY * along + nY * (wave + tipCurl) + u * u * 8 * scale();
        var twist = Math.sin(p.phase + u * Math.PI * 2.4 + tSec * p.twistV);
        var w = p.width * (1.08 - u * 0.5) * (0.55 + 0.45 * Math.abs(twist));
        /* 切线近似：邻点差分在绘制时用 heading + 波导 */
        var tangAng =
          p.heading +
          Math.cos(p.phase + u * Math.PI * p.freq + tSec * p.phaseV * 0.35) *
            0.55 *
            p.freq *
            (amp / Math.max(24, len));
        var nx = -Math.sin(tangAng);
        var ny = Math.cos(tangAng);
        pts.push({
          x: x,
          y: y,
          w: Math.max(2.4, w),
          nx: nx,
          ny: ny,
          u: u,
          twist: twist
        });
      }
      return pts;
    }

    function drawRibbon(p, alpha, tSec) {
      if (alpha <= 0.02) return;
      var pts = ribbonSpine(p, tSec);
      if (pts.length < 3) return;
      ctx.globalCompositeOperation = "source-over";

      /* 先画圆角描边底，消掉分段锯齿 */
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      var i;
      for (i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.strokeStyle =
        "rgba(" + p.r + "," + p.g + "," + p.b + "," + (alpha * 0.88).toFixed(3) + ")";
      ctx.lineWidth = Math.max(3, p.width * 0.92);
      ctx.stroke();

      /* 分段填充明暗面，增强卷曲立体 */
      for (i = 0; i < pts.length - 1; i++) {
        var a = pts[i];
        var b = pts[i + 1];
        var aHw = a.w * 0.48;
        var bHw = b.w * 0.48;
        var useDark = (a.twist + b.twist) * 0.5 < 0;
        var rr = useDark ? p.r2 : Math.min(255, p.r + 12);
        var gg = useDark ? p.g2 : Math.min(255, p.g + 8);
        var bb = useDark ? p.b2 : Math.min(255, p.b + 4);
        var segA = alpha * (0.7 + 0.25 * (1 - a.u));
        ctx.beginPath();
        ctx.moveTo(a.x + a.nx * aHw, a.y + a.ny * aHw);
        ctx.lineTo(b.x + b.nx * bHw, b.y + b.ny * bHw);
        ctx.lineTo(b.x - b.nx * bHw, b.y - b.ny * bHw);
        ctx.lineTo(a.x - a.nx * aHw, a.y - a.ny * aHw);
        ctx.closePath();
        ctx.fillStyle =
          "rgba(" + rr + "," + gg + "," + bb + "," + segA.toFixed(3) + ")";
        ctx.fill();
      }

      /* 高光细线 */
      ctx.beginPath();
      for (i = 0; i < pts.length; i++) {
        var pt = pts[i];
        var ox = pt.x + pt.nx * pt.w * 0.22;
        var oy = pt.y + pt.ny * pt.w * 0.22;
        if (i === 0) ctx.moveTo(ox, oy);
        else ctx.lineTo(ox, oy);
      }
      ctx.strokeStyle = "rgba(255,248,210," + (alpha * 0.32).toFixed(3) + ")";
      ctx.lineWidth = Math.max(1, p.width * 0.16);
      ctx.stroke();
    }

    function drawStar(p, alpha) {
      if (alpha <= 0.02) return;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalCompositeOperation = "source-over";
      var arm = p.size * 1.65;
      ctx.strokeStyle =
        "rgba(" +
        Math.min(255, p.r + 30) +
        "," +
        Math.min(255, p.g + 22) +
        "," +
        Math.min(255, p.b + 12) +
        "," +
        (alpha * 0.88).toFixed(3) +
        ")";
      ctx.lineWidth = Math.max(1, p.size * 0.3);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-arm, 0);
      ctx.lineTo(arm, 0);
      ctx.moveTo(0, -arm);
      ctx.lineTo(0, arm);
      ctx.stroke();
      ctx.restore();
    }

    function drawSpark(p, alpha) {
      if (alpha <= 0.02) return;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle =
        "rgba(" +
        p.r +
        "," +
        p.g +
        "," +
        p.b +
        "," +
        (alpha * 0.8).toFixed(3) +
        ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    function stepItem(p, dt, tNorm, gravityMul) {
      p.life += dt;
      if (p.life < 0) return;
      var drag = tNorm < 0.5 ? 0.995 : 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(drag, dt * 60);
      p.vy *= Math.pow(drag, dt * 60);
      p.vy += 36 * gravityMul * dt;
      if (p.kind === "ribbon") {
        p.heading += p.headingV * dt;
        p.phase += p.phaseV * dt;
        p.amp += p.ampV * dt;
        p.headingV *= Math.pow(0.99, dt * 60);
        /* 软约束：别飞出正方形太远 */
        var maxR = sizeCss * 0.42;
        var dx = p.x - cx;
        var dy = p.y - cy;
        var dist = Math.hypot(dx, dy);
        if (dist > maxR) {
          p.vx -= (dx / dist) * 30 * dt;
          p.vy -= (dy / dist) * 30 * dt;
        }
      } else if (p.kind === "star") {
        p.rot += p.rotV * dt;
      }
    }

    function step(dt, tNorm) {
      var fadeOut = tNorm < 0.82 ? 1 : 1 - (tNorm - 0.82) / 0.18;
      var i;
      for (i = 0; i < ribbons.length; i++) stepItem(ribbons[i], dt, tNorm, 0.7);
      for (i = 0; i < stars.length; i++) stepItem(stars[i], dt, tNorm, 0.45);
      for (i = 0; i < sparks.length; i++) stepItem(sparks[i], dt, tNorm, 0.55);
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
