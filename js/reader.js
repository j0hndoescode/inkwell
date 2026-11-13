/* The bound book: shows finished pages as an open book with page-turn animations. */
const pageSeed = (book, i) => (Sheet.seedOf(book.id) + i * 7919) >>> 0;

const Reader = (() => {
  const { PW, PH } = CFG;
  const BX = 20, BY = 18;
  let book, list = [], mode = 'spread', pos = 0, flipping = false;
  let els;

  function init() {
    els = {
      stage: document.getElementById('reader-stage'),
      box: document.getElementById('book-box'),
      book: document.getElementById('book'),
      pgL: document.getElementById('pgL'),
      pgR: document.getElementById('pgR'),
      leaf: document.getElementById('leaf'),
      front: document.querySelector('#leaf .front'),
      back: document.querySelector('#leaf .back'),
      prev: document.getElementById('nav-prev'),
      next: document.getElementById('nav-next'),
      range: document.getElementById('reader-range'),
      posLbl: document.getElementById('reader-pos'),
    };
    els.prev.addEventListener('click', () => flip(-1));
    els.next.addEventListener('click', () => flip(1));
    els.pgL.addEventListener('click', () => flip(-1));
    els.pgR.addEventListener('click', (e) => {
      if (mode === 'single') {
        const r = els.pgR.getBoundingClientRect();
        flip(e.clientX < r.left + r.width * 0.3 ? -1 : 1);
      } else flip(1);
    });
    els.range.addEventListener('input', () => {
      if (flipping) return;
      pos = mode === 'spread' ? +els.range.value * 2 : +els.range.value;
      render();
    });
  }

  const leatherOf = (b) => LEATHERS.find((l) => l.id === b.leather) || LEATHERS[0];
  const paperOf = (b) => (PAPERS.find((p) => p.id === b.paper) || PAPERS[1]).color;

  function buildList() {
    const pages = book.pages.map((_, i) => i);
    if (mode === 'spread') {
      list = ['end', 'title', ...pages];
      if (list.length % 2) list.push('blank');
    } else {
      list = ['title', ...pages];
    }
  }

  function make(item) {
    if (item === undefined || item === null) return null;
    if (item === 'end') return Sheet.endpaper(leatherOf(book));
    if (item === 'title') return Sheet.titlePage({ title: book.title, author: book.author, paper: paperOf(book), created: book.created });
    if (item === 'blank') return Sheet.blank(paperOf(book), 99);
    return Sheet.create({ text: book.pages[item], seed: pageSeed(book, item), folio: `- ${item + 1} -`, paper: paperOf(book) });
  }

  function fill(target, item, shade = false) {
    target.replaceChildren();
    const el = make(item);
    if (el) target.appendChild(el);
    if (shade) {
      const s = document.createElement('div');
      s.className = 'shade';
      target.appendChild(s);
    }
  }

  /** Which list position shows book page `i`? */
  function posFor(i) {
    const li = list.indexOf(i);
    if (li < 0) return 0;
    return mode === 'spread' ? li - (li % 2) : li;
  }

  function open(b, at = 'end') {
    book = b;
    const lea = leatherOf(b);
    els.book.style.setProperty('--l1', lea.c1);
    els.book.style.setProperty('--l2', lea.c2);
    document.getElementById('reader-title').textContent = b.title || 'Untitled';
    document.getElementById('reader-author').textContent = b.author ? 'by ' + b.author : '';
    fit(true);
    buildList();
    pos = at === 'start' ? 0 : posFor(typeof at === 'number' ? at : book.pages.length - 1);
    render();
  }

  function render() {
    if (mode === 'spread') {
      fill(els.pgL, list[pos]);
      fill(els.pgR, list[pos + 1]);
    } else {
      els.pgL.replaceChildren();
      fill(els.pgR, list[pos]);
    }
    els.leaf.hidden = true;
    const step = mode === 'spread' ? 2 : 1;
    els.prev.disabled = pos - step < 0;
    els.next.disabled = pos + step >= list.length;
    els.range.max = mode === 'spread' ? Math.ceil(list.length / 2) - 1 : list.length - 1;
    els.range.value = mode === 'spread' ? pos / 2 : pos;
    els.posLbl.textContent = label();
  }

  function label() {
    const vis = mode === 'spread' ? [list[pos], list[pos + 1]] : [list[pos]];
    const nums = vis.filter((v) => typeof v === 'number').map((v) => v + 1);
    const total = book.pages.length;
    if (nums.length === 2) return `pages ${nums[0]}-${nums[1]} of ${total}`;
    if (nums.length === 1) return `page ${nums[0]} of ${total}`;
    return vis.includes('title') ? 'title page' : 'cover';
  }

  function flip(dir) {
    if (flipping || !book) return false;
    const step = mode === 'spread' ? 2 : 1;
    const np = pos + dir * step;
    if (np < 0 || np >= list.length) return false;
    flipping = true;
    Sound.flip();
    const leaf = els.leaf;
    let frames, shadeFront, shadeBack;
    const DUR = 900;

    if (mode === 'spread') {
      if (dir > 0) {
        leaf.className = 'leaf right';
        fill(els.front, list[pos + 1], true);
        fill(els.back, list[pos + 2], true);
        fill(els.pgR, list[pos + 3]);
        frames = [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }];
      } else {
        leaf.className = 'leaf left';
        fill(els.front, list[pos], true);
        fill(els.back, list[pos - 1], true);
        fill(els.pgL, list[pos - 2]);
        frames = [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }];
      }
    } else {
      leaf.className = 'leaf right';
      if (dir > 0) {
        fill(els.front, list[pos], true);
        fill(els.back, 'blank', true);
        fill(els.pgR, list[pos + 1]);
        frames = [
          { transform: 'rotateY(0deg)', opacity: 1 },
          { transform: 'rotateY(-150deg)', opacity: 1, offset: 0.75 },
          { transform: 'rotateY(-180deg)', opacity: 0 },
        ];
      } else {
        fill(els.front, list[pos - 1], true);
        fill(els.back, 'blank', true);
        frames = [
          { transform: 'rotateY(-180deg)', opacity: 0 },
          { transform: 'rotateY(-150deg)', opacity: 1, offset: 0.25 },
          { transform: 'rotateY(0deg)', opacity: 1 },
        ];
      }
    }
    leaf.hidden = false;
    const ease = 'cubic-bezier(.45,.05,.3,1)';
    const anim = leaf.animate(frames, { duration: DUR, easing: ease, fill: 'forwards' });
    shadeFront = leaf.querySelector('.front .shade');
    shadeBack = leaf.querySelector('.back .shade');
    shadeFront && shadeFront.animate([{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0.6 }], { duration: DUR, easing: ease });
    shadeBack && shadeBack.animate([{ opacity: 0.8 }, { opacity: 0.7, offset: 0.5 }, { opacity: 0 }], { duration: DUR, easing: ease });

    anim.onfinish = () => {
      pos = np;
      anim.cancel();
      render();
      flipping = false;
    };
    return true;
  }

  function fit(silent) {
    if (!els || !book) return;
    const W = els.stage.clientWidth, H = els.stage.clientHeight;
    const bw2 = PW * 2 + BX * 2, bw1 = PW + BX * 2, bh = PH + BY * 2;
    const navW = W < 600 ? 90 : 140;
    const sSpread = Math.min((W - navW) / bw2, (H - 16) / bh);
    const sSingle = Math.min((W - navW) / bw1, (H - 16) / bh);
    const newMode = sSpread >= 0.42 || sSpread >= sSingle * 0.8 ? 'spread' : 'single';
    const s = newMode === 'spread' ? sSpread : sSingle;
    const bw = newMode === 'spread' ? bw2 : bw1;
    els.book.style.width = bw + 'px';
    els.book.style.height = bh + 'px';
    els.book.style.transform = `scale(${s})`;
    els.book.classList.toggle('single', newMode === 'single');
    els.box.style.width = bw * s + 'px';
    els.box.style.height = bh * s + 'px';
    if (newMode !== mode) {
      // keep the same page in view when the layout changes
      const vis = list[pos + (mode === 'spread' ? 1 : 0)];
      mode = newMode;
      buildList();
      pos = typeof vis === 'number' ? posFor(vis) : 0;
      if (!silent) render();
    }
  }

  return { init, open, flip, fit, get busy() { return flipping; } };
})();
