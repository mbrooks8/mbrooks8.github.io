// Versus after the first loop, on screen: the results card's standings and the little live boards of friends
// still racing. The rules are race.js.
import { el, text, button, dialog, theme } from './ui.js';
import { formatTime } from './store.js';
import { thumb } from './thumb.js';
import { unpackLines, ordinal } from './race.js';

/**
 * The versus results card, top part: who won, the places and times so far, and (once you are done) the friends
 * still racing to watch. o: r (room), finished (seat -> [ms, hints, place]), progress, nameOf, colorOf, dotLine,
 * watch, solved (this phone is done), earned / repeat (points line).
 */
export function versusCard(o) {
  const { r, finished, progress, nameOf } = o;
  const kids = [];
  // The host numbers finishes as they arrive, so the first loop in real time wins (late joiners too).
  let winner = null;
  for (const [p, f] of finished) if (f[2] === 1) { winner = p; break; }
  const h = text(winner == null ? 'Race on!' : (r && winner === r.me) ? 'You win!' : `${nameOf(winner)} wins!`, { size: 30, bold: true, cls: 'center' });
  h.style.color = winner != null ? o.colorOf(winner) : theme.accent;
  kids.push(h);
  if (o.earned) kids.push(text(`+${o.earned} point${o.earned === 1 ? '' : 's'}`, { size: 15, color: 'inkSoft', cls: 'center' }));
  else if (o.repeat) kids.push(text('Already solved, so no points', { size: 15, color: 'inkSoft', cls: 'center' }));
  const players = r ? r.players : [];
  const pct = p => Math.floor((progress.get(p) || 0) * 100);
  const rank = p => { const f = finished.get(p); return f ? (f[2] > 0 ? f[2] : 99) : 100; };
  const order = players.slice().sort((a, b) => rank(a) - rank(b) || (progress.get(b) || 0) - (progress.get(a) || 0));
  kids.push(el('div', { class: 'plist' }, ...order.map(p => {
    const f = finished.get(p);
    const line = f ? `${f[2] > 0 ? ordinal(f[2]) + ' ' : ''}${nameOf(p)}: ${formatTime(f[0])} · ` + (f[1] === 0 ? 'no hints' : `${f[1]} hint${f[1] === 1 ? '' : 's'}`)
      : r.away[p] ? `${nameOf(p)}: left` : `${nameOf(p)}: still drawing (${pct(p)}%)`;
    return o.dotLine(p, line);
  })));
  // Done: watch the friends still racing (tap one for a bigger look). Racers don't get to peek.
  const racing = order.filter(p => !finished.has(p) && !r.away[p]);
  if (o.solved && racing.length) kids.push(el('div', { class: 'racers' }, ...racing.map(p => o.watch.card(p))));
  return kids;
}

/**
 * Little live boards of the friends still racing. opts: puzzle() (the round's puzzle), colorOf(p), label(p).
 * The canvases are kept, so the results card can be rebuilt without them flickering.
 */
export function createWatch({ puzzle, colorOf, label }) {
  const lines = new Map(), canvases = new Map();
  let big = null; // { player, canvas, caption, d }
  const flags = p => {
    const pz = puzzle();
    if (!lines.has(p) && pz) lines.set(p, new Uint8Array(pz.grid.edgeCount));
    return lines.get(p);
  };
  const canvasOf = p => {
    let c = canvases.get(p);
    if (!c) { c = thumb(puzzle(), { lines: flags(p), shade: false, color: colorOf(p), size: 76 }); canvases.set(p, c); }
    return c;
  };
  const watch = {
    /** A LOOK came in. */
    set(p, hex) {
      const pz = puzzle(); if (!pz) return;
      const got = unpackLines(hex, pz.grid.edgeCount); if (!got) return;
      flags(p).set(got);
      const c = canvases.get(p); if (c) c._draw();
      if (big && big.player === p) { big.canvas._draw(); big.caption.textContent = label(p); }
    },
    /** One racer to watch: their board so far and a caption; tap for a bigger look. */
    card(p) {
      const b = el('button', { type: 'button', class: 'racer', 'aria-label': `Watch ${label(p)}` }, canvasOf(p), el('span', {}, label(p)));
      b.addEventListener('click', () => watch.open(p));
      return b;
    },
    open(p) {
      if (big) big.d.close();
      const size = Math.max(160, Math.min(300, window.innerWidth - 90));
      const canvas = thumb(puzzle(), { lines: flags(p), shade: false, clues: true, color: colorOf(p), size });
      const caption = text(label(p), { size: 18, cls: 'center' });
      const me = { player: p, canvas, caption, d: null };
      me.d = dialog(el('div', { class: 'col center racebig' }, canvas, caption, button('Back', () => me.d.close(), { size: 16 })),
        { onClose: () => { if (big === me) big = null; } });
      big = me;
    },
    /** Captions changed (progress, someone finished): refresh the big look's. */
    relabel() { if (big) big.caption.textContent = label(big.player); },
    /** A finished racer: their big look closes. */
    done(p) { if (big && big.player === p) big.d.close(); },
    /** How many fence pieces we've seen of [p] (tests). */
    seen(p) { const f = lines.get(p); return f ? f.reduce((a, b) => a + b, 0) : 0; },
    clear() { lines.clear(); canvases.clear(); if (big) big.d.close(); big = null; },
  };
  return watch;
}
