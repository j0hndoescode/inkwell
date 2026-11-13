/* Shared dimensions. Everything is laid out in "design pixels" and then scaled to the screen. */
const CFG = {
  COLS: 44,          // characters per line
  ROWS: 28,          // lines per page
  CW: 13,            // width of one typed character cell
  LH: 25,            // line height
  MX: 58,            // left/right paper margin
  MT: 64,            // top margin
  MB: 70,            // bottom margin
  TAB: 5,            // tab stop every N columns
  BELL_AT: 7,        // margin bell rings this many columns before the end
};
CFG.PW = CFG.COLS * CFG.CW + CFG.MX * 2;              // paper width  (688)
CFG.PH = CFG.ROWS * CFG.LH + CFG.MT + CFG.MB;         // paper height (834)

/* The typewriter body. PX/PY is the printing point (where the type slug strikes). */
const MACH = { W: 1000, H: 790, PX: 500, PY: 170, CLIP: 182 };

const LEATHERS = [
  { id: 'oxblood',  name: 'Oxblood',      c1: '#6e1f1c', c2: '#3e0f0d' },
  { id: 'forest',   name: 'Forest',       c1: '#284634', c2: '#13241a' },
  { id: 'navy',     name: 'Midnight',     c1: '#1f2f4d', c2: '#0e1628' },
  { id: 'tobacco',  name: 'Tobacco',      c1: '#6b4426', c2: '#382212' },
  { id: 'plum',     name: 'Plum',         c1: '#4b2440', c2: '#25101f' },
  { id: 'ebony',    name: 'Ebony',        c1: '#2b2725', c2: '#121010' },
];

const PAPERS = [
  { id: 'ivory',     name: 'Ivory',     color: '#f3ead3' },
  { id: 'parchment', name: 'Parchment', color: '#ecdcb4' },
  { id: 'antique',   name: 'Antique',   color: '#e2cc9c' },
];

const FINISHES = [
  { id: 'lacquer', name: 'Black lacquer', a: '#2c2826', b: '#0d0c0b', deck: '#181615', trim: '#d6b25e' },
  { id: 'seafoam', name: 'Seafoam',       a: '#7fbfaa', b: '#3f7c6b', deck: '#2c3e50', trim: '#f2ead3' },
  { id: 'oxblood', name: 'Oxblood',       a: '#6a2420', b: '#2a0b09', deck: '#1a1312', trim: '#d6b25e' },
  { id: 'ivory',   name: 'Cream',         a: '#e9dfc7', b: '#a8997a', deck: '#2a2623', trim: '#8a6a2c' },
];

const THEMES = [
  { id: 'study',    name: 'Lamplit study' },
  { id: 'daylight', name: 'Morning light' },
  { id: 'midnight', name: 'Midnight' },
  { id: 'rosewood', name: 'Candlelight' },
  { id: 'marble',   name: 'Café marble' },
];

const INKS = [
  { id: 'black',   name: 'Black',   color: '#231c17' },
  { id: 'sepia',   name: 'Sepia',   color: '#4b2d16' },
  { id: 'indigo',  name: 'Indigo',  color: '#1f2a52' },
  { id: 'crimson', name: 'Crimson', color: '#7a1a17' },
];

const SOUND_PROFILES = [
  { id: 'classic',  name: 'Classic manual' },
  { id: 'office',   name: 'Heavy office' },
  { id: 'portable', name: 'Portable' },
  { id: 'electric', name: 'Electric' },
  { id: 'muffled',  name: 'Muffled (late night)' },
  { id: 'silent',   name: 'Silent keys' },
];

const AMBIENCES = [
  { id: 'none',  name: 'None' },
  { id: 'rain',  name: 'Rain' },
  { id: 'fire',  name: 'Fireplace' },
  { id: 'sea',   name: 'Sea' },
  { id: 'clock', name: 'Clock' },
];
