/* Full scenes behind the typewriter, one per ambience. Everything is painted in code.
   Each scene is built from layers at different depths: far layers move a little as the pointer moves,
   near layers move more, which gives a gentle sense of depth. Static layers are painted once; only
   the moving parts (water, flames, snow, fireflies...) are drawn every frame. */
const Scenes = (() => {
  const TAU = Math.PI * 2;
  const M = 56; // extra width painted on each side so layers can shift without showing an edge
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (k) => k * k * (3 - 2 * k);

  // ---------------- painting helpers ----------------
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function lin(g, x0, y0, x1, y1, stops) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    return gr;
  }
  function blob(g, x, y, r, stops) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  /** A static layer: painted once on a canvas a little wider than the screen. */
  function layer(W, H, depth, paint) {
    const w = W + M * 2;
    const c = makeCanvas(w, H);
    paint(c.getContext('2d'), w, H);
    return { c, depth };
  }
  /** Run `fn` in the coordinate space of a layer at `depth` (x from 0 to W + 2M). */
  function at(ctx, P, depth, fn) {
    ctx.save();
    ctx.translate(-M + P.x * depth * M, P.y * depth * 12);
    fn();
    ctx.restore();
  }
  const show = (ctx, P, L) => at(ctx, P, L.depth, () => ctx.drawImage(L.c, 0, 0));

  /** A rolling silhouette (hills, mountains) filled down to `bottom`. */
  function ridge(g, w, base, amp, fill, opt = {}) {
    const ph = [rnd(0, TAU), rnd(0, TAU), rnd(0, TAU), rnd(0, TAU)];
    const fr = opt.freq || 1, sharp = opt.sharp || 0;
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(0, opt.bottom ?? base + amp * 4);
    for (let x = 0; x <= w + 4; x += 4) {
      const u = (x / w) * fr;
      let v = 0.5 * Math.sin(u * TAU * 1.0 + ph[0]) + 0.3 * Math.sin(u * TAU * 2.3 + ph[1]) + 0.2 * Math.sin(u * TAU * 5.1 + ph[2]);
      if (sharp) v = v * (1 - sharp) + sharp * (1 - 2 * Math.abs(Math.sin(u * TAU * 3.2 + ph[3])));
      g.lineTo(x, base - amp * (0.5 + 0.5 * v));
    }
    g.lineTo(w + 4, opt.bottom ?? base + amp * 4);
    g.closePath();
    g.fill();
  }

  function pine(g, x, y, h, color, snow) {
    const w = h * 0.46;
    for (let i = 0; i < 4; i++) {
      const ty = y - h + i * h * 0.21;
      const tw = w * (0.32 + i * 0.23);
      g.fillStyle = color;
      g.beginPath(); g.moveTo(x, ty); g.lineTo(x - tw / 2, ty + h * 0.33); g.lineTo(x + tw / 2, ty + h * 0.33); g.closePath(); g.fill();
      if (snow) {
        g.fillStyle = snow;
        g.beginPath(); g.moveTo(x, ty + 1); g.lineTo(x - tw * 0.32, ty + h * 0.2); g.lineTo(x - tw * 0.05, ty + h * 0.13); g.lineTo(x + tw * 0.22, ty + h * 0.18); g.closePath(); g.fill();
      }
    }
    g.fillStyle = color;
    g.fillRect(x - h * 0.025, y - h * 0.05, h * 0.05, h * 0.07);
  }

  function cloudSprite(w, h, rgb, alpha) {
    const c = makeCanvas(w, h), g = c.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const x = rnd(0.18, 0.82) * w, y = rnd(0.42, 0.68) * h, r = rnd(0.1, 0.24) * w;
      blob(g, x, y, r, [[0, `rgba(${rgb},${alpha})`], [0.55, `rgba(${rgb},${alpha * 0.5})`], [1, `rgba(${rgb},0)`]]);
    }
    return c;
  }

  function books(g, x0, x1, y0, y1) {
    const palette = ['#5a2a22', '#2e3b2a', '#3c2f4a', '#6b5a3a', '#243548', '#4a1f1f', '#3b4a3a', '#5e4630', '#2a2a36'];
    let x = x0;
    while (x < x1 - 6) {
      const bw = rnd(7, 17), bh = (y1 - y0) * rnd(0.68, 0.95);
      g.fillStyle = pick(palette);
      if (Math.random() < 0.06 && x + bh * 0.4 < x1) { // a leaning book
        g.save(); g.translate(x, y1); g.rotate(-0.35); g.fillRect(0, -bw, bh, bw); g.restore();
        x += bh * 0.4; continue;
      }
      g.fillRect(x, y1 - bh, bw - 1, bh);
      g.fillStyle = 'rgba(214,178,94,.35)';
      g.fillRect(x + 1, y1 - bh * 0.82, bw - 3, 1.5);
      g.fillRect(x + 1, y1 - bh * 0.25, bw - 3, 1.5);
      g.fillStyle = 'rgba(255,255,255,.06)';
      g.fillRect(x, y1 - bh, 2, bh);
      x += bw;
    }
  }

  function bookcase(g, x0, x1, top, floor, rows) {
    g.fillStyle = '#24150c';
    g.fillRect(x0, top, x1 - x0, floor - top);
    const rh = (floor - top - 24) / rows;
    for (let r = 0; r < rows; r++) {
      const y0 = top + 14 + r * rh, y1 = y0 + rh - 10;
      g.fillStyle = '#120a05';
      g.fillRect(x0 + 10, y0, x1 - x0 - 20, rh - 10);
      books(g, x0 + 12, x1 - 12, y0 + 6, y1);
      g.fillStyle = '#3a2414';
      g.fillRect(x0 + 6, y1, x1 - x0 - 12, 8);
      g.fillStyle = 'rgba(255,255,255,.07)';
      g.fillRect(x0 + 6, y1, x1 - x0 - 12, 1.5);
    }
  }

  function drawBird(ctx, x, y, s, flap, color) {
    const f = Math.sin(flap);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, s * 0.13);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s, y - s * 0.15 - s * 0.35 * f);
    ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.45 - s * 0.3 * f, x, y);
    ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.45 - s * 0.3 * f, x + s, y - s * 0.15 - s * 0.35 * f);
    ctx.stroke();
  }

  /** Small flocks that cross the sky every so often. */
  function flock(W, yMin, yMax, color, size) {
    const birds = [];
    let next = rnd(2, 6);
    return (ctx, t, dt) => {
      next -= dt;
      if (next <= 0) {
        next = rnd(9, 22);
        const n = Math.floor(rnd(1, 6)), y = rnd(yMin, yMax), v = rnd(35, 70), dir = Math.random() < 0.5 ? 1 : -1;
        for (let i = 0; i < n; i++) birds.push({ x: dir > 0 ? -30 - i * rnd(18, 34) : W + 2 * M + 30 + i * rnd(18, 34), y: y + rnd(-14, 14), v: v * dir, s: size * rnd(0.7, 1.15), ph: rnd(0, TAU), fr: rnd(7, 10) });
      }
      for (let i = birds.length - 1; i >= 0; i--) {
        const b = birds[i];
        b.x += b.v * dt; b.y += Math.sin(t * 0.8 + b.ph) * 4 * dt;
        if (b.x < -80 || b.x > W + 2 * M + 80) { birds.splice(i, 1); continue; }
        drawBird(ctx, b.x, b.y, b.s, t * b.fr + b.ph, color);
      }
    };
  }

  // =====================================================================
  //   SCENES. Each returns { draw(ctx, t, dt, P), light } where light tints the table.
  // =====================================================================
  const BUILD = {
    // ----------------------------------------------------------- the beach
    sea(W, H, L) {
      const w = W + 2 * M;
      const hy = Math.round(L.tableY * 0.56);
      const sandY = Math.round(hy + (L.tableY - hy) * 0.42);
      const sunX = w * 0.89, sunY = hy - H * 0.07;

      const sky = layer(W, H, 0.06, (g) => {
        g.fillStyle = lin(g, 0, 0, 0, hy, [[0, '#5b93c2'], [0.5, '#98c0dc'], [0.86, '#e6d8c4'], [1, '#f7dfbd']]);
        g.fillRect(0, 0, w, hy + 6);
        blob(g, sunX, sunY, H * 0.6, [[0, 'rgba(255,247,228,1)'], [0.045, 'rgba(255,246,224,.97)'], [0.07, 'rgba(255,226,182,.5)'], [0.3, 'rgba(255,214,168,.18)'], [1, 'rgba(255,214,168,0)']]);
      });
      const clouds = Array.from({ length: 6 }, (_, i) => ({
        img: cloudSprite(rnd(220, 380), rnd(80, 120), '255,250,244', rnd(0.35, 0.6)),
        x: rnd(0, w), y: rnd(H * 0.04, hy * 0.62), v: rnd(3, 8),
      }));
      const far = layer(W, H, 0.16, (g) => {
        g.fillStyle = 'rgba(112,142,164,.62)';
        g.beginPath(); g.moveTo(0, hy + 1);
        for (let x = 0; x <= w * 0.42; x += 6) {
          const k = 1 - x / (w * 0.42);
          g.lineTo(x, hy - H * 0.075 * Math.pow(k, 0.65) * (0.86 + 0.14 * Math.sin(x * 0.021)));
        }
        g.lineTo(w * 0.42, hy + 1); g.closePath(); g.fill();
        g.fillStyle = 'rgba(120,150,170,.45)';
        g.beginPath(); g.ellipse(w * 0.62, hy + 1, w * 0.035, H * 0.012, 0, Math.PI, TAU); g.fill();
      });
      const sea = layer(W, H, 0.26, (g) => {
        g.fillStyle = lin(g, 0, hy, 0, sandY, [[0, '#4d8ba3'], [0.55, '#4aa0aa'], [1, '#86c9bf']]);
        g.fillRect(0, hy, w, sandY - hy + 2);
        g.fillStyle = lin(g, 0, hy - 5, 0, hy + 12, [[0, 'rgba(255,240,222,0)'], [0.45, 'rgba(255,240,222,.42)'], [1, 'rgba(255,240,222,0)']]);
        g.fillRect(0, hy - 5, w, 17);
      });
      const sand = layer(W, H, 0.42, (g) => {
        g.fillStyle = lin(g, 0, sandY, 0, H, [[0, '#ecd8ae'], [0.35, '#e0c696'], [1, '#c8a878']]);
        g.fillRect(0, sandY, w, H - sandY);
        for (let i = 0; i < 2600; i++) {
          g.fillStyle = Math.random() < 0.5 ? 'rgba(120,90,50,.18)' : 'rgba(255,250,235,.25)';
          g.fillRect(rnd(0, w), rnd(sandY, H), 1, 1);
        }
      });
      // a leaning palm on the left
      const palmBase = { x: w * 0.07, y: L.tableY + H * 0.02 }, palmTop = { x: w * 0.135, y: hy - H * 0.2 };
      const palm = layer(W, H, 0.6, (g) => {
        for (let i = 0; i <= 40; i++) {
          const k = i / 40;
          const x = palmBase.x + (palmTop.x - palmBase.x) * k + Math.sin(k * Math.PI) * w * 0.035;
          const y = palmBase.y + (palmTop.y - palmBase.y) * k;
          g.fillStyle = i % 3 === 0 ? '#4a3824' : '#5b4630';
          g.beginPath(); g.ellipse(x, y, 13 - k * 6, 6, 0, 0, TAU); g.fill();
        }
        for (let f = 0; f < 9; f++) {
          const a = -Math.PI * 0.95 + (f / 8) * Math.PI * 1.15 + rnd(-0.08, 0.08);
          const len = rnd(H * 0.13, H * 0.19), droop = rnd(0.35, 0.6) * len;
          const ex = palmTop.x + Math.cos(a) * len, ey = palmTop.y + Math.sin(a) * len * 0.45 + droop;
          const cx = palmTop.x + Math.cos(a) * len * 0.5, cy = palmTop.y + Math.sin(a) * len * 0.5 - len * 0.08;
          g.strokeStyle = f % 2 ? '#2c4a2b' : '#355a31';
          g.lineWidth = 3; g.beginPath(); g.moveTo(palmTop.x, palmTop.y); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke();
          g.lineWidth = 1.6;
          for (let s = 0.12; s < 1; s += 0.045) { // leaflets along the frond
            const px = (1 - s) * (1 - s) * palmTop.x + 2 * (1 - s) * s * cx + s * s * ex;
            const py = (1 - s) * (1 - s) * palmTop.y + 2 * (1 - s) * s * cy + s * s * ey;
            const l = (1 - s * 0.6) * len * 0.16;
            g.beginPath(); g.moveTo(px, py); g.lineTo(px - l * 0.4, py + l); g.moveTo(px, py); g.lineTo(px + l * 0.4, py + l); g.stroke();
          }
        }
        g.fillStyle = '#3d2f1f';
        for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(palmTop.x + rnd(-8, 8), palmTop.y + rnd(2, 10), 6, 0, TAU); g.fill(); }
      });
      const glints = Array.from({ length: 110 }, () => ({ u: rnd(-1, 1) * rnd(0, 1), v: Math.pow(Math.random(), 1.6), sp: rnd(1.5, 4), ph: rnd(0, TAU), len: rnd(5, 18) }));
      const gulls = flock(W, H * 0.06, hy * 0.7, 'rgba(60,60,70,.7)', 7);

      return {
        light: 'rgba(255,214,160,0.10)',
        draw(ctx, t, dt, P) {
          show(ctx, P, sky);
          at(ctx, P, 0.1, () => {
            for (const c of clouds) {
              c.x += c.v * dt; if (c.x > w + 40) c.x = -c.img.width - 40;
              ctx.drawImage(c.img, c.x, c.y);
            }
            gulls(ctx, t, dt);
          });
          show(ctx, P, far);
          show(ctx, P, sea);
          at(ctx, P, 0.26, () => {
            ctx.fillStyle = '#fff6e0';
            for (const s of glints) {
              const a = Math.sin(t * s.sp + s.ph);
              if (a < 0.35) continue;
              const y = hy + 2 + s.v * (sandY - hy - 6);
              ctx.globalAlpha = (a - 0.35) * 1.1 * (1 - s.v * 0.6);
              ctx.fillRect(sunX + s.u * (10 + s.v * W * 0.14) - s.len / 2, y, s.len * (0.5 + s.v), 1.3);
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#ffffff';
            for (let k = 0; k < 5; k++) { // swells rolling towards the shore
              const ph = (t * 0.085 + k / 5) % 1;
              const y = hy + (sandY - hy) * Math.pow(ph, 1.5);
              ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.32;
              ctx.lineWidth = 0.8 + ph * 2.2;
              ctx.beginPath();
              for (let x = -10; x <= w + 10; x += 24) {
                const yy = y + (1 + 4 * ph) * Math.sin(x * 0.012 + k * 2 + t * 0.4) + 2 * ph * Math.sin(x * 0.031 - t * 0.7);
                x === -10 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
              }
              ctx.stroke();
            }
            ctx.globalAlpha = 1;
          });
          show(ctx, P, sand);
          at(ctx, P, 0.42, () => { // water washing up the sand and sliding back
            const swell = 0.5 + 0.5 * Math.sin(TAU * 0.085 * t);
            const reach = sandY + 6 + (L.tableY - sandY) * 0.38 * swell;
            const edge = (x) => reach + 5 * Math.sin(x * 0.015 + t * 0.6) + 3 * Math.sin(x * 0.041 - t);
            ctx.fillStyle = 'rgba(110,88,58,.22)';
            ctx.fillRect(0, sandY, w, reach - sandY + 16);
            ctx.beginPath(); ctx.moveTo(0, sandY);
            for (let x = 0; x <= w; x += 16) ctx.lineTo(x, edge(x));
            ctx.lineTo(w, sandY); ctx.closePath();
            ctx.fillStyle = 'rgba(150,210,205,.5)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2.4;
            ctx.beginPath();
            for (let x = 0; x <= w; x += 16) x === 0 ? ctx.moveTo(x, edge(x)) : ctx.lineTo(x, edge(x));
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.4;
            ctx.beginPath();
            for (let x = 0; x <= w; x += 16) { const y = edge(x) - 7 - 2 * Math.sin(x * 0.05 + t); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
            ctx.stroke();
          });
          at(ctx, P, 0.6, () => { // the palm sways a little
            ctx.translate(palmBase.x, palmBase.y);
            ctx.rotate(Math.sin(t * 0.55) * 0.012 + Math.sin(t * 1.3) * 0.004);
            ctx.drawImage(palm.c, -palmBase.x, -palmBase.y);
          });
        },
      };
    },

    // ----------------------------------------------------------- a rainy window at night
    rain(W, H, L) {
      const w = W + 2 * M;
      const hy = Math.round(L.tableY * 0.62);
      const sky = layer(W, H, 0.06, (g) => {
        g.fillStyle = lin(g, 0, 0, 0, L.tableY, [[0, '#0e1522'], [0.6, '#1f2b3d'], [0.85, '#2c3a4f'], [1, '#1a2230']]);
        g.fillRect(0, 0, w, H);
        blob(g, w * 0.3, hy, H * 0.5, [[0, 'rgba(255,170,110,.12)'], [1, 'rgba(255,170,110,0)']]);
        blob(g, w * 0.78, hy, H * 0.45, [[0, 'rgba(140,180,255,.08)'], [1, 'rgba(140,180,255,0)']]);
      });
      const city = layer(W, H, 0.18, (out) => {
        // painted sharp, then drawn out of focus, as if seen through wet glass
        const tmp = makeCanvas(w, H), g = tmp.getContext('2d');
        let x = 0;
        while (x < w) {
          const bw = rnd(36, 96), bh = rnd(H * 0.05, H * 0.2);
          g.fillStyle = pick(['#121a27', '#151e2c', '#101722']);
          g.fillRect(x, hy - bh, bw, L.tableY - hy + bh);
          for (let wy = hy - bh + 8; wy < L.tableY - 10; wy += 9) {
            for (let wx = x + 5; wx < x + bw - 5; wx += 8) {
              if (Math.random() < 0.22) {
                g.fillStyle = Math.random() < 0.8 ? `rgba(255,${Math.round(rnd(190, 225))},130,${rnd(0.35, 0.75)})` : `rgba(190,215,255,${rnd(0.3, 0.6)})`;
                g.fillRect(wx, wy, 3, 4);
              }
            }
          }
          x += bw + rnd(2, 10);
        }
        out.filter = 'blur(2.2px)';
        out.drawImage(tmp, 0, 0);
        out.filter = 'none';
      });
      const bokeh = Array.from({ length: 40 }, () => ({
        x: rnd(0, w), y: rnd(hy - H * 0.05, L.tableY), r: rnd(6, 26), ph: rnd(0, TAU),
        c: pick(['255,190,110', '255,120,90', '130,200,255', '255,230,170', '255,160,80']), a: rnd(0.06, 0.2), vx: Math.random() < 0.18 ? rnd(-40, 40) : 0,
      }));
      const streaks = Array.from({ length: 140 }, () => ({ x: rnd(0, w), y: rnd(-H, H), l: rnd(14, 34), v: rnd(700, 1100), a: rnd(0.08, 0.2) }));
      const glass = layer(W, H, 0.85, (g) => {
        for (let i = 0; i < 320; i++) {
          const x = rnd(0, w), y = rnd(0, L.tableY - 20), r = rnd(0.8, 3.2);
          g.fillStyle = 'rgba(10,14,22,.35)'; g.beginPath(); g.ellipse(x, y + r * 0.3, r, r * 1.15, 0, 0, TAU); g.fill();
          g.fillStyle = 'rgba(210,225,255,.35)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, TAU); g.fill();
        }
      });
      const sliders = Array.from({ length: 16 }, () => ({ x: rnd(0, w), y0: rnd(0, L.tableY * 0.6), y: 0, v: 0, r: rnd(2, 3.6), wait: rnd(0, 6) }));
      sliders.forEach((s) => (s.y = s.y0));
      const frame = layer(W, H, 0.9, (g) => {
        const wood = (x, y, ww, hh, vertical) => {
          g.fillStyle = vertical ? lin(g, x, 0, x + ww, 0, [[0, '#0d0806'], [0.4, '#2a1a10'], [1, '#120b07']]) : lin(g, 0, y, 0, y + hh, [[0, '#2a1a10'], [1, '#0d0806']]);
          g.fillRect(x, y, ww, hh);
        };
        wood(w * 0.12 - 14, 0, 28, L.tableY, true);
        wood(w * 0.88 - 14, 0, 28, L.tableY, true);
        wood(0, H * 0.17, w, 22, false);
        wood(0, L.tableY - 26, w, 26, false); // the sill
        g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, L.tableY - 26, w, 2);
      });
      let flash = 0, nextFlash = rnd(20, 45);
      return {
        light: 'rgba(40,60,100,0.28)',
        draw(ctx, t, dt, P) {
          show(ctx, P, sky);
          nextFlash -= dt;
          if (nextFlash <= 0) { flash = 1; nextFlash = rnd(25, 60); }
          if (flash > 0) {
            const f = flash > 0.7 ? 1 : flash > 0.55 ? 0.3 : flash > 0.4 ? 0.8 : flash;
            ctx.fillStyle = `rgba(190,205,255,${0.22 * f})`; ctx.fillRect(0, 0, W, L.tableY);
            flash -= dt * 1.4;
          }
          show(ctx, P, city);
          at(ctx, P, 0.3, () => {
            for (const b of bokeh) {
              b.x += b.vx * dt; if (b.x > w + 30) b.x = -30; if (b.x < -30) b.x = w + 30;
              const a = b.a * (0.7 + 0.3 * Math.sin(t * 0.7 + b.ph));
              blob(ctx, b.x, b.y, b.r, [[0, `rgba(${b.c},${a})`], [0.7, `rgba(${b.c},${a * 0.7})`], [1, `rgba(${b.c},0)`]]);
            }
            ctx.strokeStyle = 'rgb(200,215,240)'; ctx.lineWidth = 1;
            for (const s of streaks) {
              s.y += s.v * dt; s.x += s.v * 0.08 * dt;
              if (s.y > L.tableY) { s.y = rnd(-80, -10); s.x = rnd(0, w); }
              ctx.globalAlpha = s.a;
              ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.l * 0.08, s.y - s.l); ctx.stroke();
            }
            ctx.globalAlpha = 1;
          });
          show(ctx, P, glass);
          at(ctx, P, 0.85, () => { // drops gathering and running down the pane
            for (const s of sliders) {
              if (s.wait > 0) { s.wait -= dt; } else { s.v = Math.min(s.v + 30 * dt, rnd(20, 70)); s.y += s.v * dt; if (Math.random() < 0.01) { s.wait = rnd(0.3, 1.5); s.v = 0; } }
              if (s.y > L.tableY - 30) { s.x = rnd(0, w); s.y0 = rnd(0, L.tableY * 0.6); s.y = s.y0; s.wait = rnd(1, 6); s.v = 0; }
              ctx.strokeStyle = 'rgba(200,215,240,.13)'; ctx.lineWidth = s.r * 0.7;
              ctx.beginPath(); ctx.moveTo(s.x, s.y0); ctx.lineTo(s.x, s.y); ctx.stroke();
              ctx.fillStyle = 'rgba(12,16,26,.45)'; ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * 1.3, 0, 0, TAU); ctx.fill();
              ctx.fillStyle = 'rgba(220,230,255,.45)'; ctx.beginPath(); ctx.arc(s.x - s.r * 0.3, s.y - s.r * 0.4, s.r * 0.35, 0, TAU); ctx.fill();
            }
          });
          show(ctx, P, frame);
        },
      };
    },

    // ----------------------------------------------------------- a cabin with a fire
    fire(W, H, L) {
      const w = W + 2 * M;
      const floor = L.tableY;
      const fx = w * 0.17, fw = Math.max(W * 0.3, 260), top = floor - H * 0.46;
      const openL = fx - fw * 0.3, openR = fx + fw * 0.3, openT = floor - H * 0.25;
      const wall = layer(W, H, 0.08, (g) => {
        let x = 0;
        while (x < w) {
          const pw = rnd(70, 115);
          const tone = Math.round(rnd(30, 52));
          g.fillStyle = `rgb(${tone + 14},${Math.round(tone * 0.62)},${Math.round(tone * 0.4)})`;
          g.fillRect(x, 0, pw, floor);
          for (let k = 0; k < 6; k++) { // grain
            g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
            g.beginPath(); const gx = x + rnd(4, pw - 4); g.moveTo(gx, 0); g.bezierCurveTo(gx + rnd(-6, 6), floor * 0.3, gx + rnd(-6, 6), floor * 0.6, gx + rnd(-4, 4), floor); g.stroke();
          }
          g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x + pw - 2, 0, 2, floor);
          x += pw;
        }
        g.fillStyle = lin(g, 0, 0, 0, floor, [[0, 'rgba(0,0,0,.65)'], [0.5, 'rgba(0,0,0,.35)'], [1, 'rgba(0,0,0,.25)']]);
        g.fillRect(0, 0, w, floor);
        // a small window on the right with a blue night outside
        const wx = w * 0.78, wy = floor - H * 0.5, ww = w * 0.13, wh = H * 0.24;
        g.fillStyle = lin(g, 0, wy, 0, wy + wh, [[0, '#0b1430'], [1, '#26365e']]);
        g.fillRect(wx, wy, ww, wh);
        for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.3, 0.8)})`; g.fillRect(wx + rnd(0, ww), wy + rnd(0, wh * 0.6), 1, 1); }
        g.fillStyle = 'rgba(220,230,250,.6)'; g.fillRect(wx, wy + wh - 6, ww, 6);
        g.fillStyle = '#1c110a';
        g.fillRect(wx - 8, wy - 8, ww + 16, 8); g.fillRect(wx - 8, wy + wh, ww + 16, 10);
        g.fillRect(wx - 8, wy, 8, wh); g.fillRect(wx + ww, wy, 8, wh); g.fillRect(wx + ww / 2 - 3, wy, 6, wh); g.fillRect(wx, wy + wh / 2 - 3, ww, 6);
      });
      const hearth = layer(W, H, 0.2, (g) => {
        g.fillStyle = '#3d342e';
        g.fillRect(fx - fw / 2, top, fw, floor - top);
        for (let y = top; y < floor; y += 22) { // stones
          let x = fx - fw / 2 + (Math.floor((y - top) / 22) % 2 ? -14 : 0);
          while (x < fx + fw / 2) {
            const sw = rnd(28, 54);
            const c = Math.round(rnd(62, 98));
            g.fillStyle = `rgb(${c},${Math.round(c * 0.9)},${Math.round(c * 0.82)})`;
            g.beginPath();
            g.roundRect(Math.max(x, fx - fw / 2) + 2, y + 2, Math.min(sw - 4, fx + fw / 2 - x - 4), 18, 6);
            g.fill();
            x += sw;
          }
        }
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(fx - fw / 2, top, fw, floor - top);
        // the opening
        g.fillStyle = '#080302';
        g.beginPath(); g.moveTo(openL, floor); g.lineTo(openL, openT + 30); g.quadraticCurveTo(fx, openT - 30, openR, openT + 30); g.lineTo(openR, floor); g.closePath(); g.fill();
        // mantel
        g.fillStyle = lin(g, 0, top - 22, 0, top, [[0, '#4b2e19'], [1, '#2a180c']]);
        g.fillRect(fx - fw / 2 - 18, top - 22, fw + 36, 22);
        g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(fx - fw / 2 - 18, top - 22, fw + 36, 2);
        // logs
        g.fillStyle = '#2b1a0e';
        g.beginPath(); g.roundRect(openL + 12, floor - 22, openR - openL - 24, 14, 7); g.fill();
        g.beginPath(); g.roundRect(openL + 26, floor - 34, openR - openL - 60, 13, 6); g.fill();
        // candlesticks on the mantel
        for (const cx of [fx - fw * 0.36, fx + fw * 0.38]) {
          g.fillStyle = '#b8935a'; g.fillRect(cx - 6, top - 30, 12, 8);
          g.fillStyle = '#efe4c8'; g.fillRect(cx - 4, top - 58, 8, 28);
        }
      });
      const shelf = layer(W, H, 0.22, (g) => bookcase(g, w * 0.92, w + 10, floor - H * 0.62, floor, 4));
      const sparks = Array.from({ length: 22 }, () => ({ x: rnd(openL, openR), y: rnd(openT, floor), v: rnd(30, 70), ph: rnd(0, TAU) }));
      const tongues = Array.from({ length: 9 }, (_, i) => ({ k: i / 8, ph: rnd(0, TAU), sp: rnd(5, 9) }));
      return {
        light: 'rgba(255,140,60,0.14)',
        draw(ctx, t, dt, P) {
          const f = 0.8 + 0.2 * (Math.sin(t * 7.3) * 0.5 + Math.sin(t * 11.7 + 1) * 0.3 + Math.sin(t * 3.1 + 2) * 0.2);
          show(ctx, P, wall);
          at(ctx, P, 0.1, () => blob(ctx, fx, floor - H * 0.1, Math.max(W, H) * 0.75, [[0, `rgba(255,140,60,${0.28 * f})`], [0.4, `rgba(255,110,40,${0.1 * f})`], [1, 'rgba(255,100,30,0)']]));
          show(ctx, P, hearth);
          show(ctx, P, shelf);
          at(ctx, P, 0.2, () => {
            ctx.globalCompositeOperation = 'lighter';
            const base = floor - 26, span = openR - openL - 30;
            for (const q of tongues) {
              const x = openL + 15 + q.k * span + Math.sin(t * 2 + q.ph) * 4;
              const h = (H * 0.09 + H * 0.06 * Math.sin(q.k * Math.PI)) * (0.65 + 0.35 * Math.sin(t * q.sp + q.ph) * Math.sin(t * q.sp * 0.37 + q.ph * 2));
              const fwid = span / 6;
              const g = ctx.createRadialGradient(x, base, 0, x, base - h * 0.3, h);
              g.addColorStop(0, 'rgba(255,236,170,.7)'); g.addColorStop(0.35, 'rgba(255,150,50,.5)'); g.addColorStop(1, 'rgba(200,50,10,0)');
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.moveTo(x - fwid, base);
              ctx.quadraticCurveTo(x - fwid * 0.8, base - h * 0.55, x + Math.sin(t * 3 + q.ph) * fwid * 0.5, base - h);
              ctx.quadraticCurveTo(x + fwid * 0.8, base - h * 0.55, x + fwid, base);
              ctx.closePath(); ctx.fill();
            }
            blob(ctx, (openL + openR) / 2, floor - 24, (openR - openL) * 0.55, [[0, `rgba(255,120,40,${0.35 * f})`], [1, 'rgba(255,90,20,0)']]);
            for (const cx of [fx - fw * 0.36, fx + fw * 0.38]) {
              const cf = 0.8 + 0.2 * Math.sin(t * 13 + cx);
              blob(ctx, cx, top - 64, 26, [[0, `rgba(255,220,140,${0.5 * cf})`], [1, 'rgba(255,200,120,0)']]);
              ctx.fillStyle = `rgba(255,236,170,${0.9 * cf})`;
              ctx.beginPath(); ctx.ellipse(cx, top - 64, 3, 7 * cf, 0, 0, TAU); ctx.fill();
            }
            for (const s of sparks) {
              s.y -= s.v * dt; s.x += Math.sin(t * 2 + s.ph) * 10 * dt;
              if (s.y < openT - H * 0.05) { s.y = floor - 30; s.x = rnd(openL + 10, openR - 10); }
              ctx.fillStyle = `rgba(255,190,90,${0.6 * clamp((s.y - openT + H * 0.05) / (H * 0.2), 0, 1)})`;
              ctx.fillRect(s.x, s.y, 1.6, 1.6);
            }
            ctx.globalCompositeOperation = 'source-over';
          });
        },
      };
    },

    // ----------------------------------------------------------- hills at sunrise
    sunrise(W, H, L) {
      const w = W + 2 * M;
      const hy = Math.round(L.tableY * 0.6);
      const sunX = w * 0.89;
      const dawn = layer(W, H, 0.04, (g) => {
        g.fillStyle = lin(g, 0, 0, 0, hy + H * 0.05, [[0, '#3b4b7c'], [0.45, '#a87b9e'], [0.78, '#f19e7c'], [1, '#ffd396']]);
        g.fillRect(0, 0, w, L.tableY);
      });
      const day = layer(W, H, 0.04, (g) => {
        g.fillStyle = lin(g, 0, 0, 0, hy + H * 0.05, [[0, '#6c9dcf'], [0.6, '#bdd3e3'], [1, '#ffe2b2']]);
        g.fillRect(0, 0, w, L.tableY);
      });
      const clouds = Array.from({ length: 5 }, () => ({ img: cloudSprite(rnd(240, 420), rnd(70, 110), '255,205,180', rnd(0.3, 0.5)), x: rnd(0, w), y: rnd(H * 0.05, hy * 0.6), v: rnd(2, 6) }));
      const span = L.tableY - hy;
      const hills = [
        [0.14, hy + H * 0.01, H * 0.07, '#9a8db0', 0.5],
        [0.24, hy + span * 0.3, H * 0.07, '#7d978f', 0.7],
        [0.38, hy + span * 0.62, H * 0.07, '#5e7b58', 0.9],
        [0.56, L.tableY + H * 0.03, H * 0.06, '#45603d', 1.1],
      ].map(([d, base, amp, col, fr]) => layer(W, H, d, (g) => {
        ridge(g, w, base, amp, col, { freq: fr, bottom: H });
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = lin(g, w, 0, 0, 0, [[0, 'rgba(255,190,120,.28)'], [0.6, 'rgba(255,190,120,0)']]);
        g.fillRect(0, 0, w, H);
        g.globalCompositeOperation = 'source-over';
      }));
      const mist = makeCanvas(w, 80), mg = mist.getContext('2d');
      for (let i = 0; i < 24; i++) blob(mg, rnd(0, w), rnd(25, 55), rnd(60, 160), [[0, 'rgba(255,240,235,.18)'], [1, 'rgba(255,240,235,0)']]);
      const birds = flock(W, H * 0.08, hy * 0.75, 'rgba(50,40,60,.65)', 6);
      return {
        get light() { return 'rgba(255,190,120,0.12)'; },
        draw(ctx, t, dt, P) {
          const k = ease(clamp(t / 70, 0, 1));
          show(ctx, P, dawn);
          ctx.globalAlpha = k * 0.85; show(ctx, P, day); ctx.globalAlpha = 1;
          const sunY = hy + H * 0.035 - k * H * 0.17;
          at(ctx, P, 0.05, () => {
            blob(ctx, sunX, sunY, H * 0.65, [[0, 'rgba(255,240,205,.95)'], [0.04, 'rgba(255,236,196,.9)'], [0.065, 'rgba(255,200,140,.45)'], [0.35, 'rgba(255,180,120,.15)'], [1, 'rgba(255,180,120,0)']]);
            for (let i = 0; i < 6; i++) { // rays
              const a = Math.PI * (0.62 + i * 0.13) + Math.sin(t * 0.12 + i) * 0.02, L2 = Math.max(W, H) * 1.4, wd = 0.03 + (i % 2) * 0.015;
              const g = ctx.createLinearGradient(sunX, sunY, sunX + Math.cos(a) * L2, sunY + Math.sin(a) * L2);
              g.addColorStop(0, `rgba(255,225,170,${0.08 * (0.4 + 0.6 * k)})`); g.addColorStop(1, 'rgba(255,225,170,0)');
              ctx.fillStyle = g;
              ctx.beginPath(); ctx.moveTo(sunX, sunY); ctx.lineTo(sunX + Math.cos(a - wd) * L2, sunY + Math.sin(a - wd) * L2); ctx.lineTo(sunX + Math.cos(a + wd) * L2, sunY + Math.sin(a + wd) * L2); ctx.closePath(); ctx.fill();
            }
            for (const c of clouds) { c.x += c.v * dt; if (c.x > w + 40) c.x = -c.img.width - 40; ctx.drawImage(c.img, c.x, c.y); }
            birds(ctx, t, dt);
          });
          hills.forEach((hl, i) => {
            show(ctx, P, hl);
            if (i < 3) at(ctx, P, hl.depth, () => { // mist drifting between the hills
              const y = [hy + span * 0.12, hy + span * 0.45, hy + span * 0.78][i] - 40;
              const off = (t * (4 + i * 3)) % w;
              ctx.globalAlpha = 0.9 - i * 0.2;
              ctx.drawImage(mist, off, y); ctx.drawImage(mist, off - w, y);
              ctx.globalAlpha = 1;
            });
          });
        },
      };
    },

    // ----------------------------------------------------------- golden fields at sunset
    sunset(W, H, L) {
      const w = W + 2 * M;
      const hy = Math.round(L.tableY * 0.72);
      const sunX = w * 0.84, sunY = hy - H * 0.015;
      const sky = layer(W, H, 0.04, (g) => {
        g.fillStyle = lin(g, 0, 0, 0, hy, [[0, '#3c4c7c'], [0.38, '#a9789c'], [0.7, '#f19f68'], [1, '#ffd28c']]);
        g.fillRect(0, 0, w, L.tableY);
        blob(g, sunX, sunY, H * 0.7, [[0, 'rgba(255,244,214,1)'], [0.035, 'rgba(255,236,190,.95)'], [0.06, 'rgba(255,190,120,.55)'], [0.3, 'rgba(255,160,100,.2)'], [1, 'rgba(255,150,100,0)']]);
      });
      const clouds = Array.from({ length: 6 }, () => ({ img: cloudSprite(rnd(260, 440), rnd(70, 110), '255,190,160', rnd(0.35, 0.55)), x: rnd(0, w), y: rnd(H * 0.04, hy * 0.6), v: rnd(2, 5) }));
      const far = layer(W, H, 0.12, (g) => ridge(g, w, hy + 2, H * 0.022, '#6e4c5c', { freq: 2, bottom: H }));
      const field = layer(W, H, 0.38, (g) => {
        g.fillStyle = lin(g, 0, hy, 0, H, [[0, '#a8743a'], [0.25, '#6e4520'], [1, '#2c1a0c']]);
        g.fillRect(0, hy, w, H);
        g.lineWidth = 1;
        for (let i = 0; i < 2400; i++) { // rows of grass catching the low light
          const y = hy + Math.pow(Math.random(), 1.6) * (L.tableY - hy + 20), x = rnd(0, w), h = 2 + (y - hy) * 0.06;
          g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,200,120,.35)' : 'rgba(60,35,15,.4)';
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-1.5, 1.5), y - h); g.stroke();
        }
        // a lone tree on the horizon, near the sun
        const tx = w * 0.79, ty = hy + 1, th = H * 0.09;
        g.fillStyle = '#1e130c';
        g.fillRect(tx - 3, ty - th * 0.45, 6, th * 0.45);
        for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(tx + rnd(-th * 0.45, th * 0.45), ty - th * rnd(0.5, 0.95), th * rnd(0.14, 0.24), 0, TAU); g.fill(); }
      });
      const blades = Array.from({ length: 140 }, () => ({ x: rnd(0, w), h: rnd(H * 0.04, H * 0.11), ph: rnd(0, TAU), lean: rnd(-0.15, 0.15) }));
      const birds = flock(W, H * 0.08, hy * 0.7, 'rgba(40,25,30,.6)', 6);
      return {
        light: 'rgba(255,170,90,0.16)',
        draw(ctx, t, dt, P) {
          show(ctx, P, sky);
          at(ctx, P, 0.06, () => {
            for (const c of clouds) { c.x += c.v * dt; if (c.x > w + 40) c.x = -c.img.width - 40; ctx.drawImage(c.img, c.x, c.y); }
            birds(ctx, t, dt);
          });
          show(ctx, P, far);
          show(ctx, P, field);
          at(ctx, P, 0.6, () => { // tall grass in front, swaying, its tips lit by the sun
            ctx.lineCap = 'round';
            for (const b of blades) {
              const sway = Math.sin(t * 1.1 + b.ph) * 0.08 + b.lean;
              const x0 = b.x, y0 = L.tableY + 6, x1 = x0 + Math.sin(sway) * b.h, y1 = y0 - Math.cos(sway) * b.h;
              ctx.strokeStyle = '#2a170a'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0, y0 - b.h * 0.5, x1, y1); ctx.stroke();
              ctx.fillStyle = 'rgba(255,190,110,.55)';
              ctx.beginPath(); ctx.ellipse(x1, y1, 1.6, 4, sway, 0, TAU); ctx.fill();
            }
          });
        },
      };
    },

    // ----------------------------------------------------------- a snowy forest at dusk
    snow(W, H, L) {
      const w = W + 2 * M;
      const hy = Math.round(L.tableY * 0.58);
      const span = L.tableY - hy;
      const sky = layer(W, H, 0.04, (g) => {
        g.fillStyle = lin(g, 0, 0, 0, hy + span * 0.3, [[0, '#1d2945'], [0.55, '#55648c'], [0.86, '#a39db6'], [1, '#c8bfd0']]);
        g.fillRect(0, 0, w, L.tableY);
        blob(g, w * 0.83, H * 0.13, H * 0.3, [[0, 'rgba(240,240,255,.35)'], [1, 'rgba(240,240,255,0)']]);
        g.fillStyle = '#f3f0e3'; g.beginPath(); g.arc(w * 0.83, H * 0.13, H * 0.03, 0, TAU); g.fill();
      });
      const mountains = layer(W, H, 0.1, (g) => {
        ridge(g, w, hy + 4, H * 0.17, '#8b9ab8', { sharp: 0.55, freq: 1.4, bottom: H });
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = lin(g, 0, hy - H * 0.17, 0, hy, [[0, 'rgba(240,244,252,.9)'], [0.45, 'rgba(225,232,245,.4)'], [1, 'rgba(225,232,245,0)']]);
        g.fillRect(0, 0, w, H);
        g.globalCompositeOperation = 'source-over';
      });
      const farTrees = layer(W, H, 0.2, (g) => {
        const base = hy + span * 0.28;
        g.fillStyle = '#9aabc7'; g.fillRect(0, base - 2, w, H);
        for (let x = -10; x < w + 10; x += rnd(6, 14)) pine(g, x, base + rnd(0, 6), rnd(H * 0.045, H * 0.085), '#5e7093', '#aab8d0');
      });
      const cabin = { x: w * 0.15, y: hy + span * 0.5 };
      const midTrees = layer(W, H, 0.34, (g) => {
        const base = hy + span * 0.58;
        g.fillStyle = '#bfcbe0'; g.fillRect(0, base - 3, w, H);
        // the cabin
        const cw = H * 0.09, ch = H * 0.055;
        g.fillStyle = '#2d2433'; g.fillRect(cabin.x - cw / 2, cabin.y - ch, cw, ch);
        g.fillStyle = '#3a2c35'; g.fillRect(cabin.x + cw * 0.22, cabin.y - ch * 1.75, cw * 0.12, ch * 0.6);
        g.fillStyle = '#e4ebf5'; g.beginPath(); g.moveTo(cabin.x - cw * 0.62, cabin.y - ch + 2); g.lineTo(cabin.x, cabin.y - ch * 1.75); g.lineTo(cabin.x + cw * 0.62, cabin.y - ch + 2); g.closePath(); g.fill();
        g.fillStyle = '#ffcf7a'; g.fillRect(cabin.x - cw * 0.3, cabin.y - ch * 0.62, cw * 0.18, ch * 0.3); g.fillRect(cabin.x + cw * 0.08, cabin.y - ch * 0.62, cw * 0.18, ch * 0.3);
        blob(g, cabin.x, cabin.y - ch * 0.45, H * 0.07, [[0, 'rgba(255,200,110,.35)'], [1, 'rgba(255,200,110,0)']]);
        for (let x = -10; x < w + 10; x += rnd(18, 40)) {
          if (Math.abs(x - cabin.x) < H * 0.08) continue;
          pine(g, x, base + rnd(0, 8), rnd(H * 0.08, H * 0.15), '#33435f', '#c7d2e3');
        }
      });
      const nearTrees = layer(W, H, 0.55, (g) => {
        g.fillStyle = lin(g, 0, L.tableY - span * 0.12, 0, H, [[0, '#dce4f0'], [1, '#c4cfe0']]);
        g.fillRect(0, L.tableY - span * 0.12, w, H);
        for (const x of [w * 0.02, w * 0.07, w * 0.95, w * 0.99]) pine(g, x, L.tableY + H * 0.02, rnd(H * 0.24, H * 0.32), '#1b2538', '#d4dceb');
      });
      const flakes = [0.15, 0.35, 0.6].map((d, i) => ({
        d,
        list: Array.from({ length: [110, 70, 26][i] }, () => ({ x: rnd(0, w), y: rnd(0, H), r: [rnd(0.6, 1.2), rnd(1.2, 2.2), rnd(2.6, 4.4)][i], v: [rnd(10, 22), rnd(22, 40), rnd(45, 70)][i], ph: rnd(0, TAU), sw: rnd(8, 28) })),
      }));
      const smoke = [];
      let nextPuff = 0;
      return {
        light: 'rgba(150,175,230,0.18)',
        draw(ctx, t, dt, P) {
          show(ctx, P, sky);
          at(ctx, P, flakes[0].d, () => drawFlakes(ctx, flakes[0], t, dt, 0.55));
          show(ctx, P, mountains);
          show(ctx, P, farTrees);
          show(ctx, P, midTrees);
          at(ctx, P, 0.34, () => { // chimney smoke
            nextPuff -= dt;
            if (nextPuff <= 0) { nextPuff = 0.45; smoke.push({ x: cabin.x + H * 0.02, y: cabin.y - H * 0.1, r: 4, a: 0.32 }); }
            for (let i = smoke.length - 1; i >= 0; i--) {
              const s = smoke[i];
              s.y -= 14 * dt; s.x += 7 * dt; s.r += 5 * dt; s.a -= 0.045 * dt;
              if (s.a <= 0) { smoke.splice(i, 1); continue; }
              blob(ctx, s.x, s.y, s.r, [[0, `rgba(205,210,225,${s.a})`], [1, 'rgba(205,210,225,0)']]);
            }
          });
          at(ctx, P, flakes[1].d, () => drawFlakes(ctx, flakes[1], t, dt, 0.7));
          show(ctx, P, nearTrees);
          at(ctx, P, flakes[2].d, () => drawFlakes(ctx, flakes[2], t, dt, 0.5));
        },
      };
      function drawFlakes(ctx, layerF, t, dt, alpha) {
        ctx.fillStyle = '#fff';
        for (const p of layerF.list) {
          p.y += p.v * dt;
          if (p.y > H + 6) { p.y = -6; p.x = rnd(0, w); }
          ctx.globalAlpha = alpha;
          ctx.beginPath(); ctx.arc(p.x + Math.sin(t * 0.5 + p.ph) * p.sw, p.y, p.r, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    },

    // ----------------------------------------------------------- a summer night
    night(W, H, L) {
      const w = W + 2 * M;
      const hy = Math.round(L.tableY * 0.7);
      const sky = layer(W, H, 0.03, (g) => {
        g.fillStyle = lin(g, 0, 0, 0, hy, [[0, '#04060f'], [0.55, '#0c1431'], [1, '#1e2b57']]);
        g.fillRect(0, 0, w, L.tableY);
        // the Milky Way: a soft diagonal band
        for (let i = 0; i < 18; i++) {
          const k = i / 17;
          blob(g, w * (0.05 + k * 0.9), H * 0.02 + k * hy * 0.9, H * rnd(0.1, 0.16), [[0, `rgba(${pick(['170,160,220', '150,170,230', '200,180,220'])},.05)`], [1, 'rgba(160,160,220,0)']]);
        }
        for (let i = 0; i < 1500; i++) {
          const k = Math.random(), off = (Math.random() + Math.random() + Math.random() - 1.5) * H * 0.09;
          g.fillStyle = `rgba(255,255,255,${rnd(0.15, 0.55)})`;
          g.fillRect(w * (0.05 + k * 0.9) + off * 0.6, H * 0.02 + k * hy * 0.9 + off, 1, 1);
        }
        for (let i = 0; i < 520; i++) {
          const r = Math.random() < 0.08 ? 1.6 : rnd(0.5, 1.1);
          g.fillStyle = `rgba(${pick(['255,255,255', '255,240,220', '220,230,255'])},${rnd(0.3, 0.95)})`;
          g.beginPath(); g.arc(rnd(0, w), rnd(0, hy), r, 0, TAU); g.fill();
        }
        // crescent moon
        const mx = w * 0.17, my = H * 0.15, mr = H * 0.034;
        blob(g, mx, my, mr * 6, [[0, 'rgba(230,230,210,.18)'], [1, 'rgba(230,230,210,0)']]);
        g.fillStyle = '#f2eed8'; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
        g.fillStyle = '#070b1d'; g.beginPath(); g.arc(mx + mr * 0.42, my - mr * 0.16, mr * 0.92, 0, TAU); g.fill();
      });
      const trees = layer(W, H, 0.16, (g) => {
        g.fillStyle = '#060a19';
        for (let x = -20; x < w + 20; x += rnd(14, 34)) {
          const r = rnd(H * 0.02, H * 0.05);
          g.beginPath(); g.arc(x, hy - r * rnd(0.3, 0.9), r, 0, TAU); g.fill();
        }
        g.fillRect(0, hy - 2, w, H);
      });
      const field = layer(W, H, 0.45, (g) => {
        g.fillStyle = lin(g, 0, hy, 0, H, [[0, '#0a1024'], [1, '#05080f']]);
        g.fillRect(0, hy + (L.tableY - hy) * 0.35, w, H);
        g.strokeStyle = '#04070e'; g.lineWidth = 1.4;
        for (let i = 0; i < 900; i++) { // grass silhouettes along the edge of the field
          const x = rnd(0, w), y = L.tableY + rnd(-4, 10), h = rnd(10, 38);
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + rnd(-6, 6), y - h * 0.6, x + rnd(-10, 10), y - h); g.stroke();
        }
      });
      const twinklers = Array.from({ length: 60 }, () => ({ x: rnd(0, w), y: rnd(0, hy * 0.95), ph: rnd(0, TAU), sp: rnd(0.8, 2.4), r: rnd(0.8, 1.6) }));
      const flies = [0.25, 0.45, 0.7].map((d, i) => ({ d, list: Array.from({ length: [10, 8, 5][i] }, () => ({ x: rnd(0, w), y: rnd(hy - 20, L.tableY + 10), a: rnd(0, TAU), sp: [8, 14, 22][i], ph: rnd(0, TAU), pulse: rnd(0.5, 1.2), r: [7, 11, 18][i] })) }));
      let shoot = null, nextShoot = rnd(8, 20);
      return {
        light: 'rgba(30,45,100,0.32)',
        draw(ctx, t, dt, P) {
          show(ctx, P, sky);
          at(ctx, P, 0.03, () => {
            ctx.fillStyle = '#fff';
            for (const s of twinklers) {
              ctx.globalAlpha = 0.25 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(t * s.sp + s.ph), 3);
              ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
            }
            ctx.globalAlpha = 1;
            nextShoot -= dt;
            if (nextShoot <= 0 && !shoot) { shoot = { x: rnd(w * 0.3, w), y: rnd(0, hy * 0.4), k: 0 }; nextShoot = rnd(15, 40); }
            if (shoot) {
              shoot.k += dt * 1.6;
              const len = 120, x = shoot.x - shoot.k * 260, y = shoot.y + shoot.k * 110;
              const g = ctx.createLinearGradient(x, y, x + len, y - len * 0.42);
              g.addColorStop(0, `rgba(255,255,255,${0.8 * (1 - shoot.k)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
              ctx.strokeStyle = g; ctx.lineWidth = 1.4;
              ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y - len * 0.42); ctx.stroke();
              if (shoot.k >= 1) shoot = null;
            }
          });
          show(ctx, P, trees);
          drawFlies(ctx, P, flies[0], t, dt);
          show(ctx, P, field);
          drawFlies(ctx, P, flies[1], t, dt);
          drawFlies(ctx, P, flies[2], t, dt);
        },
      };
      function drawFlies(ctx, P, group, t, dt) {
        at(ctx, P, group.d, () => {
          for (const p of group.list) {
            p.a += Math.sin(t * 0.7 + p.ph) * 0.9 * dt;
            p.x += Math.cos(p.a) * p.sp * dt; p.y += Math.sin(p.a) * p.sp * 0.6 * dt;
            if (p.x < -20) p.x = w + 20; if (p.x > w + 20) p.x = -20;
            p.y = clamp(p.y, hy - 40, L.tableY + 20);
            const on = Math.pow(Math.max(0, Math.sin(t * p.pulse + p.ph)), 2);
            if (on < 0.03) continue;
            blob(ctx, p.x, p.y, p.r, [[0, `rgba(225,255,150,${0.85 * on})`], [0.25, `rgba(200,255,120,${0.35 * on})`], [1, 'rgba(200,255,120,0)']]);
          }
        });
      }
    },

    // ----------------------------------------------------------- an old study with a clock
    clock(W, H, L) {
      const w = W + 2 * M;
      const floor = L.tableY;
      const cx = w * 0.9, cw = Math.max(W * 0.07, 66), cTop = Math.max(H * 0.1, floor - H * 0.42);
      const faceY = cTop + cw * 0.75, faceR = cw * 0.34;
      const winTop = cTop + cw * 1.5, winBot = floor - H * 0.08;
      const room = layer(W, H, 0.08, (g) => {
        g.fillStyle = '#1f251c'; g.fillRect(0, 0, w, floor);
        for (let x = 0; x < w; x += 26) { g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(x, 0, 10, floor); }
        g.fillStyle = '#2a1b11'; g.fillRect(0, floor - H * 0.16, w, H * 0.16);
        g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, floor - H * 0.16, w, 2);
        g.fillStyle = lin(g, 0, 0, 0, floor, [[0, 'rgba(0,0,0,.6)'], [1, 'rgba(0,0,0,.15)']]); g.fillRect(0, 0, w, floor);
      });
      const shelves = layer(W, H, 0.2, (g) => {
        bookcase(g, -10, w * 0.27, floor - H * 0.78, floor, 5);
        // grandfather clock
        g.fillStyle = lin(g, cx - cw / 2, 0, cx + cw / 2, 0, [[0, '#1e1008'], [0.45, '#3d2412'], [1, '#160b05']]);
        g.fillRect(cx - cw / 2, cTop, cw, floor - cTop);
        g.fillRect(cx - cw * 0.62, cTop - cw * 0.25, cw * 1.24, cw * 0.3);
        g.beginPath(); g.moveTo(cx - cw * 0.62, cTop - cw * 0.25); g.quadraticCurveTo(cx, cTop - cw * 0.75, cx + cw * 0.62, cTop - cw * 0.25); g.fill();
        g.fillStyle = '#efe4c6'; g.beginPath(); g.arc(cx, faceY, faceR, 0, TAU); g.fill();
        g.strokeStyle = '#b8935a'; g.lineWidth = 3; g.stroke();
        g.fillStyle = '#2a1d10';
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.fillRect(cx + Math.cos(a) * faceR * 0.8 - 1.5, faceY + Math.sin(a) * faceR * 0.8 - 1.5, 3, 3); }
        g.strokeStyle = '#2a1d10'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(cx, faceY); g.lineTo(cx + faceR * 0.45, faceY - faceR * 0.35); g.moveTo(cx, faceY); g.lineTo(cx - faceR * 0.1, faceY - faceR * 0.65); g.stroke();
        g.fillStyle = '#0b0603'; g.fillRect(cx - cw * 0.3, winTop, cw * 0.6, winBot - winTop);
        g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.strokeRect(cx - cw * 0.3, winTop, cw * 0.6, winBot - winTop);
      });
      const motesList = Array.from({ length: 50 }, () => ({ x: rnd(0, w * 0.7), y: rnd(0, floor), r: rnd(0.6, 1.6), ph: rnd(0, TAU), sp: rnd(0.4, 1) }));
      return {
        light: 'rgba(255,200,140,0.1)',
        draw(ctx, t, dt, P) {
          show(ctx, P, room);
          at(ctx, P, 0.12, () => { // light from a window up and to the left
            const g = ctx.createLinearGradient(0, 0, w * 0.6, floor);
            g.addColorStop(0, 'rgba(255,225,170,.16)'); g.addColorStop(1, 'rgba(255,225,170,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(w * 0.18, 0); ctx.lineTo(w * 0.42, 0); ctx.lineTo(w * 0.72, floor); ctx.lineTo(w * 0.38, floor); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgb(255,236,200)';
            for (const m of motesList) {
              m.x += Math.sin(t * 0.3 + m.ph) * 4 * dt; m.y += Math.cos(t * 0.25 + m.ph) * 4 * dt;
              ctx.globalAlpha = 0.35 * Math.pow(Math.max(0, Math.sin(t * m.sp + m.ph)), 2);
              ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
            }
            ctx.globalAlpha = 1;
          });
          show(ctx, P, shelves);
          at(ctx, P, 0.2, () => { // the pendulum, in time with the ticks you hear
            const ct = (typeof Sound !== 'undefined' && Sound.clock) ?? t;
            const ang = 0.2 * Math.cos(Math.PI * ct);
            const len = (winBot - winTop) * 0.82;
            ctx.save();
            ctx.beginPath(); ctx.rect(cx - cw * 0.3, winTop, cw * 0.6, winBot - winTop); ctx.clip();
            ctx.translate(cx, winTop + 4); ctx.rotate(ang);
            ctx.fillStyle = '#9c7a44'; ctx.fillRect(-1.5, 0, 3, len);
            const bob = ctx.createRadialGradient(-3, len - 3, 1, 0, len, cw * 0.17);
            bob.addColorStop(0, '#f3d79a'); bob.addColorStop(1, '#8a6a35');
            ctx.fillStyle = bob; ctx.beginPath(); ctx.arc(0, len, cw * 0.17, 0, TAU); ctx.fill();
            ctx.restore();
          });
        },
      };
    },
  };

  return {
    has: (id) => !!BUILD[id],
    build: (id, W, H, layout) => BUILD[id](W, H, layout),
  };
})();
