// The playing board for any tiling, drawn on a canvas. A port of BoardView.kt.
// Tap a gap to cycle fence -> X -> empty, long-press for X, pinch (or wheel) to zoom,
// drag with one or two fingers to move the board. Dragging never draws.
import { Edge } from './core.js';
import { pencilLine, pencilCircle, pencilHatch, blend, rgba, rng } from './sketch.js';
import { vibrate } from './native.js';
import { play, playWin } from './sound.js';

const PING_MS = 2500;
const GLOW_FADE_MS = 900;
const CONFETTI_MS = 3200;
const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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
    this.locked = false;
    this.onChanged = null;
    this.guideEdges = new Set();
    this.onlyGuided = false;
    this.onOffGuide = null;
    /** Co-op: pencil colour per player id; fences are drawn in their owner's colour. */
    this.ownerColors = null;
    /** Co-op: long-pressing a dot calls this ("look here") instead of placing an X. */
    this.onPing = null;
    this.pings = [];
    this.scale = 1; this.fitScale = 1; this.offX = 0; this.offY = 0;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.hintEdge = -1; this.hintCell = -1; this.hintVertex = -1; this.hintOn = false;
    this.flashEdges = []; this.flashOn = false;
    this.solvedReveal = 0;
    this.revealStart = 0;
    // Win animation: a glow runs round the loop, then the inside is shaded and paper confetti flies.
    this.loopPath = null; this.traceStart = 0; this.traceMs = 0;
    this.confetti = []; this.confettiStart = 0;
    this.confettiColors = null;
    this.sounds = false; // only the real playing board makes sounds
    this.frame = 0;
    this.crossPen = false; // Pen: X, taps make X instead of fence
    this.drawPen = false; // Pen: Draw, drag from dot to dot to draw (two fingers move the board)
    this.pingArmed = false; // co-op Ping button: the next tap points at the nearest dot
    this.onPingDone = null;
    this.pointers = new Map();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.bindInput();
  }

  setGame(g) {
    this.game = g;
    this.solvedReveal = g && g.isSolved() ? 1 : 0;
    this.revealStart = 0;
    this.loopPath = null; this.traceStart = 0; this.confetti = [];
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

  /** Flashes a few growing rings at [vertex] in [color] for a couple of seconds. */
  showPing(vertex, color) {
    this.pings = this.pings.filter(p => p.vertex !== vertex);
    this.pings.push({ vertex, color, start: performance.now() });
    this.invalidate();
  }

  showHint(edge, cell, vertex) { this.hintEdge = edge; this.hintCell = cell; this.hintVertex = vertex; this.hintOn = true; this.invalidate(); }
  flashMistakes(edges) { this.flashEdges = edges; this.flashOn = true; this.invalidate(); }
  clearHighlights(redraw = true) { this.hintOn = false; this.flashOn = false; if (redraw) this.invalidate(); }
  setGuide(edges, only) { this.guideEdges = new Set(edges); this.onlyGuided = only; this.invalidate(); }

  /**
   * The win: a warm glow traces the loop, the inside gets shaded, and (with [celebrate]) paper confetti
   * and the win tune. Returns how long the show takes in ms, so the win card can wait for it.
   */
  playSolved({ celebrate = true } = {}) {
    const now = performance.now();
    const calm = reducedMotion();
    this.loopPath = calm ? null : this.orderLoop(this.game);
    const n = this.loopPath ? this.loopPath.length : 0;
    this.traceMs = n ? Math.max(700, Math.min(1600, 300 + n * 22)) : 0;
    this.traceStart = n ? now : 0;
    this.solvedReveal = 0.0001;
    this.revealStart = now + this.traceMs * 0.7;
    this.confetti = [];
    this.confettiStart = celebrate && !calm ? now + this.traceMs : 0;
    if (celebrate && this.sounds) playWin(this.traceMs || 600);
    this.invalidate();
    return this.traceMs + (this.confettiStart ? 1500 : 600);
  }

  /** The solved loop's vertices in order round the loop, or null. */
  orderLoop(gm) {
    const g = gm && gm.grid;
    if (!g) return null;
    let start = -1;
    for (let e = 0; e < g.edgeCount && start < 0; e++) if (gm.marks[e] === Edge.LINE) start = g.edgeVertices[2 * e];
    if (start < 0) return null;
    // Start from the top-left-most dot on the loop, so it reads like a pencil starting a drawing.
    for (let v = 0; v < g.vertexCount; v++) {
      if (!g.vertexEdges[v].some(e => gm.marks[e] === Edge.LINE)) continue;
      if (g.vy[v] + g.vx[v] * 0.5 < g.vy[start] + g.vx[start] * 0.5) start = v;
    }
    const path = [start];
    let prevE = -1, v = start;
    for (let guard = 0; guard <= g.edgeCount; guard++) {
      const next = g.vertexEdges[v].find(e => e !== prevE && gm.marks[e] === Edge.LINE);
      if (next === undefined) return null;
      v = g.otherEnd(next, v); prevE = next;
      if (v === start) return path;
      path.push(v);
    }
    return null;
  }

  spawnConfetti() {
    const cols = this.confettiColors || [this.pencilColor, this.palette.hint, this.palette.done];
    const r = rng(Math.floor(performance.now()));
    const count = Math.round(Math.min(120, Math.max(60, this.w * this.h / 4000)));
    const unit = Math.max(10, Math.min(20, Math.min(this.w, this.h) / 30));
    for (let i = 0; i < count; i++) {
      // Two handfuls tossed up from the bottom corners, plus a few drifting down from the top.
      const side = i % 3, fromTop = side === 2;
      const x = fromTop ? r() * this.w : side === 0 ? this.w * (0.05 + r() * 0.15) : this.w * (0.8 + r() * 0.15);
      const y = fromTop ? -unit * (1 + r() * 6) : this.h + unit;
      const ang = -Math.PI / 2 + 0.12 + r() * 0.45; // up and a little inward
      const speed = fromTop ? 0 : (0.9 + r() * 0.5) * Math.sqrt(this.h) / 19;
      this.confetti.push({
        x, y, vx: fromTop ? (r() - 0.5) * 0.04 : Math.cos(ang) * speed * (side === 0 ? 1 : -1), vy: fromTop ? 0.03 + r() * 0.04 : Math.sin(ang) * speed,
        rot: r() * 6.28, vr: (r() - 0.5) * 0.012, flip: r() * 6.28, vf: 0.006 + r() * 0.01,
        w: unit * (0.6 + r() * 0.7), h: unit * (0.3 + r() * 0.35), kind: Math.floor(r() * 4),
        color: cols[Math.floor(r() * cols.length)], seed: Math.floor(r() * 1e6), delay: fromTop ? r() * 500 : r() * 160,
      });
    }
    this.lastConfettiAt = performance.now();
    if (this.sounds) play('rustle');
  }

  drawConfetti(ctx, now) {
    const dt = Math.min(40, now - (this.lastConfettiAt || now));
    this.lastConfettiAt = now;
    const age = now - this.confettiStart;
    const fade = Math.max(0, Math.min(1, (CONFETTI_MS - age) / 700));
    const g = 0.0016; // gravity, px/ms²
    for (const p of this.confetti) {
      if (age < p.delay) continue;
      p.vy += g * dt;
      // Paper has a lot of air drag: it soon floats down at a gentle speed, swaying.
      const drag = Math.pow(0.997, dt);
      p.vx *= Math.pow(0.9985, dt);
      if (p.vy > 0.11) p.vy = 0.11 + (p.vy - 0.11) * drag;
      p.flip += p.vf * dt; p.rot += p.vr * dt;
      p.x += (p.vx + Math.sin(p.flip * 0.7) * 0.03) * dt; p.y += p.vy * dt;
      ctx.save();
      ctx.globalAlpha = 0.92 * fade;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.scale(1, Math.max(0.3, Math.abs(Math.cos(p.flip)))); // tumbling paper
      ctx.fillStyle = rgba(p.color, 0.8);
      const w = p.w, h = p.h;
      ctx.beginPath();
      if (p.kind === 0) { ctx.rect(-w / 2, -h / 2, w, h); }
      else if (p.kind === 1) { ctx.moveTo(-w / 2, h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(0, -h); ctx.closePath(); }
      else if (p.kind === 2) { ctx.arc(0, 0, h * 0.8, 0, 6.2832); }
      else { ctx.rect(-w * 0.7, -h * 0.25, w * 1.4, h * 0.5); }
      ctx.fill();
      // A pencil edge, so it looks cut from coloured paper.
      ctx.globalAlpha = 0.55 * fade;
      ctx.strokeStyle = blend(p.color, '#000000', 0.25);
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.restore();
    }
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
        const t = Math.max(0, Math.min(1, (performance.now() - this.revealStart) / 1200));
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
        const base = (this.ownerColors && gm.owner && this.ownerColors[gm.owner[e]]) || this.pencilColor;
        const col = gm.hinted[e] ? blend(base, pal.hint, 0.45) : base;
        pencilLine(ctx, x0 + ix, y0 + iy, x1 - ix, y1 - iy, col, lineW, e * 7919 + 3);
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

    // Pings ("look here"): three rings growing out from the dot.
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
          ctx.beginPath(); ctx.arc(this.sx(g, pm.vertex), this.sy(g, pm.vertex), unit * (0.15 + r * 0.6), 0, 6.2832); ctx.stroke();
          ctx.restore();
        }
      }
      if (this.pings.length) animate = true;
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

  vertexNear(x, y, radius) {
    const g = this.game && this.game.grid;
    if (!g) return -1;
    const bx = (x - this.offX) / this.scale, by = (y - this.offY) / this.scale;
    let best = -1, bestD = radius * g.edgeLength;
    for (let v = 0; v < g.vertexCount; v++) {
      const d = Math.hypot(bx - g.vx[v], by - g.vy[v]);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  buzz(ms = 8) { if (this.haptics) vibrate(ms); }

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
    if (this.pingArmed && this.onPing) {
      this.pingArmed = false;
      const v = this.vertexNear(x, y, 1.5);
      if (v >= 0) { this.onPing(v); this.buzz(25); if (this.sounds) play('ping'); }
      if (this.onPingDone) this.onPingDone();
      return;
    }
    if (long && this.onPing) {
      const v = this.vertexNear(x, y, 0.3);
      if (v >= 0) { this.onPing(v); this.buzz(25); if (this.sounds) play('ping'); return; }
    }
    const edge = this.edgeAt(x, y);
    if (edge < 0) return;
    if (this.onlyGuided && !this.guideEdges.has(edge)) { this.onOffGuide && this.onOffGuide(); return; }
    // Tap draws a fence or clears the gap (with Pen: X, an X); long-press always makes an X (or clears it).
    const was = gm.marks[edge];
    if (long || this.crossPen) gm.setMark(edge, was === Edge.CROSS ? Edge.UNKNOWN : Edge.CROSS);
    else gm.setMark(edge, was === Edge.UNKNOWN ? Edge.LINE : Edge.UNKNOWN);
    if (this.sounds) {
      const now = gm.marks[edge];
      play(now === Edge.LINE ? 'fence' : now === Edge.CROSS ? 'cross' : 'erase');
    }
    this.buzz(long ? 25 : 8);
    this.clearHighlights();
    this.onChanged && this.onChanged();
  }

  bindInput() {
    const c = this.canvas;
    const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    let downX = 0, downY = 0, lastX = 0, lastY = 0, moved = false, multi = false;
    let longTimer = 0, longFired = false, pinchDist = 0, lastTapAt = 0, lastTapX = 0, lastTapY = 0;
    // Pen: Draw stroke state: the dot we're at, and the edges drawn this stroke (to back up over).
    let drawing = false, atV = -1, trail = [], stroked = false;
    const endDraw = () => {
      const was = stroked;
      if (stroked && this.game) this.game.endStroke();
      drawing = false; atV = -1; trail = []; stroked = false; this.stroking = false;
      if (was && this.onChanged) this.onChanged(); // now the note can go (it would have moved the board mid-stroke)
    };
    const drawTo = (x, y) => {
      const gm = this.game, g = gm && gm.grid;
      if (!g || this.locked) return;
      const v = this.vertexNear(x, y, 0.33);
      if (v < 0 || v === atV) return;
      let edge = -1;
      for (const e of g.vertexEdges[atV]) if (g.edgeVertices[2 * e] === v || g.edgeVertices[2 * e + 1] === v) { edge = e; break; }
      if (edge < 0) return; // not next door; keep going until we reach a neighbour
      if (this.onlyGuided && !this.guideEdges.has(edge)) { atV = v; return; }
      if (!stroked) { gm.beginStroke(); stroked = true; this.stroking = true; }
      if (trail.length && trail[trail.length - 1] === edge) {
        trail.pop();
        gm.setMark(edge, Edge.UNKNOWN); // backing up erases what this stroke just drew
        if (this.sounds) play('erase');
      } else if (gm.marks[edge] !== Edge.LINE) {
        gm.setMark(edge, Edge.LINE);
        if (gm.marks[edge] === Edge.LINE) trail.push(edge);
        if (this.sounds) play('fence');
      }
      atV = v;
      this.buzz(6);
      this.clearHighlights();
      this.onChanged && this.onChanged();
    };
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
        endDraw();
        if (this.drawPen && !this.pingArmed) { atV = this.vertexNear(x, y, 0.45); drawing = atV >= 0; }
        cancelLong();
        longTimer = setTimeout(() => {
          longTimer = 0;
          if (!moved && !multi) { longFired = true; this.tapEdge(downX, downY, true); }
        }, 450);
      } else if (this.pointers.size === 2) {
        multi = true; cancelLong(); endDraw();
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
        if (moved && drawing) {
          // Walk the finger's path in small steps so a quick swipe doesn't skip a dot.
          const g = this.game && this.game.grid;
          const step = g ? Math.max(4, g.edgeLength * this.scale * 0.2) : 8;
          const n = Math.max(1, Math.ceil(Math.hypot(x - lastX, y - lastY) / step));
          for (let i = 1; i <= n; i++) drawTo(lastX + (x - lastX) * i / n, lastY + (y - lastY) * i / n);
        } else if (moved) {
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
      const drew = drawing && moved;
      endDraw();
      if (e.type === 'pointercancel' || multi || moved || longFired || drew) return;
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
