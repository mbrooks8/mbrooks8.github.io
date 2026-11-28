// The wardrobe: pick the paper, pencil and ping feeling you play with. Only what you own is shown (the store sells the rest).
// Solo play and co-op use the pencil; co-op uses the host's paper; versus uses your own.
import { el, text, button, chip, sk, dialog, applyTheme, onThemeChange } from './ui.js';
import { store } from './store.js';
import { BACKGROUNDS, PENCIL_GOODS, hasBackground, ownedPencils, ownedPings } from './cosmetics.js';
import { PENCILS } from './sketch.js';
import { scribble, paperSample, shopDialog } from './shop.js';

const pencilName = i => (i < 100 ? PENCILS[i][0] : PENCIL_GOODS.find(g => g.pencil === i).name);

export function wardrobeDialog(onDone) {
  let d, tab = 'pencils';
  const col = el('div', { class: 'col' });
  const restyle = () => { applyTheme(); onThemeChange.forEach(f => f()); };
  const pickBtn = (picture, name, on, set) => {
    const b = el('button', { type: 'button', class: 'good', 'aria-pressed': on ? 'true' : 'false', 'aria-label': name }, picture, el('span', { class: 'gname', text: name }));
    b.addEventListener('click', () => { set(); build(); });
    return on ? sk(b, { kind: 'ring', stroke: 'accent' }) : b;
  };
  const shelf = () => {
    if (tab === 'pencils') {
      return el('div', { class: 'shelf' }, ...ownedPencils(store.owned).map(i =>
        pickBtn(scribble(i), pencilName(i), store.pencil === i, () => { store.pencil = i; restyle(); })));
    }
    if (tab === 'paper') {
      return el('div', { class: 'shelf' }, ...BACKGROUNDS.filter(b => hasBackground(b.id, store.owned)).map(b =>
        pickBtn(paperSample(b), b.name, store.background === b.id, () => { store.background = b.id; restyle(); })));
    }
    const kinds = [{ key: '', glyph: '', word: 'Plain' }, ...ownedPings(store.owned)];
    return el('div', { class: 'shelf' }, ...kinds.map(k =>
      pickBtn(el('span', { class: 'glyphs', 'aria-hidden': 'true', text: k.glyph || '◯' }), k.word, store.pingKind === k.key, () => { store.pingKind = k.key; })));
  };
  const build = () => {
    col.replaceChildren(
      el('div', { class: 'row gap6' }, ...[['pencils', 'Pencil'], ['paper', 'Paper'], ['pings', 'Ping']].map(([k, label]) => chip(label, tab === k, () => { tab = k; build(); }))),
      shelf(),
      text(tab === 'paper' ? 'In co-op, everyone plays on the host’s paper.' : tab === 'pencils' ? 'In co-op, friends with the same pencil get another line pattern.' : 'Sent when you ping in co-op.', { size: 15, color: 'inkSoft', cls: 'center' }),
      el('div', { class: 'gap8 center' }, button('Store', () => { d.close(); shopDialog(onDone); }, { size: 17, kind: 'link' })));
  };
  build();
  d = dialog(col, { onClose: onDone });
  return d;
}
