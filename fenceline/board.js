// The playing board for any tiling, drawn on a canvas. (Ported from the 1.x Android app.)
// Tap a gap to draw or clear a fence, long-press for X (Pen: X swaps them). Pinch (or wheel) to zoom,
// drag to move the board, double-tap empty space to see it all. With Pen: Draw, a one-finger drag
// from dot to dot draws (two fingers still move the board).
import { BoardDraw } from './board-draw.js';
import { BoardInput } from './board-input.js';
import { BoardCelebrate } from './board-celebrate.js';

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
    this.ownerStyles = null; // solid, dashed or dotted per seat (co-op)
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
    const oldW = this.w, oldH = this.h;
    // Still showing the whole board? Then fit again. Zoomed or moved by the player? Keep their view
    // (same zoom, same spot in the middle) when the space changes: notes, the player list, the keyboard.
    const fitted = !oldW || !this.game || (this.scale === this.fitScale && this.offX === this.fitOffX && this.offY === this.fitOffY);
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    if (fitted) { this.resetZoom(); return; }
    const bx = (oldW / 2 - this.offX) / this.scale, by = (oldH / 2 - this.offY) / this.scale;
    const keep = this.scale;
    this.resetZoom(); // recomputes fitScale for the new size
    this.scale = Math.max(keep, this.fitScale);
    this.offX = this.w / 2 - bx * this.scale;
    this.offY = this.h / 2 - by * this.scale;
    this.clampPan(); this.invalidate();
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
    this.fitOffX = this.offX; this.fitOffY = this.offY;
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


  invalidate() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); });
  }

}

// The rest of BoardView lives in three files, so drawing, input and the win animation can change separately.
for (const part of [BoardDraw, BoardInput, BoardCelebrate]) {
  for (const k of Object.getOwnPropertyNames(part.prototype)) {
    if (k !== 'constructor') Object.defineProperty(BoardView.prototype, k, Object.getOwnPropertyDescriptor(part.prototype, k));
  }
}
