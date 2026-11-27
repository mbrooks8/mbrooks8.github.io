// The shape pickers: one cell of each board shape, drawn in pencil and ringed when picked.
import { Shape, Grid } from './core.js';
import { el, theme } from './ui.js';
import { pencilLine, pencilCircle } from './sketch.js';

/** Draws a cell of that board shape in pencil, as a picker button. */
export function shapeChip(shape, selected, onClick) {
  const b = el('button', { type: 'button', class: 'shapechip' + (selected ? ' sel' : ''), 'aria-label': shape.label, 'aria-pressed': selected ? 'true' : 'false' });
  const c = el('canvas');
  b.append(c);
  b.addEventListener('click', onClick);
  const g = Grid.create(shape, 3, 3);
  let cell = 0;
  if (shape === Shape.TRIANGLE) {
    for (let k = 0; k < g.cellCount; k++) {
      const ys = Array.from(g.cellVertices[k], v => g.vy[v]).sort((a, b2) => a - b2);
      if (ys[0] < ys[1] - 1e-6) { cell = k; break; }
    }
  }
  let pts = Array.from(g.cellVertices[cell], v => [g.vx[v], g.vy[v]]);
  if (shape === Shape.HEX) pts = pts.map(([x, y]) => [y, x]); // flat-top hexagon
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY);
  const poly = pts.map(([x, y]) => [(x - (minX + maxX) / 2) / span, (y - (minY + maxY) / 2) / span]);
  const draw = () => {
    const r = b.getBoundingClientRect();
    if (r.width < 2) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const size = Math.min(r.width, r.height) * 0.42;
    const cx = r.width / 2, cy = r.height / 2;
    const P = poly.map(([x, y]) => [cx + x * size, cy + y * size]);
    const stroke = selected ? theme.accent : theme.pal.inkSoft;
    for (let i = 0; i < P.length; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length];
      pencilLine(ctx, x0, y0, x1, y1, stroke, 1.9, shape.label.length * 31 + i, 2);
    }
    // The ring (not just the colour) shows which shape is picked.
    if (selected) pencilCircle(ctx, cx, cy, Math.min(r.width, r.height) * 0.44, theme.accent, 2, 77 + shape.label.length);
  };
  new ResizeObserver(draw).observe(b);
  return b;
}
