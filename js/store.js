/* Persistence: everything lives in localStorage under one key. */
const Store = {
  KEY: 'inkwell.v1',

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(this.KEY));
      if (d && Array.isArray(d.books)) {
        d.settings = Object.assign({ sound: true, finish: 'lacquer' }, d.settings || {});
        return d;
      }
    } catch (e) { /* fall through */ }
    return null;
  },

  save(data) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  },
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const countWords = (pages) => {
  let n = 0;
  for (const p of pages) { const m = p.match(/\S+/g); if (m) n += m.length; }
  return n;
};

/* Word-wrap plain prose into typewriter pages (used for the sample book). */
function proseToPages(paragraphs) {
  const lines = [];
  for (const para of paragraphs) {
    if (para === '') { lines.push(''); continue; }
    let line = '     ';
    for (const word of para.split(/\s+/)) {
      if (line.trim() === '' ? (line + word).length <= CFG.COLS : (line + ' ' + word).length <= CFG.COLS) {
        line = line.trim() === '' ? line + word : line + ' ' + word;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  const pages = [];
  for (let i = 0; i < lines.length; i += CFG.ROWS) pages.push(lines.slice(i, i + CFG.ROWS).join('\n'));
  return pages.length ? pages : [''];
}

function sampleBook() {
  const pages = proseToPages([
    'THE LIGHTHOUSE LETTERS',
    '',
    'Dear Marguerite,',
    '',
    'The supply boat came this morning, three days late and smelling of diesel and oranges. I have rationed the oranges. I have not rationed the coffee, and I suspect you would scold me for that, but the nights here are long and the lamp does not keep itself.',
    'I found an old typewriter in the keeper\'s cabinet beneath a tin of buttons. The ribbon is dry and the letter E sticks, so forgive me if this letter looks as though it was written during a small earthquake. It was not. The sea has been calm all week, which is somehow worse. A quiet sea is a sea that is thinking.',
    'You asked what I do with my days. I wind the clockwork. I polish the brass until I can see my own tired face in it. I count the ships, and when there are no ships I count the gulls, and when there are no gulls I write to you.',
    'There is a ledger on the desk that goes back sixty years. Every keeper wrote the weather in it, and nothing else, until 1931, when someone wrote a single line in the margin: "She did not come back, but the light stayed on." I have read it perhaps a hundred times. I do not know who she was. I think about her every evening when I climb the stairs.',
    'The wind has turned. I must go and see to the lamp.',
    '',
    'Yours, across the water,',
    '                              E.',
  ]);
  return {
    id: uid(),
    title: 'The Lighthouse Letters',
    author: 'A Sample Book',
    leather: 'navy',
    paper: 'parchment',
    pages,
    saves: [],
    created: Date.now(),
    updated: Date.now(),
  };
}
