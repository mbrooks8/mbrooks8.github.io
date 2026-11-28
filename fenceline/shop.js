// The store: spend points on paper, ping emoji and pencils. Reached from Stats and Settings; no real money anywhere.
import { el, text, button, chip, sk, dialog, theme, applyTheme, onThemeChange } from './ui.js';
import { store } from './store.js';
import { pencilColor, pencilLine } from './sketch.js';
import { BACKGROUNDS, PING_PACKS, PENCIL_GOODS, canBuy, goodById } from './cosmetics.js';

/** A wavy pencil scribble in pencil [i]'s colour (the dashes and dots of its line style are in the players list). */
export function scribble(i) {
  const c = el('canvas', { 'aria-hidden': 'true', style: 'width:44px;height:30px;display:block' });
  requestAnimationFrame(() => {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(44 * dpr); c.height = Math.round(30 * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const col = pencilColor(i, theme.night);
    const pts = [[6, 22], [12, 8], [18, 20], [24, 8], [30, 18], [38, 9]];
    for (let k = 0; k + 1 < pts.length; k++) pencilLine(ctx, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], col, 3.4, i * 9 + k, 2);
  });
  return c;
}

const paperSample = bg => {
  const pal = { ...theme.pal, ...((theme.night ? bg.night : bg.day) || {}) };
  return el('span', { class: 'paperprev', 'aria-hidden': 'true', style: { background: `repeating-linear-gradient(transparent 0 7px, ${pal.ruling} 7px 8px), ${pal.paper}` } });
};

export function shopDialog(onDone) {
  let d, tab = 'pencils', selected = '';
  const col = el('div', { class: 'col' });
  const refreshTheme = () => { applyTheme(); onThemeChange.forEach(f => f()); };

  /** One thing on a shelf: its picture, its name, and what it costs (or "yours"). */
  const good = (id, picture, name, { inUse = false, onUse = null } = {}) => {
    const g = goodById(id);
    const owned = !g || store.owned.includes(id);
    const b = el('button', { type: 'button', class: 'good' + (inUse ? ' sel' : ''), 'aria-pressed': inUse || (id && id === selected) ? 'true' : 'false',
      'aria-label': `${name}, ${owned ? 'yours' : g.price + ' points'}` },
      picture, el('span', { class: 'gname', text: name }), el('span', { class: 'gprice', text: owned ? (inUse ? 'in use' : 'yours') : String(g.price) }));
    b.addEventListener('click', () => {
      if (owned) { if (onUse) onUse(); selected = ''; } else selected = id === selected ? '' : id;
      build();
    });
    return inUse || (id && id === selected) ? sk(b, { kind: 'ring', stroke: 'accent' }) : b;
  };

  const shelf = () => {
    if (tab === 'pencils') {
      const plain = [0, 1, 2, 3, 4];
      return el('div', { class: 'shelf' },
        ...plain.map(i => good('', scribble(i), ['Terracotta', 'Indigo', 'Ochre', 'Rose', 'Graphite'][i], { inUse: store.pencil === i, onUse: () => { store.pencil = i; refreshTheme(); } })),
        ...PENCIL_GOODS.map(p => good(p.id, scribble(p.pencil), p.name, { inUse: store.pencil === p.pencil, onUse: () => { store.pencil = p.pencil; refreshTheme(); } })));
    }
    if (tab === 'paper') {
      return el('div', { class: 'shelf' }, ...BACKGROUNDS.map(b => good(b.price ? 'bg-' + b.id : '', paperSample(b), b.name,
        { inUse: store.background === b.id, onUse: () => { store.background = b.id; refreshTheme(); } })));
    }
    return el('div', { class: 'shelf pings' }, ...PING_PACKS.map(p => good(p.price ? 'pings-' + p.id : '',
      el('span', { class: 'glyphs', 'aria-hidden': 'true', text: p.kinds.map(k => k.glyph).join(' ') }), p.name)));
  };

  const build = () => {
    const kids = [
      el('div', { class: 'center' }, text(`${store.balance.toLocaleString('en-US')} points to spend`, { size: 18, color: 'inkSoft' })),
      el('div', { class: 'row gap6' }, ...[['pencils', 'Pencils'], ['paper', 'Paper'], ['pings', 'Pings']].map(([k, label]) =>
        chip(label, tab === k, () => { tab = k; selected = ''; build(); }))),
      shelf(),
    ];
    const g = selected ? goodById(selected) : null;
    if (g) {
      const can = canBuy(g.id, store.balance, store.owned);
      const buy = button(`Buy ${g.name} · ${g.price}`, () => { if (store.buy(g.id)) { selected = ''; if (g.kind === 'pencil') store.pencil = PENCIL_GOODS.find(p => p.id === g.id).pencil; if (g.kind === 'background') store.background = g.id.slice(3); refreshTheme(); build(); } }, { size: 19, kind: 'primary' });
      buy.classList.toggle('dim', !can.ok);
      kids.push(el('div', { class: 'gap8' }, buy));
      if (!can.ok && can.why === 'short') kids.push(text(`${can.need} more points. Finish a puzzle to earn them.`, { size: 15, color: 'inkSoft', cls: 'center' }));
    } else if (tab === 'pings') {
      kids.push(text('Hold Ping in co-op to send one.', { size: 15, color: 'inkSoft', cls: 'center' }));
    }
    col.replaceChildren(...kids);
  };
  build();
  d = dialog(col, { onClose: onDone });
  return d;
}
