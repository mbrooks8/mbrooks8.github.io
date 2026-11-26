// Fenceline for the web: main menu, game screen, lessons and dialogs.
// Mirrors MainActivity.kt and GameActivity.kt from the Android app (without Play together or leaderboards).
import { Shape, Edge, Grid, Puzzle, PuzzleCode, PuzzleGenerator, Game, Tutorial, Boards, dailySeed } from './core.js';
import { store, formatTime } from './store.js';
import { theme, applyTheme, onThemeChange, el, text, button, chip, row, dialog, sk, setLabel, closeTopDialog, closeAllDialogs, redrawBoxes } from './ui.js';
import { BoardView } from './board.js';
import { PENCILS, pencilColor, pencilLine } from './sketch.js';

const SHARE_BASE = 'https://mbrooks8.github.io/fenceline/?p=';
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

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; }
}

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
      ...(navigator.vibrate ? [toggle('Vibrate', 'haptics')] : []),
      ...(navigator.wakeLock ? [toggle('Keep screen on', 'keepAwake')] : []),
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
      el('p', { class: 'about' },
        'Playing on Android? ', el('a', { href: './Fenceline.apk', download: '' }, 'Download the app'), '.'),
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
    text('Tap the gap between two dots to draw a fence. Tap again for an X (a gap that stays empty), and once more to clear it. Long-press also makes an X. Pinch to zoom, drag to move.', { size: 16 }),
    el('div', { class: 'gap16' }, button('Got it', () => d.close())),
  );
  d = dialog(col);
}

async function shareText(textBody, note) {
  if (navigator.share) {
    try { await navigator.share({ text: textBody }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const ok = await copy(textBody);
  if (note) note(ok ? 'Copied! Paste it to a friend.' : textBody);
}

async function copy(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch (e) { /* fall back */ }
  const t = el('textarea', { style: { position: 'fixed', opacity: '0' } });
  t.value = s; document.body.append(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
  t.remove();
  return ok;
}

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

    kids.push(el('div', { class: 'gap26' }, button('Enter a code', codeDialog, { size: 16 })));
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
  if (navigator.clipboard && navigator.clipboard.readText) {
    kids.push(el('div', { class: 'gap6' }, button('Paste', async () => {
      try { const t = await navigator.clipboard.readText(); const c = PuzzleCode.find(t || ''); input.value = c ? c.toString() : (t || '').trim(); } catch (e) { /* denied */ }
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

// ---- game screen ----

let inGameHistory = false;

function openGame(opts) {
  if (!inGameHistory) {
    try { history.pushState({ fl: 'game' }, ''); inGameHistory = true; } catch (e) { /* ignore */ }
  }
  showGame(opts);
}

function leaveGame() {
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
  const bar = el('div', { class: 'row bottombar' }, undoBtn, redoBtn, penBtn);
  const root = el('div', { class: 'game' }, top, appLink, note, boardFrame, bar);

  const board = new BoardView(canvas);
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
    if (game && !game.isSolved() && resumedAt > 0 && document.visibilityState === 'visible') game.elapsedMs += Math.max(0, now - resumedAt);
    resumedAt = now;
  };
  const updateTimer = () => { if (!game) return; bankTime(); timerText.textContent = formatTime(game.elapsedMs); };
  const ticker = setInterval(updateTimer, 1000);
  const save = () => {
    if (!game) return;
    bankTime();
    game.elapsedMs = Math.round(game.elapsedMs);
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
    board.invalidate();
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
      text('Tap the gap between two dots to draw a fence. Tap it again for an X, a gap you know stays empty.', { size: 16, cls: 'gap10' }),
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
      text('This clears all your marks. The timer keeps going.', { size: 16, color: 'inkSoft' }),
      el('div', { class: 'row gap14' },
        button('Cancel', () => d.close(), { size: 17 }),
        button('Reset', () => {
          d.close();
          if (game) game.reset();
          board.clearHighlights(); pendingFix = null;
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
    if (!alreadyDone && mode !== 'tutorial' && code) store.addHistory(code.toString(), g.elapsedMs, g.hintsUsed, mode === 'daily' ? 'daily' : '');
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

  setScreen('game', root, () => {
    disposed = true;
    save();
    clearInterval(ticker);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', save);
    onThemeChange.delete(onTheme);
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
  } else if (mode === 'code') {
    const code = PuzzleCode.find(opts.code || '');
    if (!code) { showMenu(); return; }
    if (isAndroid) {
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
  const raw = (params.get('p') || params.get('code') || '').replace(/\s+/g, '');
  const code = raw ? PuzzleCode.find(raw) : null;
  if (raw) {
    // Keep the address clean, so a reload or a home-screen launch opens the menu.
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  }
  showMenu();
  if (code) {
    store.seenIntro = true; // a friend's puzzle comes first; the lessons stay under Learn
    document.title = 'Fenceline puzzle ' + code;
    openGame({ mode: 'code', code: code.toString() });
    setTimeout(() => { document.title = 'Fenceline'; }, 4000);
  } else if (!store.seenIntro) {
    store.seenIntro = true;
    openGame({ mode: 'tutorial', step: 0 });
  }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

if (document.fonts && document.fonts.load) {
  // Draw with the handwriting font from the first frame when it loads quickly.
  Promise.race([document.fonts.load('20px "Coming Soon"'), new Promise(r => setTimeout(r, 600))]).then(boot, boot);
  document.fonts.ready.then(() => redrawBoxes());
} else boot();

// Test hook (used by the automated checks only).
window.__fenceline = { factory, store };
