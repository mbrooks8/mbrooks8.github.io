// Small helpers for the hand-drawn UI: themed palette, sketchy boxes, buttons, chips and dialogs.
import { DAY, NIGHT, setPaper, pencilColor, paperTexture, drawBox, rgba, drawRing, drawShaded, drawWash, drawUnderline, inkOn } from './sketch.js';
import { icon } from './icons.js';
import { store } from './store.js';
import { backgroundById } from './cosmetics.js';
import { motifTile, motifCorner } from './stationery.js';
import { play as playSound, applyVolumes } from './sound.js';

export const theme = { night: false, pal: DAY, accent: pencilColor(0, false) };
/** In a co-op room the host's paper is used by everyone (an id from cosmetics.js, or '' for your own). */
let roomPaper = '';
export function setRoomPaper(id) { const v = id || ''; if (v === roomPaper) return false; roomPaper = v; applyTheme(); onThemeChange.forEach(f => f()); return true; }

const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function applyTheme() {
  const t = store.theme;
  const bg = backgroundById(roomPaper || store.background);
  setPaper(bg.day, bg.night);
  theme.night = t === 'night' || (t === 'system' && !!(darkQuery && darkQuery.matches));
  theme.pal = theme.night ? NIGHT : DAY;
  theme.accent = pencilColor(store.pencil, theme.night);
  const root = document.documentElement;
  root.dataset.theme = theme.night ? 'dark' : 'light';
  const p = theme.pal;
  for (const [k, v] of Object.entries(p)) root.style.setProperty('--' + k, v);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accentTint', rgba(theme.accent, 0x22 / 255));
  root.style.setProperty('--onAccent', inkOn(theme.accent, '#2E2925', '#FFF8EC'));
  root.style.setProperty('--paperImg', `url(${paperTexture(theme.night)})`);
  root.style.setProperty('--motifTile', motifTile(bg.motif, theme.night));
  root.style.setProperty('--motifCorner', motifCorner(bg.motif, theme.night));
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', p.paper);
  redrawBoxes();
}
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', () => { if (store.theme === 'system') { applyTheme(); onThemeChange.forEach(f => f()); } });
export const onThemeChange = new Set();

// ---- sketchy boxes ----

let boxSeed = 11;
const ro = new ResizeObserver(entries => { for (const e of entries) drawSk(e.target); });

function color(name) {
  if (!name) return theme.pal.ink;
  if (name === 'accent') return theme.accent;
  if (name === 'accentTint') return rgba(theme.accent, 0x22 / 255);
  if (name.startsWith('#')) return name;
  return theme.pal[name] || name;
}

function drawSk(node) {
  const c = node._skCanvas;
  if (!c) return;
  const r = node.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  const o = node._sk;
  const W = c.width, H = c.height;
  if (o.kind === 'ring') drawRing(ctx, W, H, { stroke: color(o.stroke || 'accent'), width: o.width || 2, seed: o.seed, dpr });
  else if (o.kind === 'shaded') drawShaded(ctx, W, H, { fill: color(o.fill || 'accent'), stroke: color(o.stroke || 'accent'), seed: o.seed, dpr });
  else if (o.kind === 'wash') drawWash(ctx, W, H, { fill: color(o.fill || 'accentTint'), stroke: o.stroke ? color(o.stroke) : null, dpr });
  else if (o.kind === 'under') drawUnderline(ctx, W, H, { stroke: color(o.stroke || 'inkSoft'), width: o.width || 1.8, seed: o.seed, dpr });
  else if (o.kind === 'none') { /* nothing */ } else {
    drawBox(ctx, r.width, r.height, {
      fill: color(o.fill || 'card'), stroke: color(o.stroke || 'ink'), width: o.width || 2.2,
      corner: 10, seed: o.seed, dpr,
    });
  }
}

/** Gives [node] a hand-drawn box behind its content. */
export function sk(node, opts = {}) {
  node.classList.add('sk');
  node._sk = { seed: (boxSeed++) * 17, ...opts };
  let c = node._skCanvas;
  if (!c) {
    c = document.createElement('canvas');
    c.className = 'sk-bg';
    c.setAttribute('aria-hidden', 'true');
    node.prepend(c);
    node._skCanvas = c;
    ro.observe(node);
  } else drawSk(node);
  return node;
}

export function redrawBoxes() { document.querySelectorAll('.sk').forEach(drawSk); }

// ---- elements ----

export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid);
  return n;
}

export function text(s, { size = 18, bold = false, color: col, cls = '' } = {}) {
  const n = el('div', { class: 'txt ' + cls, text: s });
  n.style.fontSize = size + 'px';
  if (bold) n.classList.add('bold');
  if (col) n.style.color = `var(--${col})`;
  return n;
}

/**
 * A pencil button. kind: 'box' (plain box, the default), 'primary' (shaded in with the pencil colour),
 * 'outline' (pencil-colour box), 'link' (underlined words) or 'plain' (just the words).
 */
export function button(label, onClick, { size = 18, accent = null, cls = '', kind = 'box', icon: ic = null, aria = null } = {}) {
  const b = el('button', { type: 'button', class: `btn btn-${kind} ` + cls });
  if (aria) b.setAttribute('aria-label', aria);
  const lbl = el('span', { class: 'lbl' });
  if (ic) lbl.append(icon(ic, Math.round(size * 1.15)));
  lbl.append(el('span', { class: 'lbltext', text: label }));
  b.append(lbl);
  b.style.fontSize = size + 'px';
  if (accent) b.style.color = `var(--${accent})`;
  b.addEventListener('click', onClick);
  if (kind === 'primary') return sk(b, { kind: 'shaded', fill: 'accent', stroke: 'accent' });
  if (kind === 'outline') return sk(b, { stroke: 'accent', fill: 'card' });
  if (kind === 'link') return sk(b, { kind: 'under', stroke: 'inkSoft' });
  if (kind === 'plain') return b;
  return sk(b, { stroke: accent || 'ink' });
}

/** A choice shown as plain words, ringed in pencil when picked (the ring is the signal, not only the colour). */
export function pick(label, selected, onClick, { size = 19, aria = null } = {}) {
  const b = el('button', { type: 'button', class: 'pick' + (selected ? ' sel' : ''), 'aria-pressed': selected ? 'true' : 'false' });
  if (aria) b.setAttribute('aria-label', aria);
  b.append(el('span', { class: 'lbl', text: label }));
  b.style.fontSize = size + 'px';
  b.addEventListener('click', onClick);
  return selected ? sk(b, { kind: 'ring', stroke: 'accent' }) : b;
}

/** A small icon button with a word under it (home screen row, game bottom bar). */
export function iconButton(name, label, onClick, { size = 26, aria = null, cls = '' } = {}) {
  const b = el('button', { type: 'button', class: 'iconlink ' + cls, 'aria-label': aria || label });
  b.append(icon(name, size));
  if (label) b.append(el('span', { class: 'iclbl', text: label }));
  b.addEventListener('click', onClick);
  return b;
}

export function setLabel(b, label) { (b.querySelector('.lbltext') || b.querySelector('.lbl')).textContent = label; }

export function chip(label, selected, onClick, { size = 16 } = {}) {
  const b = el('button', { type: 'button', class: 'chip' + (selected ? ' sel' : '') });
  b.append(el('span', { class: 'lbl', text: label }));
  b.style.fontSize = size + 'px';
  b.addEventListener('click', onClick);
  return sk(b, { fill: selected ? 'accentTint' : 'card', stroke: selected ? 'accent' : 'inkSoft', width: selected ? 2.4 : 1.6 });
}

export function row(...kids) { return el('div', { class: 'row' }, ...kids); }

// ---- dialogs ----

const openDialogs = [];

/**
 * A taped paper card holding [content]. Returns { close }.
 * place: 'center' (default), 'bottom' (win card: no dimming, so the board stays in view) or 'note'
 * (a sticky note under the top-right ⋯ button). Cancelable cards get a small × in the corner.
 */
export function dialog(content, { cancelable = true, onClose, place = 'center', closeX = true } = {}) {
  const card = el('div', { class: 'card paper place-' + place, role: 'dialog', 'aria-modal': 'true' });
  card.style.setProperty('--tilt', ((boxSeed++ % 5) - 2) * 0.25 + 'deg');
  card.append(el('div', { class: 'tape', 'aria-hidden': 'true' }));
  const inner = el('div', { class: 'card-inner' }, content);
  card.append(inner);
  const overlay = el('div', { class: 'overlay place-' + place }, card);
  let closed = false;
  const d = {
    close() {
      if (closed) return;
      closed = true;
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 140);
      const i = openDialogs.indexOf(d);
      if (i >= 0) openDialogs.splice(i, 1);
      if (onClose) onClose();
    },
    cancelable,
  };
  if (cancelable && closeX && place !== 'note') {
    const x = el('button', { type: 'button', class: 'closex', 'aria-label': 'Close' }, icon('x', 20));
    x.addEventListener('click', () => d.close());
    card.append(x);
  }
  overlay.addEventListener('click', e => { if (e.target === overlay && cancelable) d.close(); });
  document.body.append(overlay);
  openDialogs.push(d);
  return d;
}

export function closeTopDialog() {
  const d = openDialogs[openDialogs.length - 1];
  if (d && d.cancelable) { d.close(); return true; }
  return !!d;
}
// A keyboard's Escape closes the card on top, like the phone's Back button.
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openDialogs.length) { e.preventDefault(); closeTopDialog(); } });

/** The dialog on top, or null. */
export function topDialog() { return openDialogs[openDialogs.length - 1] || null; }
export function closeAllDialogs() { [...openDialogs].forEach(d => d.close()); }

/** A volume slider row for a saved setting ('sfxVolume' or 'musicVolume'); [sample] plays a sound when let go. */
export function volumeSlider(label, key, sample) {
  const input = el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(store[key]), 'aria-label': label + ' volume', class: 'vol' });
  input.addEventListener('input', () => { store[key] = +input.value; applyVolumes(); });
  if (sample) input.addEventListener('change', () => playSound(sample));
  return el('label', { class: 'volrow' }, el('span', { text: label }), input);
}
