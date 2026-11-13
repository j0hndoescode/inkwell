# Inkwell — a typewriter for writing books

An online vintage typewriter. Each project is a leather-bound book; you type pages on the machine,
full pages are pulled out and bound into the book, and you can flip through the book page by page.

## Run it

No build step. Either double-click `index.html`, or serve the folder:

```bash
python3 -m http.server 8642 --directory typewriter
```

then open http://localhost:8642.

## How it works

- **Library**: your books on a shelf. Make new books (title, author, leather binding, paper tone), edit, delete, export as `.txt`.
- **Typewriter**: type with your keyboard or click the keys. Enter / the carriage lever = carriage return,
  Backspace erases (backspacing on a blank sheet brings back the previous page), Tab jumps to the next tab stop.
  The bell rings near the margin; a word that runs past the margin is carried onto the next line.
- **Pages**: 44 columns × 28 lines per sheet. When a sheet is full it's pulled out and a fresh one rolls in.
- **Fixing mistakes**: click any letter on the page, scroll over the paper, or use the arrow keys / Home / End to bring the
  carriage there. Typing inserts (words that no longer fit slide down a line) or, in *Strike over* mode (Insert key), types on top.
  Delete / Backspace remove letters. Page Up / Page Down (or the ‹ › by the page counter) swap sheets in the machine.
  ⌘/Ctrl ↓ (or the “back to where you left off” pill) returns to the end of the book.
- **Mood & machine** (sliders icon): room themes (Lamplit study, Morning light, Midnight, Candlelight, Café marble),
  typewriter finish, ink colour, key sounds (Classic manual, Heavy office, Portable, Electric with motor hum, Muffled, Silent),
  volume, background ambience (rain, fireplace, sea, clock) and focus mode (⌘/Ctrl .).
- **Save points**: ⌘/Ctrl S (or the bookmark button) snapshots the book; History lists them and can restore one
  (your current version is kept as a save point first). Work also autosaves as you type.
- **Reader**: an open book with 3D page turns (arrow keys, click a page, or the slider).
- **Back up / restore**: everything lives in the browser's localStorage; use “Back up library” on the shelf to download a JSON backup.

## Files

- `js/config.js` — page and machine dimensions, bindings, paper tones, typewriter finishes
- `js/machine.js` — draws and animates the typewriter (keys, typebars, ribbon, carriage)
- `js/sheet.js` — renders aged typewritten paper
- `js/reader.js` — the page-flipping book
- `js/app.js` — library, typing model, save points
- `js/sound.js` — synthesised typewriter sounds (WebAudio, no audio files)
