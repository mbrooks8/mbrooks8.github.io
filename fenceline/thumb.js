// Small pencil pictures of a board: dots, the fence, and the inside shaded. Used by Learn and Stats.
import { el, theme } from './ui.js';
import { pencilLine, pencilHatch } from './sketch.js';

/** Cells inside the loop given by [lines] (one flag per edge): flood from the border through open edges. */
function insideCells(grid, lines) {
  const out = new Uint8Array(grid.cellCount);
  const stack = [];
  for (let e = 0; e < grid.edgeCount; e++) {
    const cs = grid.edgeCells[e];
    if (cs.length === 1 && !lines[e] && !out[cs[0]]) { out[cs[0]] = 1; stack.push(cs[0]); }
  }
  while (stack.length) {
    const c = stack.pop();
    for (const e of grid.cellEdges[c]) {
      if (lines[e]) continue;
      for (const o of grid.edgeCells[e]) if (!out[o]) { out[o] = 1; stack.push(o); }
    }
  }
  return out.map(v => (v ? 0 : 1));
}

/**
 * A canvas showing [puzzle]. opts: lines (edge flags, default the solution), shade (shade the inside),
 * clues (write the numbers), color (fence colour), size (css px).
 */
export function thumb(puzzle, { lines = null, shade = true, clues = false, color = null, size = 54, faded = false } = {}) {
  const c = el('canvas', { class: 'thumb', 'aria-hidden': 'true' });
  c.style.width = c.style.height = size + 'px';
  const draw = () => {
    if (!puzzle) return;
    const g = puzzle.grid;
    const L = lines || puzzle.solution;
    if (!L) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(size * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 5, span = Math.max(g.maxX - g.minX, g.maxY - g.minY) || 1;
    const k = (size - 2 * pad) / span;
    const ox = pad + ((size - 2 * pad) - (g.maxX - g.minX) * k) / 2 - g.minX * k;
    const oy = pad + ((size - 2 * pad) - (g.maxY - g.minY) * k) / 2 - g.minY * k;
    const X = v => ox + g.vx[v] * k, Y = v => oy + g.vy[v] * k;
    const pen = faded ? theme.pal.inkSoft : (color || theme.accent);
    if (shade) {
      const inside = insideCells(g, L);
      ctx.save();
      ctx.beginPath();
      for (let cell = 0; cell < g.cellCount; cell++) {
        if (!inside[cell]) continue;
        const vs = g.cellVertices[cell];
        vs.forEach((v, i) => (i ? ctx.lineTo(X(v), Y(v)) : ctx.moveTo(X(v), Y(v))));
        ctx.closePath();
      }
      ctx.clip();
      pencilHatch(ctx, 0, 0, size, size, pen, 3.2, 7);
      ctx.restore();
    }
    for (let e = 0; e < g.edgeCount; e++) {
      if (!L[e]) continue;
      const a = g.edgeVertices[2 * e], b = g.edgeVertices[2 * e + 1];
      pencilLine(ctx, X(a), Y(a), X(b), Y(b), pen, 2.2, e * 7 + 3, 2);
    }
    ctx.fillStyle = theme.pal.ink;
    for (let v = 0; v < g.vertexCount; v++) { ctx.beginPath(); ctx.arc(X(v), Y(v), Math.max(1, Math.min(1.8, k * 0.08)), 0, 6.283); ctx.fill(); }
    if (clues) {
      ctx.fillStyle = theme.pal.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(k * 0.55)}px "Coming Soon", cursive`;
      for (let cell = 0; cell < g.cellCount; cell++) {
        const v = puzzle.clues[cell];
        if (v < 0) continue;
        const vs = g.cellVertices[cell];
        let sx = 0, sy = 0; for (const q of vs) { sx += X(q); sy += Y(q); }
        ctx.fillText(String(v), sx / vs.length, sy / vs.length + 1);
      }
    }
  };
  c._draw = draw;
  requestAnimationFrame(draw);
  return c;
}
