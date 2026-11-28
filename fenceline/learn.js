// Learn: the rules in three lines with a little picture each, the gestures, then the guided lessons.
// (How to play and Learn used to be two buttons; Michael asked for one.)
import { Tutorial, Game, Edge } from './core.js';
import { store } from './store.js';
import { el, dialog, theme, text, button } from './ui.js';
import { BoardView } from './board.js';
import { pencilLine } from './sketch.js';
import { icon } from './icons.js';
import { thumb } from './thumb.js';
import { openGame } from './app.js';

/** A small drawing for a rule, on a 54px canvas. */
function ruleArt(kind) {
  const S = 54;
  const c = el('canvas', { class: 'thumb', 'aria-hidden': 'true' });
  c.style.width = c.style.height = S + 'px';
  requestAnimationFrame(() => {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(S * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dot = (x, y) => { ctx.fillStyle = theme.pal.ink; ctx.beginPath(); ctx.arc(x, y, 2, 0, 6.283); ctx.fill(); };
    const line = (a, b, x, y, s) => pencilLine(ctx, a, b, x, y, theme.accent, 3, s, 2);
    const cross = (x, y) => { pencilLine(ctx, x - 3, y - 3, x + 3, y + 3, theme.pal.inkSoft, 1.5, 1, 1); pencilLine(ctx, x + 3, y - 3, x - 3, y + 3, theme.pal.inkSoft, 1.5, 2, 1); };
    if (kind === 'number') {
      line(10, 10, 44, 10, 1); line(44, 10, 44, 44, 2); line(44, 44, 10, 44, 3);
      cross(10, 27);
      [[10, 10], [44, 10], [10, 44], [44, 44]].forEach(([x, y]) => dot(x, y));
      ctx.fillStyle = theme.pal.ink; ctx.font = '22px "Coming Soon", cursive'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('3', 27, 28);
    } else {
      line(6, 27, 27, 27, 4); line(27, 27, 27, 6, 5);
      cross(38, 27); cross(27, 38);
      [[6, 27], [27, 6], [48, 27], [27, 48]].forEach(([x, y]) => dot(x, y));
      ctx.fillStyle = theme.pal.ink; ctx.beginPath(); ctx.arc(27, 27, 3, 0, 6.283); ctx.fill();
    }
  });
  return c;
}

export function learnDialog() {
  let d;
  const goal = Tutorial.goalPuzzle();
  const rule = (art, words) => el('div', { class: 'rowitem', style: 'border:0;padding:4px 0;font-size:17px' }, art, el('div', { class: 'grow', text: words }));
  const lesson = (pic, label, sub, done, go) => {
    const b = el('button', { type: 'button', class: 'rowitem', 'aria-label': label },
      pic, el('div', { class: 'grow' }, label, el('span', { class: 'sub', text: sub })),
      done ? icon('check', 24, 'var(--done)', 2.2) : '');
    b.addEventListener('click', () => { d.close(); go(); });
    return b;
  };
  const anyDone = Tutorial.steps.some((s, i) => store.lessonDone(i));
  const subs = ['tap for fence, hold for X', 'two fence pieces or none', 'undo, pen and the ⋯ menu'];
  const lessons = Tutorial.steps.map((s, i) => {
    const p = Tutorial.puzzle(i);
    let lines = null;
    if (i === 0) lines = Uint8Array.from(p.solution, (v, e) => (v && e % 3 !== 0 ? 1 : 0)); // half drawn
    return lesson(thumb(p, { lines, shade: i !== 0, clues: i === 2, faded: i === 1 }), s.title, subs[i] || s.tip, store.lessonDone(i),
      () => openGame({ mode: 'tutorial', step: i, noGoal: true }));
  });
  d = dialog(el('div', { class: 'col', style: 'gap:2px' },
    rule(thumb(goal, {}), 'Draw one loop along the dots.'),
    rule(ruleArt('number'), 'A number says how many of its sides are fence.'),
    rule(ruleArt('dots'), 'Every dot has two fence pieces or none.'),
    el('div', { class: 'gestures gap12' },
      el('div', {}, 'Tap', el('span', { class: 'k', text: 'fence' })),
      el('div', {}, 'Hold', el('span', { class: 'k', text: 'X' })),
      el('div', {}, 'Drag', el('span', { class: 'k', text: 'move' })),
      el('div', {}, 'Pinch', el('span', { class: 'k', text: 'zoom' }))),
    el('hr', { class: 'divider' }),
    lesson(thumb(goal, {}), 'The goal', 'one loop, all the way around', anyDone, () => openGame({ mode: 'tutorial', step: 0 })),
    ...lessons,
  ));
}

/** Before the first lesson: what you're aiming for, and a finished puzzle to look at. */
export function showGoal() {
  let d;
  const done = new Game(Tutorial.goalPuzzle());
  for (let e = 0; e < done.grid.edgeCount; e++) if (done.puzzle.solution[e]) done.setMark(e, Edge.LINE);
  const mini = el('canvas', { class: 'mini' });
  const col = el('div', { class: 'col' },
    text('The goal', { size: 26, bold: true }),
    text('Join the dots into one closed fence. Each number tells how many of its 4 sides are fence.', { size: 16 }),
    mini,
    text('Once a fence goes all the way around and every number is satisfied, a puzzle is finished.', { size: 15, color: 'inkSoft' }),
    text('Tap the gap between two dots to draw a fence. Press and hold a gap to mark it X.', { size: 16, cls: 'gap10' }),
    el('div', { class: 'gap14' }, button('Show me how', () => d.close(), { size: 18, accent: 'accent' })),
  );
  let mb = null;
  d = dialog(col, { onClose: () => mb && mb.destroy() });
  mb = new BoardView(mini);
  mb.locked = true; mb.showErrors = false; mb.palette = theme.pal; mb.pencilColor = theme.accent;
  mb.setGame(done);
  setTimeout(() => mb.playSolved({ celebrate: false }), 250);
}
