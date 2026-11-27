// The win animation on the board: a glow traces the loop, the inside gets pencil hatching, paper confetti.
import { Edge } from './core.js';
import { rng, rgba, blend } from './sketch.js';
import { play, playWin } from './sound.js';


export const GLOW_FADE_MS = 900;
export const CONFETTI_MS = 3200;
const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Methods of BoardView (mixed in by board.js). */
export class BoardCelebrate {
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
}
