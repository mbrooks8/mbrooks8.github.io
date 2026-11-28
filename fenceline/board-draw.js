// Drawing the board: paper, dots, clues, fences, X marks, highlights, pings. Called once per frame.
import { CONFETTI_MS, GLOW_FADE_MS } from './board-celebrate.js';
import { Edge } from './core.js';
import { pingGlyph } from './pings.js';
import { pencilHatch, rgba, blend, pencilLine, pencilCircle } from './sketch.js';


const PING_MS = 2500;

/** Methods of BoardView (mixed in by board.js). */
export class BoardDraw {
  sx(g, v) { return this.offX + g.vx[v] * this.scale; }
  sy(g, v) { return this.offY + g.vy[v] * this.scale; }
  cx(g, c) { return this.offX + g.cellCenterX[c] * this.scale; }
  cy(g, c) { return this.offY + g.cellCenterY[c] * this.scale; }
  edgeMid(g, e) {
    const a = g.edgeVertices[2 * e], b = g.edgeVertices[2 * e + 1];
    return [(this.sx(g, a) + this.sx(g, b)) / 2, (this.sy(g, a) + this.sy(g, b)) / 2];
  }

  draw() {
    const ctx = this.ctx, gm = this.game, pal = this.palette;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!gm || !pal) return;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const g = gm.grid;
    const unit = g.edgeLength * this.scale;
    const lineW = Math.max(3, unit * 0.12);
    let animate = false;

    // Faint guide lines for non-square boards, where the cell outline isn't obvious from dots.
    if (g.shape.code !== '') {
      ctx.save();
      ctx.strokeStyle = rgba(pal.inkSoft, 45 / 255);
      ctx.lineWidth = Math.max(1, lineW * 0.18);
      ctx.beginPath();
      for (let e = 0; e < g.edgeCount; e++) {
        if (gm.marks[e] !== Edge.UNKNOWN) continue;
        const a = g.edgeVertices[2 * e], b = g.edgeVertices[2 * e + 1];
        ctx.moveTo(this.sx(g, a), this.sy(g, a)); ctx.lineTo(this.sx(g, b), this.sy(g, b));
      }
      ctx.stroke();
      ctx.restore();
    }

    // Solved: shade the inside of the loop with pencil hatching.
    if (this.solvedReveal > 0) {
      if (this.revealStart) {
        const t = Math.max(0, Math.min(1, (performance.now() - this.revealStart) / 2000));
        this.solvedReveal = t < 1 ? Math.max(0.0001, 1 - Math.pow(1 - t, 2)) : 1;
        if (t < 1) animate = true; else this.revealStart = 0;
      }
      if (this.revealStart && performance.now() < this.revealStart) animate = true; else {
      const inside = this.insideCells(gm);
      const limit = g.minY + (g.maxY - g.minY) * this.solvedReveal;
      for (let c = 0; c < g.cellCount; c++) {
        if (!inside[c] || g.cellCenterY[c] > limit + 0.5) continue;
        const vs = g.cellVertices[c];
        ctx.save();
        ctx.beginPath();
        vs.forEach((v, i) => i === 0 ? ctx.moveTo(this.sx(g, v), this.sy(g, v)) : ctx.lineTo(this.sx(g, v), this.sy(g, v)));
        ctx.closePath();
        ctx.clip();
        let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
        for (const v of vs) { const x = this.sx(g, v), y = this.sy(g, v); l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); }
        pencilHatch(ctx, l, t, r, b, this.pencilColor, unit / 6, c * 131);
        ctx.restore();
      }
      }
    }

    const inr = g.cellInnerRadius * this.scale;
    const glow = (color, alpha, width, edges) => {
      ctx.save();
      ctx.strokeStyle = rgba(color, alpha); ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const e of edges) {
        const a = g.edgeVertices[2 * e], b = g.edgeVertices[2 * e + 1];
        ctx.moveTo(this.sx(g, a), this.sy(g, a)); ctx.lineTo(this.sx(g, b), this.sy(g, b));
      }
      ctx.stroke();
      ctx.restore();
    };
    if (this.hintOn) {
      if (this.hintEdge >= 0) {
        glow(pal.hint, 110 / 255, lineW * 3.2, [this.hintEdge]);
        const [mx, my] = this.edgeMid(g, this.hintEdge);
        pencilCircle(ctx, mx, my, unit * 0.62, pal.hint, lineW * 0.7, this.hintEdge);
      }
      if (this.hintCell >= 0) pencilCircle(ctx, this.cx(g, this.hintCell), this.cy(g, this.hintCell), inr * 0.85, pal.hint, lineW * 0.8, 7);
      if (this.hintVertex >= 0) pencilCircle(ctx, this.sx(g, this.hintVertex), this.sy(g, this.hintVertex), unit * 0.28, pal.hint, lineW * 0.8, 9);
    }
    if (this.guideEdges.size) {
      // A slow pulse, so the eye finds it.
      const t = (performance.now() % 1400) / 1400;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI);
      glow(pal.hint, (70 + 110 * pulse) / 255, lineW * 3.4, this.guideEdges);
      if (this.guideEdges.size <= 2) for (const e of this.guideEdges) {
        const [mx, my] = this.edgeMid(g, e);
        pencilCircle(ctx, mx, my, unit * (0.36 + 0.06 * pulse), pal.hint, lineW * 0.7, e);
      }
      animate = true;
    }
    if (this.flashOn) {
      glow(pal.error, 120 / 255, lineW * 3, this.flashEdges);
      for (const e of this.flashEdges) {
        const [mx, my] = this.edgeMid(g, e);
        pencilCircle(ctx, mx, my, unit * 0.42, pal.error, lineW * 0.7, e);
      }
    }

    // Crosses and fences.
    for (let e = 0; e < g.edgeCount; e++) {
      const m = gm.marks[e];
      if (m === Edge.UNKNOWN) continue;
      const a = g.edgeVertices[2 * e], b = g.edgeVertices[2 * e + 1];
      const x0 = this.sx(g, a), y0 = this.sy(g, a), x1 = this.sx(g, b), y1 = this.sy(g, b);
      if (m === Edge.CROSS) {
        const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2, s = unit * 0.09;
        const col = gm.hinted[e] ? pal.hint : pal.inkSoft;
        pencilLine(ctx, cxm - s, cym - s, cxm + s, cym + s, col, lineW * 0.55, e * 31, 2);
        pencilLine(ctx, cxm - s, cym + s, cxm + s, cym - s, col, lineW * 0.55, e * 37, 2);
      } else {
        const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
        const ix = (x1 - x0) / len * unit * 0.04, iy = (y1 - y0) / len * unit * 0.04;
        const who = this.ownerColors && gm.owner ? gm.owner[e] : -1;
        const base = (who >= 0 && this.ownerColors[who]) || this.pencilColor;
        const col = gm.hinted[e] ? blend(base, pal.hint, 0.45) : base;
        const style = (who >= 0 && this.ownerStyles && this.ownerStyles[who]) || 'solid';
        const ax = x0 + ix, ay = y0 + iy, bx = x1 - ix, by = y1 - iy;
        if (style === 'solid') pencilLine(ctx, ax, ay, bx, by, col, lineW, e * 7919 + 3);
        else {
          // Dashed or dotted, so players who share a colour still look different.
          const parts = style === 'dashed' ? [[0, 0.38], [0.62, 1]] : [[0.17, 0.21], [0.48, 0.52], [0.79, 0.83]];
          parts.forEach(([p, q], k) => pencilLine(ctx, ax + (bx - ax) * p, ay + (by - ay) * p, ax + (bx - ax) * q, ay + (by - ay) * q, col, lineW, e * 7919 + 3 + k));
        }
      }
    }

    // Win: a warm glow runs round the loop behind a bright pencil tip, then fades.
    if (this.traceStart && this.loopPath) {
      const now = performance.now();
      const t = (now - this.traceStart) / this.traceMs;
      const path = this.loopPath, n = path.length;
      const f = Math.min(1, t), eased = 1 - Math.pow(1 - f, 1.6);
      const fade = t <= 1 ? 1 : Math.max(0, 1 - (now - this.traceStart - this.traceMs) / GLOW_FADE_MS);
      if (fade <= 0) { this.traceStart = 0; }
      else {
        const upto = eased * n;
        const full = Math.floor(upto);
        const pt = i => { const v = path[i % n]; return [this.sx(g, v), this.sy(g, v)]; };
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const stroke = (width, alpha) => {
          ctx.strokeStyle = rgba(pal.hint, alpha * fade); ctx.lineWidth = width;
          ctx.beginPath();
          let [x, y] = pt(0); ctx.moveTo(x, y);
          for (let i = 1; i <= Math.min(full, n); i++) { [x, y] = pt(i); ctx.lineTo(x, y); }
          if (full < n) {
            const [ax, ay] = pt(full), [bx, by] = pt(full + 1), k = upto - full;
            ctx.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k);
          }
          ctx.stroke();
        };
        stroke(lineW * 4.2, 0.22);
        stroke(lineW * 2.2, 0.38);
        if (f < 1) {
          const [ax, ay] = pt(full), [bx, by] = pt(full + 1), k = upto - full;
          const hx = ax + (bx - ax) * k, hy = ay + (by - ay) * k;
          ctx.fillStyle = rgba(pal.hint, 0.9);
          ctx.beginPath(); ctx.arc(hx, hy, lineW * 1.1, 0, 6.2832); ctx.fill();
          pencilCircle(ctx, hx, hy, lineW * 2.2, pal.hint, lineW * 0.45, full);
        }
        ctx.restore();
        animate = true;
      }
    }

    // Pings ("look here"): three rings growing out from the spot.
    if (this.pings.length) {
      const now = performance.now();
      this.pings = this.pings.filter(p => now - p.start <= PING_MS);
      for (const pm of this.pings) {
        const t = (now - pm.start) / PING_MS;
        for (let k = 0; k <= 2; k++) {
          const r = (t * 3 + k / 3) % 1;
          ctx.save();
          ctx.strokeStyle = pm.color;
          ctx.globalAlpha = Math.max(0, Math.min(1, (1 - r) * (230 / 255) * (1 - t * 0.5)));
          ctx.lineWidth = lineW * 0.6;
          ctx.beginPath(); ctx.arc(this.offX + pm.x * this.scale, this.offY + pm.y * this.scale, unit * (0.15 + r * 0.6), 0, 6.2832); ctx.stroke();
          ctx.restore();
        }
      }
      // A feeling ping also floats its emoji up from the spot, on a small paper disc ringed in the player's pencil.
      for (const pm of this.pings) {
        const glyph = pingGlyph(pm.kind);
        if (!glyph) continue;
        const t = (now - pm.start) / PING_MS;
        const px = this.offX + pm.x * this.scale, py = this.offY + pm.y * this.scale - unit * (0.5 + 0.35 * Math.min(1, t * 3));
        const size = unit * 0.62;
        ctx.save();
        ctx.globalAlpha = t > 0.7 ? Math.max(0, (1 - t) / 0.3) : 1;
        ctx.fillStyle = 'rgba(245,237,220,.9)';
        ctx.strokeStyle = pm.color; ctx.lineWidth = lineW * 0.7;
        ctx.beginPath(); ctx.arc(px, py, size * 0.75, 0, 6.2832); ctx.fill(); ctx.stroke();
        ctx.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(glyph, px, py + size * 0.05);
        ctx.restore();
      }
      if (this.pings.length) animate = true;
    }

    // Dots.
    const dotR = Math.max(2.5, unit * 0.055);
    for (let v = 0; v < g.vertexCount; v++) {
      const bad = this.showErrors && gm.vertexError(v);
      ctx.fillStyle = bad ? pal.error : pal.ink;
      const j = (((v * 7) % 5) - 2) * 0.15;
      ctx.beginPath(); ctx.arc(this.sx(g, v) + j, this.sy(g, v) - j, dotR, 0, 6.2832); ctx.fill();
      // A ring too, so a wrong dot doesn't rely on colour alone.
      if (bad) pencilCircle(ctx, this.sx(g, v), this.sy(g, v), dotR * 2.6, pal.error, lineW * 0.5, v * 13 + 5);
    }

    // Clues.
    const size = Math.min(inr * 1.12, unit * 0.62);
    ctx.font = `${size}px "Coming Soon", "Chalkboard SE", "Bradley Hand", "Comic Sans MS", cursive`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let cell = 0; cell < g.cellCount; cell++) {
      const k = gm.puzzle.clues[cell];
      if (k < 0) continue;
      const status = gm.clueStatus(cell);
      // Not colour alone (red/green is hard for many): a done number fades and gets a tick through it,
      // and a number with too many fences gets circled.
      const over = status === 'OVER' && this.showErrors;
      const done = !over && status === 'DONE' && !this.plainNumbers;
      const col = over ? pal.error : done ? blend(pal.inkSoft, pal.paper, 0.3) : pal.ink;
      ctx.fillStyle = col;
      // Draw twice, a hair apart, for a pencil-bold look.
      const x = this.cx(g, cell), y = this.cy(g, cell) + size * 0.06;
      ctx.fillText(String(k), x, y);
      ctx.fillText(String(k), x + size * 0.025, y);
      if (done) pencilLine(ctx, x - size * 0.3, y + size * 0.08, x + size * 0.32, y - size * 0.14, col, Math.max(1.5, size * 0.07), cell * 17 + 1, 2);
      if (over) pencilCircle(ctx, x, y - size * 0.04, size * 0.52, pal.error, Math.max(1.5, size * 0.08), cell * 29 + 3);
    }

    // Paper confetti, over everything.
    if (this.confettiStart) {
      const now = performance.now();
      if (now >= this.confettiStart) {
        if (!this.confetti.length) this.spawnConfetti();
        if (now - this.confettiStart > CONFETTI_MS) { this.confetti = []; this.confettiStart = 0; }
        else this.drawConfetti(ctx, now);
      }
      if (this.confettiStart) animate = true;
    }
    if (animate) this.invalidate();
  }
}
