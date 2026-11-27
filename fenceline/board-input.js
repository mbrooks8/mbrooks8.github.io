// Touch, mouse and wheel input on the board: taps, long-presses, the three pens, pan and pinch zoom.
import { vibrate } from './native.js';
import { Edge } from './core.js';
import { play } from './sound.js';


/** Methods of BoardView (mixed in by board.js). */
export class BoardInput {

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

  /** Co-op "look here" at the exact spot tapped (screen x, y), kept anywhere on the board. */
  pingAt(x, y) {
    const g = this.game && this.game.grid;
    if (!g) return;
    const pad = 0.6 * g.edgeLength; // the paper around the board counts too
    const bx = Math.max(g.minX - pad, Math.min(g.maxX + pad, (x - this.offX) / this.scale));
    const by = Math.max(g.minY - pad, Math.min(g.maxY + pad, (y - this.offY) / this.scale));
    // The nearest dot goes along too, for 1.x phones that only know dots.
    const v = this.vertexNear(this.offX + bx * this.scale, this.offY + by * this.scale, Infinity);
    this.onPing(v, bx / g.edgeLength, by / g.edgeLength);
    this.buzz(25);
    if (this.sounds) play('ping');
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
      this.pingAt(x, y);
      if (this.onPingDone) this.onPingDone();
      return;
    }
    if (long && this.onPing && this.vertexNear(x, y, 0.3) >= 0) { this.pingAt(x, y); return; }
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
    let longTimer = 0, longFired = false, pinchDist = 0, lastTapAt = 0, lastTapX = 0, lastTapY = 0, lastTapEdge = -1, lastTapUndo = null;
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
      const gm = this.game;
      const zoomed = this.scale > this.fitScale * 1.01 || this.offX !== this.fitOffX || this.offY !== this.fitOffY;
      // Double tap shows the whole board again: anywhere when zoomed in or moved (the first tap's mark
      // is taken back), and away from any gap otherwise.
      if (now - lastTapAt < 350 && Math.hypot(x - lastTapX, y - lastTapY) < 30 && (edge < 0 || (zoomed && edge === lastTapEdge))) {
        if (edge >= 0 && gm && lastTapUndo && gm.undoStack[gm.undoStack.length - 1] === lastTapUndo) {
          gm.undo(); gm.redoStack.pop();
          this.onChanged && this.onChanged();
        }
        this.resetZoom(); lastTapAt = 0; lastTapUndo = null;
        return;
      }
      lastTapAt = now; lastTapX = x; lastTapY = y; lastTapEdge = edge;
      const top = gm && gm.undoStack[gm.undoStack.length - 1];
      this.tapEdge(x, y, false);
      const after = gm && gm.undoStack[gm.undoStack.length - 1];
      lastTapUndo = after !== top ? after : null;
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
