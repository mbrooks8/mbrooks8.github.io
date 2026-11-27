// Coloured-pencil drawing on canvas: palette, paper, pencil strokes and hand-drawn boxes.
// (Ported from the 1.x Android app.)

// Pencils chosen to stay tellable apart with colour blindness too (red-green and blue-yellow).
export const PENCILS = [
  ['Terracotta', '#B5533C'],
  ['Indigo', '#2F4FA0'],
  ['Ochre', '#D09C30'],
  ['Rose', '#C467A6'],
  ['Graphite', '#4A4641'],
];
// The 6 colours players get, in seat order (the 5 pencils above, then Sky).
const PLAYER_DAY = ['#B5533C', '#2F4FA0', '#D09C30', '#C467A6', '#4A4641', '#48A4D8'];
const PLAYER_NIGHT = ['#F08A5D', '#6F93F2', '#F0CF5E', '#F2A2C8', '#E2DCD2', '#93E3F5'];
const STYLES = ['solid', 'dashed', 'dotted'];

export const DAY = {
  paper: '#F5EDDC', paperShade: '#EDE2CC', ink: '#4A4641', inkSoft: '#9A8F80', done: '#6A9A5B',
  error: '#D1495B', hint: '#E0A030', ruling: 'rgba(91,136,181,0.165)', card: '#FBF6EA',
};
export const NIGHT = {
  paper: '#2A2520', paperShade: '#332D27', ink: '#E8DFD0', inkSoft: '#9C9283', done: '#8FBF82',
  error: '#F08A7A', hint: '#F2C45A', ruling: 'rgba(63,110,156,0.133)', card: '#35302A',
};

/** Pencil colour for a pencil number. Past 6 the colours repeat (with a new line style, see pencilStyle);
 *  past 18 they also get a shade darker (day) or lighter (night). */
export function pencilColor(index, night) {
  const i = Math.max(0, index | 0);
  const c = (night ? PLAYER_NIGHT : PLAYER_DAY)[i % 6];
  const round = Math.floor(i / 18);
  return round % 2 ? blend(c, night ? '#FFFFFF' : '#000000', 0.3) : c;
}

/** Line style for a pencil number: solid for the first 6 players, then dashed, then dotted. */
export function pencilStyle(index) {
  return STYLES[Math.floor(Math.max(0, index | 0) / 6) % 3];
}

/** A small swatch of a player's line (colour and style), for name lists. */
export function pencilSwatch(index, night) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 10'); svg.setAttribute('width', '24'); svg.setAttribute('height', '10');
  svg.setAttribute('class', 'swatch'); svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', '3'); line.setAttribute('y1', '5'); line.setAttribute('x2', '21'); line.setAttribute('y2', '5');
  line.setAttribute('stroke', pencilColor(index, night)); line.setAttribute('stroke-width', '4'); line.setAttribute('stroke-linecap', 'round');
  const st = pencilStyle(index);
  if (st === 'dashed') line.setAttribute('stroke-dasharray', '5 4');
  if (st === 'dotted') line.setAttribute('stroke-dasharray', '2 4');
  svg.appendChild(line);
  return svg;
}

/** Small seeded random numbers, so a stroke looks the same on every frame. */
export function rng(seed) {
  let a = (seed | 0) ^ 0x9E3779B9;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, a) {
  if (!hex.startsWith('#')) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function blend(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  const c = x.map((v, i) => Math.round(v * (1 - t) + y[i] * t));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Traces a quadratic curve as short, slightly rough segments (like Android's DiscretePathEffect). */
function roughQuad(ctx, sx, sy, qx, qy, ex, ey, rnd, seg = 5, dev = 0.9) {
  const approx = Math.hypot(qx - sx, qy - sy) + Math.hypot(ex - qx, ey - qy);
  const n = Math.max(2, Math.ceil(approx / seg));
  ctx.moveTo(sx, sy);
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    let x = u * u * sx + 2 * u * t * qx + t * t * ex;
    let y = u * u * sy + 2 * u * t * qy + t * t * ey;
    if (i < n) { x += (rnd() - 0.5) * 2 * dev; y += (rnd() - 0.5) * 2 * dev; }
    ctx.lineTo(x, y);
  }
}

/** A coloured-pencil line: a few overlapping, slightly wobbly passes. */
export function pencilLine(ctx, x0, y0, x1, y1, color, width, seed, passes = 3, dpr = 1) {
  const rnd = rng(seed);
  const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
  const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < passes; i++) {
    const j = width * 0.35;
    const sx = x0 + (rnd() - .5) * j + nx * (rnd() - .5) * j;
    const sy = y0 + (rnd() - .5) * j + ny * (rnd() - .5) * j;
    const ex = x1 + (rnd() - .5) * j + nx * (rnd() - .5) * j;
    const ey = y1 + (rnd() - .5) * j + ny * (rnd() - .5) * j;
    const bow = (rnd() - .5) * width * 0.9;
    ctx.beginPath();
    roughQuad(ctx, sx, sy, (sx + ex) / 2 + nx * bow, (sy + ey) / 2 + ny * bow, ex, ey, rnd, 5 * dpr, 0.9 * dpr);
    ctx.strokeStyle = color;
    ctx.globalAlpha = i === 0 ? 235 / 255 : 120 / 255;
    ctx.lineWidth = width * (i === 0 ? 0.8 : 0.5 + rnd() * 0.3);
    ctx.stroke();
  }
  ctx.restore();
}

/** A hand-drawn circle, used for highlights. */
export function pencilCircle(ctx, cx, cy, r, color, width, seed, dpr = 1) {
  const rnd = rng(seed);
  ctx.save();
  ctx.strokeStyle = color; ctx.globalAlpha = 210 / 255; ctx.lineWidth = width;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  const start = rnd() * 6.28, steps = 28;
  for (let i = 0; i <= steps + 3; i++) {
    const a = start + i * (6.6 / steps);
    const rr = r * (1 + (rnd() - .5) * 0.08);
    const x = cx + rr * Math.cos(a) + (rnd() - .5) * 1.2 * dpr, y = cy + rr * Math.sin(a) + (rnd() - .5) * 1.2 * dpr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Diagonal hatching inside a rect (clip first), like shading with the side of a pencil. */
export function pencilHatch(ctx, l, t, r, b, color, gap, seed) {
  const rnd = rng(seed);
  ctx.save();
  ctx.strokeStyle = color; ctx.globalAlpha = 70 / 255; ctx.lineWidth = gap * 0.45;
  ctx.beginPath();
  for (let d = -(b - t); d < r - l; d += gap) {
    const o = (rnd() - .5) * gap * 0.4;
    ctx.moveTo(l + d + o, b); ctx.lineTo(l + d + (b - t) + o, t);
  }
  ctx.stroke();
  ctx.restore();
}

/** Procedural paper grain, made once per theme and tiled behind everything. */
const paperCache = {};
export function paperTexture(night) {
  const key = night ? 'n' : 'd';
  if (paperCache[key]) return paperCache[key];
  const size = 384;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rnd = rng(1234);
  g.fillStyle = night ? NIGHT.paper : DAY.paper;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 5000; i++) {
    const dark = rnd() < 0.5;
    g.fillStyle = dark ? `rgba(60,45,30,${(6 + rnd() * 12) / 255})` : `rgba(255,255,245,${(10 + rnd() * 20) / 255})`;
    g.beginPath(); g.arc(rnd() * size, rnd() * size, rnd() * 1.3 + 0.3, 0, 6.283); g.fill();
  }
  g.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    g.lineWidth = rnd() * 0.8 + 0.3;
    g.strokeStyle = `rgba(90,70,50,${(8 + rnd() * 12) / 255})`;
    const x = rnd() * size, y = rnd() * size, len = rnd() * 14 + 4, ang = rnd() * Math.PI;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + len / 2 * Math.cos(ang) + rnd() * 3, y + len / 2 * Math.sin(ang), x + len * Math.cos(ang), y + len * Math.sin(ang));
    g.stroke();
  }
  return (paperCache[key] = c.toDataURL('image/png'));
}

/** Draws a wobbly hand-drawn box (button / card) to fill a canvas of css size w x h. */
export function drawBox(ctx, w, h, { fill, stroke, width = 2.2, corner = 10, seed = 11, pressed = false, dpr = 1 }) {
  const sw = width * dpr, cr = corner * dpr;
  const inset = sw * 1.5;
  const l = inset, t = inset, r = w * dpr - inset, b = h * dpr - inset;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.globalAlpha = pressed ? 160 / 255 : 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(l, t, r - l, b - t, cr); else ctx.rect(l, t, r - l, b - t);
  ctx.fill();
  ctx.restore();
  pencilLine(ctx, l + cr * .5, t, r - cr * .3, t + 1, stroke, sw, seed, 2, dpr);
  pencilLine(ctx, r, t + cr * .4, r - 1, b - cr * .5, stroke, sw, seed + 1, 2, dpr);
  pencilLine(ctx, r - cr * .4, b, l + cr * .3, b - 1, stroke, sw, seed + 2, 2, dpr);
  pencilLine(ctx, l, b - cr * .4, l + 1, t + cr * .5, stroke, sw, seed + 3, 2, dpr);
}
