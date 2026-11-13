/* All sounds are synthesised with WebAudio, so no audio files are needed.
   A keystroke = sharp click (slug on platen) + body resonance + short metallic ring + low thump + escapement tick. */
const Sound = (() => {
  // ---------------- typewriter voices ----------------
  const P = {
    classic: {
      click: { f: 3000, q: 0.8, g: 0.95, d: 0.03 }, body: { f: 820, q: 1.4, g: 0.6, d: 0.08 },
      ring: { f0: 1250, parts: [1, 1.48, 2.31, 3.12], g: 0.08, d: 0.075 }, thump: { f: 115, to: 52, g: 0.55, d: 0.085 },
      esc: { delay: 0.052, f: 4300, g: 0.22 }, bell: { f: 1880, g: 0.42, d: 1.7 }, cr: 'manual', jit: 0.08,
    },
    office: {
      click: { f: 2300, q: 0.7, g: 0.95, d: 0.036 }, body: { f: 560, q: 1.1, g: 0.8, d: 0.12 },
      ring: { f0: 820, parts: [1, 1.52, 2.4], g: 0.07, d: 0.11 }, thump: { f: 92, to: 42, g: 0.85, d: 0.12 },
      esc: { delay: 0.064, f: 3600, g: 0.25 }, bell: { f: 1520, g: 0.48, d: 2.4 }, cr: 'manual', jit: 0.06,
    },
    portable: {
      click: { f: 4300, q: 0.9, g: 0.8, d: 0.022 }, body: { f: 1350, q: 1.7, g: 0.5, d: 0.05 },
      ring: { f0: 2150, parts: [1, 1.43, 2.2, 2.9], g: 0.1, d: 0.05 }, thump: { f: 165, to: 85, g: 0.32, d: 0.05 },
      esc: { delay: 0.042, f: 5200, g: 0.2 }, bell: { f: 2350, g: 0.34, d: 1.1 }, cr: 'manual', jit: 0.1,
    },
    electric: {
      click: { f: 3700, q: 1.1, g: 0.85, d: 0.016 }, body: { f: 1050, q: 1.2, g: 0.4, d: 0.04 },
      ring: null, thump: { f: 140, to: 70, g: 0.4, d: 0.04 },
      esc: null, bell: { f: 1320, g: 0.2, d: 0.6, soft: true }, cr: 'electric', hum: true, jit: 0.03,
    },
    muffled: {
      lowpass: 1500,
      click: { f: 1700, q: 0.7, g: 0.45, d: 0.03 }, body: { f: 520, q: 1, g: 0.55, d: 0.08 },
      ring: null, thump: { f: 100, to: 50, g: 0.55, d: 0.09 },
      esc: { delay: 0.055, f: 1900, g: 0.08 }, bell: { f: 1500, g: 0.14, d: 1 }, cr: 'manual', jit: 0.08,
    },
    silent: null,
  };

  let ctx = null, master = null, sfxBus = null, sfxFilter = null, ambBus = null, W = null, B = null;
  let enabled = true, profile = 'classic', volume = 0.8, ambId = 'none', ambVol = 0.5, onDesk = false;
  let ambience = null, hum = null;

  function makeBuffers(c) {
    const w = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = w.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const b = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
    const e = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < e.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; e[i] = last * 3.5; }
    return { w, b };
  }

  function init() {
    if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 1 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4; comp.knee.value = 6; comp.attack.value = 0.002; comp.release.value = 0.12;
    master.connect(comp).connect(ctx.destination);
    sfxFilter = ctx.createBiquadFilter();
    sfxFilter.type = 'lowpass'; sfxFilter.Q.value = 0.5;
    sfxBus = ctx.createGain();
    sfxBus.connect(sfxFilter).connect(master);
    ambBus = ctx.createGain();
    ambBus.connect(master);
    ({ w: W, b: B } = makeBuffers(ctx));
    // unlock (iOS/Safari): play a silent buffer inside the user gesture
    const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0);
    if (ctx.state !== 'running') ctx.resume();
    applyLevels();
    applyProfile();
    startAmbience();
  }

  function applyLevels() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(enabled ? 1 : 0, t, 0.03);
    sfxBus.gain.setTargetAtTime(volume * volume * 1.1, t, 0.02);
    ambBus.gain.setTargetAtTime(ambVol * ambVol * 0.9, t, 0.1);
  }
  function applyProfile() {
    if (!ctx) return;
    const p = P[profile];
    sfxFilter.frequency.value = p && p.lowpass ? p.lowpass : 20000;
    setHum(!!(p && p.hum && onDesk));
  }

  const live = () => ctx && enabled && P[profile] && ctx.state === 'running';
  const E = () => ({ c: ctx, out: sfxBus, w: W, b: B });

  // ---------------- primitives ----------------
  function nz(e, t, dur, o) {
    const c = e.c, s = c.createBufferSource();
    s.buffer = o.brown ? e.b : e.w;
    const f = c.createBiquadFilter();
    f.type = o.type || 'bandpass'; f.frequency.value = o.f || 1000; f.Q.value = o.q ?? 1;
    const g = c.createGain();
    const a = o.a ?? 0.0015;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(o.g, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(o.out || e.out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return f;
  }
  function tn(e, t, dur, o) {
    const c = e.c, osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(o.g, 0.0002), t + (o.a ?? 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.out || e.out);
    osc.start(t); osc.stop(t + dur + 0.05);
    return osc;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------------- voices ----------------
  const V = {
    key(e, t, p, accent = 1) {
      const j = () => 1 + (Math.random() - 0.5) * 2 * p.jit;
      const a = accent * rnd(0.85, 1.12);
      nz(e, t, p.click.d, { f: p.click.f * j(), q: p.click.q, g: p.click.g * a });
      nz(e, t + 0.002, p.body.d, { f: p.body.f * j(), q: p.body.q, g: p.body.g * a });
      if (p.ring) p.ring.parts.forEach((m, i) =>
        tn(e, t + 0.001, p.ring.d * (1 - i * 0.15), { f: p.ring.f0 * m * j(), g: (p.ring.g * a) / (1 + i * 0.6) }));
      tn(e, t, p.thump.d, { type: 'triangle', f: p.thump.f * j(), to: p.thump.to, g: p.thump.g * a });
      if (p.esc) nz(e, t + p.esc.delay * j(), 0.02, { f: p.esc.f, q: 2.5, g: p.esc.g * rnd(0.8, 1.1) });
    },
    space(e, t, p) {
      nz(e, t, p.body.d * 1.2, { f: p.body.f * 0.75, q: 1, g: p.body.g * 0.9 });
      tn(e, t, p.thump.d * 1.2, { type: 'triangle', f: p.thump.f * 0.75, to: p.thump.to * 0.8, g: p.thump.g * 1.1 });
      nz(e, t, 0.012, { f: p.click.f * 0.6, q: 0.8, g: p.click.g * 0.25 });
      if (p.esc) nz(e, t + p.esc.delay, 0.02, { f: p.esc.f, q: 2.5, g: p.esc.g });
    },
    back(e, t, p) {
      nz(e, t, 0.02, { f: p.click.f * 0.8, q: 1, g: p.click.g * 0.35 });
      tn(e, t, 0.05, { type: 'triangle', f: p.thump.f * 1.2, to: p.thump.to, g: p.thump.g * 0.6 });
      if (p.esc) nz(e, t + 0.03, 0.02, { f: p.esc.f * 0.9, q: 2.5, g: p.esc.g * 0.9 });
    },
    shift(e, t, p) {
      nz(e, t, 0.09, { f: 480, q: 1, g: 0.4 });
      tn(e, t, 0.1, { type: 'triangle', f: 72, to: 50, g: 0.35 });
    },
    bell(e, t, p) {
      const b = p.bell;
      const parts = b.soft ? [[1, 1, 1], [2, 0.15, 0.5]] : [[1, 1, 1], [2.76, 0.32, 0.55], [5.4, 0.16, 0.3], [1.006, 0.5, 0.85]];
      parts.forEach(([m, g, d]) => tn(e, t, b.d * d, { f: b.f * m, g: b.g * g, a: 0.002 }));
      nz(e, t, 0.01, { f: 5000, q: 1, g: 0.15 });
    },
    carriageReturn(e, t, p) {
      if (p.cr === 'electric') {
        const o = tn(e, t, 0.32, { type: 'sawtooth', f: 95, to: 70, g: 0.18, a: 0.03 });
        o.detune && (o.detune.value = 0);
        const f = nz(e, t, 0.3, { type: 'lowpass', f: 900, q: 0.8, g: 0.12, a: 0.03 });
        f.frequency.exponentialRampToValueAtTime(400, t + 0.3);
        nz(e, t + 0.3, 0.08, { f: 700, q: 1, g: 0.6 });
        tn(e, t + 0.3, 0.1, { type: 'triangle', f: 110, to: 60, g: 0.5 });
        return;
      }
      for (let i = 0; i < 4; i++) nz(e, t + i * 0.028, 0.02, { f: 3100, q: 3, g: 0.32 });
      const f = nz(e, t + 0.05, 0.34, { type: 'lowpass', f: 900, q: 0.7, g: 0.28, a: 0.04 });
      f.frequency.exponentialRampToValueAtTime(260, t + 0.38);
      nz(e, t + 0.39, 0.1, { f: 620, q: 1, g: 0.75 });
      tn(e, t + 0.39, 0.14, { type: 'triangle', f: 95, to: 48, g: 0.6 });
      nz(e, t + 0.39, 0.012, { f: 2800, q: 1, g: 0.3 });
    },
    roll(e, t, p) { // platen turned by one line
      nz(e, t, 0.018, { f: 2900, q: 3, g: 0.32 });
      tn(e, t, 0.03, { type: 'triangle', f: 180, to: 120, g: 0.12 });
    },
    move(e, t, p) { // carriage slid to a new spot
      const f = nz(e, t, 0.22, { type: 'lowpass', f: 1200, q: 0.7, g: 0.34, a: 0.03 });
      f.frequency.exponentialRampToValueAtTime(400, t + 0.22);
      nz(e, t + 0.2, 0.02, { f: 3000, q: 2, g: 0.35 });
    },
    feed(e, t, p, n = 12) {
      for (let i = 0; i < n; i++) nz(e, t + i * 0.045 + Math.random() * 0.01, 0.022, { f: 2800, q: 3, g: 0.42 });
      nz(e, t, n * 0.045, { type: 'lowpass', f: 400, q: 0.5, g: 0.1, a: 0.02 });
    },
    pull(e, t, p) {
      const f = nz(e, t, 0.55, { f: 1200, q: 0.6, g: 0.3, a: 0.05 });
      f.frequency.exponentialRampToValueAtTime(3800, t + 0.5);
      for (let i = 0; i < 8; i++) nz(e, t + i * 0.05, 0.02, { f: 3000, q: 3, g: 0.16 });
    },
    flip(e, t, p) {
      const f = nz(e, t, 0.42, { f: 700, q: 0.7, g: 0.32, a: 0.06 });
      f.frequency.exponentialRampToValueAtTime(3000, t + 0.3);
      nz(e, t + 0.12, 0.25, { type: 'highpass', f: 3500, q: 0.5, g: 0.06, a: 0.05 });
      nz(e, t + 0.4, 0.12, { type: 'lowpass', f: 320, q: 0.8, g: 0.32 });
    },
  };

  // UI sounds (page flip/pull/feed) play even with "silent keys"; they use the classic voice.
  function play(name, opt = {}) {
    if (!ctx || !enabled || ctx.state !== 'running') return;
    const isKey = ['key', 'space', 'back', 'shift', 'bell', 'carriageReturn'].includes(name);
    const p = P[profile] || (isKey ? null : P.classic);
    if (!p) return;
    V[name](E(), ctx.currentTime + (opt.delay || 0), p, opt.arg);
  }

  // ---------------- electric motor hum ----------------
  function setHum(on) {
    if (!ctx) return;
    if (on && !hum) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 60;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
      const g = ctx.createGain(); g.gain.value = 0.0001;
      const n = ctx.createBufferSource(); n.buffer = B; n.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 300;
      const ng = ctx.createGain(); ng.gain.value = 0.05;
      o.connect(lp).connect(g); n.connect(nf).connect(ng).connect(g);
      g.connect(sfxBus);
      g.gain.setTargetAtTime(0.09, ctx.currentTime, 0.4);
      o.start(); n.start();
      hum = { o, n, g };
    } else if (!on && hum) {
      const h = hum; hum = null;
      h.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
      setTimeout(() => { try { h.o.stop(); h.n.stop(); } catch (e) {} }, 800);
    }
  }

  // ---------------- ambience ----------------
  function loopNoise(brown, type, f, q, g) {
    const s = ctx.createBufferSource(); s.buffer = brown ? B : W; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const gn = ctx.createGain(); gn.gain.value = g;
    s.connect(fl).connect(gn).connect(ambience.bus);
    s.start(0, Math.random() * 2);
    ambience.nodes.push(s);
    return { s, fl, gn };
  }

  function startAmbience() {
    stopAmbience();
    if (!ctx || ambId === 'none') return;
    const bus = ctx.createGain();
    bus.gain.value = 0.0001;
    bus.connect(ambBus);
    bus.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    ambience = { bus, nodes: [], timer: 0, next: ctx.currentTime };
    const e = { c: ctx, out: bus, w: W, b: B };

    if (ambId === 'rain') {
      loopNoise(false, 'bandpass', 2600, 0.35, 0.16);
      loopNoise(true, 'lowpass', 500, 0.5, 0.45);
      ambience.tick = (t0, t1) => {
        const n = Math.floor(rnd(2, 7));
        for (let i = 0; i < n; i++) nz(e, rnd(t0, t1), rnd(0.008, 0.02), { f: rnd(2500, 7000), q: rnd(2, 6), g: rnd(0.03, 0.14) });
      };
    } else if (ambId === 'fire') {
      loopNoise(true, 'lowpass', 380, 0.6, 0.7);
      loopNoise(false, 'bandpass', 1100, 0.4, 0.025);
      ambience.tick = (t0, t1) => {
        if (Math.random() < 0.45) {
          const t = rnd(t0, t1), n = Math.floor(rnd(1, 5));
          for (let i = 0; i < n; i++) nz(e, t + i * rnd(0.004, 0.02), rnd(0.003, 0.012), { type: 'highpass', f: rnd(1500, 4000), q: 0.7, g: rnd(0.08, 0.5) });
        }
        if (Math.random() < 0.03) tn(e, rnd(t0, t1), 0.06, { type: 'triangle', f: rnd(120, 220), to: 60, g: 0.25 });
      };
    } else if (ambId === 'sea') {
      const roar = loopNoise(true, 'lowpass', 520, 0.6, 0.5);
      const foam = loopNoise(false, 'highpass', 2200, 0.5, 0.05);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.085;
      const d1 = ctx.createGain(); d1.gain.value = 0.38;
      const d2 = ctx.createGain(); d2.gain.value = 0.045;
      const d3 = ctx.createGain(); d3.gain.value = 260;
      lfo.connect(d1).connect(roar.gn.gain);
      lfo.connect(d2).connect(foam.gn.gain);
      lfo.connect(d3).connect(roar.fl.frequency);
      lfo.start();
      ambience.nodes.push(lfo);
      ambience.tick = () => {};
    } else if (ambId === 'clock') {
      ambience.beat = Math.ceil(ctx.currentTime);
      ambience.odd = false;
      ambience.tick = (t0, t1) => {
        while (ambience.beat < t1) {
          if (ambience.beat >= t0) {
            const f = ambience.odd ? 2500 : 3300;
            nz(e, ambience.beat, 0.035, { f, q: 7, g: 0.4 });
            tn(e, ambience.beat, 0.025, { f: f * 0.62, g: 0.05 });
          }
          ambience.odd = !ambience.odd;
          ambience.beat += 1;
        }
      };
    }
    // scheduler: look 150 ms ahead every 60 ms
    ambience.next = ctx.currentTime;
    ambience.timer = setInterval(() => {
      if (!ambience || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const t0 = Math.max(ambience.next, now), t1 = now + 0.15;
      if (t1 > t0) ambience.tick(t0, t1);
      ambience.next = t1;
    }, 60);
  }

  function stopAmbience() {
    if (!ambience) return;
    const a = ambience; ambience = null;
    clearInterval(a.timer);
    a.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
    setTimeout(() => { a.nodes.forEach((n) => { try { n.stop(); } catch (e) {} }); a.bus.disconnect(); }, 1500);
  }

  // ---------------- offline measurement (used to check levels) ----------------
  async function measure(name, prof = profile) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const sr = 44100, oc = new OAC(1, sr * 1.5, sr);
    const { w, b } = makeBuffers(oc);
    const out = oc.createGain(); out.connect(oc.destination);
    V[name]({ c: oc, out, w, b }, 0.02, P[prof] || P.classic);
    const buf = await oc.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0, sum = 0;
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += v * v; }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
  }

  return {
    init,
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; applyLevels(); },
    get state() { return ctx ? ctx.state : 'none'; },
    setProfile(id) { profile = P[id] !== undefined ? id : 'classic'; applyProfile(); },
    setVolume(v) { volume = v; applyLevels(); },
    setAmbience(id) { ambId = id; if (ctx) startAmbience(); },
    setAmbienceVolume(v) { ambVol = v; applyLevels(); },
    setDesk(on) { onDesk = on; applyProfile(); },
    key: (delay) => play('key', { delay }),
    space: () => play('space'),
    back: () => play('back'),
    shift: () => play('shift'),
    bell: () => play('bell'),
    carriageReturn: () => play('carriageReturn'),
    roll: () => play('roll'),
    move: () => play('move'),
    feed: (n) => play('feed', { arg: n }),
    pull: () => play('pull'),
    flip: () => play('flip'),
    demo() {
      if (!live()) return;
      const t = ctx.currentTime, e = E(), p = P[profile];
      [0, 0.13, 0.24, 0.4, 0.5, 0.66, 0.75].forEach((d, i) => (i === 3 ? V.space(e, t + d, p) : V.key(e, t + d, p)));
      V.bell(e, t + 0.95, p);
      V.carriageReturn(e, t + 1.3, p);
    },
    measure,
  };
})();
