// The store: spend points on paper, ping emoji and pencils. Reached from the home row, Stats and Settings.
// In the Play Store app only, a Gems tab sells gem packs and Remove ads through Google Play (gems.js), and a few
// premium goods cost gems. Everywhere else (web, iPhone, testers) none of that shows.
import { el, text, button, chip, sk, dialog, theme, applyTheme, onThemeChange } from './ui.js';
import { store } from './store.js';
import { wardrobeDialog } from './wardrobe.js';
import { pencilColor, pencilLine, pencilFx, pencilAccent } from './sketch.js';
import { drawFx, isAnimated } from './linefx.js';
import { BACKGROUNDS, PING_PACKS, PENCIL_GOODS, canBuy, goodById } from './cosmetics.js';
import { motifPreview, tileSize, MOTIFS } from './stationery.js';
import { GEM_PACKS, REMOVE_ADS, gemsOn, canRemoveAds, adsRemoved, prices, buy as buyFromPlay, restore, onGemsChange } from './gems.js';

const num = n => n.toLocaleString('en-US');

/** A wavy pencil scribble in pencil [i]'s colour (the dashes and dots of its line style are in the players list). */
export function scribble(i) {
  const c = el('canvas', { 'aria-hidden': 'true', style: 'width:44px;height:30px;display:block' });
  requestAnimationFrame(() => {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(44 * dpr); c.height = Math.round(30 * dpr);
    const ctx = c.getContext('2d');
    const col = pencilColor(i, theme.night), fx = pencilFx(i), accent = pencilAccent(i);
    const pts = [[6, 22], [12, 8], [18, 20], [24, 8], [30, 18], [38, 9]];
    const draw = t => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, 44, 30);
      for (let k = 0; k + 1 < pts.length; k++) {
        if (fx) drawFx(ctx, fx, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], col, 3.4, i * 9 + k, t, accent, theme.night);
        else pencilLine(ctx, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], col, 3.4, i * 9 + k, 2);
      }
    };
    draw(null);
    // Moving lines move here too (a few small pictures, about 18 frames a second, only while they are on screen).
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isAnimated(fx) && !calm) { const tick = () => { if (!c.isConnected) return; draw(performance.now()); setTimeout(tick, 55); }; tick(); }
  });
  return c;
}

export const paperSample = bg => {
  const pal = { ...theme.pal, ...((theme.night ? bg.night : bg.day) || {}) };
  const m = bg.motif && MOTIFS[bg.motif];
  const doodle = !m ? '' : m.grid ? `${motifPreview(bg.motif, theme.night)} 0 0 / ${tileSize(bg.motif) / 3}px repeat, ` : `${motifPreview(bg.motif, theme.night)} center / 40px 27px no-repeat, `;
  return el('span', { class: 'paperprev', 'aria-hidden': 'true', style: { background: `${doodle}repeating-linear-gradient(transparent 0 7px, ${pal.ruling} 7px 8px), ${pal.paper}` } });
};

/** [tab]: 'pencils' (default), 'paper', 'pings' or 'gems'. */
export function shopDialog(onDone, tab = 'pencils') {
  let d, selected = '', busy = false;
  const col = el('div', { class: 'col' });
  const refreshTheme = () => { applyTheme(); onThemeChange.forEach(f => f()); };
  const gemsHere = gemsOn();
  if (tab === 'gems' && !gemsHere) tab = 'pencils';
  /** Premium goods show only where gems can be bought (or once owned). */
  const shown = id => { const g = goodById(id); return !g || !g.premium || gemsHere || store.owned.includes(id); };

  /** One thing on a shelf: its picture, its name, and what it costs (or "yours"). */
  const good = (id, picture, name, { inUse = false, onUse = null } = {}) => {
    const g = goodById(id);
    const owned = !g || store.owned.includes(id);
    const gemPrice = g && g.currency === 'gems';
    const b = el('button', { type: 'button', class: 'good' + (inUse ? ' sel' : ''), 'aria-pressed': inUse || (id && id === selected) ? 'true' : 'false',
      'aria-label': `${name}, ${owned ? 'yours' : g.price + (gemPrice ? ' gems' : ' points')}` },
      picture, el('span', { class: 'gname', text: name }), el('span', { class: 'gprice', text: owned ? (inUse ? 'in use' : 'yours') : (gemPrice ? '💎 ' : '') + g.price }));
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
        ...PENCIL_GOODS.filter(p => shown(p.id)).map(p => good(p.id, scribble(p.pencil), p.name, { inUse: store.pencil === p.pencil, onUse: () => { store.pencil = p.pencil; refreshTheme(); } })));
    }
    if (tab === 'paper') {
      return el('div', { class: 'shelf' }, ...BACKGROUNDS.filter(b => shown('bg-' + b.id)).map(b => good(b.price ? 'bg-' + b.id : '', paperSample(b), b.name,
        { inUse: store.background === b.id, onUse: () => { store.background = b.id; refreshTheme(); } })));
    }
    if (tab === 'gems') return gemShelf();
    return el('div', { class: 'shelf pings' }, ...PING_PACKS.filter(p => shown('pings-' + p.id)).map(p => good(p.price ? 'pings-' + p.id : '',
      el('span', { class: 'glyphs', 'aria-hidden': 'true', text: p.kinds.map(k => k.glyph).join(' ') }), p.name)));
  };

  /** Gems tab: the five packs (prices from Play), Remove ads, and a way to ask Play again. */
  const gemShelf = () => {
    const price = prices();
    return el('div', { class: 'shelf' }, ...GEM_PACKS.filter(p => price[p.id]).map(p => {
      const b = el('button', { type: 'button', class: 'good', 'aria-pressed': p.id === selected ? 'true' : 'false', 'aria-label': `${num(p.gems)} gems, ${price[p.id]}` },
        el('span', { class: 'glyphs', 'aria-hidden': 'true', text: '💎' }), el('span', { class: 'gname', text: num(p.gems) }), el('span', { class: 'gprice', text: price[p.id] }));
      b.addEventListener('click', () => { selected = p.id === selected ? '' : p.id; build(); });
      return p.id === selected ? sk(b, { kind: 'ring', stroke: 'accent' }) : b;
    }));
  };

  /** Play's sheet for a pack or Remove ads. The gems arrive by themselves (gems.js), then the store redraws. */
  const fromPlay = async id => {
    if (busy) return;
    busy = true; build();
    const r = await buyFromPlay(id);
    busy = false;
    if (r === 'ok') selected = '';
    note = r === 'pending' ? 'Waiting for the payment to go through.' : r === 'error' ? 'That didn\'t work. Try again in a moment.' : '';
    build();
  };
  let note = '';

  const build = () => {
    const tabs = [['pencils', 'Pencils'], ['paper', 'Paper'], ['pings', 'Pings'], ...(gemsHere ? [['gems', 'Gems']] : [])];
    const head = tab === 'gems' ? `${num(store.gems)} gems` : `${num(store.balance)} point${store.balance === 1 ? '' : 's'} to spend` + (gemsHere ? ` · ${num(store.gems)} 💎` : '');
    const kids = [
      el('div', { class: 'center' }, text(head, { size: 18, color: 'inkSoft' })),
      el('div', { class: 'row gap6' }, ...tabs.map(([k, label]) =>
        chip(label, tab === k, () => { tab = k; selected = ''; note = ''; build(); }))),
      shelf(),
    ];
    const g = selected ? goodById(selected) : null;
    if (tab === 'gems') {
      const pack = GEM_PACKS.find(p => p.id === selected);
      if (pack) {
        const b = button(`Buy ${num(pack.gems)} gems · ${prices()[pack.id] || ''}`, () => fromPlay(pack.id), { size: 19, kind: 'primary' });
        b.classList.toggle('dim', busy);
        kids.push(el('div', { class: 'gap8' }, b));
        if (pack.extra) kids.push(text(`Includes ${num(pack.extra)} extra.`, { size: 15, color: 'inkSoft', cls: 'center' }));
      }
      if (canRemoveAds()) kids.push(el('div', { class: 'gap8 center' }, button(`Remove ads · ${prices()[REMOVE_ADS]}`, () => fromPlay(REMOVE_ADS), { size: 17, kind: 'outline' })));
      else if (adsRemoved()) kids.push(text('No ads. Thank you!', { size: 15, color: 'inkSoft', cls: 'center' }));
      if (note) kids.push(text(note, { size: 15, color: 'inkSoft', cls: 'center' }));
      kids.push(el('div', { class: 'gap8 center' }, button('Restore purchases', () => { restore(); note = 'Asked Google Play again.'; build(); }, { size: 15, kind: 'link' })));
      kids.push(text('Gems stay on this phone.', { size: 14, color: 'inkSoft', cls: 'center' }));
    } else if (g) {
      const gemPrice = g.currency === 'gems';
      const can = canBuy(g.id, gemPrice ? store.gems : store.balance, store.owned);
      const buy = button(`Buy ${g.name} · ${gemPrice ? '💎 ' : ''}${g.price}`, () => { if (store.buy(g.id)) { selected = ''; if (g.kind === 'pencil') store.pencil = PENCIL_GOODS.find(p => p.id === g.id).pencil; if (g.kind === 'background') store.background = g.id.slice(3); refreshTheme(); build(); } }, { size: 19, kind: 'primary' });
      buy.classList.toggle('dim', !can.ok);
      kids.push(el('div', { class: 'gap8' }, buy));
      if (!can.ok && can.why === 'short' && !gemPrice) kids.push(text(`${can.need} more points. Finish a puzzle to earn them.`, { size: 15, color: 'inkSoft', cls: 'center' }));
      if (!can.ok && can.why === 'short' && gemPrice) kids.push(el('div', { class: 'gap8 center' }, button(`${num(can.need)} more gems`, () => { tab = 'gems'; selected = ''; build(); }, { size: 15, kind: 'link' })));
    } else if (tab === 'pings') {
      kids.push(text('Hold Ping in co-op to send one.', { size: 15, color: 'inkSoft', cls: 'center' }));
    }
    kids.push(el('div', { class: 'gap8 center' }, button('Wardrobe', () => { d.close(); wardrobeDialog(onDone); }, { size: 17, kind: 'link' })));
    col.replaceChildren(...kids);
  };
  build();
  const off = onGemsChange(() => { if (col.isConnected) build(); });
  d = dialog(col, { onClose: () => { off(); if (onDone) onDone(); } });
  return d;
}
