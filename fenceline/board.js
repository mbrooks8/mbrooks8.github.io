// The playing board for any tiling, drawn on a canvas. A port of BoardView.kt.
// Tap a gap to cycle fence -> X -> empty, long-press for X, pinch (or wheel) to zoom,
// drag with one or two fingers to move the board. Dragging never draws.
import { Edge } from './core.js';
import { pencilLine, pencilCircle, pencilHatch, blend, rgba } from './sketch.js';

const PING_MS = 2500;

export class BoardView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = null;
    this.palette = null;
    this.pencilColor = '#B5533C';
    this.showErrors = true;
    this.haptics = true;
    this.plainNumbers = false;
    this.crossPen = false;
    this.locked = false;
    this.onChanged = null;
    this.guideEdges = new Set();
    this.onlyGuided = false;
    this.onOffGuide = null;
    this.scale = 1; this.fitScale = 1; this.offX = 0; this.offY = 0;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.hintEdge = -1; this.hintCell = -1; this.hintVertex = -1; this.hintOn = false;
    this.flashEdges = []; this.flashOn = false;
    this.solvedReveal = 0;
    this.revealStart = 0;
    this.frame = 0;
    this.pointers = new Map();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.bindInput();
  }

  setGame(g) {
    this.game = g;
    this.solvedReveal = g && g.isSolved() ? 1 : 0;
    this.revealStart = 0;
    this.clearHighlights(false);
    this.resetZoom();
  }

  destroy() { this.ro.disconnect(); this.game = null; }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.resetZoom();
  }

  resetZoom() {
    const g = this.game && this.game.grid;
    if (!g || !this.w) { this.invalidate(); return; }
    const pad = 0.6 * g.edgeLength;
    const bw = g.maxX - g.minX + 2 * pad, bh = g.maxY - g.minY + 2 * pad;
    this.fitScale = Math.min(this.w / bw, this.h / bh);
    this.scale = this.fitScale;
    this.offX = this.w / 2 - (g.minX + g.maxX) / 2 * this.scale;
    this.offY = this.h / 2 - (g.minY + g.maxY) / 2 * this.scale;
    this.invalidate();
  }

  showHint(edge, cell, vertex) { this.hintEdge = edge; this.hintCell = cell; this.hintVertex = vertex; this.hintOn = true; this.invalidate(); }
  flashMistakes(edges) { this.flashEdges = edges; this.flashOn = true; this.invalidate(); }
  clearHighlights(redraw = true) { this.hintOn = false; this.flashOn = false; if (redraw) this.invalidate(); }
  setGuide(edges, only) { this.guideEdges = new Set(edges); this.onlyGuided = only; this.invalidate(); }

  playSolved() {
    this.solvedReveal = 0.0001;
    this.revealStart = performance.now();
    this.invalidate();
  }

  invalidate() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); });
  }

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
        const t = Math.min(1, (performance.now() - this.revealStart) / 1400);
        this.solvedReveal = t < 1 ? 1 - Math.pow(1 - t, 2) : 1;
        if (t < 1) animate = true; else this.revealStart = 0;
      }
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
        const col = gm.hinted[e] ? blend(this.pencilColor, pal.hint, 0.45) : this.pencilColor;
        pencilLine(ctx, x0 + ix, y0 + iy, x1 - ix, y1 - iy, col, lineW, e * 7919 + 3);
      }
    }

    // Dots.
    const dotR = Math.max(2.5, unit * 0.055);
    for (let v = 0; v < g.vertexCount; v++) {
      ctx.fillStyle = this.showErrors && gm.vertexError(v) ? pal.error : pal.ink;
      const j = (((v * 7) % 5) - 2) * 0.15;
      ctx.beginPath(); ctx.arc(this.sx(g, v) + j, this.sy(g, v) - j, dotR, 0, 6.2832); ctx.fill();
    }

    // Clues.
    const size = Math.min(inr * 1.12, unit * 0.62);
    ctx.font = `${size}px "Coming Soon", "Chalkboard SE", "Bradley Hand", "Comic Sans MS", cursive`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let cell = 0; cell < g.cellCount; cell++) {
      const k = gm.puzzle.clues[cell];
      if (k < 0) continue;
      const status = gm.clueStatus(cell);
      let col = pal.ink, alpha = 1;
      if (status === 'OVER' && this.showErrors) col = pal.error;
      else if (status === 'DONE' && !this.plainNumbers) { col = pal.done; alpha = 200 / 255; }
      ctx.fillStyle = rgba(col, alpha);
      // Draw twice, a hair apart, for a pencil-bold look.
      const x = this.cx(g, cell), y = this.cy(g, cell) + size * 0.06;
      ctx.fillText(String(k), x, y);
      ctx.fillText(String(k), x + size * 0.025, y);
    }
    if (animate) this.invalidate();
  }

  /** Cells inside the drawn loop: everything not reachable from the border without crossing fence. */
  insideCells(gm) {
    const g = gm.grid;
    const outside = new Uint8Array(g.cellCount);
    const stack = [];
    for (let e = 0; e < g.edgeCount; e++) {
      if (g.edgeCells[e].length === 1 && gm.marks[e] !== Edge.LINE) {
        const c = g.edgeCells[e][0];
        if (!outside[c]) { outside[c] = 1; stack.push(c); }
      }
    }
    while (stack.length) {
      const c = stack.pop();
      for (const e of g.cellEdges[c]) {
        if (gm.marks[e] === Edge.LINE) continue;
        for (const n of g.edgeCells[e]) if (!outside[n]) { outside[n] = 1; stack.push(n); }
      }
    }
    return Array.from(outside, o => !o);
  }

  // ---- input ----------------------------------------------------------------

  /** Nearest gap to a point (css px in the canvas), or -1 if none is close. */
  edgeAt(x, y) {
    const g = this.game && this.game.grid;
    if (!g) return -1;
    const bx = (x - this.offX) / this.scale, by = (y - this.offY) / this.scale;
    let best = -1, bestD = g.edgeLength * 0.45;
    for (let e = 0; e < g.edgeCount; e++) {
      const a = g.edgeVertices[2 * e], b = g.edgeVertices[2 * e + 1];
      const dx = g.vx[b] - g.vx[a], dy = g.vy[b] - g.vy[a];
      const len2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((bx - g.vx[a]) * dx + (by - g.vy[a]) * dy) / len2));
      const dd = Math.hypot(bx - (g.vx[a] + t * dx), by - (g.vy[a] + t * dy));
      if (dd < bestD) { bestD = dd; best = e; }
    }
    return best;
  }

  buzz(ms = 8) { if (this.haptics && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }

  clampPan() {
    const g = this.game && this.game.grid;
    if (!g) return;
    const bw = (g.maxX - g.minX) * this.scale, bh = (g.maxY - g.minY) * this.scale;
    const m = g.edgeLength * this.scale;
    const left = this.offX + g.minX * this.scale, top = this.offY + g.minY * this.scale;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const newLeft = bw + 2 * m <= this.w ? (this.w - bw) / 2 : clamp(left, this.w - bw - m, m);
    const newTop = bh + 2 * m <= this.h ? (this.h - bh) / 2 : clamp(top, this.h - bh - m, m);
    this.offX += newLeft - left; this.offY += newTop - top;
  }

  zoomAt(fx, fy, factor) {
    const ns = Math.max(this.fitScale, Math.min(this.fitScale * 4, this.scale * factor));
    const k = ns / this.scale;
    this.offX = fx - (fx - this.offX) * k;
    this.offY = fy - (fy - this.offY) * k;
    this.scale = ns;
    this.clampPan(); this.invalidate();
  }

  tapEdge(x, y, long) {
    const gm = this.game;
    if (!gm || this.locked) return;
    const edge = this.edgeAt(x, y);
    if (edge < 0) return;
    if (this.onlyGuided && !this.guideEdges.has(edge)) { this.onOffGuide && this.onOffGuide(); return; }
    if (long || this.crossPen) gm.setMark(edge, gm.marks[edge] === Edge.CROSS ? Edge.UNKNOWN : Edge.CROSS);
    else gm.cycle(edge);
    this.buzz(long ? 25 : 8);
    this.clearHighlights();
    this.onChanged && this.onChanged();
  }

  bindInput() {
    const c = this.canvas;
    const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    let downX = 0, downY = 0, lastX = 0, lastY = 0, moved = false, multi = false;
    let longTimer = 0, longFired = false, pinchDist = 0, lastTapAt = 0, lastTapX = 0, lastTapY = 0;
    const cancelLong = () => { if (longTimer) { clearTimeout(longTimer); longTimer = 0; } };
    const mid = () => {
      const ps = [...this.pointers.values()];
      return [(ps[0][0] + ps[1][0]) / 2, (ps[0][1] + ps[1][1]) / 2, Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1])];
    };

    c.addEventListener('pointerdown', e => {
      if (!this.game) return;
      e.preventDefault();
      try { c.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      const [x, y] = pos(e);
      this.pointers.set(e.pointerId, [x, y]);
      if (this.pointers.size === 1) {
        multi = false; moved = false; longFired = false;
        downX = lastX = x; downY = lastY = y;
        cancelLong();
        longTimer = setTimeout(() => {
          longTimer = 0;
          if (!moved && !multi) { longFired = true; this.tapEdge(downX, downY, true); }
        }, 450);
      } else if (this.pointers.size === 2) {
        multi = true; cancelLong();
        [lastX, lastY, pinchDist] = mid();
      }
    });
    c.addEventListener('pointermove', e => {
      if (!this.pointers.has(e.pointerId)) return;
      const [x, y] = pos(e);
      this.pointers.set(e.pointerId, [x, y]);
      if (multi && this.pointers.size >= 2) {
        const [mx, my, dist] = mid();
        this.offX += mx - lastX; this.offY += my - lastY;
        lastX = mx; lastY = my;
        if (pinchDist > 0 && dist > 0) this.zoomAt(mx, my, dist / pinchDist);
        pinchDist = dist;
        this.clampPan(); this.invalidate();
      } else if (!multi) {
        if (!moved && Math.hypot(x - downX, y - downY) > 12) { moved = true; cancelLong(); }
        if (moved) {
          this.offX += x - lastX; this.offY += y - lastY;
          this.clampPan(); this.invalidate();
        }
        lastX = x; lastY = y;
      }
    });
    const up = e => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size > 0) {
        if (this.pointers.size === 1) { const p = [...this.pointers.values()][0]; lastX = p[0]; lastY = p[1]; }
        return;
      }
      cancelLong();
      if (e.type === 'pointercancel' || multi || moved || longFired) return;
      const [x, y] = pos(e);
      const now = performance.now();
      const edge = this.edgeAt(x, y);
      // Double tap away from any gap resets the zoom.
      if (edge < 0 && now - lastTapAt < 350 && Math.hypot(x - lastTapX, y - lastTapY) < 30) { this.resetZoom(); lastTapAt = 0; return; }
      lastTapAt = now; lastTapX = x; lastTapY = y;
      this.tapEdge(x, y, false);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const [x, y] = pos(e);
      if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) this.zoomAt(x, y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
      else { this.offX -= e.deltaX; this.clampPan(); this.invalidate(); }
    }, { passive: false });
  }
}
