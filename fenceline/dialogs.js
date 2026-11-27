// Dialogs opened from the main menu and the game: settings, how to play, enter a code, stats, history,
// play together and join a game.
// ---- shared dialogs ----
import { isApp, canKeepAwake, canVibrate, canReadClipboard, readClipboard } from './native.js';
import { Shape, Boards, PuzzleCode } from './core.js';
import { store, formatTime } from './store.js';
import { el, chip, row, onThemeChange, dialog, theme, text, button, applyTheme, sk } from './ui.js';
import { pencilColor } from './sketch.js';
import { PENCILS, Mode } from './room.js';
import { cleanCode } from './net.js';
import { SHARE_BASE, shareText, defaultName, GROUP_SIZES, diffLabel, cap } from './common.js';
import { openGame } from './app.js';


export function settingsDialog(onDone) {
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
      toggle('Sound', 'sound'),
      ...(canVibrate() ? [toggle('Vibrate', 'haptics')] : []),
      ...(canKeepAwake() ? [toggle('Keep screen on', 'keepAwake')] : []),
      text('Challenge', { size: 17, bold: true, cls: 'gap14' }),
      toggle('No hints', 'noHints'),
      toggle('Plain numbers (no tick when done)', 'plainNumbers'),
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

export function rulesDialog() {
  let d;
  const col = el('div', { class: 'col' },
    text('How to play', { size: 26, bold: true }),
    text('Join the dots into one closed fence, like a rubber band laid on the board.', { size: 16 }),
    el('ul', { class: 'rules' },
      el('li', { text: "A number tells how many of its square's 4 sides are fence. It doesn't say which." }),
      el('li', { text: 'Squares without a number can have any count.' }),
      el('li', { text: 'Every dot has two fence pieces touching it, or none. So the fence never stops, splits or crosses.' }),
      el('li', { text: "There's only one fence, and it goes all the way around." })),
    text('Tap the gap between two dots to draw a fence, and tap it again to clear it. Press and hold a gap to mark it X (a gap that stays empty), or switch the Pen to X. With Pen: Draw, drag from dot to dot to draw (two fingers move the board). Pinch to zoom, drag to move, and double-tap an empty spot to see the whole board.', { size: 16 }),
    el('div', { class: 'gap16' }, button('Got it', () => d.close())),
  );
  d = dialog(col);
}

export function codeDialog() {
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

export function statsDialog() {
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

export function historyDialog() {
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
export function playTogetherDialog() {
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
/** Type (or follow a link with) a friend's room code. */
export function joinDialog(prefill) {
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
