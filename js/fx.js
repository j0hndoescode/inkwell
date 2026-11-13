/* Ambience in the room. Two looks:
   - "scene": a real place behind the typewriter (filmed footage in media/: a beach, rain on a window, a fire...)
     with the typewriter's table in front and a little depth as the pointer moves. If the footage can't load,
     a painted version of the same place is used instead (see scenes.js);
   - "subtle": a faint tint and particles only, used as the fallback (and always on the bookshelf screen).
   Both sit behind the machine and the paper, so the writing stays the focus. */
const Fx = (() => {
  let canvas, ctx, W = 0, H = 0;
  let id = 'none', mode = 'scene', raf = 0, t0 = 0, last = 0, lastDraw = 0, swapTimer = 0;
  let parts = [], ripples = [], wash = null;
  let layout = { view: 'library', tableY: 0 };
  let scene = null, sceneKey = '';
  let woodImg = null, woodSrc = '', table = null, tableKey = '';
  const P = { x: 0, y: 0, tx: 0, ty: 0 }; // pointer parallax, -1..1

  // Filmed footage per ambience. focus = which part of the frame (0 top, 1 bottom) sits in view above the table.
  const MEDIA = {
    sea:     { focus: 0.42, dim: 0.16, light: 'rgba(255,214,160,0.10)' },
    rain:    { focus: 0.5,  dim: 0.10, light: 'rgba(40,60,100,0.28)' },
    fire:    { focus: 0.55, dim: 0.16, light: 'rgba(255,140,60,0.14)', flicker: true },
    sunrise: { focus: 0.62, dim: 0.04, light: 'rgba(150,170,230,0.12)', once: true, held: 'sunrise-end', glow: true },
    sunset:  { focus: 0.6,  dim: 0.04, light: 'rgba(255,170,90,0.16)' },
    snow:    { focus: 0.42, dim: 0.14, light: 'rgba(170,190,230,0.16)' },
    night:   { focus: 0.8,  dim: 0.02, light: 'rgba(30,45,100,0.32)', flies: true },
    clock:   { focus: 0.45, dim: 0.22, light: 'rgba(255,200,140,0.08)' },
  };
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  let vid = null;
  let media = { id: null, posterBad: false, videoBad: false };
  const mediaDead = () => media.posterBad && media.videoBad;
  const reduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  function init() {
    canvas = document.createElement('canvas');
    canvas.className = 'amb-fx';
    canvas.setAttribute('aria-hidden', 'true');
    ctx = canvas.getContext('2d');
    vid = document.createElement('video');
    vid.className = 'amb-video';
    vid.muted = true; vid.defaultMuted = true; vid.playsInline = true;
    vid.setAttribute('muted', ''); vid.setAttribute('playsinline', ''); vid.setAttribute('aria-hidden', 'true');
    vid.disablePictureInPicture = true;
    vid.preload = 'auto';
    vid.addEventListener('error', () => { media.videoBad = true; syncVideo(); });
    resize();
    addEventListener('resize', resize);
    addEventListener('pointermove', (e) => { P.tx = (e.clientX / W) * 2 - 1; P.ty = (e.clientY / H) * 2 - 1; }, { passive: true });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  }

  function resize() {
    const dpr = 1; // the background is soft by design; full resolution would only cost battery
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wash = null;
    sceneKey = '';
    seed();
  }

  /** Put the layer behind the content of the screen that's showing. */
  function mount(parent, before) {
    if (canvas.parentNode !== parent || canvas.nextSibling !== (before || parent.firstChild)) {
      parent.insertBefore(canvas, before || parent.firstChild);
    }
    if (vid.nextSibling !== canvas) parent.insertBefore(vid, canvas);
  }

  /** Where the table's far edge is on this screen (the scene is painted above it). */
  function setLayout(view, tableY) {
    tableY = Math.round(tableY);
    if (view === layout.view && Math.abs(tableY - layout.tableY) < 2) return;
    layout = { view, tableY };
    sceneKey = '';
    syncVideo();
    if (raf || reduce.matches) frameOnce();
  }

  /** Use the room theme's wood for the table. */
  function themeChanged() {
    const v = getComputedStyle(document.body).getPropertyValue('--desk-tex');
    const m = v.match(/url\(["']?(.*?)["']?\)\s*$/s);
    const src = m ? m[1] : '';
    if (!src || src === woodSrc) return;
    woodSrc = src;
    const img = new Image();
    // Rasterise the texture once: using the SVG directly would re-render its noise filter every frame.
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 900; c.height = img.naturalHeight || 600;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      woodImg = c; tableKey = '';
      if (reduce.matches) frameOnce();
    };
    img.src = src;
  }

  const useScene = () => mode === 'scene' && layout.view !== 'library' && layout.tableY > 0 && Scenes.has(id);
  const useVideo = () => useScene() && !!MEDIA[id] && !mediaDead();
  const still = () => reduce.matches || saveData; // no moving footage: show a still frame instead

  function loadMedia() {
    const cfg = MEDIA[id];
    media = { id, posterBad: false, videoBad: false };
    const posterName = cfg.held && still() ? cfg.held : id;
    const probe = new Image();
    probe.onerror = () => { if (media.id === id) { media.posterBad = true; syncVideo(); } };
    probe.src = `media/${posterName}.jpg`;
    vid.poster = probe.src;
    vid.loop = !cfg.once;
    vid.style.objectPosition = `50% ${cfg.focus * 100}%`;
    if (still()) { vid.removeAttribute('src'); media.videoBad = true; vid.load(); }
    else { vid.src = `media/${id}.mp4`; }
  }

  /** Show, play or pause the footage to match what's chosen and which screen is showing. */
  function syncVideo() {
    if (!vid) return;
    if (useVideo()) {
      if (media.id !== id) loadMedia();
      vid.style.height = (layout.tableY + 4) + 'px';
      if (canvas.classList.contains('on')) vid.classList.add('on');
      const done = MEDIA[id].once && vid.ended;
      if (!still() && !document.hidden && !done && vid.paused && vid.src) vid.play().catch(() => {});
    } else {
      vid.classList.remove('on');
      if (!vid.paused) vid.pause();
    }
  }

  function ensureScene() {
    const key = [id, W, H, layout.tableY].join('|');
    if (key !== sceneKey) {
      sceneKey = key;
      try { scene = Scenes.build(id, W, H, layout); } catch (e) { console.warn('scene failed', e); scene = null; }
    }
    return scene;
  }

  /** Switch ambience or look. Fades the old one out before the new one fades in. */
  function set(newId, newMode) {
    if (newMode === true) newMode = 'scene';
    if (newMode === false) newMode = 'off';
    if (newId === id && newMode === mode) return;
    clearTimeout(swapTimer);
    const wasOn = canvas.classList.contains('on');
    canvas.classList.remove('on');
    vid.classList.remove('on');
    swapTimer = setTimeout(() => {
      id = newId; mode = newMode;
      t0 = performance.now();
      wash = null; sceneKey = ''; overlayShown = '';
      seed();
      start();
      if (mode !== 'off' && id !== 'none') {
        lastDraw = 0;
        frameOnce();
        setTimeout(() => { canvas.classList.add('on'); syncVideo(); }, 30);
      } else {
        syncVideo();
      }
    }, wasOn ? 700 : 0);
  }

  function start() {
    stop();
    syncVideo();
    if (mode === 'off' || id === 'none' || document.hidden) { ctx.clearRect(0, 0, W, H); return; }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; if (vid && document.hidden && !vid.paused) vid.pause(); }

  function paint(t, dt) {
    if (useVideo()) {
      P.x += (P.tx - P.x) * Math.min(1, dt * 2.5);
      P.y += (P.ty - P.y) * Math.min(1, dt * 2.5);
      overFootage(t, dt);
      return;
    }
    overlayShown = '';
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (useScene() && ensureScene()) {
      P.x += (P.tx - P.x) * Math.min(1, dt * 2.5);
      P.y += (P.ty - P.y) * Math.min(1, dt * 2.5);
      const drift = { x: P.x + Math.sin(t * 0.07) * 0.15, y: P.y * 0.5 };
      scene.draw(ctx, t, dt, drift);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      drawTable(scene.light);
      focus();
    } else if (mode !== 'off') {
      DRAW[id] && DRAW[id](t, dt);
    }
    ctx.globalAlpha = 1;
  }

  /** Everything drawn on top of the filmed footage: a touch of depth, small extras, the table and soft edges. */
  let lastTf = '', overlay = null, overlayKey = '', overlayShown = '';
  function overFootage(t, dt) {
    const cfg = MEDIA[id];
    const top = layout.tableY;
    const tf = `translate(${(-P.x * 16).toFixed(1)}px, ${(-P.y * 6).toFixed(1)}px) scale(1.07)`;
    if (tf !== lastTf) { vid.style.transform = tf; lastTf = tf; }
    // the still parts (dimming, the table, soft edges) are painted once and reused
    const key = [id, W, H, top, woodSrc, !!woodImg].join('|');
    if (key !== overlayKey) {
      overlayKey = key; overlayShown = '';
      overlay = document.createElement('canvas');
      overlay.width = W; overlay.height = H;
      const g = overlay.getContext('2d');
      if (cfg.dim) { g.fillStyle = `rgba(0,0,0,${cfg.dim})`; g.fillRect(0, 0, W, top); }
      drawTable(cfg.light, g);
      focus(g);
    }
    const moving = cfg.glow || cfg.flies || cfg.flicker;
    if (!moving && overlayShown === key) return; // nothing changes frame to frame: leave the canvas alone
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(overlay, 0, 0);
    overlayShown = key;
    if (!moving) return;
    if (cfg.glow) { // the warmth of the sun arriving, as the dawn timelapse plays
      const k = vid.duration ? Math.min(1, vid.currentTime / vid.duration) : (still() ? 1 : 0);
      const a = 0.28 * Math.max(0, (k - 0.45) / 0.55);
      if (a > 0.005) {
        const g = ctx.createRadialGradient(W * 0.86, top, 0, W * 0.86, top, Math.max(W, H) * 0.7);
        g.addColorStop(0, `rgba(255,180,110,${a})`); g.addColorStop(1, 'rgba(255,180,110,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, top);
      }
    }
    if (cfg.flies) {
      for (const p of parts) {
        p.a += Math.sin(t * 0.7 + p.ph) * 0.9 * dt;
        p.x += Math.cos(p.a) * p.sp * dt; p.y += Math.sin(p.a) * p.sp * 0.5 * dt;
        if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
        if (p.y < top * 0.45) p.y = top * 0.45; if (p.y > top - 8) p.y = top - 8;
        const on = Math.pow(Math.max(0, Math.sin(t * p.pulse + p.ph)), 2);
        if (on < 0.03) continue;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
        g.addColorStop(0, `rgba(225,255,150,${0.8 * on})`); g.addColorStop(1, 'rgba(225,255,150,0)');
        ctx.fillStyle = g; ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
      }
    }
    if (cfg.flicker) { // firelight dancing on the table
      const f = 0.5 + 0.5 * (Math.sin(t * 7.3) * 0.5 + Math.sin(t * 11.7 + 1) * 0.3 + Math.sin(t * 3.1 + 2) * 0.2);
      ctx.fillStyle = `rgba(255,140,60,${0.03 + 0.05 * f})`; ctx.fillRect(0, top, W, H - top);
    }
  }

  /** The table the typewriter stands on, in the room theme's wood, lit by the scene. Painted once, then reused. */
  function drawTable(light, c = ctx) {
    const y = layout.tableY;
    const key = [W, H, y, light, woodSrc, !!woodImg].join('|');
    if (key !== tableKey) {
      tableKey = key;
      const h = Math.max(1, H - y + 4);
      table = document.createElement('canvas');
      table.width = W; table.height = h;
      const g = table.getContext('2d');
      g.fillStyle = woodImg ? g.createPattern(woodImg, 'repeat') : '#4a2d18';
      g.fillRect(0, 0, W, h);
      const sh = g.createLinearGradient(0, 0, 0, h);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.45)');
      g.fillStyle = sh; g.fillRect(0, 0, W, h);
      if (light) { g.fillStyle = light; g.fillRect(0, 0, W, h); }
      g.fillStyle = 'rgba(255,240,215,.22)'; g.fillRect(0, 0, W, 2); // the far edge catching the light
    }
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, y - 3, W, 3);  // its shadow on the scene
    c.drawImage(table, 0, y);
  }

  /** Soften the edges so the eye stays on the typewriter. */
  function focus(c = ctx) {
    const g = c.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.3, W / 2, H * 0.55, Math.max(W, H) * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  /** Draw a single frame straight away (so the scene is there before the first animation frame). */
  function frameOnce() {
    paint((performance.now() - t0) / 1000 + 0.5, 0);
  }

  function frame(now) {
    // ~30 fps is plenty for slow, soft movement and kinder to batteries
    if (now - lastDraw < 32 && !reduce.matches) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.06, (now - last) / 1000);
    last = now; lastDraw = now;
    paint((now - t0) / 1000, reduce.matches ? 0 : dt);
    raf = reduce.matches ? 0 : requestAnimationFrame(frame);
  }

  function seed() {
    parts = []; ripples = [];
    const n = (k) => Math.round(k * Math.max(0.35, (W * H) / (1440 * 900)));
    if (id === 'rain') for (let i = 0; i < n(170); i++) parts.push({ x: rnd(-50, W), y: rnd(-H, H), l: rnd(14, 32), v: rnd(650, 1050), a: rnd(0.12, 0.3) });
    if (id === 'snow') for (let i = 0; i < n(130); i++) parts.push({ x: rnd(0, W), y: rnd(-H, H), r: rnd(0.8, 2.8), v: rnd(16, 50), ph: rnd(0, TAU), sw: rnd(10, 34), a: rnd(0.35, 0.8) });
    if (id === 'fire') for (let i = 0; i < n(38); i++) parts.push(ember(true));
    if (id === 'sunrise' || id === 'sunset' || id === 'clock') for (let i = 0; i < n(55); i++) parts.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.6, 1.8), vx: rnd(-5, 5), vy: rnd(-4, 3), ph: rnd(0, TAU), sp: rnd(0.4, 1.2) });
    if (id === 'night') for (let i = 0; i < n(16); i++) parts.push({ x: rnd(0, W), y: rnd(0, H), a: rnd(0, TAU), sp: rnd(8, 22), ph: rnd(0, TAU), pulse: rnd(0.5, 1.3) });
    if (id === 'sea') for (let i = 0; i < n(40); i++) parts.push({ x: rnd(0, W), y: rnd(0, H), ph: rnd(0, TAU), sp: rnd(0.5, 1.6) });
  }

  function ember(anywhere) {
    return { x: rnd(-20, W * 0.32), y: anywhere ? rnd(H * 0.3, H + 20) : H + rnd(0, 40), v: rnd(18, 55), r: rnd(0.8, 2.2), ph: rnd(0, TAU) };
  }

  /** A tint that is light in the middle (where the typewriter is) and stronger towards the edges. */
  function tint(rgb, mid, edge) {
    const key = rgb + mid + edge;
    if (!wash || wash.key !== key) {
      const g = ctx.createRadialGradient(W / 2, H * 0.62, Math.min(W, H) * 0.15, W / 2, H * 0.62, Math.max(W, H) * 0.78);
      g.addColorStop(0, `rgba(${rgb},${mid})`);
      g.addColorStop(1, `rgba(${rgb},${edge})`);
      wash = { key, g };
    }
    ctx.fillStyle = wash.g;
    ctx.fillRect(0, 0, W, H);
  }

  function glow(x, y, r, stops) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  const DRAW = {
    rain(t, dt) {
      tint('22,36,62', 0.08, 0.3);
      ctx.strokeStyle = 'rgb(205,220,245)';
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      for (const p of parts) {
        p.y += p.v * dt; p.x += p.v * 0.12 * dt;
        if (p.y > H + 30) {
          if (Math.random() < 0.2) ripples.push({ x: p.x, y: rnd(H * 0.25, H), r: 1, a: 0.16 });
          p.y = rnd(-80, -10); p.x = rnd(-60, W);
        }
        ctx.globalAlpha = p.a;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.l * 0.12, p.y - p.l); ctx.stroke();
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.r += 24 * dt; r.a -= 0.12 * dt;
        if (r.a <= 0) { ripples.splice(i, 1); continue; }
        ctx.globalAlpha = r.a;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.45, 0, 0, TAU); ctx.stroke();
      }
    },

    fire(t, dt) {
      const f = 0.78 + 0.22 * (Math.sin(t * 7.3) * 0.5 + Math.sin(t * 11.7 + 1) * 0.3 + Math.sin(t * 3.1 + 2) * 0.2);
      tint('255,170,90', 0.02, 0.06);
      glow(-W * 0.02, H * 1.04, Math.max(W, H) * 0.9, [
        [0, `rgba(255,150,60,${0.34 * f})`], [0.45, `rgba(255,115,40,${0.12 * f})`], [1, 'rgba(255,100,30,0)'],
      ]);
      for (const p of parts) {
        p.y -= p.v * dt;
        p.x += (Math.sin(t * 1.3 + p.ph) * 14 + 9) * dt;
        if (p.y < H * 0.18) Object.assign(p, ember(false));
        const life = Math.max(0, Math.min(1, (p.y - H * 0.18) / (H * 0.7)));
        ctx.globalAlpha = life * 0.75 * (0.55 + 0.45 * Math.sin(t * 9 + p.ph));
        ctx.fillStyle = 'rgb(255,185,95)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }
    },

    sea(t) {
      const swell = 0.5 + 0.5 * Math.sin(TAU * 0.085 * t); // same slow rhythm as the waves you hear
      tint('18,78,98', 0.05 + 0.04 * swell, 0.24);
      ctx.strokeStyle = 'rgb(170,235,255)';
      for (let k = 0; k < 6; k++) {
        const y0 = H * (0.08 + k * 0.17) + 22 * Math.sin(t * 0.3 + k);
        ctx.globalAlpha = 0.03 + 0.03 * swell;
        ctx.lineWidth = 24 + 14 * Math.sin(t * 0.5 + k);
        ctx.beginPath();
        for (let x = -40; x <= W + 40; x += 40) {
          const y = y0 + 18 * Math.sin(x * 0.006 + t * 0.6 + k * 1.7) + 10 * Math.sin(x * 0.013 - t * 0.9 + k);
          x === -40 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      for (const p of parts) {
        const s = Math.max(0, Math.sin(t * p.sp + p.ph));
        ctx.globalAlpha = Math.pow(s, 10) * 0.55;
        ctx.fillRect(p.x, p.y, 1.6, 1.6);
      }
    },

    sunrise(t, dt) {
      const rise = Math.min(1, t / 25);
      const b = (0.6 + 0.4 * rise) * (0.93 + 0.07 * Math.sin(t * 0.4));
      glow(W * 1.04, -H * 0.12, Math.max(W, H) * 1.15, [
        [0, `rgba(255,196,120,${0.32 * b})`], [0.5, `rgba(255,160,95,${0.12 * b})`], [1, 'rgba(255,150,90,0)'],
      ]);
      glow(-W * 0.05, -H * 0.1, Math.max(W, H) * 0.7, [[0, `rgba(205,150,200,${0.08 * b})`], [1, 'rgba(205,150,200,0)']]);
      // long soft rays from the top-right corner
      for (let i = 0; i < 5; i++) {
        const a = 2.25 + i * 0.12 + Math.sin(t * 0.15 + i) * 0.02, w = 0.035 + (i % 2) * 0.02;
        const ox = W * 1.02, oy = -H * 0.06, L = Math.max(W, H) * 1.6;
        const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(a) * L, oy + Math.sin(a) * L);
        g.addColorStop(0, `rgba(255,220,160,${0.07 * b})`); g.addColorStop(1, 'rgba(255,220,160,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(a - w) * L, oy + Math.sin(a - w) * L);
        ctx.lineTo(ox + Math.cos(a + w) * L, oy + Math.sin(a + w) * L);
        ctx.closePath(); ctx.fill();
      }
      motes(t, dt, 'rgb(255,236,200)', 0.45 * b);
    },

    sunset(t, dt) {
      const b = 0.92 + 0.08 * Math.sin(t * 0.3);
      glow(W * 1.02, H * 0.78, Math.max(W, H) * 1.1, [
        [0, `rgba(255,170,90,${0.3 * b})`], [0.45, `rgba(255,140,90,${0.1 * b})`], [1, 'rgba(255,140,90,0)'],
      ]);
      glow(-W * 0.05, -H * 0.1, Math.max(W, H) * 0.8, [[0, 'rgba(190,120,170,.1)'], [1, 'rgba(190,120,170,0)']]);
      motes(t, dt, 'rgb(255,220,170)', 0.4);
    },

    snow(t, dt) {
      tint('190,206,232', 0.03, 0.18);
      ctx.fillStyle = '#fff';
      for (const p of parts) {
        p.y += p.v * dt;
        if (p.y > H + 6) { p.y = -6; p.x = rnd(0, W); }
        ctx.globalAlpha = p.a * 0.75;
        ctx.beginPath(); ctx.arc(p.x + Math.sin(t * 0.5 + p.ph) * p.sw, p.y, p.r, 0, TAU); ctx.fill();
      }
    },

    night(t, dt) {
      glow(W / 2, H * 0.6, Math.max(W, H) * 0.8, [[0, 'rgba(6,10,28,0)'], [0.3, 'rgba(6,10,28,0.12)'], [1, 'rgba(6,10,28,0.5)']]);
      for (const p of parts) {
        p.a += Math.sin(t * 0.7 + p.ph) * 0.9 * dt;
        p.x += Math.cos(p.a) * p.sp * dt; p.y += Math.sin(p.a) * p.sp * dt;
        if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
        const on = Math.pow(Math.max(0, Math.sin(t * p.pulse + p.ph)), 2);
        if (on < 0.02) continue;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12);
        g.addColorStop(0, `rgba(220,255,150,${0.75 * on})`); g.addColorStop(1, 'rgba(220,255,150,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(p.x - 12, p.y - 12, 24, 24);
      }
    },

    clock(t, dt) {
      // a pendulum's soft shadow swinging across the desk, in time with the ticks
      const ct = Sound.clock ?? t;
      const ang = 0.15 * Math.cos(Math.PI * ct);
      tint('255,200,140', 0.0, 0.06);
      ctx.save();
      ctx.translate(W * 0.74, -H * 0.55);
      ctx.rotate(ang);
      const L = H * 1.3;
      const rod = ctx.createLinearGradient(-8, 0, 8, 0);
      rod.addColorStop(0, 'rgba(0,0,0,0)'); rod.addColorStop(0.5, 'rgba(0,0,0,0.12)'); rod.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rod;
      ctx.fillRect(-8, 0, 16, L);
      const bob = ctx.createRadialGradient(0, L, 0, 0, L, 70);
      bob.addColorStop(0, 'rgba(0,0,0,0.2)'); bob.addColorStop(0.6, 'rgba(0,0,0,0.1)'); bob.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bob;
      ctx.beginPath(); ctx.arc(0, L, 70, 0, TAU); ctx.fill();
      ctx.restore();
      motes(t, dt, 'rgb(255,236,200)', 0.3);
    },
  };

  function motes(t, dt, color, strength) {
    ctx.fillStyle = color;
    for (const p of parts) {
      p.x += (p.vx + Math.sin(t * 0.3 + p.ph) * 3) * dt;
      p.y += (p.vy + Math.cos(t * 0.25 + p.ph) * 3) * dt;
      if (p.x < -5) p.x = W + 5; if (p.x > W + 5) p.x = -5;
      if (p.y < -5) p.y = H + 5; if (p.y > H + 5) p.y = -5;
      ctx.globalAlpha = strength * (0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(t * p.sp + p.ph)), 2));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
  }

  return { init, mount, set, setLayout, themeChanged, frameOnce, get id() { return id; }, get mode() { return mode; } };
})();
