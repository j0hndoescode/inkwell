/* Renders a sheet of typewritten, slightly-aged paper. Shared by the typewriter and the book reader. */
const Sheet = (() => {
  // Deterministic pseudo-random so a character always gets the same ink wobble.
  function rand(seed, n) {
    let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(n + 0x632be5ab, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (c) => ESC[c] || c;

  function seedOf(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  /** Build the HTML for typed text. freshAt = index of the character just struck (gets a darker, wet-ink look). */
  function typeHTML(text, seed, freshAt = -1) {
    const lines = text.split('\n');
    let html = '';
    let idx = 0;
    for (const line of lines) {
      html += '<div class="ln">';
      for (const ch of line) {
        if (ch === ' ') { html += '<span class="c"> </span>'; idx++; continue; }
        const r1 = rand(seed, idx * 3 + 1), r2 = rand(seed, idx * 3 + 2), r3 = rand(seed, idx * 3 + 3);
        const o = (0.7 + r1 * 0.3).toFixed(2);
        const rot = ((r2 - 0.5) * 2.6).toFixed(2);
        const y = ((r3 - 0.5) * 1.6).toFixed(2);
        let cls = 'c';
        if (r1 < 0.035) cls += ' dbl';           // occasional double-strike ghost
        else if (r1 > 0.97) cls += ' faint';     // dry ribbon spot
        if (idx === freshAt) cls += ' fresh';
        html += `<span class="${cls}" style="--o:${o};--r:${rot}deg;--y:${y}px">${esc(ch)}</span>`;
        idx++;
      }
      html += '</div>';
      idx++; // the newline
    }
    return html;
  }

  /** Per-sheet stains & foxing so no two pages look identical. */
  function ageStyle(seed) {
    const r = (n) => rand(seed, 9000 + n);
    return [
      `--sx1:${(10 + r(1) * 80).toFixed(1)}%`, `--sy1:${(10 + r(2) * 80).toFixed(1)}%`, `--ss1:${(12 + r(3) * 22).toFixed(1)}%`,
      `--sx2:${(r(4) * 100).toFixed(1)}%`, `--sy2:${(r(5) * 100).toFixed(1)}%`, `--ss2:${(2 + r(6) * 5).toFixed(1)}%`,
      `--sx3:${(r(7) * 100).toFixed(1)}%`, `--sy3:${(r(8) * 100).toFixed(1)}%`,
      `--sa:${(0.05 + r(9) * 0.1).toFixed(3)}`,
      `--tilt:${((r(10) - 0.5) * 0.5).toFixed(2)}deg`,
    ].join(';');
  }

  /** Create a typed sheet element. */
  function create({ text = '', seed = 1, folio = '', paper = '#efe3c4' } = {}) {
    const el = document.createElement('div');
    el.className = 'sheet';
    el.setAttribute('style', ageStyle(seed) + `;--paper:${paper}`);
    el.innerHTML = `<div class="type">${typeHTML(text, seed)}</div>` + (folio ? `<div class="folio">${folio}</div>` : '');
    el._seed = seed;
    return el;
  }

  function update(el, text, freshAt = -1) {
    el.querySelector('.type').innerHTML = typeHTML(text, el._seed, freshAt);
  }

  function titlePage({ title, author, paper, created }) {
    const el = document.createElement('div');
    el.className = 'sheet title-sheet';
    el.setAttribute('style', ageStyle(seedOf(title || 'x')) + `;--paper:${paper}`);
    const d = new Date(created || Date.now());
    const year = d.getFullYear();
    el.innerHTML = `
      <div class="tp">
        <div class="tp-orn">❦</div>
        <h1>${escapeHTML(title || 'Untitled')}</h1>
        <div class="tp-rule"></div>
        <p class="tp-by">${author ? 'by' : ''}</p>
        <p class="tp-author">${escapeHTML(author || '')}</p>
        <div class="tp-foot">Typewritten on an Arden No.&nbsp;5<br>${year}</div>
      </div>`;
    return el;
  }

  function endpaper(leather) {
    const el = document.createElement('div');
    el.className = 'sheet endpaper';
    el.style.setProperty('--l1', leather.c1);
    el.style.setProperty('--l2', leather.c2);
    return el;
  }

  function blank(paper, seed = 7) {
    const el = document.createElement('div');
    el.className = 'sheet';
    el.setAttribute('style', ageStyle(seed) + `;--paper:${paper}`);
    return el;
  }

  return { create, update, titlePage, endpaper, blank, seedOf, rand };
})();

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
