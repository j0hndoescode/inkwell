/* App controller: library ⇄ desk (typewriter) ⇄ reader, the typing model, saving. */
(() => {
  const { COLS, ROWS, TAB, BELL_AT } = CFG;
  const $ = (id) => document.getElementById(id);

  // ---------------- state ----------------
  let data = Store.load();
  if (!data) data = { books: [sampleBook()], settings: { sound: true, finish: 'lacquer' } };
  Sound.enabled = data.settings.sound;

  let view = 'library';
  let book = null;           // the book on the desk
  let deskBookId = null;     // which book's paper is in the machine right now
  let busy = false;          // true while a sheet is being changed
  const queue = [];
  let shiftOnce = false, shiftLock = false, physShift = false;
  let editingId = null;
  let saveTimer = 0;

  const stage = $('stage');

  // ---------------- helpers ----------------
  const findBook = (id) => data.books.find((b) => b.id === id);
  const lastIdx = () => book.pages.length - 1;
  const page = () => book.pages[lastIdx()];
  const setPage = (t) => { book.pages[lastIdx()] = t; };
  const paperColor = (b) => (PAPERS.find((p) => p.id === b.paper) || PAPERS[1]).color;
  const leatherOf = (b) => LEATHERS.find((l) => l.id === b.leather) || LEATHERS[0];
  function cursor() {
    const lines = page().split('\n');
    return { row: lines.length - 1, col: lines[lines.length - 1].length, lines };
  }

  function toast(msg, action, ms = 3200) {
    const t = $('toast');
    t.replaceChildren();
    const span = document.createElement('span');
    span.textContent = msg;
    t.appendChild(span);
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.onclick = () => { t.classList.remove('show'); action.fn(); };
      t.appendChild(b);
    }
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  function ago(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + ' days ago';
    return new Date(ts).toLocaleDateString();
  }

  // ---------------- saving ----------------
  function persist() {
    const ok = Store.save(data, view === 'desk' && book ? book.id : null);
    const st = $('save-status');
    st.classList.toggle('dirty', false);
    st.classList.toggle('err', !ok);
    st.textContent = ok ? 'Saved' : 'Not saved!';
    if (!ok) toast('Could not save. Browser storage is full. Back up your library and delete old save points.', null, 6000);
    return ok;
  }
  let askedPersist = false;
  function touch() {
    if (book) book.updated = Date.now();
    if (!askedPersist) { askedPersist = true; Store.requestPersistence(); }
    const st = $('save-status');
    st.classList.add('dirty');
    st.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = 0; persist(); updateMeta(true); }, 500);
  }
  // Save straight away whenever the page might be going away (closing the tab, switching apps on a phone).
  function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; persist(); } }
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  // ---------------- more than one tab ----------------
  // Only one tab may type into a book at a time, so an old tab can never overwrite newer writing.
  const TAB_ID = uid();
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('inkwell') : null;
  let lockedOut = false;
  function claimBook(id) { lockedOut = false; $('tab-lock').hidden = true; channel && channel.postMessage({ type: 'claim', id, tab: TAB_ID }); }
  if (channel) channel.onmessage = (e) => {
    const m = e.data || {};
    if (m.type === 'claim' && m.tab !== TAB_ID && view === 'desk' && book && book.id === m.id) {
      flush();
      lockedOut = true;
      $('tab-lock').hidden = false;
    }
  };
  // Another tab saved: pick up its changes while this tab is only showing the shelf.
  window.addEventListener('storage', (e) => {
    if (e.key !== Store.KEY || view !== 'library' || saveTimer) return;
    const fresh = Store.load();
    if (fresh) { fresh.settings = data.settings; data = fresh; renderLibrary(); }
  });

  // =====================================================================
  //   LIBRARY
  // =====================================================================
  function renderBackupNote() {
    const words = data.books.reduce((n, b) => n + countWords(b.pages), 0);
    const last = data.lastBackup;
    const stale = words > 30 && (!last || Date.now() - last > 7 * 86400000);
    const el = $('backup-note');
    el.classList.toggle('stale', stale);
    el.innerHTML = 'Your books save automatically in this browser as you type. ' +
      (last ? `Last backup: ${ago(last)}.` : 'You haven’t made a backup yet.') +
      (stale ? ' <b>Back up now and then so you never lose your writing.</b>' : '');
  }

  function renderLibrary() {
    renderBackupNote();
    const shelf = $('shelf');
    const books = [...data.books].sort((a, b) => b.updated - a.updated);
    let h = `
      <article class="book-card">
        <button class="cover new" data-act="new">
          <span class="plus">+</span>
          <span class="cv-title">Begin a new book</span>
        </button>
        <div class="plank-label"><span class="plate">${data.books.length} book${data.books.length === 1 ? '' : 's'} on the shelf</span></div>
      </article>`;
    for (const b of books) {
      const l = leatherOf(b);
      const words = countWords(b.pages);
      h += `
      <article class="book-card" style="--l1:${l.c1};--l2:${l.c2}" data-id="${b.id}">
        <button class="cover" data-act="write" title="Open at the typewriter">
          <span class="cv-orn">❦</span>
          <span class="cv-title">${escapeHTML(b.title || 'Untitled')}</span>
          <span class="cv-rule"></span>
          <span class="cv-author">${escapeHTML(b.author || '')}</span>
        </button>
        <div class="plank-label">
          <span class="plate">${b.pages.length} pg · ${words.toLocaleString()} words · ${ago(b.updated)}</span>
          <div class="card-acts">
            <button data-act="write">Write</button>
            <button data-act="read">Read</button>
            <button data-act="edit">Edit</button>
            <button data-act="export" title="Download as a text file">.txt</button>
            <button data-act="delete" class="danger">Delete</button>
          </div>
        </div>
      </article>`;
    }
    shelf.innerHTML = h;
  }

  $('shelf').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    Sound.init();
    const id = btn.closest('[data-id]')?.dataset.id;
    const b = id && findBook(id);
    switch (btn.dataset.act) {
      case 'new': openBookDialog(null); break;
      case 'write': openDesk(b); break;
      case 'read': book = b; openReader('start'); break;
      case 'edit': openBookDialog(b); break;
      case 'export': exportTxt(b); break;
      case 'delete':
        confirmBox(`Delete “${b.title}”?`, 'This removes the book and all its save points from this browser. It cannot be undone.', 'Delete')
          .then((yes) => {
            if (!yes) return;
            data.books = data.books.filter((x) => x.id !== b.id);
            data.deleted = [...(data.deleted || []), b.id];
            if (deskBookId === b.id) deskBookId = null;
            persist(); renderLibrary();
            toast('Book deleted.');
          });
        break;
    }
  });

  function showView(v) {
    view = v;
    $('library').hidden = v !== 'library';
    $('desk').hidden = v !== 'desk';
    $('reader').hidden = v !== 'reader';
    Sound.setDesk(v === 'desk');
    if (v === 'desk') Fx.mount($('stage'), $('machine'));
    else Fx.mount($(v));
    if (v === 'library') Fx.setLayout('library', 0);
    if (v === 'reader') Fx.setLayout('reader', innerHeight * 0.86);
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  function goLibrary() {
    clearTimeout(saveTimer);
    persist();
    renderLibrary();
    showView('library');
  }

  // ---------------- book dialog ----------------
  function buildSwatches() {
    $('sw-leather').innerHTML = LEATHERS.map((l) =>
      `<label class="swatch" title="${l.name}"><input type="radio" name="leather" value="${l.id}"><span style="background:var(--grain),linear-gradient(160deg,${l.c1},${l.c2})"></span></label>`).join('');
    $('sw-paper').innerHTML = PAPERS.map((p) =>
      `<label class="swatch paper" title="${p.name}"><input type="radio" name="paper" value="${p.id}"><span style="background:var(--noise),${p.color}"></span></label>`).join('');
  }

  function openBookDialog(b) {
    editingId = b ? b.id : null;
    const f = $('form-book');
    f.reset();
    $('dlg-book-title').textContent = b ? 'Edit book' : 'A new book';
    $('dlg-book-ok').textContent = b ? 'Save' : 'Bind the book';
    f.title.value = b ? b.title : '';
    f.author.value = b ? b.author : '';
    const lea = b ? b.leather : LEATHERS[Math.floor(Math.random() * LEATHERS.length)].id;
    const pap = b ? b.paper : 'parchment';
    f.querySelector(`input[name=leather][value="${lea}"]`).checked = true;
    f.querySelector(`input[name=paper][value="${pap}"]`).checked = true;
    $('dlg-book').showModal();
  }

  $('dlg-book').addEventListener('close', () => {
    const dlg = $('dlg-book');
    if (dlg.returnValue !== 'ok') return;
    const f = $('form-book');
    const vals = {
      title: f.title.value.trim() || 'Untitled',
      author: f.author.value.trim(),
      leather: f.querySelector('input[name=leather]:checked')?.value || 'oxblood',
      paper: f.querySelector('input[name=paper]:checked')?.value || 'parchment',
    };
    if (editingId) {
      const b = findBook(editingId);
      Object.assign(b, vals, { updated: Date.now() });
      if (deskBookId === b.id) deskBookId = null; // paper colour may have changed
      persist(); renderLibrary();
    } else {
      const b = { id: uid(), ...vals, pages: [''], saves: [], created: Date.now(), updated: Date.now() };
      data.books.push(b);
      persist(); renderLibrary();
      openDesk(b);
    }
  });

  // ---------------- confirm ----------------
  function confirmBox(title, text, yesLabel = 'Yes') {
    return new Promise((resolve) => {
      $('cf-title').textContent = title;
      $('cf-text').textContent = text;
      $('cf-yes').textContent = yesLabel;
      const dlg = $('dlg-confirm');
      const done = (v) => { dlg.close(); $('cf-yes').onclick = $('cf-no').onclick = null; resolve(v); };
      $('cf-yes').onclick = () => done(true);
      $('cf-no').onclick = () => done(false);
      dlg.oncancel = () => resolve(false);
      dlg.showModal();
    });
  }

  // ---------------- export / import ----------------
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const fileSafe = (s) => (s || 'book').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'book';

  function exportTxt(b) {
    let out = `${b.title}\n${b.author ? 'by ' + b.author + '\n' : ''}\n\n`;
    b.pages.forEach((p, i) => {
      out += p + '\n\n' + ' '.repeat(Math.floor(COLS / 2) - 3) + `- ${i + 1} -\n\n\n`;
    });
    download(fileSafe(b.title) + '.txt', out, 'text/plain');
  }

  $('btn-export-all').addEventListener('click', () => {
    data.lastBackup = Date.now();
    persist();
    renderBackupNote();
    download(`inkwell-library-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1), 'application/json');
  });
  $('file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      const incoming = Array.isArray(d.books) ? d.books : [];
      let n = 0;
      for (const b of incoming) {
        if (!b || !Array.isArray(b.pages) || !b.pages.every((p) => typeof p === 'string')) continue;
        const nb = {
          id: findBook(b.id) ? uid() : String(b.id || uid()),
          title: String(b.title || 'Untitled').slice(0, 80),
          author: String(b.author || '').slice(0, 60),
          leather: LEATHERS.some((l) => l.id === b.leather) ? b.leather : 'oxblood',
          paper: PAPERS.some((p) => p.id === b.paper) ? b.paper : 'parchment',
          pages: b.pages.length ? b.pages : [''],
          saves: Array.isArray(b.saves) ? b.saves.filter((s) => s && Array.isArray(s.pages)) : [],
          created: +b.created || Date.now(),
          updated: +b.updated || Date.now(),
        };
        data.books.push(nb);
        n++;
      }
      persist(); renderLibrary();
      toast(n ? `Restored ${n} book${n === 1 ? '' : 's'}.` : 'No books found in that file.');
    } catch (err) {
      toast('That file could not be read as an Inkwell backup.');
    }
  });

  // =====================================================================
  //   DESK: the typewriter
  // =====================================================================
  data.settings = Object.assign(
    { profile: 'classic', volume: 0.8, ambience: 'none', ambVol: 0.5, ambFx: 'scene', theme: 'study', ink: 'black', mode: 'insert', focus: false },
    data.settings
  );
  if (data.settings.ambFx === true) data.settings.ambFx = 'scene';
  if (data.settings.ambFx === false) data.settings.ambFx = 'off';

  Machine.build($('machine'), { onKey: onScreenKey, onPaperClick: (row, col) => { Sound.init(); act({ type: 'goto', row, col }); } });

  function applyFinish() {
    const f = FINISHES.find((x) => x.id === data.settings.finish) || FINISHES[0];
    const m = $('machine');
    m.style.setProperty('--fin-a', f.a);
    m.style.setProperty('--fin-b', f.b);
    m.style.setProperty('--fin-deck', f.deck);
    m.style.setProperty('--fin-trim', f.trim);
  }

  function fitDesk() {
    if (view !== 'desk') return;
    const s = Machine.fit(stage.clientWidth, stage.clientHeight);
    Fx.setLayout('desk', stage.clientHeight - 6 - 540 * s); // the far edge of the table, a little behind the desk mat
  }

  // ---- where the carriage is: page, line, column ----
  let cur = { p: 0, row: 0, col: 0 };
  let shownP = 0;      // which page is in the machine
  let goalCol = null;  // column remembered while rolling up and down

  const linesOf = (p) => book.pages[p].split('\n');
  function endPos(p) { const L = linesOf(p); return { p, row: L.length - 1, col: L[L.length - 1].length }; }
  function atEnd() { const e = endPos(lastIdx()); return cur.p === e.p && cur.row === e.row && cur.col === e.col; }
  function absIndex(L, row, col) { let i = 0; for (let r = 0; r < row; r++) i += L[r].length + 1; return i + col; }
  const place = (mode) => Machine.place(cur.row, cur.col, mode);
  function setCur(row, col, mode) { cur.row = row; cur.col = col; place(mode); }
  function commit(L) { book.pages[cur.p] = L.join('\n'); }

  function makeSheet(i) {
    return Sheet.create({ text: book.pages[i], seed: pageSeed(book, i), folio: `- ${i + 1} -`, paper: paperColor(book) });
  }

  function updateMeta(withWords) {
    if (!book) return;
    if (withWords || book._words === undefined) book._words = countWords(book.pages);
    const n = book.pages.length;
    $('desk-meta').textContent = `page ${cur.p + 1} of ${n} · line ${cur.row + 1}/${ROWS} · ${book._words.toLocaleString()} words`;
    $('ms-count').textContent = n;
    $('pg-prev').disabled = cur.p === 0;
    $('pg-next').disabled = cur.p >= n - 1;
    const editing = !atEnd();
    $('machine').classList.toggle('editing', editing);
    $('btn-resume').hidden = !editing;
    if (editing) $('resume-where').textContent = cur.p === lastIdx() ? `Fixing line ${cur.row + 1}` : `Fixing page ${cur.p + 1}`;
  }

  function openDesk(b) {
    book = b;
    showView('desk');
    claimBook(b.id);
    $('desk-book-title').textContent = b.title || 'Untitled';
    $('machine').style.setProperty('--paper', paperColor(b));
    fitDesk();
    $('save-status').textContent = 'Saved';
    $('save-status').classList.remove('dirty', 'err');
    if (deskBookId === b.id && Machine.currentSheet()) {
      place('none');
      updateMeta(true);
      return;
    }
    deskBookId = b.id;
    cur = endPos(lastIdx());
    updateMeta(true);
    loadSheetAnimated();
  }

  /** Feed page cur.p into the machine (from below the platen, or dropping in from above). */
  function loadSheetAnimated(from = 'below') {
    busy = true;
    document.querySelectorAll('.paper-holder .sheet.current').forEach((s) => s.remove());
    shownP = cur.p;
    const sheet = makeSheet(cur.p);
    const target = Machine.coords(cur.row, cur.col);
    const startY = from === 'above' ? target.y - 700 : MACH.CLIP + 30;
    Machine.insertSheet(sheet, { x: target.x, y: startY });
    place('none');
    sheet.style.transform = `translate(${target.x}px, ${startY}px)`;
    void sheet.offsetWidth; // commit the start position so the sheet animates in
    Sound.feed(from === 'above' ? 8 : 10);
    place('feed');
    updateMeta(false);
    setTimeout(finishBusy, 820);
  }

  function finishBusy() {
    busy = false;
    while (queue.length && !busy) act(queue.shift());
  }

  function render(freshAt = -1) {
    const s = Machine.currentSheet();
    if (s) Sheet.update(s, book.pages[shownP], freshAt);
  }

  // ---------------- actions ----------------
  const WRITES = ['char', 'return', 'backspace', 'tab'];

  function act(a) {
    if (!book || view !== 'desk') return;
    if (lockedOut) { toast('This book is open in another tab. Use that tab, or take it over here.', null, 2600); return; }
    if (busy) { if (queue.length < 300) queue.push(a); return; }
    hideHint();
    if (a.type !== 'vert') goalCol = null;
    const end = atEnd();
    let changed = WRITES.includes(a.type);
    switch (a.type) {
      case 'char': end ? typeChar(a.ch) : editChar(a.ch); break;
      case 'return': end ? carriageReturn() : editReturn(); break;
      case 'backspace': end ? backspace() : editBackspace(); break;
      case 'tab': end ? tab() : editTab(); break;
      case 'delete': changed = editDelete(); break;
      case 'vert': moveVert(a.d); break;
      case 'horiz': moveHoriz(a.d); break;
      case 'home': if (cur.col) { Sound.move(); setCur(cur.row, 0, 'jump'); } break;
      case 'end': { const l = linesOf(cur.p)[cur.row].length; if (cur.col !== l) { Sound.move(); setCur(cur.row, l, 'jump'); } break; }
      case 'goto': gotoPos(a.row, a.col); break;
      case 'page': flipSheet(a.d); break;
      case 'resume': resume(); break;
    }
    if (end && WRITES.includes(a.type)) cur = endPos(lastIdx());
    updateMeta(false);
    if (changed) touch();
  }

  function strikeFx(ch) {
    if (ch === ' ') { Machine.pressKey(' '); Sound.space(); }
    else { Machine.strike(ch); Sound.key(); }
  }

  // ---------- writing at the end of the book (the normal flow) ----------
  function typeChar(ch) {
    const { row, col, lines } = cursor();
    if (col >= COLS) {
      // End of the line: carriage returns by itself, carrying a half-typed word down with it.
      if (ch === ' ') { carriageReturn(); return; }
      const line = lines[row];
      const sp = line.lastIndexOf(' ');
      let carry = '';
      if (sp > 0 && line.length - sp - 1 < COLS - 4) {
        carry = line.slice(sp + 1);
        lines[row] = line.slice(0, sp).replace(/ +$/, '');
        setPage(lines.join('\n'));
      }
      Sound.bell();
      if (lines.length >= ROWS) {
        render();
        newPage(carry);
        queue.unshift({ type: 'char', ch });
        return;
      }
      setPage(page() + '\n' + carry + ch);
      Machine.lever();
      Sound.carriageReturn();
      strikeFx(ch);
      render(page().length - 1);
      const c = cursor();
      Machine.place(c.row, c.col, 'return');
      return;
    }
    setPage(page() + ch);
    strikeFx(ch);
    render(page().length - 1);
    Machine.place(row, col + 1, 'type');
    if (col + 1 === COLS - BELL_AT) Sound.bell();
  }

  function carriageReturn() {
    const { row, lines } = cursor();
    Machine.pressKey('RET');
    if (lines.length >= ROWS) { newPage(''); return; }
    setPage(page() + '\n');
    Machine.lever();
    Sound.carriageReturn();
    Machine.place(row + 1, 0, 'return');
  }

  function tab() {
    const { col } = cursor();
    Machine.pressKey('TAB');
    let n = TAB - (col % TAB);
    if (col + n > COLS) n = COLS - col;
    if (n <= 0) { carriageReturn(); return; }
    setPage(page() + ' '.repeat(n));
    Sound.space();
    const c = cursor();
    Machine.place(c.row, c.col, 'return');
  }

  function backspace() {
    Machine.pressKey('BKSP');
    const t = page();
    if (t.length === 0) {
      if (book.pages.length > 1) previousPage();
      return;
    }
    const removed = t[t.length - 1];
    setPage(t.slice(0, -1));
    Sound.back();
    render();
    const { row, col } = cursor();
    Machine.place(row, col, removed === '\n' ? 'return' : 'back');
  }

  /** The page is full: pull it out, bind it into the book, roll in a fresh sheet. */
  function newPage(carry) {
    busy = true;
    Machine.lever();
    Sound.pull();
    Machine.ejectSheet();
    book.pages.push(carry);
    const idx = lastIdx();
    shownP = idx;
    Machine.place(0, 0, 'return');
    setTimeout(() => {
      const sheet = makeSheet(idx);
      const target = Machine.coords(0, carry.length);
      Machine.insertSheet(sheet, { x: target.x, y: MACH.CLIP + 30 });
      Sound.feed(12);
      Machine.place(0, carry.length, 'feed');
      updateMeta(true);
      setTimeout(finishBusy, 820);
    }, 520);
    touch();
    toast(`Page ${idx} is finished and bound into the book.`, { label: 'Flip through it', fn: () => openReader('end') }, 4200);
  }

  /** Backspacing on an empty sheet takes it out and puts the previous page back in. */
  function previousPage() {
    busy = true;
    Machine.retractSheet();
    book.pages.pop();
    shownP = lastIdx();
    const { row, col } = cursor();
    setTimeout(() => {
      const sheet = makeSheet(lastIdx());
      const target = Machine.coords(row, col);
      Machine.insertSheet(sheet, { x: target.x, y: target.y - 700 });
      Sound.feed(8);
      Machine.place(row, col, 'feed');
      updateMeta(true);
      setTimeout(finishBusy, 820);
    }, 300);
    toast(`Back to page ${book.pages.length}.`);
  }

  // ---------- fixing text anywhere on a page ----------
  /** Insert text at (row, col); words that no longer fit slide down onto the next line. */
  function insertWithReflow(lines, row, col, text) {
    const L = lines.slice();
    L[row] = L[row].slice(0, col) + text + L[row].slice(col);
    let cr = row, cc = col + text.length, frow = row, fcol = col;
    for (let r = row; r < L.length && L[r].length > COLS; r++) {
      const line = L[r];
      const cut = line.lastIndexOf(' ', COLS);
      let keep, rest, shift;
      if (cut > 0) { keep = line.slice(0, cut); rest = line.slice(cut + 1); shift = cut + 1; }
      else { keep = line.slice(0, COLS); rest = line.slice(COLS); shift = COLS; }
      if (rest !== '') {
        const next = L[r + 1];
        const newPara = next === undefined || next === '' || next.startsWith(' ');
        if (newPara) {
          if (L.length >= ROWS) return null;
          L.splice(r + 1, 0, rest);
        } else {
          L[r + 1] = rest + ' ' + next;
        }
      }
      L[r] = keep.replace(/ +$/, '');
      const move = (rr, c) => (rr === r && c >= shift && rest !== '' ? [r + 1, c - shift] : [rr, c]);
      [cr, cc] = move(cr, cc);
      [frow, fcol] = move(frow, fcol);
    }
    cr = Math.min(cr, L.length - 1);
    cc = Math.min(cc, L[cr].length);
    return { lines: L, row: cr, col: cc, frow, fcol };
  }

  function editChar(ch) {
    const L = linesOf(cur.p);
    const { row, col } = cur;
    if (data.settings.mode === 'overtype' && col < L[row].length) {
      L[row] = L[row].slice(0, col) + ch + L[row].slice(col + 1);
      commit(L);
      strikeFx(ch);
      render(absIndex(L, row, col));
      setCur(row, col + 1, 'type');
      return;
    }
    const res = insertWithReflow(L, row, col, ch);
    if (!res) { Sound.bell(); toast('No room left on this sheet. Remove something first.', null, 2600); return; }
    commit(res.lines);
    strikeFx(ch);
    render(absIndex(res.lines, res.frow, res.fcol));
    setCur(res.row, res.col, res.row !== row ? 'return' : 'type');
  }

  function editReturn() {
    const L = linesOf(cur.p);
    if (cur.row < L.length - 1) {
      Machine.pressKey('RET'); Machine.lever(); Sound.carriageReturn();
      setCur(cur.row + 1, 0, 'return');
      return;
    }
    if (cur.p === lastIdx()) { // last line of the book: same as returning at the end
      cur = endPos(cur.p);
      carriageReturn();
      cur = endPos(lastIdx());
      return;
    }
    if (L.length < ROWS) {
      L.push('');
      commit(L);
      Machine.pressKey('RET'); Machine.lever(); Sound.carriageReturn();
      render();
      setCur(cur.row + 1, 0, 'return');
      return;
    }
    flipSheet(1, { row: 0, col: 0 });
  }

  function editBackspace() {
    Machine.pressKey('BKSP');
    const L = linesOf(cur.p);
    const { row, col } = cur;
    if (col > 0) {
      L[row] = L[row].slice(0, col - 1) + L[row].slice(col);
      commit(L); Sound.back(); render();
      setCur(row, col - 1, 'back');
      return;
    }
    if (row > 0) {
      const prev = L[row - 1];
      if (prev.length + L[row].length <= COLS) { L[row - 1] = prev + L[row]; L.splice(row, 1); commit(L); render(); }
      Sound.back();
      setCur(row - 1, prev.length, 'return');
      return;
    }
    Sound.bell(); // top-left corner of the sheet
  }

  function editDelete() {
    const L = linesOf(cur.p);
    const { row, col } = cur;
    if (col < L[row].length) L[row] = L[row].slice(0, col) + L[row].slice(col + 1);
    else if (row < L.length - 1 && L[row].length + L[row + 1].length <= COLS) { L[row] += L[row + 1]; L.splice(row + 1, 1); }
    else return false;
    commit(L);
    Machine.pressKey('BKSP'); Sound.back(); render(); place('type');
    return true;
  }

  function editTab() {
    Machine.pressKey('TAB');
    const n = TAB - (cur.col % TAB);
    if (data.settings.mode === 'overtype') {
      Sound.space();
      setCur(cur.row, Math.min(cur.col + n, linesOf(cur.p)[cur.row].length), 'return');
      return;
    }
    const res = insertWithReflow(linesOf(cur.p), cur.row, cur.col, ' '.repeat(n));
    if (!res) { Sound.bell(); return; }
    commit(res.lines); Sound.space(); render();
    setCur(res.row, res.col, 'return');
  }

  // ---------- moving around ----------
  function moveHoriz(d) {
    const L = linesOf(cur.p);
    let { row, col } = cur;
    col += d;
    if (col < 0) { if (row === 0) return; row--; col = L[row].length; }
    else if (col > L[row].length) { if (row >= L.length - 1) return; row++; col = 0; }
    Sound.roll();
    setCur(row, col, row !== cur.row ? 'return' : 'back');
  }

  function moveVert(d) {
    const L = linesOf(cur.p);
    const row = cur.row + d;
    if (row < 0 || row >= L.length) return; // edge of the typed part of the sheet
    if (goalCol === null) goalCol = cur.col;
    Sound.roll();
    setCur(row, Math.min(goalCol, L[row].length), 'roll');
  }

  function gotoPos(row, col) {
    const L = linesOf(cur.p);
    row = Math.max(0, Math.min(row, L.length - 1));
    col = Math.max(0, Math.min(col, L[row].length));
    if (row === cur.row && col === cur.col) return;
    Sound.move();
    setCur(row, col, 'jump');
  }

  /** Take this sheet out and put another page of the book in the machine. */
  function flipSheet(d, pos) {
    const t = cur.p + d;
    if (t < 0 || t > lastIdx()) return;
    busy = true;
    if (d < 0) Machine.retractSheet();
    else { Machine.ejectSheet(); Sound.pull(); }
    cur = pos ? { p: t, ...pos } : (d < 0 || t === lastIdx() ? endPos(t) : { p: t, row: 0, col: 0 });
    setTimeout(() => loadSheetAnimated(d < 0 ? 'above' : 'below'), d < 0 ? 280 : 450);
  }

  function resume() {
    if (atEnd()) return;
    if (cur.p === lastIdx()) {
      Sound.move();
      cur = endPos(cur.p);
      place('jump');
    } else {
      flipSheet(lastIdx() - cur.p);
    }
  }

  // wheel / trackpad over the desk rolls the platen line by line
  let wheelAcc = 0, wheelT = 0;
  stage.addEventListener('wheel', (e) => {
    if (view !== 'desk' || busy || !book) return;
    const now = performance.now();
    if (now - wheelT > 400) wheelAcc = 0;
    wheelT = now;
    wheelAcc += e.deltaY;
    const step = 48;
    while (Math.abs(wheelAcc) >= step) {
      const d = Math.sign(wheelAcc);
      wheelAcc -= d * step;
      act({ type: 'vert', d });
    }
  }, { passive: true });

  // ---------------- on-screen keys ----------------
  function syncShift() {
    const on = shiftOnce || shiftLock || physShift;
    Machine.setLatched('SHL', shiftOnce || physShift);
    Machine.setLatched('SHR', shiftOnce || physShift);
    Machine.setLatched('LOCK', shiftLock);
    Machine.setShifted(on);
  }

  function onScreenKey(id) {
    Sound.init();
    switch (id) {
      case 'BKSP': act({ type: 'backspace' }); return;
      case 'RET': act({ type: 'return' }); return;
      case 'TAB': act({ type: 'tab' }); return;
      case 'SHL': case 'SHR': shiftOnce = !shiftOnce; Sound.shift(); syncShift(); return;
      case 'LOCK': shiftLock = !shiftLock; Sound.shift(); syncShift(); return;
    }
    const sh = shiftOnce || shiftLock;
    let ch = id;
    if (/^[A-Z]$/.test(id)) ch = sh ? id : id.toLowerCase();
    else if (sh && Machine.SHIFTED[id]) ch = Machine.SHIFTED[id];
    act({ type: 'char', ch });
    if (shiftOnce) { shiftOnce = false; syncShift(); }
  }

  // ---------------- physical keyboard ----------------
  const NAV = { ArrowUp: ['vert', -1], ArrowDown: ['vert', 1], ArrowLeft: ['horiz', -1], ArrowRight: ['horiz', 1], PageUp: ['page', -1], PageDown: ['page', 1] };

  document.addEventListener('keydown', (e) => {
    Sound.init();
    if (e.key === 'Escape' && $('settings').classList.contains('open')) { closeSettings(); return; }
    if (document.querySelector('dialog[open]')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === '.') { e.preventDefault(); toggleFocus(); return; }

    if (view === 'reader') {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); Reader.flip(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); Reader.flip(-1); }
      else if (e.key === 'Escape') { e.preventDefault(); backToDesk(); }
      return;
    }
    if (view !== 'desk') return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;

    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); quickSavePoint(); return; }
    if (mod && (e.key === 'ArrowDown' || e.key === 'End')) { e.preventDefault(); act({ type: 'resume' }); return; }
    if (mod && (e.key === 'ArrowUp' || e.key === 'Home')) { e.preventDefault(); act({ type: 'goto', row: 0, col: 0 }); return; }
    if (mod || e.altKey) return;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();

    if (NAV[e.key]) { e.preventDefault(); act({ type: NAV[e.key][0], d: NAV[e.key][1] }); return; }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); act({ type: e.key.toLowerCase() }); return; }
    if (e.key === 'Delete') { e.preventDefault(); act({ type: 'delete' }); return; }
    if (e.key === 'Insert') { e.preventDefault(); setSetting('mode', data.settings.mode === 'insert' ? 'overtype' : 'insert'); toast(data.settings.mode === 'insert' ? 'Insert mode' : 'Strike-over mode', null, 1400); return; }
    if (e.key === 'Shift') {
      if (!e.repeat) { physShift = true; Sound.shift(); syncShift(); }
      return;
    }
    if (e.key === 'CapsLock') { setTimeout(() => Machine.setLatched('LOCK', e.getModifierState('CapsLock') || shiftLock), 0); return; }
    if (e.key === 'Enter') { e.preventDefault(); act({ type: 'return' }); return; }
    if (e.key === 'Backspace') { e.preventDefault(); act({ type: 'backspace' }); return; }
    if (e.key === 'Tab') { e.preventDefault(); act({ type: 'tab' }); return; }
    if (e.key.length === 1) {
      e.preventDefault();
      let ch = e.key;
      if (shiftLock && /^[a-z]$/.test(ch)) ch = ch.toUpperCase();
      act({ type: 'char', ch });
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' && physShift) { physShift = false; syncShift(); }
  });
  window.addEventListener('blur', () => { if (physShift) { physShift = false; syncShift(); } });

  let hintGone = false;
  function hideHint() {
    if (hintGone) return;
    hintGone = true;
    $('hint').classList.add('gone');
  }

  // ---------------- desk toolbar ----------------
  function barClick(id, fn) {
    $(id).addEventListener('click', (e) => { Sound.init(); e.currentTarget.blur(); fn(); });
  }
  barClick('btn-library', goLibrary);
  barClick('btn-read', () => openReader(cur.p));
  barClick('manuscript', () => openReader('start'));
  barClick('btn-savepoint', quickSavePoint);
  barClick('btn-history', openSaves);
  barClick('pg-prev', () => act({ type: 'page', d: -1 }));
  barClick('pg-next', () => act({ type: 'page', d: 1 }));
  barClick('btn-resume', () => act({ type: 'resume' }));
  barClick('btn-sound', () => setSound(!Sound.enabled, true));

  function setSound(on, announce) {
    data.settings.sound = Sound.enabled = on;
    $('btn-sound').classList.toggle('off', !on);
    persist();
    syncSettingsUI();
    if (announce) toast(on ? 'Sound on.' : 'Sound off.', null, 1400);
  }

  // =====================================================================
  //   SETTINGS: themes, sounds, modes
  // =====================================================================
  const chip = (key, o) => `<button class="chip" data-set="${key}" data-val="${o.id}" aria-pressed="false">${escapeHTML(o.name)}</button>`;

  function buildSettings() {
    $('opt-theme').innerHTML = THEMES.map((t) =>
      `<button class="theme-sw" data-theme="${t.id}" data-set="theme" data-val="${t.id}" aria-pressed="false"><span>${t.name}</span></button>`).join('');
    $('opt-finish').innerHTML = FINISHES.map((f) =>
      `<button class="dot" data-set="finish" data-val="${f.id}" title="${f.name}" aria-label="${f.name}" aria-pressed="false"
        style="background:radial-gradient(circle at 35% 30%, rgba(255,255,255,.35), transparent 45%), linear-gradient(135deg, ${f.a}, ${f.b});"></button>`).join('');
    $('opt-ink').innerHTML = INKS.map((i) =>
      `<button class="dot" data-set="ink" data-val="${i.id}" title="${i.name}" aria-label="${i.name} ink" aria-pressed="false"
        style="background:radial-gradient(circle at 35% 30%, rgba(255,255,255,.3), transparent 45%), ${i.color};"></button>`).join('');
    $('opt-profile').innerHTML = SOUND_PROFILES.map((p) => chip('profile', p)).join('');
    $('opt-amb').innerHTML = AMBIENCES.map((a) => chip('ambience', a)).join('');
    $('opt-mode').innerHTML = chip('mode', { id: 'insert', name: 'Insert' }) + chip('mode', { id: 'overtype', name: 'Strike over' });
    $('opt-ambfx').innerHTML = chip('ambFx', { id: 'scene', name: 'Full scene' }) + chip('ambFx', { id: 'subtle', name: 'Subtle' }) + chip('ambFx', { id: 'off', name: 'Sound only' });
    $('opt-focus').innerHTML = chip('focus', { id: 'off', name: 'Off' }) + chip('focus', { id: 'on', name: 'Focus mode' });
  }

  function syncSettingsUI() {
    const s = data.settings;
    document.querySelectorAll('#settings [data-set]').forEach((b) => {
      const k = b.dataset.set;
      const v = k === 'focus' ? (s[k] ? 'on' : 'off') : s[k];
      b.setAttribute('aria-pressed', String(v === b.dataset.val));
    });
    $('opt-volume').value = s.volume;
    $('opt-ambvol').value = s.ambVol;
    $('sound-note').textContent = !s.sound ? 'Sound is switched off. Choosing a sound turns it back on.'
      : 'Pick a machine to hear it. If you hear nothing, check the tab isn’t muted and your volume is up.';
  }

  function applySettings() {
    const s = data.settings;
    document.body.dataset.theme = s.theme;
    document.body.style.setProperty('--ink', (INKS.find((i) => i.id === s.ink) || INKS[0]).color);
    document.body.classList.toggle('focus', !!s.focus);
    applyFinish();
    Sound.setProfile(s.profile);
    Sound.setVolume(s.volume);
    Sound.setAmbienceVolume(s.ambVol);
    Fx.themeChanged();
    Fx.set(s.ambience, s.ambFx);
  }

  function setSetting(k, v) {
    data.settings[k] = v;
    if (k === 'ambience') Sound.setAmbience(v);
    applySettings();
    syncSettingsUI();
    persist();
  }

  function toggleFocus() {
    setSetting('focus', !data.settings.focus);
    if (data.settings.focus && view === 'desk') toast('Focus mode: move the pointer to the top for the menu. ⌘/Ctrl . to leave.', null, 3000);
  }

  function openSettings() {
    syncSettingsUI();
    const d = $('settings');
    d.inert = false;
    d.classList.add('open');
  }
  function closeSettings() {
    const d = $('settings');
    d.classList.remove('open');
    d.inert = true;
  }

  $('settings').addEventListener('click', (e) => {
    const b = e.target.closest('[data-set]');
    if (!b) return;
    Sound.init();
    const k = b.dataset.set, v = b.dataset.val;
    if (k === 'focus') { if ((v === 'on') !== !!data.settings.focus) toggleFocus(); return; }
    if (k === 'ambFx') { setSetting('ambFx', v); return; }
    setSetting(k, v);
    if (k === 'profile') {
      if (!Sound.enabled) setSound(true);
      setTimeout(() => Sound.demo(), 120);
    }
    if (k === 'ambience' && v !== 'none' && !Sound.enabled) setSound(true);
  });
  $('opt-volume').addEventListener('input', (e) => { data.settings.volume = +e.target.value; Sound.setVolume(data.settings.volume); });
  $('opt-volume').addEventListener('change', () => { Sound.key(); Sound.key(0.12); persist(); });
  $('opt-ambvol').addEventListener('input', (e) => { data.settings.ambVol = +e.target.value; Sound.setAmbienceVolume(data.settings.ambVol); });
  $('opt-ambvol').addEventListener('change', () => persist());
  document.querySelectorAll('[data-open-settings]').forEach((b) => b.addEventListener('click', (e) => {
    Sound.init();
    e.currentTarget.blur();
    $('settings').classList.contains('open') ? closeSettings() : openSettings();
  }));
  $('btn-settings-close').addEventListener('click', closeSettings);
  document.addEventListener('pointerdown', (e) => {
    if ($('settings').classList.contains('open') && !e.target.closest('#settings, [data-open-settings], .keys, .lever, .paper-holder')) closeSettings();
  });

  // =====================================================================
  //   SAVE POINTS
  // =====================================================================
  function snippet(pages) {
    const all = pages.join(' ').replace(/\s+/g, ' ').trim();
    return all.length > 70 ? '…' + all.slice(-70) : all || '(blank page)';
  }

  function makeSavePoint(name) {
    const { row } = cursor();
    const sp = {
      id: uid(),
      name: name || `Page ${book.pages.length}, line ${row + 1}`,
      at: Date.now(),
      pages: [...book.pages],
      words: countWords(book.pages),
    };
    book.saves = book.saves || [];
    book.saves.unshift(sp);
    clearTimeout(saveTimer);
    book.updated = Date.now();
    persist();
    return sp;
  }

  function quickSavePoint() {
    if (!book) return;
    const sp = makeSavePoint('');
    Sound.bell();
    toast(`Save point made: ${sp.name}`, { label: 'View all', fn: openSaves });
  }

  function renderSaves() {
    const ol = $('sp-list');
    const saves = book.saves || [];
    if (!saves.length) {
      ol.innerHTML = '<li class="sp-empty">No save points yet. Make one whenever you reach a moment you might want to come back to.</li>';
      return;
    }
    ol.innerHTML = saves.map((s) => `
      <li data-id="${s.id}">
        <div class="sp-info">
          <div class="sp-name">${escapeHTML(s.name)}</div>
          <div class="sp-sub">${new Date(s.at).toLocaleString()} · ${s.pages.length} page${s.pages.length === 1 ? '' : 's'} · ${s.words} words</div>
          <div class="sp-snip">${escapeHTML(snippet(s.pages))}</div>
        </div>
        <button data-sp="restore">Restore</button>
        <button data-sp="delete" class="del" title="Delete save point" aria-label="Delete save point">✕</button>
      </li>`).join('');
  }

  function openSaves() {
    if (!book) return;
    $('sp-name').value = '';
    renderSaves();
    $('dlg-saves').showModal();
  }

  $('form-savepoint').addEventListener('submit', (e) => {
    e.preventDefault();
    const sp = makeSavePoint($('sp-name').value.trim());
    $('sp-name').value = '';
    renderSaves();
    toast(`Save point made: ${sp.name}`);
  });
  $('btn-saves-close').addEventListener('click', () => $('dlg-saves').close());

  $('sp-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-sp]');
    if (!btn) return;
    const id = btn.closest('li').dataset.id;
    const sp = book.saves.find((s) => s.id === id);
    if (!sp) return;
    if (btn.dataset.sp === 'delete') {
      book.saves = book.saves.filter((s) => s.id !== id);
      persist(); renderSaves();
      return;
    }
    $('dlg-saves').close();
    const yes = await confirmBox(`Restore “${sp.name}”?`,
      'The book will go back to how it was at this save point. Your current version is kept as a new save point first, so nothing is lost.', 'Restore');
    if (!yes) return;
    makeSavePoint(`Before restoring “${sp.name}”`);
    book.pages = [...sp.pages];
    book._words = undefined;
    cur = endPos(lastIdx());
    persist();
    updateMeta(true);
    busy = true;
    Machine.ejectSheet();
    Sound.pull();
    setTimeout(loadSheetAnimated, 550);
    toast(`Restored “${sp.name}”.`);
  });

  // =====================================================================
  //   READER
  // =====================================================================
  Reader.init();

  function openReader(at) {
    if (!book) return;
    clearTimeout(saveTimer);
    persist();
    showView('reader');
    Reader.open(book, at);
  }
  function backToDesk() { openDesk(book); }
  $('btn-reader-back').addEventListener('click', backToDesk);
  $('btn-reader-lib').addEventListener('click', goLibrary);

  $('btn-takeover').addEventListener('click', () => {
    // load what the other tab saved, then continue here
    const fresh = Store.load();
    if (fresh) { fresh.settings = data.settings; data = fresh; }
    const b = findBook(book.id);
    if (!b) { goLibrary(); return; }
    deskBookId = null;
    openDesk(b);
  });

  // =====================================================================
  //   boot
  // =====================================================================
  Fx.init();
  window.addEventListener('resize', () => { fitDesk(); if (view === 'reader') { Reader.fit(); Fx.setLayout('reader', innerHeight * 0.86); } });
  document.addEventListener('pointerdown', () => Sound.init(), { passive: true });
  $('btn-sound').classList.toggle('off', !Sound.enabled);
  buildSwatches();
  buildSettings();
  applySettings();
  Sound.setAmbience(data.settings.ambience);
  renderLibrary();
  showView('library');
})();
