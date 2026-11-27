// Fenceline: start-up, the main menu, and moving between screens (menu <-> game, with the Back button).
// The game screen is game.js, play together is play.js, dialogs are dialogs.js, shared helpers are common.js.
// native.js comes first: inside the Android app it imports the old app's data before anything reads it.
import './compat.js';
import { isApp, setBackHandler, onNative, parseLink } from './native.js';
import { Shape, Grid, PuzzleCode, Game, Tutorial, Boards } from './core.js';
import { store, formatTime } from './store.js';
import { theme, applyTheme, onThemeChange, el, text, button, chip, dialog, closeTopDialog, closeAllDialogs, topDialog, redrawBoxes } from './ui.js';
import { pencilLine } from './sketch.js';
import { cleanCode } from './net.js';
import { isTodaysDaily, isIOS, diffLabel, standalone, cap, factory } from './common.js';
import { statsDialog, rulesDialog, settingsDialog, joinDialog, codeDialog, playTogetherDialog } from './dialogs.js';
import { showGame } from './game.js';

const app = document.getElementById('app');

// ---- screens ----

let screen = null; // { name, dispose }

export function setScreen(name, node, dispose) {
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

export function showMenu() {
  const col = el('div', { class: 'menu col' });
  const build = () => {
    const kids = [];
    kids.push(el('h1', { class: 'title', text: 'Fenceline' }));

    // Continue.
    let saved = null;
    try { saved = store.savedGame ? Game.load(store.savedGame) : null; } catch (e) { saved = null; }
    if (saved && !saved.isSolved()) {
      const p = saved.puzzle;
      const label = store.savedMode === 'daily' && isTodaysDaily(p) ? 'Daily puzzle' : store.savedMode === 'tutorial' ? 'Lesson'
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

// ---- game screen ----

let inGameHistory = false;

export function openGame(opts) {
  if (!inGameHistory) {
    try { history.pushState({ fl: 'game' }, ''); inGameHistory = true; } catch (e) { /* ignore */ }
  }
  showGame(opts);
}

export function leaveGame() {
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
  // A puzzle or room link that's been cut short or mangled: say so instead of quietly showing the menu.
  store.seenIntro = true;
  closeAllDialogs();
  let d;
  d = dialog(el('div', { class: 'col' },
    text("That link didn't work", { size: 22, bold: true }),
    text(l.join != null ? 'Room codes have 4 letters. Ask your friend for the code, then tap Play together and Join.'
      : 'The puzzle code in it looks cut off. Ask your friend for the code, then tap Enter a code.', { size: 16, color: 'inkSoft' }),
    el('div', { class: 'gap14' }, button('OK', () => d.close(), { size: 17 }))));
  return true;
}

if (document.fonts && document.fonts.load) {
  // Draw with the handwriting font from the first frame when it loads quickly.
  Promise.race([document.fonts.load('20px "Coming Soon"'), new Promise(r => setTimeout(r, 600))]).then(boot, boot);
  document.fonts.ready.then(() => redrawBoxes());
} else boot();

// Test hook (used by the automated checks only).
window.__fenceline = { factory, store };
