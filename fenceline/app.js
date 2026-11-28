// Fenceline: start-up, the main menu, and moving between screens (menu <-> game, with the Back button).
// The game screen is game.js, play together is play.js, dialogs are dialogs.js, shared helpers are common.js.
// native.js comes first: inside the Android app it imports the old app's data before anything reads it.
import './compat.js';
import { isApp, setBackHandler, onNative, parseLink } from './native.js';
import { Shape, PuzzleCode, Game, Boards } from './core.js';
import { store, formatTime } from './store.js';
import { applyTheme, onThemeChange, el, text, button, pick, iconButton, sk, dialog, closeTopDialog, closeAllDialogs, topDialog, redrawBoxes } from './ui.js';
import { shapeChip } from './shapes.js';
import { icon } from './icons.js';
import { cleanCode } from './net.js';
import { isTodaysDaily, isIOS, standalone, cap, factory } from './common.js';
import { statsDialog, settingsDialog, joinDialog, codeDialog, playTogetherDialog, sizePicks } from './dialogs.js';
import { learnDialog } from './learn.js';
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

export function showMenu() {
  const col = el('div', { class: 'menu home' });
  let showAll = false; // "more" sizes open
  const build = () => {
    const kids = [];
    kids.push(el('h1', { class: 'title', text: 'Fenceline' }));

    // Daily, with the streak as a little candle.
    const streak = store.dailyStreak;
    const daily = el('button', { type: 'button', class: 'daily', 'aria-label': 'Daily puzzle' + (streak ? `, streak ${streak}` : '') + (store.dailyDoneToday ? ', done today' : '') },
      icon('sun', 30, 'var(--hint)', 1.7),
      el('span', { class: 'grow', text: 'Daily puzzle' }),
      store.dailyDoneToday ? el('span', { class: 'what', text: 'back tomorrow' }) : '',
      store.dailyDoneToday ? icon('check', 20, 'var(--done)', 2.2) : '',
      streak > 0 ? el('span', { class: 'streak' }, icon('candle', 18, 'var(--hint)'), String(streak)) : '',
      icon('arrow', 22, 'var(--accent)'));
    daily.addEventListener('click', () => { if (!store.dailyDoneToday) openGame({ mode: 'daily' }); }); // done: locked until tomorrow
    kids.push(el('div', { class: 'gap22' }, sk(daily, { stroke: 'inkSoft', width: 1.8 })));

    // Continue, a quiet line under the daily.
    let saved = null;
    try { saved = store.savedGame ? Game.load(store.savedGame) : null; } catch (e) { saved = null; }
    if (saved && !saved.isSolved()) {
      const p = saved.puzzle;
      const label = store.savedMode === 'daily' && isTodaysDaily(p) ? 'daily' : store.savedMode === 'tutorial' ? 'lesson'
        : `${Boards.label(p.shape, p.width, p.height)}`;
      const cont = el('button', { type: 'button', class: 'continue', 'aria-label': `Continue ${label}` },
        icon('restart', 24, 'var(--done)'), el('span', { class: 'grow', text: 'Continue' }),
        el('span', { class: 'what', text: `${label} · ${formatTime(saved.elapsedMs)}` }));
      cont.addEventListener('click', () => openGame({ mode: 'continue' }));
      kids.push(cont);
    }

    // New puzzle: shape, size, difficulty. No headings; the picks speak for themselves.
    kids.push(el('div', { class: 'row shapes' }, ...Shape.entries.map(sh =>
      shapeChip(sh, store.lastShape === sh, () => { store.lastShape = sh; build(); }))));
    kids.push(...sizePicks(Boards.sizes(store.lastShape), store.lastSize, s => { store.lastSize = s; build(); },
      () => showAll, v => { showAll = v; build(); }));
    kids.push(el('div', { class: 'picks around gap16' }, ...['EASY', 'MEDIUM', 'HARD'].map(d =>
      pick(cap(d), store.lastDifficulty === d, () => { store.lastDifficulty = d; build(); }))));
    kids.push(el('div', { class: 'gap26' }, button('Start drawing', () => {
      const [w, h] = store.lastSize.split('x').map(Number);
      openGame({ mode: 'free', w, h, d: store.lastDifficulty, shape: store.lastShape });
    }, { size: 23, kind: 'primary' })));
    kids.push(el('div', { class: 'gap14' }, button('Play together', () => playTogetherDialog(), { size: 23, kind: 'outline', icon: 'people' })));
    if (isIOS && !standalone) {
      kids.push(el('p', { class: 'tip' }, 'Tip: tap Share, then “Add to Home Screen” to keep Fenceline on your phone.'));
    }
    kids.push(el('div', { class: 'homefoot' },
      iconButton('hash', 'Code', codeDialog, { aria: 'Enter a code' }),
      iconButton('book', 'Learn', () => learnDialog()),
      iconButton('chart', 'Stats', statsDialog),
      iconButton('gear', 'Settings', () => settingsDialog(build))));
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
