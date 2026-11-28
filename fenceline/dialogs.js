// Cards opened from the main menu and the game: settings, enter a code, stats (with history),
// play together and join a game. Learn (with the rules) is learn.js.
// They are taped paper cards with no titles: you tapped the button, so you know where you are.
import { privacyChoicesNeeded, privacyChoices } from './ads.js';
import { isApp, canKeepAwake, canVibrate, canReadClipboard, readClipboard } from './native.js';
import { Shape, Boards, PuzzleCode } from './core.js';
import { store, formatTime } from './store.js';
import { el, onThemeChange, dialog, theme, text, button, pick, applyTheme, sk, volumeSlider } from './ui.js';
import { pencilLine, drawBox } from './sketch.js';
import { icon } from './icons.js';
import { applyVolumes, unlockSound } from './sound.js';
import { Mode } from './room.js';
import { cleanCode, Link } from './net.js';
import { SHARE_BASE, shareText, defaultName, GROUP_SIZES, diffLabel, cap, factory } from './common.js';
import { shapeChip } from './shapes.js';
import { thumb } from './thumb.js';
import { shopDialog } from './shop.js';
import { wardrobeDialog } from './wardrobe.js';
import { leaderboardsOn, showLeaderboards } from './leaderboards.js';
import { openGame } from './app.js';
import { replayDialog } from './replay.js';
import { timelapseIds } from './timelapse.js';

const FIRST = 5; // sizes shown before "more"

/** Size picks: the first few, then "more" opens the rest (and stays open while a hidden size is picked). */
export function sizePicks(sizes, current, onPick, isOpen, setOpen) {
  const open = isOpen() || sizes.indexOf(current) >= FIRST;
  const shown = open ? sizes : sizes.slice(0, FIRST);
  const rows = [];
  const per = open ? 4 : FIRST;
  for (let i = 0; i < shown.length; i += per) {
    rows.push(el('div', { class: 'picks gap16' }, ...shown.slice(i, i + per).map(s =>
      pick(s.replace('x', '×'), current === s, () => onPick(s), { size: 19 }))));
  }
  if (sizes.length > FIRST) {
    const more = pick(open ? 'less ▴' : 'more ▾', false, () => setOpen(!open), { size: 15, aria: open ? 'Fewer sizes' : 'More sizes' });
    if (open) rows.push(el('div', { class: 'more' }, more));
    else rows[rows.length - 1].append(more);
  }
  return rows;
}

/** A hand-drawn tick box. */
function tickBox(on) {
  const c = el('canvas', { 'aria-hidden': 'true' });
  requestAnimationFrame(() => {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(24 * dpr);
    const ctx = c.getContext('2d');
    drawBox(ctx, 24, 24, { fill: 'rgba(0,0,0,0)', stroke: theme.pal.inkSoft, width: 1.5, corner: 3, seed: 5, dpr });
    if (on) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pencilLine(ctx, 5, 12, 10, 18, theme.accent, 2.6, 3, 2);
      pencilLine(ctx, 10, 18, 21, 3, theme.accent, 2.6, 4, 2);
    }
  });
  return c;
}

export function settingsDialog(onDone) {
  const col = el('div', { class: 'col', style: 'gap:0' });
  let d;
  const toggle = (label, key) => {
    const t = el('button', { type: 'button', class: 'tick' + (store[key] ? '' : ' off'), role: 'switch', 'aria-checked': store[key] ? 'true' : 'false' });
    t.append(tickBox(store[key]), el('span', { text: label }));
    t.addEventListener('click', () => { store[key] = !store[key]; if (key === 'sound') { applyVolumes(); unlockSound(); } build(); });
    return t;
  };
  const build = () => {
    col.replaceChildren(
      toggle('Show mistakes', 'showErrors'),
      toggle('Auto-X around finished numbers', 'autoCross'),
      toggle('Timer', 'showTimer'),
      toggle('Sound', 'sound'),
      ...(store.sound ? [volumeSlider('Effects', 'sfxVolume', 'fence'), volumeSlider('Music', 'musicVolume')] : []),
      ...(canVibrate() ? [toggle('Vibrate', 'haptics')] : []),
      ...(canKeepAwake() ? [toggle('Keep screen on', 'keepAwake')] : []),
      el('hr', { class: 'divider' }),
      toggle('No hints', 'noHints'),
      toggle('Plain numbers', 'plainNumbers'),
      el('hr', { class: 'divider' }),
      el('div', { class: 'picks around gap16' }, ...[['system', 'Auto'], ['day', 'Day'], ['night', 'Night']].map(([k, label]) =>
        pick(label, store.theme === k, () => { store.theme = k; applyTheme(); onThemeChange.forEach(f => f()); build(); }))),
      el('div', { class: 'gap12 center' }, button('Wardrobe', () => wardrobeDialog(build), { size: 17, kind: 'link' }), button('Store', () => shopDialog(build), { size: 17, kind: 'link' })),
      // EU/UK players can change their ad consent (production app only; Google says when it's needed).
      ...(privacyChoicesNeeded() ? [el('div', { class: 'gap12 center' }, button('Privacy choices', () => { d.close(); privacyChoices(); }, { size: 17, kind: 'link' }))] : []),
      ...(isApp ? [] : [el('p', { class: 'about gap16' },
        'Playing on Android? ', el('a', { href: './Fenceline.apk', download: '' }, 'Download the app'), '.')]),
    );
  };
  build();
  d = dialog(col, { onClose: onDone });
  return d;
}

export function codeDialog() {
  let d;
  const input = el('input', { class: 'codein', type: 'text', placeholder: 'F1-…', 'aria-label': 'Puzzle code', autocapitalize: 'characters', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false' });
  input.style.textAlign = 'center'; input.style.fontSize = '22px';
  const error = text('', { size: 15, color: 'error', cls: 'center' });
  const play = () => {
    const code = PuzzleCode.find(input.value);
    if (!code) error.textContent = "Hmm, that's not a puzzle code.";
    else { d.close(); openGame({ mode: 'code', code: code.toString() }); }
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') play(); });
  const kids = [sk(el('div', { class: 'field' }, input), { kind: 'under', stroke: 'ink' }), error];
  if (canReadClipboard()) {
    const paste = el('button', { type: 'button', class: 'pick', style: 'padding:8px 16px;font-size:16px;color:var(--ink)' },
      el('span', { class: 'lbl', style: 'display:inline-flex;gap:8px;align-items:center' }, icon('paste', 18), 'Paste'));
    paste.addEventListener('click', async () => {
      const t = await readClipboard();
      if (t == null) return;
      const c = PuzzleCode.find(t || ''); input.value = c ? c.toString() : (t || '').trim();
    });
    kids.push(el('div', { class: 'center' }, sk(paste, { kind: 'wash', fill: 'paperShade' })));
  }
  kids.push(el('div', { class: 'gap14' }, button('Play', play, { size: 22, kind: 'primary' })));
  d = dialog(el('div', { class: 'col' }, ...kids));
  setTimeout(() => input.focus(), 50);
}

/** A one-line date like "Nov 27" (or "Today"). */
const shortDate = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const t = new Date();
  if (d.toDateString() === t.toDateString()) return 'Today';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Stats at a glance, with the history of solved puzzles right under them. */
export function statsDialog() {
  let d;
  const stat = (n, k, s) => el('div', {}, el('div', { class: 'n' }, n), el('div', { class: 'k', text: k }), el('div', { class: 's', text: s || ' ' }));
  const cells = ['EASY', 'MEDIUM', 'HARD'].map(diff => {
    const n = store.solved(diff);
    return stat(String(n), diffLabel(diff), n > 0 ? 'avg ' + formatTime(store.totalTime(diff) / n) : '');
  });
  const sh = store.lastShape, size = store.lastSize, diff = store.lastDifficulty;
  const [w, h] = size.split('x').map(Number);
  const best = store.best(Boards.key(sh, w, h), diff);
  cells.push(
    stat(el('span', { style: 'display:inline-flex;align-items:center' }, icon('candle', 22, 'var(--hint)'), String(store.dailyStreak)), 'streak', `best ${store.bestStreak}`),
    stat(best > 0 ? formatTime(best) : '–', 'best ' + Boards.label(sh, w, h), diffLabel(diff) + ', no hints'),
    stat(String(store.noHintWins), 'no-hint', 'solves'),
    Object.assign(stat(store.points.toLocaleString('en-US'), 'points', `${store.balance.toLocaleString('en-US')} to spend`), { className: 'wide' }));
  const kids = [el('div', { class: 'stat3' }, ...cells)];
  // Leaderboards (Google Play Games, Android app only).
  kids.push(el('div', { class: 'gap8 row gap6' }, button('Wardrobe', () => wardrobeDialog(), { size: 20, kind: 'outline' }), button('Store', () => shopDialog(), { size: 20, kind: 'outline' })));
  if (leaderboardsOn()) kids.push(el('div', { class: 'gap8' }, button('Leaderboards', () => showLeaderboards(), { size: 20, kind: 'outline', icon: 'chart' })));
  kids.push(el('hr', { class: 'divider gap8' }));

  const note = text('', { size: 15, color: 'inkSoft' });
  const items = store.history;
  if (!items.length) kids.push(text('Solved puzzles will show up here.', { size: 16, color: 'inkSoft', cls: 'center' }));
  let thumbs = 0;
  const watchable = timelapseIds();
  for (const hh of items) {
    const code = PuzzleCode.find(hh.code);
    if (!code) continue;
    const board = `${Boards.label(code.shape, code.width, code.height)} ${diffLabel(code.difficulty)}`;
    const what = ({ daily: 'Daily ', coop: 'Co-op ', versus: 'Versus ' }[hh.kind] || '') + board;
    const hints = hh.hints === 0 ? '' : ` · ${hh.hints} hint${hh.hints === 1 ? '' : 's'}`;
    const pic = el('div', { style: 'width:54px;height:54px;flex:none' });
    // The board pictures are drawn in the background, newest first.
    if (thumbs++ < 12) {
      factory.gen('thumb', code.width, code.height, code.difficulty, code.seed, code.shape)
        .then(p => pic.replaceChildren(thumb(p, { faded: false })), () => {});
    }
    // Watch it again: the timelapse of every move (kept for the newest games).
    const watch = watchable.has(hh.tl) ? el('button', { type: 'button', 'aria-label': 'Watch ' + what }, icon('play', 22)) : null;
    if (watch) watch.addEventListener('click', () => replayDialog(hh));
    const replay = el('button', { type: 'button', 'aria-label': 'Play ' + what + ' again' }, icon('restart', 22));
    replay.addEventListener('click', () => { d.close(); openGame({ mode: 'code', code: code.toString() }); });
    const share = el('button', { type: 'button', 'aria-label': 'Share ' + what }, icon('share', 22));
    share.addEventListener('click', () => shareText(`Try this ${board} Fenceline puzzle! I did it in ${formatTime(hh.ms)}.\n${SHARE_BASE}${code}\nCode: ${code}`, s => { note.textContent = s; }));
    kids.push(el('div', { class: 'rowitem' }, pic,
      el('div', { class: 'grow' }, what, el('span', { class: 'sub', text: `${shortDate(hh.date)} · ${formatTime(hh.ms)}${hints}` })),
      el('div', { class: 'acts' }, ...(watch ? [watch] : []), replay, share)));
  }
  kids.push(note);
  d = dialog(el('div', { class: 'col', style: 'gap:6px' }, ...kids));
}

// ---- play together ----

/** A big choice button (Online / Same room, Co-op / Versus): shaded in when picked, with a short line under it. */
function choice(label, sub, ic, selected, onClick) {
  const b = el('button', { type: 'button', class: 'choice' + (selected ? ' sel' : ''), 'aria-label': label, 'aria-pressed': selected ? 'true' : 'false' });
  if (ic) b.append(icon(ic, 22));
  b.append(el('span', { text: label }), el('span', { class: 'sub', text: sub }));
  b.addEventListener('click', onClick);
  return selected ? sk(b, { kind: 'shaded', fill: 'accent', stroke: 'accent' }) : sk(b, { stroke: 'inkSoft', width: 1.6 });
}

/** Pick how to connect, co-op or versus and a board, then host or join. The board starts as your last solo picks. */
export function playTogetherDialog() {
  let d;
  const col = el('div', { class: 'col' });
  let coop = true; // co-op first (Michael)
  let shape = store.lastShape;
  let size = store.lastSize;
  let diff = store.lastDifficulty;
  let showAll = false;
  let open = store.mpOpen;
  // In the Android app, also offer same-room play over Nearby (no internet).
  let via = isApp ? store.mpVia : 'online';
  const name = el('input', { class: 'codein namein', type: 'text', placeholder: 'Your name', 'aria-label': 'Your name', maxlength: '20', autocomplete: 'nickname', spellcheck: 'false' });
  name.value = defaultName();
  const saveName = () => { store.playerName = name.value.trim(); };
  const fill = () => {
    const sizes = Boards.sizes(shape).concat(coop ? GROUP_SIZES[shape.name] : []);
    if (!sizes.includes(size)) size = Boards.defaultSize ? Boards.defaultSize(shape) : Boards.sizes(shape)[1];
    const kids = [];
    if (isApp) {
      kids.push(el('div', { class: 'choices' },
        choice('Online', 'friends anywhere', 'people', via === 'online', () => { via = 'online'; store.mpVia = via; fill(); }),
        choice('Same room', 'phones nearby', 'ping', via === 'nearby', () => { via = 'nearby'; store.mpVia = via; fill(); })));
    }
    kids.push(
      el('div', { class: 'choices' },
        choice('Co-op', 'one shared loop', 'pen', coop, () => { coop = true; fill(); }),
        choice('Versus', 'first loop wins', 'arrow', !coop, () => { coop = false; fill(); })),
      sk(el('div', { class: 'field gap8' }, name), { kind: 'under', stroke: 'inkSoft' }),
      el('hr', { class: 'divider' }),
      el('div', { class: 'row shapes' }, ...Shape.entries.map(sh => shapeChip(sh, shape === sh, () => { shape = sh; fill(); }))),
      ...sizePicks(sizes, size, s => { size = s; fill(); }, () => showAll, v => { showAll = v; fill(); }),
      el('div', { class: 'picks around gap12' }, ...['EASY', 'MEDIUM', 'HARD'].map(dd => pick(cap(dd), diff === dd, () => { diff = dd; fill(); }))),
    );
    // Online rooms can be open (listed for anyone to join) or private (code only). Same-room play is always visible to phones nearby.
    if (via === 'online') kids.push(el('div', { class: 'picks around gap12' },
      pick('Open room', open, () => { open = true; store.mpOpen = true; fill(); }),
      pick('Private', !open, () => { open = false; store.mpOpen = false; fill(); })),
      text(open ? 'Shows up in the open rooms list.' : 'Only people with your code can join.', { size: 14, color: 'inkSoft', cls: 'center' }));
    const go = role => {
      saveName();
      d.close();
      if (role === 'join') {
        if (via === 'nearby') openGame({ mode: 'mp', role: 'join', via });
        else joinDialog('');
        return;
      }
      const [w, h] = size.split('x').map(Number);
      openGame({ mode: 'mp', role: 'host', mpMode: coop ? Mode.COOP : Mode.VERSUS, w, h, d: diff, shape, via, open: via === 'online' && open });
    };
    kids.push(el('div', { class: 'row gap16' },
      button('Host', () => go('host'), { size: 22, kind: 'primary' }),
      button('Join', () => go('join'), { size: 22, kind: 'outline' })));
    col.replaceChildren(...kids);
  };
  fill();
  d = dialog(col, { onClose: saveName });
}

/** Type (or follow a link with) a friend's room code. */
export function joinDialog(prefill) {
  let d;
  const code = el('input', { class: 'codein roomin', type: 'text', placeholder: 'ABCD', 'aria-label': 'Room code', maxlength: '6', autocapitalize: 'characters', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false' });
  code.style.textAlign = 'center';
  code.value = (prefill || '').toUpperCase();
  const name = el('input', { class: 'codein namein', type: 'text', placeholder: 'Your name', 'aria-label': 'Your name', maxlength: '20', autocomplete: 'nickname', spellcheck: 'false' });
  name.value = defaultName();
  const error = text('', { size: 15, color: 'error', cls: 'center' });
  const go = () => {
    const c = cleanCode(code.value);
    if (c.length !== 4) { error.textContent = 'Room codes have 4 letters.'; return; }
    store.playerName = name.value.trim();
    d.close();
    openGame({ mode: 'mp', role: 'join', code: c });
  };
  for (const i of [code, name]) i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  // Open rooms: hosts who left "Open room" on show up here (private rooms never do).
  const rooms = el('div', { class: 'col' });
  const stop = new AbortController();
  let scanning = false;
  const roomButton = r => button(`${r.coop ? 'Co-op' : 'Versus'} · ${r.board} · ${r.host} (${r.players}${r.playing ? ', playing' : ''})`, () => {
    store.playerName = name.value.trim();
    stop.abort(); d.close();
    openGame({ mode: 'mp', role: 'join', code: r.code, fromList: true });
  }, { size: 16, kind: 'outline' });
  const look = () => {
    if (scanning) return;
    scanning = true;
    const found = [];
    const note = text('Looking for open rooms…', { size: 15, color: 'inkSoft', cls: 'center' });
    const draw = () => rooms.replaceChildren(...found.map(roomButton), note);
    draw();
    Link.findOpen({ signal: stop.signal, onRoom: r => { if (!stop.signal.aborted) { found.push(r); draw(); } } }).then(() => {
      note.textContent = found.length ? '' : 'No open rooms right now.';
    }, e => { note.textContent = (e && e.message) || "Couldn't look for rooms."; }).finally(() => {
      scanning = false;
      if (stop.signal.aborted) return;
      note.after(button('Look again', look, { size: 15, kind: 'outline' }));
    });
  };
  d = dialog(el('div', { class: 'col' },
    text('Room code from your friend', { size: 15, color: 'inkSoft', cls: 'center' }),
    sk(el('div', { class: 'field' }, code), { kind: 'under', stroke: 'ink' }),
    sk(el('div', { class: 'field' }, name), { kind: 'under', stroke: 'inkSoft' }),
    error,
    el('div', { class: 'gap12' }, button('Join', go, { size: 22, kind: 'primary' })),
    el('hr', { class: 'divider' }),
    rooms,
  ), { onClose: () => stop.abort() });
  look();
  setTimeout(() => (code.value ? name : code).focus(), 50);
}

