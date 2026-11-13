/* The typewriter itself: builds the drawing, animates keys / typebars / carriage, reports clicks. */
const Machine = (() => {
  const { PX, PY, CLIP, W, H } = MACH;
  const { PW, PH, CW, LH, MX, MT, COLS } = CFG;

  // ---- keyboard layout (design coords: key centre) ----
  const R1 = 480, R2 = 540, R3 = 600, R4 = 660;
  const KEYS = [];
  '1234567890-='.split('').forEach((c, i) => KEYS.push({ id: c, x: 128 + i * 62, y: R1 }));
  KEYS.push({ id: 'BKSP', x: 128 + 12 * 62, y: R1, label: 'BACK<br>SPACE', fn: 'backspace' });
  KEYS.push({ id: 'TAB', x: 112, y: R2, label: 'TAB', fn: 'tab' });
  'QWERTYUIOP'.split('').forEach((c, i) => KEYS.push({ id: c, x: 190 + i * 62, y: R2 }));
  KEYS.push({ id: "'", x: 190 + 10 * 62, y: R2 });
  KEYS.push({ id: 'LOCK', x: 122, y: R3, label: 'SHIFT<br>LOCK', fn: 'lock' });
  'ASDFGHJKL;'.split('').forEach((c, i) => KEYS.push({ id: c, x: 206 + i * 62, y: R3 }));
  KEYS.push({ id: 'RET', x: 206 + 10 * 62 + 26, y: R3, label: 'RETURN', fn: 'return', wide: 78 });
  KEYS.push({ id: 'SHL', x: 132, y: R4, label: 'SHIFT', fn: 'shift' });
  'ZXCVBNM,./'.split('').forEach((c, i) => KEYS.push({ id: c, x: 222 + i * 62, y: R4 }));
  KEYS.push({ id: 'SHR', x: 222 + 10 * 62 + 20, y: R4, label: 'SHIFT', fn: 'shift' });

  const SHIFTED = { '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '¢', '7': '&', '8': '*', '9': '(', '0': ')',
    '-': '_', '=': '+', "'": '"', ';': ':', ',': ',', '.': '.', '/': '?' };
  const UNSHIFT = { '^': '6' };
  for (const [b, s] of Object.entries(SHIFTED)) if (s !== b) UNSHIFT[s] = b;
  UNSHIFT['<'] = ','; UNSHIFT['>'] = '.';

  /** Which key on the machine produces this character? */
  function keyIdFor(ch) {
    if (/^[a-z]$/i.test(ch)) return ch.toUpperCase();
    if (UNSHIFT[ch]) return UNSHIFT[ch];
    return ch;
  }

  // ---- typebar geometry ----
  const charKeys = KEYS.filter((k) => !k.fn).sort((a, b) => a.x - b.x || a.y - b.y);
  const NB = charKeys.length;
  const BAR = {};
  const bars = charKeys.map((k, i) => {
    const th = ((165 - i * (150 / (NB - 1))) * Math.PI) / 180;
    const b = {
      key: k.id,
      px: 500 + 200 * Math.cos(th), py: 262 + 48 * Math.sin(th),
      tx: 500 + 300 * Math.cos(th), ty: 318 + 100 * Math.sin(th),
    };
    BAR[k.id] = i;
    return b;
  });
  const STRIKE = { x: PX, y: PY + 4 };

  let root, els = {}, handlers = {};
  let curX = 0, curY = 0, shiftOff = 0;
  let spoolAngle = 0;

  // ================= build =================
  function build(container, h) {
    root = container;
    handlers = h || {};
    root.style.width = W + 'px';
    root.style.height = H + 'px';
    root.innerHTML = `
      <div class="carriage carriage-back">
        <div class="paper-table" style="left:-50px;width:${PW + 100}px;top:30px;height:160px">
          <span class="guide l"></span><span class="guide r"></span>
        </div>
      </div>
      <div class="paper-window" style="left:-2600px;top:-4000px;width:6200px;height:${4000 + CLIP}px">
        <div class="paper-holder" style="left:2600px;top:4000px"></div>
      </div>
      <div class="carriage carriage-front">
        <div class="platen" style="left:-120px;width:${PW + 240}px;top:178px;height:60px"></div>
        <div class="paper-wrap" style="left:0;width:${PW}px;top:${CLIP - 2}px;height:${222 - CLIP}px"></div>
        <div class="bail" style="left:-70px;width:${PW + 140}px;top:199px">
          <span class="roller" style="left:${70 + PW * 0.22}px"></span><span class="roller" style="left:${70 + PW * 0.78 - 26}px"></span>
        </div>
        <div class="scale" style="left:${MX - 8}px;width:${COLS * CW + 16}px;top:214px">${scaleSVG()}</div>
        <div class="endcap" style="left:-128px;top:182px"></div>
        <div class="endcap" style="left:${PW + 120}px;top:182px"></div>
        <div class="knob" style="left:-176px;top:174px"></div>
        <div class="knob" style="left:${PW + 128}px;top:174px"></div>
        <div class="lever-wrap" style="left:-300px;top:150px">
          <button class="lever" id="lever" aria-label="Carriage return lever" tabindex="-1">
            <span class="lever-arm"></span><span class="lever-paddle"></span><span class="lever-ball"></span>
          </button>
        </div>
        <div class="release" style="left:${PW + 150}px;top:150px"></div>
      </div>
      ${bodySVG()}
      ${barsSVG()}
      <div class="keys" id="keys">${keysHTML()}</div>
    `;

    els.back = root.querySelector('.carriage-back');
    els.front = root.querySelector('.carriage-front');
    els.holder = root.querySelector('.paper-holder');
    els.lever = root.querySelector('#lever');
    els.barLines = [...root.querySelectorAll('.tb line')];
    els.barSlugs = [...root.querySelectorAll('.tb rect')];
    els.ribbonA = root.querySelector('#ribbonA');
    els.ribbonB = root.querySelector('#ribbonB');
    els.vibe = root.querySelector('#vibe');
    els.spools = [...root.querySelectorAll('.spokes')];
    els.keys = {};
    root.querySelectorAll('[data-key]').forEach((k) => (els.keys[k.dataset.key] = k));

    // pointer input on the on-screen keys
    root.querySelector('#keys').addEventListener('pointerdown', (e) => {
      const k = e.target.closest('[data-key]');
      if (!k) return;
      e.preventDefault();
      handlers.onKey && handlers.onKey(k.dataset.key);
    });
    // click a character on the paper to bring the carriage to it
    els.holder.addEventListener('pointerdown', (e) => {
      const sheet = e.target.closest('.sheet.current');
      if (!sheet || !handlers.onPaperClick) return;
      e.preventDefault();
      const r = sheet.getBoundingClientRect();
      const k = r.width / PW;
      const x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
      handlers.onPaperClick(Math.floor((y - MT) / LH), Math.floor((x - MX) / CW));
    });
    els.lever.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handlers.onKey && handlers.onKey('RET');
    });
    setRibbon(0);
  }

  function scaleSVG() {
    const w = COLS * CW + 16;
    let s = `<svg width="${w}" height="12" viewBox="0 0 ${w} 12">`;
    for (let i = 0; i <= COLS; i++) {
      const x = 8 + i * CW + CW / 2;
      const big = i % 5 === 0;
      s += `<line x1="${x}" y1="0" x2="${x}" y2="${big ? 5 : 3}" />`;
      if (i % 10 === 0 && i > 0 && i < COLS) s += `<text x="${x}" y="11">${i}</text>`;
    }
    return s + '</svg>';
  }

  function keysHTML() {
    let h = '';
    for (const k of KEYS) {
      const w = k.wide || 50;
      const label = k.label ? `<span class="lbl">${k.label}</span>`
        : (SHIFTED[k.id] && SHIFTED[k.id] !== k.id ? `<small>${escapeHTML(SHIFTED[k.id])}</small>` : '') + `<b>${escapeHTML(k.id)}</b>`;
      h += `<button class="key${k.fn ? ' fn' : ''}${k.wide ? ' wide' : ''}" data-key="${escapeHTML(k.id)}" tabindex="-1"
        aria-label="${k.fn || k.id}" style="left:${k.x - w / 2}px;top:${k.y - 25}px;width:${w}px"><span class="face">${label}</span></button>`;
    }
    h += `<button class="spacebar" data-key=" " tabindex="-1" aria-label="space" style="left:290px;top:698px;width:420px"></button>`;
    return h;
  }

  function bodySVG() {
    // key levers running back into the machine
    let rods = '';
    for (const k of KEYS) {
      const ex = 500 + (k.x - 500) * 0.6;
      rods += `<line x1="${k.x}" y1="${k.y + 18}" x2="${ex.toFixed(1)}" y2="444" />`;
    }
    rods += `<line x1="330" y1="706" x2="390" y2="444" /><line x1="670" y1="706" x2="610" y2="444" />`;

    return `
    <svg class="body-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <defs>
        <linearGradient id="gLac" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style="stop-color:var(--fin-a)"/><stop offset="1" style="stop-color:var(--fin-b)"/>
        </linearGradient>
        <linearGradient id="gLacH" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style="stop-color:var(--fin-b)"/><stop offset=".45" style="stop-color:var(--fin-a)"/><stop offset="1" style="stop-color:var(--fin-b)"/>
        </linearGradient>
        <linearGradient id="gShine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".25" stop-color="#fff" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="gChrome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fdfdfd"/><stop offset=".45" stop-color="#a5a5a5"/><stop offset=".6" stop-color="#e2e2e2"/><stop offset="1" stop-color="#5a5a5a"/>
        </linearGradient>
        <radialGradient id="gWell" cx=".5" cy="0" r="1">
          <stop offset="0" stop-color="#262422"/><stop offset=".7" stop-color="#080707"/>
        </radialGradient>
        <linearGradient id="gDeck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style="stop-color:var(--fin-deck)"/><stop offset="1" stop-color="#000" stop-opacity=".9"/>
        </linearGradient>
      </defs>

      <rect x="26" y="232" width="948" height="14" rx="5" fill="url(#gChrome)"/>
      <path d="M78 240 H922 Q954 240 958 272 L982 730 H18 L42 272 Q46 240 78 240 Z" fill="url(#gLac)"/>
      <path d="M78 240 H922 Q954 240 958 272 L982 730 H18 L42 272 Q46 240 78 240 Z" fill="url(#gShine)"/>
      <path d="M88 252 H912 Q940 252 944 280 L962 716 H38 L56 280 Q60 252 88 252 Z" fill="none" style="stroke:var(--fin-trim)" stroke-width="1.3" opacity=".75"/>

      <path d="M70 432 H930 L950 712 H50 Z" fill="url(#gDeck)"/>
      <path d="M70 432 H930" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>
      <g class="rods">${rods}</g>

      <path d="M196 252 H804 V292 Q804 458 500 458 Q196 458 196 292 Z" fill="url(#gWell)"/>
      <path d="M196 292 Q196 458 500 458 Q804 458 804 292" fill="none" stroke="url(#gChrome)" stroke-width="3" opacity=".7"/>
      <path d="M206 350 A 304 106 0 0 0 794 350" fill="none" stroke="#3b2519" stroke-width="12" stroke-linecap="round"/>
      <path d="M206 350 A 304 106 0 0 0 794 350" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="2" stroke-dasharray="2 5"/>

      <g class="sideframe">
        <path d="M46 296 C 34 420 26 570 30 730 L 80 730 C 76 600 82 450 104 300 C 100 266 54 264 46 296 Z" fill="url(#gLacH)"/>
        <path d="M58 300 C 48 420 42 570 44 724" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="3"/>
        <path d="M92 304 C 72 440 66 600 70 724" fill="none" style="stroke:var(--fin-trim)" stroke-width="1.2" opacity=".7"/>
      </g>
      <g class="sideframe" transform="translate(1000 0) scale(-1 1)">
        <path d="M46 296 C 34 420 26 570 30 730 L 80 730 C 76 600 82 450 104 300 C 100 266 54 264 46 296 Z" fill="url(#gLacH)"/>
        <path d="M58 300 C 48 420 42 570 44 724" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="3"/>
        <path d="M92 304 C 72 440 66 600 70 724" fill="none" style="stroke:var(--fin-trim)" stroke-width="1.2" opacity=".7"/>
      </g>

      <rect x="30" y="716" width="940" height="13" rx="4" fill="url(#gChrome)"/>
      <rect x="8" y="728" width="984" height="58" rx="12" fill="url(#gLac)"/>
      <rect x="8" y="728" width="984" height="58" rx="12" fill="url(#gShine)"/>
      <path d="M28 740 H972" style="stroke:var(--fin-trim)" stroke-width="1.4" opacity=".8"/>
      <path d="M28 776 H972" style="stroke:var(--fin-trim)" stroke-width=".8" opacity=".5"/>
      <text x="500" y="767" text-anchor="middle" class="brand">ARDEN</text>
      <text x="610" y="766" class="brand-no">No. 5</text>
    </svg>`;
  }

  function spool(x, y, id) {
    let spokes = '';
    for (let a = 0; a < 360; a += 72) {
      const r = (a * Math.PI) / 180;
      spokes += `<line x1="0" y1="0" x2="${(31 * Math.cos(r)).toFixed(1)}" y2="${(31 * Math.sin(r)).toFixed(1)}"/>`;
    }
    return `
      <g transform="translate(${x} ${y})" id="${id}">
        <ellipse cx="0" cy="6" rx="52" ry="50" fill="#000" opacity=".35"/>
        <circle r="50" fill="url(#gChrome2)"/>
        <circle r="45" fill="#1d1b1a"/>
        <circle r="39" fill="url(#gRibbonRoll)"/>
        <circle r="30" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1"/>
        <circle r="22" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1"/>
        <g class="spokes">${spokes}<circle r="12" fill="url(#gChrome2)"/><rect x="-2" y="-12" width="4" height="9" fill="#555"/></g>
        <circle r="4" fill="#222"/>
      </g>`;
  }

  function barsSVG() {
    let tb = '';
    bars.forEach((b) => {
      tb += `<g class="tb"><line x1="${b.px.toFixed(1)}" y1="${b.py.toFixed(1)}" x2="${b.tx.toFixed(1)}" y2="${b.ty.toFixed(1)}"/>
        <rect x="${(b.tx - 4).toFixed(1)}" y="${(b.ty - 5).toFixed(1)}" width="8" height="10" rx="1.5"/></g>`;
    });
    return `
    <svg class="bars-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <defs>
        <linearGradient id="gChrome2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#9c9c9c"/><stop offset=".6" stop-color="#e6e6e6"/><stop offset="1" stop-color="#4f4f4f"/>
        </linearGradient>
        <radialGradient id="gRibbonRoll">
          <stop offset=".45" stop-color="#3a0e0e"/><stop offset=".7" stop-color="#1a0606"/><stop offset="1" stop-color="#0b0b0b"/>
        </radialGradient>
        <linearGradient id="gSeg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#eeeeee"/><stop offset=".5" stop-color="#8a8a8a"/><stop offset="1" stop-color="#d0d0d0"/>
        </linearGradient>
      </defs>
      ${spool(132, 288, 'spoolL')}
      ${spool(868, 288, 'spoolR')}
      <polyline id="ribbonA" fill="none" stroke="#141010" stroke-width="9" stroke-linejoin="round"/>
      <polyline id="ribbonB" fill="none" stroke="#7a1616" stroke-width="3.5" stroke-linejoin="round"/>
      <g id="vibe">
        <path d="M486 206 V198 M514 206 V198" stroke="url(#gChrome2)" stroke-width="3" stroke-linecap="round"/>
        <path d="M480 212 Q500 222 520 212" fill="none" stroke="url(#gChrome2)" stroke-width="3"/>
      </g>
      <g class="cardholder">
        <path d="M472 198 L479 179 M528 198 L521 179" stroke="url(#gChrome2)" stroke-width="2.5" stroke-linecap="round"/>
        <polygon points="494,241 506,241 500,229" class="pointer"/>
      </g>
      <rect id="caret" class="caret" x="${PX - CW / 2 + 0.5}" y="${PY + 8.5}" width="${CW - 1}" height="1.8" rx=".9"/>
      <g class="bars">${tb}</g>
      <path d="M698 268.7 A200 48 0 0 1 302 268.7" fill="none" stroke="url(#gSeg)" stroke-width="15"/>
      <path d="M698 268.7 A200 48 0 0 1 302 268.7" fill="none" stroke="#2a2a2a" stroke-width="7" stroke-dasharray="1.4 5.1"/>
      <circle cx="500" cy="262" r="0" />
    </svg>`;
  }

  // ================= animation =================
  const active = new Map();
  let raf = 0;
  const UP = 48, HOLD = 14, DOWN = 130;

  function curve(t) {
    t = Math.max(0, t); // the frame clock can be a hair behind the strike timestamp
    if (t < UP) return Math.pow(t / UP, 1.7);
    if (t < UP + HOLD) return 1;
    if (t < UP + HOLD + DOWN) { const u = (t - UP - HOLD) / DOWN; return 1 - (1 - Math.pow(1 - u, 3)); }
    return null;
  }

  function setBar(i, k) {
    const b = bars[i];
    // tip travels on a slight arc toward the printing point
    const x = b.tx + (STRIKE.x - b.tx) * k;
    const y = b.ty + (STRIKE.y - b.ty) * k - Math.sin(k * Math.PI) * 30;
    const ln = els.barLines[i], sl = els.barSlugs[i];
    ln.setAttribute('x2', x.toFixed(1)); ln.setAttribute('y2', y.toFixed(1));
    sl.setAttribute('x', (x - 4).toFixed(1)); sl.setAttribute('y', (y - 5).toFixed(1));
    ln.parentNode.classList.toggle('up', k > 0.02);
  }

  function setRibbon(k) {
    const ry = 196 - 17 * k;
    const pts = `176,276 452,${ry} 548,${ry} 824,276`;
    els.ribbonA.setAttribute('points', pts);
    els.ribbonB.setAttribute('points', `176,279 452,${ry + 2.5} 548,${ry + 2.5} 824,279`);
    els.vibe.setAttribute('transform', `translate(0 ${(-17 * k).toFixed(1)})`);
  }

  function loop(now) {
    let maxK = 0;
    for (const [i, st] of active) {
      const k = curve(now - st);
      if (k === null) { setBar(i, 0); active.delete(i); }
      else { setBar(i, k); if (k > maxK) maxK = k; }
    }
    setRibbon(maxK);
    raf = active.size ? requestAnimationFrame(loop) : 0;
    if (!raf) setRibbon(0);
  }

  function strike(ch) {
    const id = keyIdFor(ch);
    pressKey(id);
    const i = BAR[id];
    if (i === undefined) return;
    active.set(i, performance.now());
    if (!raf) raf = requestAnimationFrame(loop);
    spoolAngle += 9;
    els.spools.forEach((s, j) => s.setAttribute('transform', `rotate(${j ? spoolAngle : -spoolAngle})`));
  }

  function pressKey(id) {
    const k = els.keys[id];
    if (!k) return;
    k.classList.remove('down');
    void k.offsetWidth;
    k.classList.add('down');
    clearTimeout(k._t);
    k._t = setTimeout(() => k.classList.remove('down'), 120);
  }

  function setLatched(id, on) {
    const k = els.keys[id];
    if (k) k.classList.toggle('latched', !!on);
  }

  function lever() {
    els.lever.classList.remove('pull');
    void els.lever.offsetWidth;
    els.lever.classList.add('pull');
  }

  /** Position for the carriage so that (row, col) sits under the printing point. */
  function coords(row, col) {
    return {
      x: PX - MX - CW / 2 - col * CW,
      y: PY - MT - row * LH - LH * 0.56,
    };
  }

  const TRANS = {
    type: 'transform .075s cubic-bezier(.3,.7,.4,1) .02s',
    back: 'transform .09s ease-out',
    return: 'transform .44s cubic-bezier(.22,.8,.25,1)',
    feed: 'transform .8s cubic-bezier(.35,.1,.25,1)',
    shift: 'transform .08s ease-out',
    roll: 'transform .16s cubic-bezier(.3,.7,.4,1)',
    jump: 'transform .38s cubic-bezier(.25,.8,.3,1)',
    none: 'none',
  };

  function applyTransforms(mode) {
    const t = TRANS[mode] || TRANS.type;
    const sheet = els.holder.querySelector('.sheet.current');
    if (sheet) {
      sheet.style.transition = t;
      sheet.style.transform = `translate(${curX}px, ${curY + shiftOff}px)`;
    }
    for (const c of [els.back, els.front]) {
      c.style.transition = t;
      c.style.transform = `translate(${curX}px, ${shiftOff}px)`;
    }
  }

  function place(row, col, mode = 'type') {
    const c = coords(row, col);
    curX = c.x; curY = c.y;
    applyTransforms(mode);
  }

  function setShifted(on) {
    const v = on ? -7 : 0;
    if (v === shiftOff) return;
    shiftOff = v;
    applyTransforms('shift');
  }

  /** Swap in a new sheet. If `from` is given, the sheet starts there (in machine coords) before animating. */
  function insertSheet(sheet, from) {
    els.holder.querySelectorAll('.sheet.current').forEach((s) => s.classList.remove('current'));
    sheet.classList.add('current');
    els.holder.appendChild(sheet);
    if (from) {
      sheet.style.transition = 'none';
      sheet.style.transform = `translate(${from.x}px, ${from.y}px)`;
      void sheet.offsetWidth;
    }
  }

  /** Pull the current sheet up and out of the machine. */
  function ejectSheet() {
    const s = els.holder.querySelector('.sheet.current');
    if (!s) return Promise.resolve();
    s.classList.remove('current');
    const anim = s.animate(
      [
        { transform: `translate(${curX}px, ${curY}px)`, opacity: 1 },
        { transform: `translate(${curX - 30}px, ${curY - PH - 500}px) rotate(-4deg)`, opacity: 0.0 },
      ],
      { duration: 900, easing: 'cubic-bezier(.5,0,.75,.4)', fill: 'forwards' }
    );
    return anim.finished.then(() => s.remove()).catch(() => s.remove());
  }

  /** Drop the current sheet back down behind the platen (used when backspacing into the previous page). */
  function retractSheet() {
    const s = els.holder.querySelector('.sheet.current');
    if (!s) return Promise.resolve();
    s.classList.remove('current');
    const anim = s.animate(
      [{ transform: `translate(${curX}px, ${curY}px)` }, { transform: `translate(${curX}px, ${CLIP + 40}px)` }],
      { duration: 450, easing: 'ease-in', fill: 'forwards' }
    );
    return anim.finished.then(() => s.remove()).catch(() => s.remove());
  }

  function currentSheet() { return els.holder.querySelector('.sheet.current'); }

  function fit(stageW, stageH) {
    // room for the machine plus ~15 lines of paper above the printing point
    const needH = (H - PY) + 330;
    // on phones, let the outer frame crop slightly so the keys are big enough to tap
    const s = Math.min(stageW / (stageW < 700 ? 860 : 1120), stageH / needH, 1.25);
    root.parentElement.style.setProperty('--s', s.toFixed(4));
    return s;
  }

  return {
    build, strike, pressKey, setLatched, lever, place, setShifted, insertSheet, ejectSheet, retractSheet,
    currentSheet, fit, coords, keyIdFor, SHIFTED,
    get x() { return curX; }, get y() { return curY; },
  };
})();
