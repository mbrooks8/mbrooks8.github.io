// Small Play together cards: a join request (host), lost connection (guest), and Invite friends from a solo game.
import { Shape, Boards } from './core.js';
import { store } from './store.js';
import { el, dialog, text, button, pick, chip, sk } from './ui.js';
import { JOIN_BASE, GROUP_SIZES, cap, shareText, defaultName } from './common.js';

/** Host: someone wants into the running game. */
export function joinRequestCard(r, peer, name, returning) {
  let d;
  d = dialog(el('div', { class: 'col' },
    text(returning ? `${name} is back!` : `${name} wants to join`, { size: 22, bold: true }),
    text(returning ? 'Let them back into their seat?' : 'Let them into this game?', { size: 16, color: 'inkSoft' }),
    el('div', { class: 'row gap14' },
      button('Not now', () => { d.close(); r.deny(peer); }, { size: 17 }),
      button('Let in', () => { d.close(); r.approve(peer); }, { size: 18, kind: 'primary' })),
  ), { cancelable: false });
}

/** Guest: the host's phone went away. */
export function lostCard({ rejoin, keep }) {
  let d;
  d = dialog(el('div', { class: 'col' },
    text('Lost the connection', { size: 22, bold: true }),
    text('Rejoin to get your seat back, or keep drawing on your own.', { size: 16, color: 'inkSoft' }),
    el('div', { class: 'row gap14' },
      button('Keep drawing', () => { d.close(); keep(); }, { size: 16 }),
      button('Rejoin', () => { d.close(); rejoin(); }, { size: 18, kind: 'primary' })),
  ));
}

/** Share a room's join link and code. */
export const shareRoom = (code, note) => {
  const c = String(code).toUpperCase();
  shareText(`Join my Fenceline game!\n${JOIN_BASE}${c}\nRoom code: ${c}`, note);
};

/**
 * Solo game: draw this same board with friends (co-op). Private unless Open room is picked (Michael, 2026-11-28).
 * [go(open)] makes the room and resolves to its code, or throws with a message to show.
 */
export function inviteSoloCard(go) {
  let d, open = false, busy = false, status = '';
  const col = el('div', { class: 'col' });
  const name = el('input', { class: 'codein namein', type: 'text', placeholder: 'Your name', 'aria-label': 'Your name', maxlength: '20', autocomplete: 'nickname', spellcheck: 'false' });
  name.value = defaultName();
  const fill = () => col.replaceChildren(
    text('Draw this board with friends. Your fences and time come along.', { size: 16, cls: 'center' }),
    sk(el('div', { class: 'field gap8' }, name), { kind: 'under', stroke: 'inkSoft' }),
    el('div', { class: 'picks around gap12' },
      pick('Private', !open, () => { open = false; fill(); }),
      pick('Open room', open, () => { open = true; fill(); })),
    text(open ? 'Shows up in the open rooms list.' : 'Only people with your code can join.', { size: 14, color: 'inkSoft', cls: 'center' }),
    ...(status ? [text(status, { size: 15, color: 'inkSoft', cls: 'center' })] : []),
    el('div', { class: 'gap8' }, button(busy ? 'Making a room…' : 'Make room', make, { size: 20, kind: 'primary' })),
  );
  const make = async () => {
    if (busy) return;
    store.playerName = name.value.trim();
    busy = true; status = ''; fill();
    let code = '';
    try { code = await go(open); } catch (e) { status = (e && e.message) || 'Something went wrong. Try again.'; }
    busy = false;
    if (!code) { fill(); return; }
    const note = t => { status = t; shown(); };
    const shown = () => col.replaceChildren(
      el('div', { class: 'roomcode' }, el('div', { class: 'lbl2', text: 'Room code' }), el('div', { class: 'big', text: code.toUpperCase() })),
      button('Share invite', () => shareRoom(code, note), { size: 18, kind: 'primary' }),
      text("You'll be asked before anyone joins.", { size: 14, color: 'inkSoft', cls: 'center' }),
      ...(status ? [text(status, { size: 15, color: 'inkSoft', cls: 'center' })] : []),
      button('Keep drawing', () => d.close(), { size: 16 }),
    );
    shown();
  };
  fill();
  d = dialog(col, { onClose: () => { if (!busy) store.playerName = name.value.trim(); } });
  return d;
}

/** Host, after a round: pick the shape, size and difficulty of the next board; [onStart(shape, w, h, diff)]. */
export function nextBoardCard(now, onStart) {
  let d;
  let shape = now.shape, size = `${now.w}x${now.h}`, diff = now.diff;
  const col = el('div', { class: 'col' });
  const fill = () => {
    const sizes = Boards.sizes(shape).concat(now.coop ? GROUP_SIZES[shape.name] || [] : []);
    if (!sizes.includes(size)) size = Boards.defaultSize ? Boards.defaultSize(shape) : sizes[1];
    const kids = [
      text('Next board', { size: 26, bold: true }),
      el('div', { class: 'row gap6' }, ...Shape.entries.map(sh => chip(sh.label, shape === sh, () => { shape = sh; fill(); }, { size: 13 }))),
      text(`${shape.label} board`, { size: 15, color: 'inkSoft' }),
    ];
    for (let i = 0; i < sizes.length; i += 4) {
      kids.push(el('div', { class: 'row gap6' }, ...sizes.slice(i, i + 4).map(s =>
        chip(s.replace('x', '×'), size === s, () => { size = s; fill(); }))));
    }
    kids.push(el('div', { class: 'row gap6' }, ...['EASY', 'MEDIUM', 'HARD'].map(dd => chip(cap(dd), diff === dd, () => { diff = dd; fill(); }))));
    kids.push(el('div', { class: 'row gap14' },
      button('Back', () => d.close(), { size: 17 }),
      button('Start', () => {
        d.close();
        const [w, h] = size.split('x').map(Number);
        onStart(shape, w, h, diff);
      }, { size: 18, kind: 'primary' })));
    col.replaceChildren(...kids);
  };
  fill();
  d = dialog(col);
}
