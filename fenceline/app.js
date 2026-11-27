// Fenceline for the web: main menu, game screen, lessons and dialogs.
// Mirrors MainActivity.kt and GameActivity.kt from the Android app (Play together runs online here; no leaderboards).
// native.js comes first: inside the Android app it imports the old app's data before anything reads it.
import './compat.js';
import { isApp, share as nativeShare, copyText, readClipboard, canReadClipboard, canVibrate, canKeepAwake, keepScreenOn, deviceName, setBackHandler, onNative, parseLink } from './native.js';
import { Shape, Edge, Grid, Puzzle, PuzzleCode, PuzzleGenerator, Game, Tutorial, Boards, dailySeed } from './core.js';
import { store, formatTime } from './store.js';
import { theme, applyTheme, onThemeChange, el, text, button, chip, row, dialog, sk, setLabel, closeTopDialog, closeAllDialogs, topDialog, redrawBoxes } from './ui.js';
import { BoardView } from './board.js';
import { PENCILS, pencilColor, pencilLine } from './sketch.js';
import { Mode, CoopBoard, SEATS, parsePuzzle as roomParse } from './room.js';
import { Link, cleanCode } from './net.js';
import { NearbyLink } from './nearby.js';

const SHARE_BASE = 'https://mbrooks8.github.io/fenceline/?p=';
const JOIN_BASE = 'https://mbrooks8.github.io/fenceline/?join=';

/** Big boards for co-op group play, about 400 to 900 cells (Store.kt groupSizes). */
const GROUP_SIZES = {
  SQUARE: ['20x20', '25x25', '30x30'],
  HEX: ['18x22', '22x28', '26x34'],
  TRIANGLE: ['14x15', '17x19', '20x22'],
  CAIRO: ['14x16', '17x20', '20x23'],
};
const isAndroid = /Android/i.test(navigator.userAgent);
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const app = document.getElementById('app');
const cap = s => s.charAt(0) + s.slice(1).toLowerCase();
const diffLabel = d => (d || '').toLowerCase();

// ---- puzzle factory: generates in workers and keeps the next one ready ----

const factory = {
  workers: {}, nextId: 1, pending: new Map(), ready: null, noWorker: false,

  worker(kind) {
    if (this.noWorker) return null;
    if (this.workers[kind]) return this.workers[kind];
    let w;
    try { w = new Worker('./worker.js', { type: 'module' }); } catch (e) { this.noWorker = true; return null; }
    w.onmessage = ev => {
      const m = ev.data || {};
      const job = this.pending.get(m.id);
      if (!job) return;
      this.pending.delete(m.id);
      if (m.error) { job.reject(new Error(m.error)); return; }
      try {
        const p0 = Puzzle.decode(m.text);
        job.resolve(new Puzzle(p0.width, p0.height, p0.clues, p0.solution, m.difficulty, BigInt(m.seed), p0.shape));
      } catch (e) { job.reject(e); }
    };
    w.onerror = ev => {
      // A worker that can't start (old browser): finish its jobs here instead.
      ev.preventDefault && ev.preventDefault();
      this.noWorker = true;
      for (const [id, job] of this.pending) if (job.kind === kind) { this.pending.delete(id); this.local(job); }
      try { w.terminate(); } catch (e) { /* ignore */ }
      delete this.workers[kind];
    };
    return (this.workers[kind] = w);
  },

  local(job) {
    setTimeout(() => {
      try { job.resolve(PuzzleGenerator.generate(job.w, job.h, job.d, job.seed, job.shape)); } catch (e) { job.reject(e); }
    }, 30);
  },

  gen(kind, w, h, d, seed, shape) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const job = { id, kind, w, h, d, seed, shape, resolve, reject };
      const wk = this.worker(kind);
      if (!wk) { this.local(job); return; }
      this.pending.set(id, job);
      wk.postMessage({ id, width: w, height: h, difficulty: d, seed: seed.toString(), shape: shape.code });
    });
  },

  key: (w, h, d, s) => `${s.code}${w}x${h}/${d}`,

  request(w, h, d, seed, shape) {
    const k = this.key(w, h, d, shape);
    if (seed == null && this.ready && this.ready.key === k) {
      const p = this.ready.promise;
      this.ready = null;
      p.then(() => this.prefetch(w, h, d, shape), () => {});
      return p.catch(() => this.gen('fg', w, h, d, PuzzleCode.randomSeed(), shape));
    }
    const p = this.gen('fg', w, h, d, seed == null ? PuzzleCode.randomSeed() : seed, shape);
    if (seed == null) p.then(() => this.prefetch(w, h, d, shape), () => {});
    return p;
  },

  /** Builds the next puzzle for these settings in the background. */
  prefetch(w, h, d, shape) {
    if (this.noWorker) return;
    const k = this.key(w, h, d, shape);
    if (this.ready && this.ready.key === k) return;
    const entry = { key: k, promise: this.gen('bg', w, h, d, PuzzleCode.randomSeed(), shape) };
    entry.promise.catch(() => { if (this.ready === entry) this.ready = null; });
    this.ready = entry;
  },
};

// ---- keep the screen on while playing ----

const keepAwake = on => keepScreenOn(on);

// ---- shared dialogs ----

function settingsDialog(onDone) {
  const col = el('div', { class: 'col' });
  let d;
  const toggle = (label, key) => {
    const t = el('button', { type: 'button', class: 'toggle' });
    const refresh = () => { t.textContent = (store[key] ? '☑  ' : '☐  ') + label; };
    refresh();
    t.addEventListener('click', () => { store[key] = !store[key]; refresh(); });
    return t;
  };
  const build = () => {
    col.replaceChildren(
      text('Settings', { size: 26, bold: true }),
      toggle('Show mistakes', 'showErrors'),
      toggle('Auto-X around finished numbers', 'autoCross'),
      toggle('Show timer', 'showTimer'),
      ...(canVibrate() ? [toggle('Vibrate', 'haptics')] : []),
      ...(canKeepAwake() ? [toggle('Keep screen on', 'keepAwake')] : []),
      text('Challenge', { size: 17, bold: true, cls: 'gap14' }),
      toggle('No hints', 'noHints'),
      toggle('Plain numbers (no glow when done)', 'plainNumbers'),
      text('Pencil', { size: 17, bold: true, cls: 'gap14' }),
      row(...PENCILS.map(([name], i) => {
        const c = chip(name.slice(0, 5), store.pencil === i, () => { store.pencil = i; applyTheme(); build(); }, { size: 12 });
        c.style.color = pencilColor(i, theme.night);
        if (store.pencil === i) { c._sk.stroke = pencilColor(i, theme.night); }
        return c;
      })),
      text('Paper', { size: 17, bold: true, cls: 'gap14' }),
      row(...[['system', 'Auto'], ['day', 'Day'], ['night', 'Night']].map(([k, label]) =>
        chip(label, store.theme === k, () => { store.theme = k; applyTheme(); onThemeChange.forEach(f => f()); build(); }, { size: 15 }))),
      el('div', { class: 'gap18' }, button('Done', () => d.close())),
      ...(isApp ? [] : [el('p', { class: 'about' },
        'Playing on Android? ', el('a', { href: './Fenceline.apk', download: '' }, 'Download the app'), '.')]),
    );
  };
  build();
  d = dialog(col, { onClose: onDone });
  return d;
}

function rulesDialog() {
  let d;
  const col = el('div', { class: 'col' },
    text('How to play', { size: 26, bold: true }),
    text('Join the dots into one closed fence, like a rubber band laid on the board.', { size: 16 }),
    el('ul', { class: 'rules' },
      el('li', { text: "A number tells how many of its square's 4 sides are fence. It doesn't say which." }),
      el('li', { text: 'Squares without a number can have any count.' }),
      el('li', { text: 'Every dot has two fence pieces touching it, or none. So the fence never stops, splits or crosses.' }),
      el('li', { text: "There's only one fence, and it goes all the way around." })),
    text('Tap the gap between two dots to draw a fence, and tap it again to clear it. Press and hold a gap to mark it X (a gap that stays empty), or switch the Pen to X. Pinch to zoom, drag to move.', { size: 16 }),
    el('div', { class: 'gap16' }, button('Got it', () => d.close())),
  );
  d = dialog(col);
}

async function shareText(textBody, note) {
  const how = await nativeShare(textBody);
  if (how === 'shared') return;
  if (note) note(how === 'copied' ? 'Copied! Paste it to a friend.' : textBody);
}

const copy = s => copyText(s);

// ---- screens ----

let screen = null; // { name, dispose }

function setScreen(name, node, dispose) {
  if (screen && screen.dispose) screen.dispose();
  closeAllDialogs();
  app.replaceChildren(node);
  screen = { name, dispose };
  window.scrollTo(0, 0);
}

/** Draws a cell of that board shape in pencil, as a picker button. */
function shapeChip(shape, selected, onClick) {
  const b = el('button', { type: 'button', class: 'shapechip' + (selected ? ' sel' : ''), 'aria-label': shape.label, 'aria-pressed': selected ? 'true' : 'false' });
  const c = el('canvas');
  b.append(c);
  b.addEventListener('click', onClick);
  const g = Grid.create(shape, 3, 3);
  let cell = 0;
  if (shape === Shape.TRIANGLE) {
    for (let k = 0; k < g.cellCount; k++) {
      const ys = Array.from(g.cellVertices[k], v => g.vy[v]).sort((a, b2) => a - b2);
      if (ys[0] < ys[1] - 1e-6) { cell = k; break; }
    }
  }
  let pts = Array.from(g.cellVertices[cell], v => [g.vx[v], g.vy[v]]);
  if (shape === Shape.HEX) pts = pts.map(([x, y]) => [y, x]); // flat-top hexagon
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY);
  const poly = pts.map(([x, y]) => [(x - (minX + maxX) / 2) / span, (y - (minY + maxY) / 2) / span]);
  const draw = () => {
    const r = b.getBoundingClientRect();
    if (r.width < 2) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const inset = 5, size = Math.min(r.width - 2 * inset, r.height - 2 * inset);
    const cx = r.width / 2, cy = r.height / 2;
    const P = poly.map(([x, y]) => [cx + x * size, cy + y * size]);
    ctx.beginPath(); P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    ctx.fillStyle = selected ? `rgba(${hex(theme.accent)},${0x22 / 255})` : theme.pal.card;
    ctx.fill();
    const stroke = selected ? theme.accent : theme.pal.inkSoft;
    const w = selected ? 2.4 : 1.6;
    for (let i = 0; i < P.length; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length];
      pencilLine(ctx, x0, y0, x1, y1, stroke, w, shape.label.length * 31 + i, 2);
    }
    let tx = P.reduce((s, p) => s + p[0], 0) / P.length, ty = P.reduce((s, p) => s + p[1], 0) / P.length;
    if (P.length === 3) ty += size * 0.12;
    const xsAt = [];
    for (let i = 0; i < P.length; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length];
      if ((y0 - ty) * (y1 - ty) <= 0 && y0 !== y1) xsAt.push(x0 + (ty - y0) / (y1 - y0) * (x1 - x0));
    }
    const room = xsAt.length >= 2 ? (Math.max(...xsAt) - Math.min(...xsAt)) * 0.86 : r.width * 0.8;
    let fs = 14;
    ctx.font = `${fs}px "Coming Soon", "Chalkboard SE", cursive`;
    const w0 = ctx.measureText(shape.label).width;
    if (w0 > room) { fs = fs * room / w0; ctx.font = `${fs}px "Coming Soon", "Chalkboard SE", cursive`; }
    ctx.fillStyle = stroke; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(shape.label, tx, ty);
  };
  new ResizeObserver(draw).observe(b);
  return b;
}
function hex(h) { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; }

function showMenu() {
  const col = el('div', { class: 'menu col' });
  const build = () => {
    const kids = [];
    kids.push(el('h1', { class: 'title', text: 'Fenceline' }));

    // Continue.
    let saved = null;
    try { saved = store.savedGame ? Game.load(store.savedGame) : null; } catch (e) { saved = null; }
    if (saved && !saved.isSolved()) {
      const p = saved.puzzle;
      const label = store.savedMode === 'daily' ? 'Daily puzzle' : store.savedMode === 'tutorial' ? 'Lesson'
        : `${Boards.label(p.shape, p.width, p.height)} ${diffLabel(p.difficulty)}`;
      kids.push(el('div', { class: 'gap22' }, button(`Continue  ·  ${label}  ·  ${formatTime(saved.elapsedMs)}`, () => openGame({ mode: 'continue' }), { accent: 'accent' })));
    }

    // Daily.
    const streak = store.dailyStreak;
    const dailyLabel = store.dailyDoneToday ? `Daily puzzle  ✓  streak ${streak}` : 'Daily puzzle' + (streak > 0 ? `  ·  streak ${streak}` : '');
    kids.push(el('div', { class: 'gap14' }, button(dailyLabel, () => openGame({ mode: 'daily' }))));

    // New puzzle.
    kids.push(text('New puzzle', { size: 24, bold: true, cls: 'gap26' }));
    kids.push(text('Shape', { size: 15, color: 'inkSoft', cls: 'gap4' }));
    kids.push(el('div', { class: 'row shapes' }, ...Shape.entries.map(sh =>
      shapeChip(sh, store.lastShape === sh, () => { store.lastShape = sh; build(); }))));
    kids.push(text('Board size', { size: 15, color: 'inkSoft', cls: 'gap10' }));
    const sizes = Boards.sizes(store.lastShape);
    for (let i = 0; i < sizes.length; i += 4) {
      kids.push(el('div', { class: 'row gap6' }, ...sizes.slice(i, i + 4).map(s =>
        chip(s.replace('x', '×'), store.lastSize === s, () => { store.lastSize = s; build(); }))));
    }
    kids.push(text('Difficulty', { size: 15, color: 'inkSoft', cls: 'gap12' }));
    kids.push(el('div', { class: 'row gap6' }, ...['EASY', 'MEDIUM', 'HARD'].map(d =>
      chip(cap(d), store.lastDifficulty === d, () => { store.lastDifficulty = d; build(); }))));
    kids.push(el('div', { class: 'gap14' }, button('Start drawing', () => {
      const [w, h] = store.lastSize.split('x').map(Number);
      openGame({ mode: 'free', w, h, d: store.lastDifficulty, shape: store.lastShape });
    }, { size: 20, accent: 'accent' })));

    kids.push(el('div', { class: 'row gap26' }, button('Enter a code', codeDialog, { size: 16 }), button('Play together', () => playTogetherDialog(), { size: 16 })));
    kids.push(el('div', { class: 'row gap8' },
      button('Learn', () => openGame({ mode: 'tutorial', step: Math.max(0, Math.min(Tutorial.steps.length - 1, store.tutorialStep)) }), { size: 16 }),
      button('Stats', statsDialog, { size: 16 }),
      button('Settings', () => settingsDialog(build), { size: 16 })));
    kids.push(el('div', { class: 'gap8' }, button('How to play', rulesDialog, { size: 16 })));
    if (isIOS && !standalone) {
      kids.push(el('p', { class: 'tip' }, 'Tip: tap Share, then “Add to Home Screen” to keep Fenceline on your phone.'));
    }
    col.replaceChildren(...kids);
    // Warm up a puzzle for the selected settings so Start is instant.
    const [w, h] = store.lastSize.split('x').map(Number);
    factory.prefetch(w, h, store.lastDifficulty, store.lastShape);
  };
  build();
  const onTheme = () => build();
  onThemeChange.add(onTheme);
  setScreen('menu', el('div', { class: 'scroll' }, col), () => onThemeChange.delete(onTheme));
}

function codeDialog() {
  let d;
  const input = el('input', { class: 'codein', type: 'text', placeholder: 'F1-…', autocapitalize: 'characters', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false' });
  const error = text('', { size: 15, color: 'error' });
  const play = () => {
    const code = PuzzleCode.find(input.value);
    if (!code) error.textContent = "Hmm, that's not a puzzle code.";
    else { d.close(); openGame({ mode: 'code', code: code.toString() }); }
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') play(); });
  const kids = [
    text('Enter a code', { size: 24, bold: true }),
    text("Paste a friend's puzzle code.", { size: 15, color: 'inkSoft' }),
    sk(el('div', { class: 'inputbox' }, input), { stroke: 'inkSoft', width: 1.6 }),
    error,
  ];
  if (canReadClipboard()) {
    kids.push(el('div', { class: 'gap6' }, button('Paste', async () => {
      const t = await readClipboard();
      if (t == null) return;
      const c = PuzzleCode.find(t || ''); input.value = c ? c.toString() : (t || '').trim();
    }, { size: 15 })));
  }
  kids.push(el('div', { class: 'row gap12' }, button('Cancel', () => d.close(), { size: 17 }), button('Play', play, { size: 17, accent: 'accent' })));
  d = dialog(el('div', { class: 'col' }, ...kids));
  setTimeout(() => input.focus(), 50);
}

function statsDialog() {
  let d;
  const kids = [text('Stats', { size: 26, bold: true })];
  for (const diff of ['EASY', 'MEDIUM', 'HARD']) {
    const n = store.solved(diff);
    const avg = n > 0 ? formatTime(store.totalTime(diff) / n) : '–';
    kids.push(text(`${cap(diff)}: ${n} solved, average ${avg}`, { size: 17, bold: true, cls: 'gap12' }));
    const bests = [];
    for (const sh of Shape.entries) for (const s of Boards.sizes(sh)) {
      const [w, h] = s.split('x').map(Number);
      const b = store.best(Boards.key(sh, w, h), diff);
      if (b > 0) bests.push(`${Boards.label(sh, w, h)} ${formatTime(b)}`);
    }
    kids.push(text(bests.length ? 'Best (no hints): ' + bests.join(', ') : 'No best times yet', { size: 15, color: 'inkSoft' }));
  }
  kids.push(text(`Solved without hints: ${store.noHintWins}`, { size: 16, cls: 'gap14' }));
  kids.push(text(`Daily streak: ${store.dailyStreak}  (best ${store.bestStreak})`, { size: 16 }));
  kids.push(el('div', { class: 'row gap16' }, button('History', () => { d.close(); historyDialog(); }, { size: 17 }), button('Close', () => d.close(), { size: 17 })));
  d = dialog(el('div', { class: 'col' }, ...kids));
}

function historyDialog() {
  let d;
  const kids = [text('History', { size: 26, bold: true })];
  const items = store.history;
  if (!items.length) kids.push(text('Solved puzzles will show up here.', { size: 16, color: 'inkSoft', cls: 'gap8' }));
  const fmt = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const note = text('', { size: 15, color: 'inkSoft' });
  for (const h of items) {
    const code = PuzzleCode.find(h.code);
    if (!code) continue;
    const board = `${Boards.label(code.shape, code.width, code.height)} ${diffLabel(code.difficulty)}`;
    const what = ({ daily: 'Daily · ', coop: 'Co-op · ', versus: 'Versus · ' }[h.kind] || '') + board;
    const hints = h.hints === 0 ? 'no hints' : `${h.hints} hint${h.hints === 1 ? '' : 's'}`;
    kids.push(text(what, { size: 17, bold: true, cls: 'gap14' }));
    kids.push(text(`${formatTime(h.ms)} · ${hints} · ${fmt(h.date)}`, { size: 15, color: 'inkSoft' }));
    kids.push(el('div', { class: 'row gap6' },
      button('Play', () => { d.close(); openGame({ mode: 'code', code: code.toString() }); }, { size: 15, accent: 'accent' }),
      button('Share', () => shareText(`Try this ${board} Fenceline puzzle! I did it in ${formatTime(h.ms)}.\n${SHARE_BASE}${code}\nCode: ${code}`, s => { note.textContent = s; }), { size: 15 })));
  }
  kids.push(note);
  kids.push(el('div', { class: 'gap18' }, button('Close', () => d.close(), { size: 17 })));
  d = dialog(el('div', { class: 'col' }, ...kids));
}

// ---- play together ----

/** Pick versus or co-op and a board, then host or join (MainActivity.playTogetherDialog). */
function playTogetherDialog() {
  let d;
  const col = el('div', { class: 'col' });
  let coop = true; // co-op first (Michael)
  let shape = store.lastShape;
  let size = store.lastSize;
  let diff = store.lastDifficulty;
  // In the Android app, also offer same-room play over Nearby (no internet).
  let via = isApp ? store.mpVia : 'online';
  const name = el('input', { class: 'codein namein', type: 'text', placeholder: 'Your name', maxlength: '20', autocomplete: 'nickname', spellcheck: 'false' });
  name.value = defaultName();
  const saveName = () => { store.playerName = name.value.trim(); };
  const fill = () => {
    const sizes = Boards.sizes(shape).concat(coop ? GROUP_SIZES[shape.name] : []);
    if (!sizes.includes(size)) size = Boards.defaultSize ? Boards.defaultSize(shape) : Boards.sizes(shape)[1];
    const kids = [text('Play together', { size: 26, bold: true })];
    if (isApp) {
      kids.push(el('div', { class: 'row gap12' },
        chip('Online', via === 'online', () => { via = 'online'; store.mpVia = via; fill(); }),
        chip('Same room', via === 'nearby', () => { via = 'nearby'; store.mpVia = via; fill(); })));
      kids.push(text(via === 'nearby' ? 'Android phones close by. No internet needed.' : 'Any phone, anywhere. Needs internet.', { size: 15, color: 'inkSoft' }));
    } else kids.push(text('Online, with friends anywhere.', { size: 15, color: 'inkSoft' }));
    kids.push(
      sk(el('div', { class: 'inputbox' }, name), { stroke: 'inkSoft', width: 1.6 }),
      el('div', { class: 'row gap12' },
        chip('Versus', !coop, () => { coop = false; fill(); }),
        chip('Co-op', coop, () => { coop = true; fill(); })),
      text(coop ? 'Draw one loop together.' : 'Same puzzle, first loop wins.', { size: 15, color: 'inkSoft' }),
      el('div', { class: 'row gap6' }, ...Shape.entries.map(sh => chip(sh.label, shape === sh, () => { shape = sh; fill(); }, { size: 13 }))),
      text(`${shape.label} board`, { size: 15, color: 'inkSoft' }),
    );
    for (let i = 0; i < sizes.length; i += 4) {
      kids.push(el('div', { class: 'row gap6' }, ...sizes.slice(i, i + 4).map(s =>
        chip(s.replace('x', '×'), size === s, () => { size = s; fill(); }))));
    }
    kids.push(el('div', { class: 'row gap6' }, ...['EASY', 'MEDIUM', 'HARD'].map(dd => chip(cap(dd), diff === dd, () => { diff = dd; fill(); }))));
    const go = role => {
      saveName();
      d.close();
      if (role === 'join') {
        if (via === 'nearby') openGame({ mode: 'mp', role: 'join', via });
        else joinDialog('');
        return;
      }
      const [w, h] = size.split('x').map(Number);
      openGame({ mode: 'mp', role: 'host', mpMode: coop ? Mode.COOP : Mode.VERSUS, w, h, d: diff, shape, via });
    };
    kids.push(el('div', { class: 'row gap16' },
      button('Host', () => go('host'), { size: 18, accent: 'accent' }),
      button('Join', () => go('join'), { size: 18, accent: 'accent' })));
    kids.push(el('div', { class: 'gap8' }, button('Close', () => { saveName(); d.close(); }, { size: 16 })));
    col.replaceChildren(...kids);
  };
  fill();
  d = dialog(col);
}

/** The name other players see: what you typed last time, else (in the app) this phone's name. */
function defaultName() { return store.playerName || deviceName(); }

/** Type (or follow a link with) a friend's room code. */
function joinDialog(prefill) {
  let d;
  const code = el('input', { class: 'codein roomin', type: 'text', placeholder: 'ABCD', maxlength: '6', autocapitalize: 'characters', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false' });
  code.value = (prefill || '').toUpperCase();
  const name = el('input', { class: 'codein namein', type: 'text', placeholder: 'Your name', maxlength: '20', autocomplete: 'nickname', spellcheck: 'false' });
  name.value = defaultName();
  const error = text('', { size: 15, color: 'error' });
  const go = () => {
    const c = cleanCode(code.value);
    if (c.length !== 4) { error.textContent = 'Room codes have 4 letters.'; return; }
    store.playerName = name.value.trim();
    d.close();
    openGame({ mode: 'mp', role: 'join', code: c });
  };
  for (const i of [code, name]) i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  d = dialog(el('div', { class: 'col' },
    text('Join a game', { size: 24, bold: true }),
    text('Type the room code from your friend.', { size: 15, color: 'inkSoft' }),
    sk(el('div', { class: 'inputbox' }, code), { stroke: 'inkSoft', width: 1.6 }),
    sk(el('div', { class: 'inputbox' }, name), { stroke: 'inkSoft', width: 1.6 }),
    error,
    el('div', { class: 'row gap12' }, button('Cancel', () => d.close(), { size: 17 }), button('Join', go, { size: 17, accent: 'accent' })),
  ));
  setTimeout(() => (code.value ? name : code).focus(), 50);
}

// ---- game screen ----

let inGameHistory = false;

function openGame(opts) {
  if (!inGameHistory) {
    try { history.pushState({ fl: 'game' }, ''); inGameHistory = true; } catch (e) { /* ignore */ }
  }
  showGame(opts);
}

function leaveGame() {
  closeAllDialogs();
  if (inGameHistory) { history.back(); return; } // popstate shows the menu
  showMenu();
}

window.addEventListener('popstate', () => {
  if (closeTopDialog()) {
    // Back closed a dialog: stay on this screen.
    if (screen && screen.name === 'game') { try { history.pushState({ fl: 'game' }, ''); } catch (e) { /* ignore */ } }
    return;
  }
  inGameHistory = false;
  if (screen && screen.name === 'game') showMenu();
});

function showGame(opts) {
  let mode = opts.mode, step = opts.step || 0;
  let game = null, resumedAt = 0, winShown = false, pendingFix = null, guide = [], guideAt = 0, disposed = false;
  // Play together.
  let link = null, room = null, coop = null;
  let mpMode = opts.mpMode || Mode.VERSUS, mpW = opts.w || 7, mpH = opts.h || 7, mpDiff = opts.d || 'EASY', mpShape = opts.shape || Shape.SQUARE;
  let lobbyD = null, lobbyCol = null, lobbyStatus = '', resultsD = null, resultsCol = null;
  let countingDown = false, hostPuzzle = null, startWhenReady = false, lastSentProgress = -1, lastProgAt = 0, progTimer = 0;
  let lastLocalEdit = -Infinity, round = 0, syncTimer = 0, countTimer = 0, roomCode = opts.code || '';
  const nearby = opts.via === 'nearby'; // Android app, same room over Nearby (else online)
  const progress = new Map(), finished = new Map(); // finished: player -> [ms, hints, place]
  const hintsOff = () => store.noHints && mode !== 'tutorial';

  // Layout.
  const back = el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Back', text: '‹' });
  back.addEventListener('click', () => { save(); leaveGame(); });
  const title = el('div', { class: 'gtitle' });
  const timerText = el('div', { class: 'timer' });
  const menuBtn = el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Menu', text: '⋯' });
  menuBtn.addEventListener('click', () => menuDialog());
  const top = el('div', { class: 'topbar' }, back, title, timerText, menuBtn);
  const appLink = el('div', { class: 'applink', hidden: true });
  const note = sk(el('div', { class: 'note', hidden: true }), { stroke: 'inkSoft', width: 1.6 });
  const noteText = el('span');
  note.append(noteText);
  note.addEventListener('click', () => { if (mode !== 'tutorial') setNote(''); });
  const setNote = s => { noteText.textContent = s; note.hidden = !s; };
  const canvas = el('canvas', { class: 'board', 'aria-label': 'Puzzle board' });
  const loading = el('div', { class: 'loading', text: 'sharpening pencils…' });
  const boardFrame = el('div', { class: 'boardframe' }, canvas, loading);
  const undoBtn = button('Undo', () => { game && game.undo(); board.clearHighlights(); pendingFix = null; refresh(); save(); }, { size: 16 });
  const redoBtn = button('Redo', () => { game && game.redo(); board.clearHighlights(); pendingFix = null; refresh(); save(); }, { size: 16 });
  const penBtn = button('Pen: Fence', () => { board.crossPen = !board.crossPen; refresh(); }, { size: 16 });
  // Co-op: Ping, then tap the board to point everyone at that dot.
  const pingBtn = button('Ping', () => { board.pingArmed = !board.pingArmed; refresh(); if (board.pingArmed) setNote('Tap a dot to show everyone.'); }, { size: 16 });
  pingBtn.hidden = true;
  const bar = el('div', { class: 'row bottombar' }, undoBtn, redoBtn, penBtn, pingBtn);
  const playersText = el('div', { class: 'players', hidden: true });
  const root = el('div', { class: 'game' }, top, playersText, appLink, note, boardFrame, bar);

  const board = new BoardView(canvas);
  board.onPingDone = () => { refresh(); setNote(''); };
  if (window.__fenceline) window.__fenceline.board = board;
  board.onChanged = () => { pendingFix = null; if (mode !== 'tutorial') setNote(''); advanceGuide(); refresh(); save(); };
  board.onOffGuide = () => { const s = guide[guideAt]; if (s) setNote('Try the glowing gap. ' + s.text); };

  const applySettings = () => {
    board.palette = theme.pal;
    board.pencilColor = theme.accent;
    board.showErrors = store.showErrors;
    board.haptics = store.haptics;
    board.plainNumbers = store.plainNumbers;
    if (game) game.autoCross = store.autoCross;
    timerText.hidden = !store.showTimer;
    keepAwake(store.keepAwake);
    board.invalidate();
  };

  // Timer and saving.
  const bankTime = () => {
    const now = performance.now();
    if (game && !game.isSolved() && resumedAt > 0 && !countingDown && document.visibilityState === 'visible') game.elapsedMs += Math.max(0, now - resumedAt);
    resumedAt = now;
  };
  const updateTimer = () => { if (!game) return; bankTime(); timerText.textContent = formatTime(game.elapsedMs); };
  const ticker = setInterval(updateTimer, 1000);
  const save = () => {
    if (!game) return;
    bankTime();
    game.elapsedMs = Math.round(game.elapsedMs);
    if (mode === 'mp') return;
    if (game.isSolved()) {
      const s = store.savedGame;
      if (s && s.startsWith(game.puzzle.encode(true))) store.savedGame = null;
      return;
    }
    store.savedGame = game.saveString();
    store.savedMode = mode;
  };
  const onVis = () => {
    if (document.visibilityState === 'hidden') { save(); }
    else { resumedAt = performance.now(); keepAwake(store.keepAwake); }
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', save);
  const onTheme = () => { applySettings(); };
  onThemeChange.add(onTheme);

  const showLoading = () => { loading.hidden = false; board.locked = true; };

  const refresh = () => {
    if (!game) return;
    undoBtn.classList.toggle('dim', !game.canUndo);
    redoBtn.classList.toggle('dim', !game.canRedo);
    setLabel(penBtn, board.crossPen ? 'Pen: X' : 'Pen: Fence');
    pingBtn.hidden = !board.onPing;
    pingBtn.classList.toggle('on', board.pingArmed);
    board.invalidate();
    if (mode === 'mp') sendProgress(game);
    if (game.isSolved() && !winShown) onSolved(false);
  };

  const start = g => {
    if (disposed) return;
    loading.hidden = true;
    board.locked = false;
    winShown = false;
    game = g;
    g.autoCross = store.autoCross;
    applySettings();
    board.setGame(g);
    const p = g.puzzle;
    let head;
    if (mode === 'daily') head = 'Daily · ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    else if (mode === 'tutorial') head = `Lesson ${step + 1}/${Tutorial.steps.length} · ${Tutorial.steps[step].title}`;
    else if (mode === 'mp') head = (mpMode === Mode.COOP ? 'Co-op · ' : 'Versus · ') + `${Boards.label(p.shape, p.width, p.height)} ${diffLabel(p.difficulty)}`;
    else head = `${Boards.label(p.shape, p.width, p.height)} · ${diffLabel(p.difficulty)}`;
    const code = mode === 'tutorial' ? null : PuzzleCode.of(p);
    title.replaceChildren(el('div', { class: 'head', text: head }), code ? el('div', { class: 'code', text: code.toString() }) : '');
    setNote(mode === 'tutorial' ? Tutorial.steps[step].tip : '');
    startGuide(g);
    resumedAt = performance.now();
    updateTimer();
    refresh();
    save();
    if (g.isSolved()) onSolved(true);
  };

  const newPuzzle = (w, h, d, seed, shape) => {
    mode = 'free';
    showLoading();
    setNote('');
    factory.request(w, h, d, seed, shape).then(p => start(new Game(p)), err => {
      loading.textContent = "Oops, that puzzle wouldn't draw. Go back and try again.";
      console.error(err);
    });
  };

  const startTutorial = i => {
    mode = 'tutorial'; step = i;
    store.tutorialStep = i;
    const p = Tutorial.puzzle(i);
    const g = new Game(p);
    for (const e of Tutorial.prepared(i, p)) g.setMark(e, Edge.LINE);
    start(g);
    if (i === 0) showGoal();
  };

  // Guided lessons.
  const startGuide = g => {
    guide = mode === 'tutorial' ? Tutorial.guide(step, g.puzzle) : [];
    guideAt = 0;
    advanceGuide();
  };
  const advanceGuide = () => {
    const g = game;
    if (!g) return;
    while (guideAt < guide.length && guide[guideAt].edges.every(e => g.marks[e] === guide[guideAt].value)) guideAt++;
    if (guideAt >= guide.length) {
      guide = [];
      board.setGuide([], false);
      return;
    }
    const s = guide[guideAt];
    board.setGuide(s.edges.filter(e => g.marks[e] !== s.value), true);
    setNote(s.text);
  };

  /** Before the first lesson: what you're aiming for, and a finished puzzle to look at. */
  const showGoal = () => {
    let d;
    const done = new Game(Tutorial.goalPuzzle());
    for (let e = 0; e < done.grid.edgeCount; e++) if (done.puzzle.solution[e]) done.setMark(e, Edge.LINE);
    const mini = el('canvas', { class: 'mini' });
    const col = el('div', { class: 'col' },
      text('The goal', { size: 26, bold: true }),
      text('Join the dots into one closed fence. Each number tells how many of its 4 sides are fence.', { size: 16 }),
      mini,
      text('A finished puzzle: one fence that goes all the way around, and every number matches. Each dot has two fence pieces, or none.', { size: 15, color: 'inkSoft' }),
      text('Tap the gap between two dots to draw a fence. Press and hold a gap to mark it X, a gap you know stays empty.', { size: 16, cls: 'gap10' }),
      el('div', { class: 'gap14' }, button('Show me how', () => d.close(), { size: 18, accent: 'accent' })),
    );
    let mb = null;
    d = dialog(col, { onClose: () => mb && mb.destroy() });
    mb = new BoardView(mini);
    mb.locked = true; mb.showErrors = false; mb.palette = theme.pal; mb.pencilColor = theme.accent;
    mb.setGame(done);
    setTimeout(() => mb.playSolved(), 250);
  };

  // Tools.
  const hint = () => {
    const g = game;
    if (!g || g.isSolved()) return;
    const h = g.findHint();
    if (!h) return;
    if (h.isFix) {
      const same = pendingFix && pendingFix.length === h.wrong.length && h.wrong.every(e => pendingFix.includes(e));
      if (same) {
        const n = g.clearMistakes();
        board.clearHighlights();
        setNote(`Erased ${n} wrong mark${n === 1 ? '' : 's'}.`);
        pendingFix = null;
        refresh(); save();
      } else {
        board.flashMistakes(h.wrong);
        setNote(h.reason + ' Hint again to erase.');
        pendingFix = h.wrong;
      }
      return;
    }
    pendingFix = null;
    g.applyHint(h);
    board.showHint(h.edge, h.focusCell, h.focusVertex);
    setNote(h.reason);
    refresh(); save();
  };

  const check = () => {
    const g = game;
    if (!g) return;
    const wrong = g.mistakes();
    if (!wrong.length) setNote('All good so far!');
    else {
      board.flashMistakes(wrong);
      setNote(`${wrong.length} wrong mark${wrong.length === 1 ? '' : 's'}, circled in red.`);
      pendingFix = wrong;
    }
  };

  const shareMsg = timeMs => {
    const p = game && game.puzzle;
    const code = p && PuzzleCode.of(p);
    if (!code) return null;
    const what = mode === 'daily' ? "today's daily" : `this ${Boards.label(p.shape, p.width, p.height)} ${diffLabel(p.difficulty)}`;
    const brag = timeMs != null ? ` I did it in ${formatTime(timeMs)}.` : '';
    return `Try ${what} Fenceline puzzle!${brag}\n${SHARE_BASE}${code}\nCode: ${code}`;
  };
  const sharePuzzle = timeMs => { const t = shareMsg(timeMs); if (t) shareText(t, setNote); };
  const copyCode = async () => {
    const code = game && PuzzleCode.of(game.puzzle);
    if (!code) return;
    const ok = await copy(code.toString());
    setNote(ok ? `Copied ${code}` : `Code: ${code}`);
  };

  const menuDialog = () => {
    let d;
    const col = el('div', { class: 'col' });
    const item = (label, action) => col.append(el('div', { class: 'gap8' }, button(label, () => { d.close(); action(); }, { size: 17 })));
    // Hint first circles any wrong marks (Hint again erases them), else draws the next piece.
    // With "No hints" on it is Check, which only looks for mistakes.
    item(hintsOff() ? 'Check' : 'Hint', () => hintsOff() ? check() : hint());
    item('Clear mistakes', () => {
      const n = game ? game.clearMistakes() : 0;
      setNote(n === 0 ? 'No mistakes!' : `Erased ${n} mark${n === 1 ? '' : 's'}.`);
      refresh(); save();
    });
    if (mode === 'mp' && room && !nearby && room.roomId) item('Invite friends', () => {
      const c = room.roomId.toUpperCase();
      shareText(`Join my Fenceline game!\n${JOIN_BASE}${c}\nRoom code: ${c}`, setNote);
    });
    if (mode !== 'tutorial' && game && PuzzleCode.of(game.puzzle)) {
      item('Share puzzle', () => sharePuzzle(null));
      item('Copy code', copyCode);
    }
    item('Reset puzzle', confirmReset);
    if (mode === 'free') item('New puzzle', () => {
      const p = game && game.puzzle;
      if (p) newPuzzle(p.width, p.height, p.difficulty || 'EASY', null, p.shape);
    });
    item('Settings', () => settingsDialog(() => { applySettings(); refresh(); }));
    item('How to play', rulesDialog);
    item('Reset zoom', () => board.resetZoom());
    d = dialog(col);
  };

  const confirmReset = () => {
    let d;
    d = dialog(el('div', { class: 'col' },
      text('Reset puzzle?', { size: 24, bold: true }),
      text(shared() ? "This clears everyone's lines on the shared board." : 'This clears all your marks. The timer keeps going.', { size: 16, color: 'inkSoft' }),
      el('div', { class: 'row gap14' },
        button('Cancel', () => d.close(), { size: 17 }),
        button('Reset', () => {
          d.close();
          if (game) game.reset();
          board.clearHighlights(); pendingFix = null;
          if (shared() && coop) coop.syncAll(); // host also sends the whole board, so everyone lands on the same blank board
          if (mode !== 'tutorial') setNote(''); else { guideAt = 0; startGuide(game); }
          refresh(); save();
        }, { size: 17, accent: 'error' })),
    ));
  };

  const onSolved = alreadyDone => {
    const g = game;
    if (!g) return;
    winShown = true;
    bankTime();
    g.elapsedMs = Math.round(g.elapsedMs);
    if (!alreadyDone) board.playSolved();
    const code = PuzzleCode.of(g.puzzle);
    const kind = mode === 'daily' ? 'daily' : mode !== 'mp' ? '' : mpMode === Mode.COOP ? 'coop' : 'versus';
    if (!alreadyDone && mode !== 'tutorial' && code) store.addHistory(code.toString(), g.elapsedMs, g.hintsUsed, kind);
    if (mode === 'mp') { if (!alreadyDone) board.buzz(40); mpSolved(g); return; }
    const p = g.puzzle;
    const size = Boards.key(p.shape, p.width, p.height);
    const best = !alreadyDone && mode !== 'tutorial' ? store.recordWin(size, p.difficulty || 'EASY', g.elapsedMs, g.hintsUsed, mode === 'daily') : false;
    store.savedGame = null;
    if (!alreadyDone) board.buzz(40);
    setTimeout(() => { if (!disposed) showWin(g, best); }, alreadyDone ? 0 : 1300);
  };

  const showWin = (g, newBest) => {
    let d;
    const cheers = ['Lovely loop!', 'Neatly fenced!', 'All closed up!', 'Beautifully done!', "That's the one!"];
    const seed = g.puzzle.seed == null ? 0n : BigInt(g.puzzle.seed);
    const idx = Number(((seed % 5n) + 5n) % 5n);
    const kids = [text(cheers[idx], { size: 30, bold: true, color: 'accent', cls: 'center' })];
    const parts = [`Time ${formatTime(g.elapsedMs)}`, g.hintsUsed === 0 ? 'no hints' : `${g.hintsUsed} hint${g.hintsUsed === 1 ? '' : 's'}`];
    kids.push(text(parts.join(' · '), { size: 18, cls: 'center gap8' }));
    if (newBest) kids.push(text('★ New best! ★', { size: 18, bold: true, color: 'hint', cls: 'center' }));
    if (mode === 'daily') kids.push(text(`Streak: ${store.dailyStreak}`, { size: 17, cls: 'center' }));
    if (mode === 'tutorial') {
      if (step + 1 < Tutorial.steps.length) {
        kids.push(el('div', { class: 'gap16' }, button('Next lesson', () => { d.close(); startTutorial(step + 1); }, { size: 18, accent: 'accent' })));
      } else {
        store.tutorialStep = 0;
        kids.push(text("You've got the basics!", { size: 16, cls: 'center gap10' }));
        kids.push(el('div', { class: 'gap12' }, button('Play a 5×5', () => { d.close(); newPuzzle(5, 5, 'EASY', null, Shape.SQUARE); }, { size: 18, accent: 'accent' })));
      }
    } else if (mode === 'free') {
      kids.push(el('div', { class: 'gap16' }, button('Next puzzle', () => {
        d.close();
        const p = g.puzzle;
        newPuzzle(p.width, p.height, p.difficulty || 'EASY', null, p.shape);
      }, { size: 18, accent: 'accent' })));
    }
    if (mode !== 'tutorial' && PuzzleCode.of(g.puzzle)) kids.push(el('div', { class: 'gap8' }, button('Challenge a friend', () => sharePuzzle(g.elapsedMs), { size: 16 })));
    kids.push(el('div', { class: 'gap8' }, button('Close', () => d.close(), { size: 16 })));
    kids.push(el('div', { class: 'gap8' }, button('Menu', () => { d.close(); leaveGame(); }, { size: 16 })));
    d = dialog(el('div', { class: 'col' }, ...kids));
  };


  // ---- play together (online) ----------------------------------------------

  const shared = () => mode === 'mp' && mpMode === Mode.COOP && !!room;
  // "X left, Y hosts now" stays readable while people reconnect right after it.
  let hostNote = '', hostNoteAt = -1e9, statusNote = '';
  const leftTimers = new Map(), toldLeft = new Set();
  let wokeAt = -1e9;
  const onWake = () => { if (document.visibilityState !== 'hidden') wokeAt = performance.now(); };
  document.addEventListener('visibilitychange', onWake);
  const moveNote = t => { hostNote = t; hostNoteAt = performance.now(); setNote(t); };
  const laterNote = t => setNote(performance.now() - hostNoteAt < 6000 ? `${hostNote} ${t}` : t);
  const isHost = () => !!(room && room.isHost);
  const nameOf = p => (room && p === room.me) ? 'You' : (room && room.names[p]) || 'Friend';
  const colorOf = p => pencilColor(room ? (room.pencils[p] || 0) : 0, theme.night);
  const boardLabelOf = (sh, w, h, d) => `${Boards.label(sh, w, h)} ${diffLabel(d)}`;
  const dotLine = (p, label) => el('span', { class: 'pl' }, el('span', { class: 'dot', style: { color: colorOf(p) }, text: '● ' }), label);

  const linkUi = {
    onLobby(r) {
      if (!r.isHost && r.me >= 0 && lobbyStatus === 'Asking to join…') lobbyStatus = '';
      fillLobby(); updatePlayers();
    },
    onMessage(r, msg) {
      switch (msg.t) {
        case 'START': if (!r.isHost) {
          mpMode = msg.mode;
          let p;
          try { p = parsePuzzleText(msg.puzzle); } catch (e) { console.error(e); return; }
          // Rejoining the round we were already in: keep our board (and versus time).
          const same = game && mode === 'mp' && round === msg.round && game.puzzle.encode(true) === p.encode(true);
          round = msg.round;
          startRound(p, same);
        } break;
        case 'PING': board.showPing(msg.vertex, colorOf(msg.player)); setNote(`${nameOf(msg.player)} says: look here!`); break;
        case 'PROG': progress.set(msg.player, msg.fraction); updatePlayers(); fillResults(); break;
        case 'DONE':
          finished.set(msg.player, [msg.ms, msg.hints, msg.place]);
          progress.set(msg.player, 1);
          updatePlayers();
          if (!resultsD) showResults(); else fillResults();
          break;
        case 'MARK': case 'STATE':
          // Skip a full sync that may predate our own very latest edit; the next one catches up.
          if (msg.t === 'STATE' && performance.now() - lastLocalEdit < 1500) return;
          if (coop && coop.apply(msg)) { board.invalidate(); refresh(); }
          break;
        case 'REMATCH': {
          const roundOver = (game && game.isSolved()) || finished.size > 0;
          if (r.isHost && roundOver) launchRound();
          else if (!r.isHost) setNote(`${nameOf(msg.player)} wants another round!`);
          break;
        }
      }
    },
    onPlayerLeft(r, player) {
      // Phones drop out for a moment all the time (screen off, app switch). Only say so if they stay gone.
      // (And if this phone was the one asleep, the others are just finding it again.)
      clearTimeout(leftTimers.get(player));
      const later = () => leftTimers.set(player, setTimeout(() => {
        if (document.visibilityState === 'hidden' || performance.now() - wokeAt < 10000) { later(); return; }
        leftTimers.delete(player);
        if (game && room && room.away[player]) { setNote(`${nameOf(player)} dropped out. They can join again.`); toldLeft.add(player); }
      }, 10000));
      later();
      progress.delete(player);
      updatePlayers(); fillResults();
    },
    onHostLost() {
      const had = !!room && room.me >= 0;
      if (link) link.close();
      link = null; room = null;
      if (!game) { lobbyStatus = had ? 'Lost the connection.' : lobbyStatus || 'Lost the connection.'; fillLobby(); return; }
      updatePlayers();
      lostDialog();
    },
    onHostMoving(r, from, to) {
      const msg = `${r.names[from] || 'The host'} left. ${r.names[to] || 'A friend'} is hosting now…`;
      if (game && mode === 'mp') moveNote(msg); else { lobbyStatus = msg; fillLobby(); }
      updatePlayers();
    },
    onBecameHost(r, from) {
      loadSetup(r.setup);
      const msg = `${r.names[from] || 'The host'} left. You're hosting now.`;
      if (game && mode === 'mp') moveNote(msg); else lobbyStatus = msg;
      prepareNextPuzzle();
      if (coop) scheduleSync();
      fillLobby(); fillResults(); updatePlayers();
    },
    onJoinRequest(r, peer, name, returning) { askToJoin(r, peer, name, returning); },
    onJoined(r, player, returning) {
      clearTimeout(leftTimers.get(player)); leftTimers.delete(player);
      if (!returning || toldLeft.delete(player)) laterNote(`${nameOf(player)} ${returning ? 'is back' : 'joined'}!`);
      if (mpMode === Mode.COOP && coop) coop.syncAll(); // catch them up on the shared board
      updatePlayers(); fillResults();
    },
    onDenied() { lobbyStatus = 'The host said not now.'; fillLobby(); },
    onHostsChanged() { fillLobby(); },
    onError(t) { lobbyStatus = t; fillLobby(); if (!lobbyD) setNote(t); },
    onStatus(t) {
      if (game && mode === 'mp') {
        if (t) { laterNote(t); statusNote = noteText.textContent; }
        else if (statusNote && noteText.textContent === statusNote) { setNote(''); statusNote = ''; }
      }
      else { lobbyStatus = t; fillLobby(); }
    },
  };

  const parsePuzzleText = t => roomParse(t);

  const setupText = () => `${mpMode}|${mpShape.name}|${mpW}|${mpH}|${mpDiff}`;
  /** A new host carries on with the first host's settings (for the next puzzle). */
  const loadSetup = setup => {
    const f = String(setup || '').split('|');
    if (f.length < 5) return;
    if (!game || mode !== 'mp') mpMode = f[0] === Mode.COOP ? Mode.COOP : Mode.VERSUS;
    mpShape = Shape.entries.find(x => x.name === f[1]) || mpShape;
    mpW = parseInt(f[2], 10) || mpW;
    mpH = parseInt(f[3], 10) || mpH;
    if (['EASY', 'MEDIUM', 'HARD'].includes(f[4])) mpDiff = f[4];
  };

  const startMultiplayer = async () => {
    mode = 'mp';
    title.replaceChildren(el('div', { class: 'head', text: 'Play together' }));
    loading.textContent = '';
    showLoading();
    openLink(opts.role === 'join' ? 'join' : 'host');
  };

  const openLink = async role => {
    link = nearby ? new NearbyLink() : new Link();
    link.ui = linkUi;
    if (window.__fenceline) window.__fenceline.link = link;
    lobbyStatus = nearby ? 'Starting Nearby…' : role === 'host' ? 'Making a room…' : `Looking for room ${roomCode.toUpperCase()}…`;
    showLobby();
    const myLink = link;
    const myName = defaultName();
    try {
      if (role === 'host') {
        prepareNextPuzzle();
        room = nearby
          ? await link.host(myName || 'Host', store.pencil, store.installId, { coop: mpMode === Mode.COOP, board: `${mpW}x${mpH} ${diffLabel(mpDiff)}` })
          : await link.host(myName || 'Host', store.pencil, store.installId);
        if (disposed || link !== myLink) { myLink.close(); return; }
        room.setup = setupText();
        if (!nearby) roomCode = room.roomId;
        lobbyStatus = nearby ? 'Visible to nearby phones.' : 'Send your friends the code.';
      } else if (nearby) {
        room = await link.look(myName || '', store.pencil, store.installId);
        if (disposed || link !== myLink) { myLink.close(); return; }
        lobbyStatus = 'Searching nearby…';
      } else {
        room = await link.join(roomCode, myName || '', store.pencil, store.installId);
        if (disposed || link !== myLink) { myLink.close(); return; }
        lobbyStatus = 'Asking to join…';
      }
    } catch (e) {
      if (disposed || link !== myLink) return;
      lobbyStatus = (e && e.message) || 'Something went wrong. Try again.';
      try { link.close(); } catch (_) { /* ignore */ }
      link = null; room = null;
    }
    fillLobby();
    updatePlayers();
  };

  /** Guest who lost the host: look for the game again. The host lets you back into your old seat. */
  const rejoin = () => { openLink('join'); };

  /** Host: start building the next puzzle now so Start (or Rematch) is quick, even on big boards. */
  const prepareNextPuzzle = () => {
    hostPuzzle = null;
    const want = setupText();
    factory.request(mpW, mpH, mpDiff, PuzzleCode.randomSeed(), mpShape).then(p => {
      if (disposed || want !== setupText()) return;
      hostPuzzle = p;
      if (startWhenReady) launchRound();
    }, err => { console.error(err); lobbyStatus = "Oops, that puzzle wouldn't draw."; fillLobby(); });
  };

  const showLobby = () => {
    if (lobbyD) { fillLobby(); return; }
    lobbyCol = el('div', { class: 'col' });
    lobbyD = dialog(lobbyCol, { cancelable: false });
    fillLobby();
  };

  const shareInvite = () => {
    const c = (room ? room.roomId : roomCode).toUpperCase();
    shareText(`Join my Fenceline game!\n${JOIN_BASE}${c}\nRoom code: ${c}`, t => { lobbyStatus = t; fillLobby(); });
  };

  const fillLobby = () => {
    const col = lobbyCol;
    if (!col) return;
    const r = room;
    const kids = [];
    if (nearby && r && !r.isHost && r.me < 0) {
      // Same room: pick a game from the phones close by (as in the 1.x app).
      kids.push(text('Looking for games…', { size: 24, bold: true }));
      const hosts = link && link.hosts ? [...link.hosts.values()] : [];
      if (!hosts.length) kids.push(text('Ask a friend to tap Host.', { size: 15, color: 'inkSoft' }));
      for (const h of hosts) kids.push(button(h.title, () => { lobbyStatus = 'Asking to join…'; fillLobby(); link.join(h.id); }, { size: 16, accent: 'accent' }));
    } else if (!r || (!r.isHost && r.me < 0)) {
      kids.push(text(opts.role === 'host' && !r ? (nearby ? 'Starting Nearby…' : 'Making a room…') : nearby ? 'Looking for games…' : 'Joining…', { size: 24, bold: true }));
      if (roomCode && !nearby) kids.push(text(`Room ${roomCode.toUpperCase()}`, { size: 15, color: 'inkSoft' }));
    } else {
      const ready = r.here.length >= 2;
      kids.push(text(r.isHost ? (ready ? 'Ready when you are!' : 'Waiting for friends…') : "You're in!", { size: 24, bold: true }));
      let setup = r.isHost ? null : r.setup.split('|');
      const label = r.isHost ? `${mpMode === Mode.COOP ? 'Co-op' : 'Versus'} · ${boardLabelOf(mpShape, mpW, mpH, mpDiff)}`
        : setup && setup.length >= 5 ? `${setup[0] === Mode.COOP ? 'Co-op' : 'Versus'} · ${boardLabelOf(Shape.entries.find(x => x.name === setup[1]) || Shape.SQUARE, setup[2], setup[3], setup[4])}` : '';
      if (label) kids.push(text(label, { size: 15, color: 'inkSoft' }));
      if (r.isHost && !nearby) {
        kids.push(el('div', { class: 'roomcode' }, el('div', { class: 'lbl2', text: 'Room code' }), el('div', { class: 'big', text: r.roomId.toUpperCase() })));
        kids.push(button('Share invite', shareInvite, { size: 16 }));
      }
      kids.push(el('div', { class: 'plist' }, ...r.players.map(p => dotLine(p, (p === r.me ? `${r.names[p]} (you)` : r.names[p] || '') + (r.away[p] ? ' (away)' : '')))));
      if (r.isHost) {
        const b = button('Start', () => { if (r.here.length >= 2) launchRound(); }, { size: 18, accent: 'accent' });
        b.classList.toggle('dim', !ready);
        kids.push(el('div', { class: 'gap8' }, b));
      } else kids.push(text('The host starts the game.', { size: 15, color: 'inkSoft' }));
    }
    if (lobbyStatus) kids.push(text(lobbyStatus, { size: 15, color: 'inkSoft' }));
    if (!room && opts.role === 'join' && link == null) kids.push(button('Try again', () => openLink('join'), { size: 16, accent: 'accent' }));
    kids.push(button('Cancel', () => leaveGame(), { size: 16 }));
    col.replaceChildren(...kids);
  };

  /** Host: start a round with the prepared puzzle (or as soon as it's ready). */
  const launchRound = () => {
    const r = room;
    if (!r || !r.isHost) return;
    const p = hostPuzzle;
    if (!p) {
      startWhenReady = true;
      lobbyStatus = 'Sketching the puzzle…'; fillLobby();
      setNote('Sketching the next puzzle…');
      return;
    }
    startWhenReady = false;
    r.start(mpMode, p);
    startRound(p, false);
    prepareNextPuzzle();
  };

  const startRound = (p, keep) => {
    const r = room;
    if (!r || disposed) return;
    if (r.isHost) round = r.round;
    if (lobbyD) { lobbyD.close(); lobbyD = null; lobbyCol = null; }
    if (resultsD) { resultsD.close(); resultsD = null; resultsCol = null; }
    if (coop) { coop.detach(); coop = null; }
    progress.clear(); finished.clear(); lastSentProgress = -1;
    const g = keep ? game : new Game(p);
    g.localPlayer = Math.max(0, r.me);
    if (mpMode === Mode.COOP) {
      coop = new CoopBoard(g, r);
      const send = g.onLocalChange;
      g.onLocalChange = (e, v, h) => { lastLocalEdit = performance.now(); if (send) send(e, v, h); };
      board.ownerColors = Array.from({ length: SEATS }, (_, i) => colorOf(i));
      board.onPing = v => { board.showPing(v, colorOf(r.me)); if (room) room.broadcast({ t: 'PING', player: room.me, vertex: v }); };
    } else {
      board.ownerColors = null;
      board.onPing = null;
      board.pingArmed = false;
    }
    mode = 'mp';
    if (!keep) start(g); else { board.invalidate(); laterNote("You're back in!"); }
    playersText.hidden = false;
    updatePlayers();
    clearTimeout(syncTimer);
    // Versus: everyone (and anyone joining late) gets a 3-2-1; your own time starts after it.
    if (mpMode === Mode.VERSUS) { if (!keep) countdown(3); else refresh(); }
    else if (r.isHost) scheduleSync();
  };

  /** Co-op host: send the whole board every few seconds, so everyone stays in step. */
  const scheduleSync = () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function tick() {
      if (!coop || !isHost() || disposed) return;
      if (!(game && game.isSolved())) coop.syncAll();
      syncTimer = setTimeout(tick, 3000);
    }, 3000);
  };

  const countdown = n => {
    countingDown = true;
    board.locked = true;
    loading.hidden = false;
    loading.classList.add('count');
    loading.textContent = n > 0 ? String(n) : 'Go!';
    clearTimeout(countTimer);
    if (n > 0) { countTimer = setTimeout(() => countdown(n - 1), 900); return; }
    countTimer = setTimeout(() => {
      loading.hidden = true;
      loading.classList.remove('count');
      countingDown = false;
      board.locked = false;
      resumedAt = performance.now();
      if (game) game.elapsedMs = 0;
    }, 500);
  };

  const sendProgress = g => {
    const r = room;
    if (!r || mpMode !== Mode.VERSUS || r.me < 0) return;
    const p = g.progress();
    if (Math.abs(p - lastSentProgress) < 0.01) return;
    progress.set(r.me, p);
    updatePlayers();
    // At most a few updates a second; the last one always goes out.
    const now = performance.now();
    const send = () => { progTimer = 0; lastProgAt = performance.now(); lastSentProgress = p; if (room) room.broadcast({ t: 'PROG', player: room.me, fraction: Math.round(p * 1000) / 1000 }); };
    clearTimeout(progTimer);
    if (now - lastProgAt > 300 || p >= 1) send(); else progTimer = setTimeout(() => sendProgress(game), 300 - (now - lastProgAt));
  };

  const updatePlayers = () => {
    const r = room;
    if (mode !== 'mp') return;
    if (!r) { playersText.replaceChildren('Playing solo'); return; }
    if (mpMode === Mode.COOP) board.ownerColors = Array.from({ length: SEATS }, (_, i) => colorOf(i)); // late joiners too
    const many = r.players.length > 4;
    playersText.replaceChildren(...r.players.map(p => {
      const label = nameOf(p).slice(0, many ? 8 : 12) + (r.away[p] ? ' (away)' : '');
      return dotLine(p, mpMode === Mode.VERSUS ? `${label} ${Math.floor((progress.get(p) || 0) * 100)}%` : label);
    }));
  };

  const mpSolved = g => {
    const r = room;
    if (mpMode === Mode.VERSUS) {
      if (r && r.me >= 0) {
        const d = r.finish(g.elapsedMs, g.hintsUsed);
        const prev = finished.get(r.me);
        finished.set(r.me, [g.elapsedMs, g.hintsUsed, d ? d.place : (prev ? prev[2] : 0)]);
        progress.set(r.me, 1);
      }
      updatePlayers();
      setTimeout(() => { if (disposed) return; if (!resultsD) showResults(); else fillResults(); }, 1300);
    } else {
      setTimeout(() => { if (!disposed) showResults(); }, 1300);
    }
  };

  const showResults = () => {
    if (disposed) return;
    if (resultsD) resultsD.close();
    resultsCol = el('div', { class: 'col' });
    resultsD = dialog(resultsCol, { cancelable: false });
    fillResults();
  };

  const fillResults = () => {
    const col = resultsCol, g = game;
    if (!col || !g) return;
    const r = room;
    const players = r ? r.players : [];
    const kids = [];
    if (mpMode === Mode.COOP) {
      kids.push(text('Solved together!', { size: 30, bold: true, color: 'accent', cls: 'center' }));
      const hints = g.hintsUsed === 0 ? 'no hints' : `${g.hintsUsed} hint${g.hintsUsed === 1 ? '' : 's'}`;
      kids.push(text(`Time ${formatTime(g.elapsedMs)} · ${hints}`, { size: 18, cls: 'center' }));
      kids.push(el('div', { class: 'plist center' }, ...players.map(p => {
        let n = 0; for (let e = 0; e < g.grid.edgeCount; e++) if (g.marks[e] === Edge.LINE && g.owner[e] === p) n++;
        return dotLine(p, `${nameOf(p)}: ${n} piece${n === 1 ? '' : 's'}`);
      })));
    } else {
      // The host numbers finishes as they arrive, so the first loop in real time wins (late joiners too).
      let winner = null;
      for (const [p, f] of finished) if (f[2] === 1) { winner = p; break; }
      const head = winner == null ? 'Race on!' : (r && winner === r.me) ? 'You win!' : `${nameOf(winner)} wins!`;
      const h = text(head, { size: 30, bold: true, cls: 'center' });
      h.style.color = winner != null ? colorOf(winner) : theme.accent;
      kids.push(h);
      const rank = p => { const f = finished.get(p); return f ? (f[2] > 0 ? f[2] : 99) : 100; };
      const order = players.slice().sort((a, b) => rank(a) - rank(b) || (progress.get(b) || 0) - (progress.get(a) || 0));
      kids.push(el('div', { class: 'plist' }, ...order.map(p => {
        const f = finished.get(p);
        const line = f ? `${nameOf(p)}: ${formatTime(f[0])} · ` + (f[1] === 0 ? 'no hints' : `${f[1]} hint${f[1] === 1 ? '' : 's'}`)
          : `${nameOf(p)}: still drawing (${Math.floor((progress.get(p) || 0) * 100)}%)`;
        return dotLine(p, line);
      })));
      if (!g.isSolved()) kids.push(button('Keep drawing', () => { if (resultsD) resultsD.close(); resultsD = null; resultsCol = null; }, { size: 17 }));
    }
    if (r) {
      kids.push(button(mpMode === Mode.COOP ? 'Play again' : 'Rematch', () => {
        if (r.isHost) launchRound(); else { r.broadcast({ t: 'REMATCH', player: r.me }); setNote('Asked the host for another round…'); }
      }, { size: 18, accent: 'accent' }));
    }
    kids.push(button('Leave', () => leaveGame(), { size: 16 }));
    col.replaceChildren(...kids);
  };

  /** Host: someone wants into the running game. */
  const askToJoin = (r, peer, name, returning) => {
    let d;
    d = dialog(el('div', { class: 'col' },
      text(returning ? `${name} is back!` : `${name} wants to join`, { size: 22, bold: true }),
      text(returning ? 'Let them back into their seat?' : 'Let them into this game?', { size: 16, color: 'inkSoft' }),
      el('div', { class: 'row gap14' },
        button('Not now', () => { d.close(); r.deny(peer); }, { size: 17 }),
        button('Let in', () => { d.close(); r.approve(peer); }, { size: 17, accent: 'accent' })),
    ), { cancelable: false });
  };

  /** Guest: the host's phone went away. */
  const lostDialog = () => {
    let d;
    d = dialog(el('div', { class: 'col' },
      text('Lost the connection', { size: 22, bold: true }),
      text('Rejoin to get your seat back, or keep drawing on your own.', { size: 16, color: 'inkSoft' }),
      el('div', { class: 'row gap14' },
        button('Keep drawing', () => { d.close(); setNote('Playing solo.'); updatePlayers(); }, { size: 16 }),
        button('Rejoin', () => { d.close(); rejoin(); }, { size: 17, accent: 'accent' })),
    ));
  };

  setScreen('game', root, () => {
    disposed = true;
    save();
    clearInterval(ticker);
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('visibilitychange', onWake);
    for (const t of leftTimers.values()) clearTimeout(t);
    window.removeEventListener('pagehide', save);
    onThemeChange.delete(onTheme);
    clearTimeout(syncTimer); clearTimeout(countTimer); clearTimeout(progTimer);
    if (coop) coop.detach();
    if (link) link.close();
    link = null; room = null;
    board.destroy();
    keepAwake(false);
  });
  applySettings();
  showLoading();

  // What to play.
  if (mode === 'continue') {
    let g = null;
    try { g = store.savedGame ? Game.load(store.savedGame) : null; } catch (e) { g = null; }
    mode = store.savedMode;
    step = store.tutorialStep;
    const oldLesson = mode === 'tutorial' && (step < 0 || step >= Tutorial.steps.length || !g || g.puzzle.encode(false) !== Tutorial.puzzle(step).encode(false));
    if (oldLesson) startTutorial(Math.max(0, Math.min(Tutorial.steps.length - 1, step)));
    else if (g) start(g);
    else { mode = 'free'; showMenu(); }
  } else if (mode === 'daily') {
    factory.request(10, 10, 'MEDIUM', dailySeed(new Date()), Shape.SQUARE).then(p => start(new Game(p)), err => { loading.textContent = "Oops, today's puzzle wouldn't draw."; console.error(err); });
  } else if (mode === 'tutorial') {
    startTutorial(step);
  } else if (mode === 'mp') {
    startMultiplayer();
  } else if (mode === 'code') {
    const code = PuzzleCode.find(opts.code || '');
    if (!code) { showMenu(); return; }
    if (isAndroid && !isApp) {
      const href = `intent://p/${encodeURIComponent(code)}#Intent;scheme=fenceline;package=com.fenceline.app;end`;
      appLink.replaceChildren('Got the Android app? ', el('a', { href }, 'Open it there'));
      appLink.hidden = false;
    }
    newPuzzle(code.width, code.height, code.difficulty, code.seed, code.shape);
  } else {
    newPuzzle(opts.w, opts.h, opts.d, null, opts.shape);
  }
}

// ---- start up ----

function boot() {
  applyTheme();
  // iOS: stop page-level pinch zoom; the board has its own.
  document.addEventListener('gesturestart', e => e.preventDefault());
  const params = new URLSearchParams(location.search);
  const hasLink = params.has('p') || params.has('code') || params.has('join');
  const startUrl = location.href;
  if (hasLink) {
    // Keep the address clean, so a reload or a home-screen launch opens the menu.
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  }
  showMenu();
  if (!(hasLink && openLinkUrl(startUrl)) && !store.seenIntro) {
    store.seenIntro = true;
    openGame({ mode: 'tutorial', step: 0 });
  }
  if (isApp) {
    // Android app: links tapped while it's open, and the back button.
    onNative('open-url', e => { if (e && e.url) openLinkUrl(e.url); });
    setBackHandler(() => {
      const d = topDialog();
      if (d && d.cancelable) { d.close(); return true; }
      if (screen && screen.name === 'game') { leaveGame(); return true; } // also leaves a lobby or a finished game
      if (d) { closeAllDialogs(); return true; }
      return false;
    });
  } else if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    // The app has its files on the phone already; the website keeps a copy for offline play.
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

/** Opens a shared puzzle or a room invite. Returns false when the link holds neither. */
function openLinkUrl(url) {
  const l = parseLink(url);
  if (!l) return false;
  const code = l.code ? PuzzleCode.find(String(l.code).replace(/\s+/g, '')) : null;
  const joinCode = l.join ? cleanCode(l.join) : '';
  if (code) {
    store.seenIntro = true; // a friend's puzzle comes first; the lessons stay under Learn
    closeAllDialogs();
    document.title = 'Fenceline puzzle ' + code;
    openGame({ mode: 'code', code: code.toString() });
    setTimeout(() => { document.title = 'Fenceline'; }, 4000);
    return true;
  }
  if (joinCode) {
    store.seenIntro = true;
    const show = () => { closeAllDialogs(); joinDialog(joinCode.toUpperCase()); };
    // Leaving a game goes back through history, which lands a moment later.
    if (screen && screen.name === 'game') { leaveGame(); setTimeout(show, 250); } else show();
    return true;
  }
  return false;
}

if (document.fonts && document.fonts.load) {
  // Draw with the handwriting font from the first frame when it loads quickly.
  Promise.race([document.fonts.load('20px "Coming Soon"'), new Promise(r => setTimeout(r, 600))]).then(boot, boot);
  document.fonts.ready.then(() => redrawBoxes());
} else boot();

// Test hook (used by the automated checks only).
window.__fenceline = { factory, store };
