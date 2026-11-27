// Small helpers for the hand-drawn UI: themed palette, sketchy boxes, buttons, chips and dialogs (a port of Ui.kt).
import { DAY, NIGHT, pencilColor, paperTexture, drawBox, rgba } from './sketch.js';
import { store } from './store.js';

export const theme = { night: false, pal: DAY, accent: pencilColor(0, false) };

const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function applyTheme() {
  const t = store.theme;
  theme.night = t === 'night' || (t === 'system' && !!(darkQuery && darkQuery.matches));
  theme.pal = theme.night ? NIGHT : DAY;
  theme.accent = pencilColor(store.pencil, theme.night);
  const root = document.documentElement;
  root.dataset.theme = theme.night ? 'dark' : 'light';
  const p = theme.pal;
  for (const [k, v] of Object.entries(p)) root.style.setProperty('--' + k, v);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accentTint', rgba(theme.accent, 0x22 / 255));
  root.style.setProperty('--paperImg', `url(${paperTexture(theme.night)})`);
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
  drawBox(ctx, r.width, r.height, {
    fill: color(o.fill || 'card'), stroke: color(o.stroke || 'ink'), width: o.width || 2.2,
    corner: 10, seed: o.seed, dpr,
  });
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

export function button(label, onClick, { size = 18, accent = null, cls = '' } = {}) {
  const b = el('button', { type: 'button', class: 'btn ' + cls });
  b.append(el('span', { class: 'lbl', text: label }));
  b.style.fontSize = size + 'px';
  if (accent) b.style.color = `var(--${accent})`;
  b.addEventListener('click', onClick);
  return sk(b, { stroke: accent || 'ink' });
}

export function setLabel(b, label) { b.querySelector('.lbl').textContent = label; }

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

/** A paper-card dialog holding [content]. Returns { close }. */
export function dialog(content, { cancelable = true, onClose } = {}) {
  const card = sk(el('div', { class: 'card', role: 'dialog', 'aria-modal': 'true' }), { width: 2.4 });
  const inner = el('div', { class: 'card-inner' }, content);
  card.append(inner);
  const overlay = el('div', { class: 'overlay' }, card);
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
/** The dialog on top, or null. */
export function topDialog() { return openDialogs[openDialogs.length - 1] || null; }
export function closeAllDialogs() { [...openDialogs].forEach(d => d.close()); }
