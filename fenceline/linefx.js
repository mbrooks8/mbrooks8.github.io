// Special pencil lines from the store: patterns (wave, loop, beads...) and lines that move (sparkles, ember, rainbow...).
// One function draws one fence piece. [t] is a clock in ms, or null for a still picture (reduced motion, store previews).
// Kept light on purpose: a few strokes per piece, no blur, and the board only redraws about 18 times a second for them.
import { pencilLine, rng, blend } from './sketch.js';

const ANIMATED = new Set(['sparkle', 'ember', 'confetti', 'aurora', 'rainbow', 'lights']);
/** Does this look move? (The board only keeps redrawing while a moving line is on it.) */
export const isAnimated = fx => ANIMATED.has(fx);

const CONFETTI = ['#E8505B', '#F2B33D', '#4CAF7A', '#4A8FD6', '#A863C9'];
const PASTEL_DAY = ['#E58FA8', '#6FB59A', '#9A87D6', '#E0A84E'];
const PASTEL_NIGHT = ['#F7B6C8', '#9FE0C4', '#C6B8F5', '#F5D08A'];
const BULBS = ['#E8505B', '#F2B33D', '#4CAF7A', '#4A8FD6'];

/** A small heart centred on (x, y), pointing along [ux, uy]'s normal. */
function heart(ctx, x, y, r, col, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.7, y - r * 1.3, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.5, y - r * 0.1, x, y + r * 0.9);
  ctx.fill(); ctx.restore();
}

/** A leaf (or petal) along angle [ang]. */
function leaf(ctx, x, y, len, ang, col, alpha = 0.9) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0); ctx.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
  ctx.fill(); ctx.restore();
}

/** A smooth stroke through points, twice: once firm, once faint and a little off, like pencil. */
function strokePath(ctx, pts, col, w, seed) {
  const rnd = rng(seed);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col;
  for (let pass = 0; pass < 2; pass++) {
    const j = pass ? w * 0.2 : 0, dx = (rnd() - .5) * j, dy = (rnd() - .5) * j;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
    ctx.globalAlpha = pass ? 0.4 : 0.92;
    ctx.lineWidth = pass ? w * 0.45 : w * 0.78;
    ctx.stroke();
  }
  ctx.restore();
}

function dot(ctx, x, y, r, col, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, r), 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

/** A little four-point star. */
function star(ctx, x, y, r, col, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, r * 0.3);
  ctx.beginPath();
  ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
  const d = r * 0.45; ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d); ctx.moveTo(x - d, y + d); ctx.lineTo(x + d, y - d);
  ctx.stroke(); ctx.restore();
}

/** The points of a patterned line: [along, across] pairs turned into canvas points. */
function shaped(ax, ay, bx, by, offsets) {
  const L = Math.max(1, Math.hypot(bx - ax, by - ay));
  const ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy, ny = ux;
  return offsets.map(([s, o]) => [ax + ux * s * L + nx * o, ay + uy * s * L + ny * o]);
}

/**
 * Draws one fence piece in pencil look [fx] from (ax,ay) to (bx,by).
 * [accent] is the sparkle colour, [night] picks lighter rainbow colours.
 */
export function drawFx(ctx, fx, ax, ay, bx, by, col, w, seed, t, accent = '#FFFFFF', night = false) {
  const L = Math.max(1, Math.hypot(bx - ax, by - ay));
  const ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy, ny = ux;
  const at = (p, o = 0) => [ax + ux * p * L + nx * o, ay + uy * p * L + ny * o];
  const clock = t == null ? 0 : t;
  const wave = k => (Math.sin(clock / k + seed * 0.9) + 1) / 2;

  switch (fx) {
    case 'wave': {
      const n = 16, pts = [];
      for (let i = 0; i <= n; i++) pts.push([i / n, Math.sin(i / n * Math.PI * 3) * w * 0.8]);
      return strokePath(ctx, shaped(ax, ay, bx, by, pts), col, w, seed);
    }
    case 'zigzag': {
      const a = w * 0.9;
      return strokePath(ctx, shaped(ax, ay, bx, by, [[0, 0], [0.2, a], [0.4, -a], [0.6, a], [0.8, -a], [1, 0]]), col, w * 0.9, seed);
    }
    case 'loop': {
      // Cursive loops: a rolling circle, tapering to nothing at both ends so pieces join up.
      const k = Math.max(1, Math.round(L / (w * 4.5))), pitch = 1 / (2 * Math.PI * k), r = Math.max(w * 1.15, L * pitch * 1.5);
      const steps = 14 * k, pts = [];
      for (let i = 0; i <= steps; i++) {
        const th = i / steps * 2 * Math.PI * k, env = Math.pow(Math.sin(Math.PI * i / steps), 0.6);
        pts.push([pitch * th - r / L * env * Math.sin(th), -r * env * Math.cos(th)]);
      }
      return strokePath(ctx, shaped(ax, ay, bx, by, pts), col, w * 0.75, seed);
    }
    case 'beads': {
      const n = Math.max(2, Math.round(L / (w * 2.5)));
      for (let i = 0; i < n; i++) { const [x, y] = at((i + 0.5) / n); dot(ctx, x, y, w * 0.58, col, 0.95); }
      return undefined;
    }
    case 'stitch': {
      const n = Math.max(3, Math.round(L / (w * 3)));
      ctx.save(); ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = w * 0.7; ctx.globalAlpha = 0.92; ctx.beginPath();
      for (let i = 0; i < n; i++) { const [x0, y0] = at((i + 0.1) / n), [x1, y1] = at((i + 0.7) / n); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
      ctx.stroke(); ctx.restore();
      return undefined;
    }
    case 'double': {
      const o = w * 0.5;
      strokePath(ctx, shaped(ax, ay, bx, by, [[0, o], [1, o]]), col, w * 0.5, seed);
      return strokePath(ctx, shaped(ax, ay, bx, by, [[0, -o], [1, -o]]), col, w * 0.5, seed + 1);
    }
    case 'sparkle': {
      pencilLine(ctx, ax, ay, bx, by, col, w, seed);
      for (let k = 0; k < 2; k++) {
        const s = t == null ? 0.7 : Math.pow((Math.sin(clock / 420 + seed * 1.7 + k * 2.3) + 1) / 2, 2);
        const [x, y] = at(0.28 + 0.44 * k + ((seed * 7 + k * 5) % 10) / 100, (k ? 1 : -1) * w * 0.55);
        star(ctx, x, y, w * (0.45 + 1.1 * s), accent, 0.45 + 0.55 * s);
      }
      return undefined;
    }
    case 'ember': {
      const p = t == null ? 0.6 : wave(260);
      ctx.save(); ctx.strokeStyle = '#FF9A3D'; ctx.lineCap = 'round'; ctx.globalAlpha = 0.07 + 0.07 * p; ctx.lineWidth = w * 1.9;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore();
      pencilLine(ctx, ax, ay, bx, by, blend(col, night ? '#FFE08A' : '#F2B33D', p * 0.7), w, seed);
      const f = t == null ? 0.4 : ((clock / 1100 + (seed % 7) * 0.13) % 1);
      const [x, y] = at(0.3 + ((seed * 3) % 5) / 10, -w * (0.6 + f * 1.8));
      dot(ctx, x, y, w * 0.2, '#FFB347', 1 - f);
      return undefined;
    }
    case 'confetti': {
      pencilLine(ctx, ax, ay, bx, by, col, w * 0.85, seed);
      const step = t == null ? 0 : Math.floor(clock / 500 + seed);
      for (let k = 0; k < 3; k++) { const [x, y] = at(0.2 + 0.3 * k, (k % 2 ? 1 : -1) * w * 0.75); dot(ctx, x, y, w * 0.3, CONFETTI[(k + step) % 5]); }
      return undefined;
    }
    case 'rainbow': case 'aurora': {
      const hue = (x, y) => {
        const phase = (x + y) * 0.7;
        return fx === 'rainbow' ? (clock / 14 + phase) % 360 : 165 + 70 * Math.sin(phase * 0.017 + clock / 1800);
      };
      const l = fx === 'rainbow' ? (night ? 70 : 54) : (night ? 66 : 42);
      const g = ctx.createLinearGradient(ax, ay, bx, by);
      g.addColorStop(0, `hsl(${hue(ax, ay)} 80% ${l}%)`); g.addColorStop(1, `hsl(${hue(bx, by)} 80% ${l}%)`);
      return pencilLine(ctx, ax, ay, bx, by, g, w, seed);
    }
    case 'paws': {
      // A thin line with paw prints stepping along it, left and right.
      pencilLine(ctx, ax, ay, bx, by, col, w * 0.5, seed);
      const n = Math.max(2, Math.round(L / (w * 3.6)));
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1, [x, y] = at((i + 0.5) / n, side * w * 0.55);
        dot(ctx, x, y, w * 0.5, col, 0.95);
        for (const [s1, o1] of [[0.55, -0.62], [0.78, 0], [0.55, 0.62]]) {
          dot(ctx, x + ux * w * s1 + nx * w * o1, y + uy * w * s1 + ny * w * o1, w * 0.2, col, 0.95);
        }
      }
      return undefined;
    }
    case 'hearts': {
      pencilLine(ctx, ax, ay, bx, by, col, w * 0.45, seed);
      const n = Math.max(2, Math.round(L / (w * 3)));
      for (let i = 0; i < n; i++) { const [x, y] = at((i + 0.5) / n); heart(ctx, x, y, w * 0.75, col, 0.95); }
      return undefined;
    }
    case 'vine': {
      const n = 12, pts = [];
      for (let i = 0; i <= n; i++) pts.push([i / n, Math.sin(i / n * Math.PI * 2) * w * 0.35]);
      strokePath(ctx, shaped(ax, ay, bx, by, pts), col, w * 0.8, seed);
      const ang = Math.atan2(uy, ux), k = Math.max(2, Math.round(L / (w * 3.2)));
      for (let i = 0; i < k; i++) {
        const side = i % 2 ? 1 : -1, [x, y] = at((i + 0.5) / k);
        leaf(ctx, x, y, w * 1.5, ang + side * 0.9, blend(col, night ? '#FFFFFF' : '#2E6B3A', 0.25));
      }
      return undefined;
    }
    case 'scales': {
      // Little arches along one side, like fish scales.
      pencilLine(ctx, ax, ay, bx, by, col, w * 0.6, seed);
      const n = Math.max(2, Math.round(L / (w * 1.9))), ang = Math.atan2(uy, ux);
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w * 0.42; ctx.globalAlpha = 0.9; ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const [x, y] = at((i + 0.5) / n, w * 0.1), r = L / n / 2;
        ctx.beginPath(); ctx.arc(x, y, r, ang, ang + Math.PI); ctx.stroke();
      }
      ctx.restore();
      return undefined;
    }
    case 'gingham': {
      // Checks: the pencil colour with light squares across it.
      pencilLine(ctx, ax, ay, bx, by, col, w * 1.1, seed);
      const n = Math.max(3, Math.round(L / (w * 1.3))), light = blend(col, night ? '#1E1B18' : '#FFFFFF', 0.6);
      ctx.save(); ctx.strokeStyle = light; ctx.lineWidth = w * 0.42; ctx.lineCap = 'butt'; ctx.globalAlpha = 0.85; ctx.beginPath();
      for (let i = 0; i < n; i += 2) { const [x0, y0] = at(i / n), [x1, y1] = at((i + 1) / n); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
      ctx.stroke(); ctx.restore();
      return undefined;
    }
    case 'pastel': case 'candycane': {
      // Stripes: pastel colours (starting with the pencil's own), or the pencil colour with white stripes.
      pencilLine(ctx, ax, ay, bx, by, col, w, seed);
      const n = Math.max(3, Math.round(L / (w * 1.4)));
      const cols = fx === 'pastel' ? [col, ...(night ? PASTEL_NIGHT : PASTEL_DAY)] : [night ? '#F4EEE6' : '#FFFFFF'];
      ctx.save(); ctx.lineWidth = w * 0.62; ctx.lineCap = 'round'; ctx.globalAlpha = 0.92;
      for (let i = fx === 'pastel' ? 0 : 1; i < n; i += 2) {
        const [x0, y0] = at((i + 0.15) / n, -w * 0.25), [x1, y1] = at((i + 0.85) / n, w * 0.25);
        ctx.strokeStyle = cols[(i / 2 | 0) % cols.length]; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.restore();
      return undefined;
    }
    case 'highlight': {
      // A soft wide highlighter band under a thin line.
      ctx.save(); ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.globalAlpha = night ? 0.3 : 0.26; ctx.lineWidth = w * 2.4;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore();
      return pencilLine(ctx, ax, ay, bx, by, col, w * 0.7, seed);
    }
    case 'holly': {
      pencilLine(ctx, ax, ay, bx, by, col, w * 0.6, seed);
      const ang = Math.atan2(uy, ux), k = Math.max(1, Math.round(L / (w * 4.5)));
      for (let i = 0; i < k; i++) {
        const [x, y] = at((i + 0.5) / k);
        leaf(ctx, x, y, w * 1.7, ang - 0.6, col); leaf(ctx, x, y, w * 1.7, ang + Math.PI + 0.6, col);
        dot(ctx, x, y, w * 0.38, night ? '#FF7A7A' : '#C8283A'); dot(ctx, x + ux * w * 0.5 + nx * w * 0.4, y + uy * w * 0.5 + ny * w * 0.4, w * 0.32, night ? '#FF7A7A' : '#C8283A');
      }
      return undefined;
    }
    case 'lights': {
      // A string of fairy lights: a thin wire in the pencil colour, bulbs that glow in turn.
      pencilLine(ctx, ax, ay, bx, by, col, w * 0.55, seed);
      const n = Math.max(2, Math.round(L / (w * 2.8)));
      for (let i = 0; i < n; i++) {
        const k = (seed + i) % 4, glow = t == null ? 0.8 : (Math.sin(clock / 380 + k * 1.6 + i) + 1) / 2;
        const [x, y] = at((i + 0.5) / n, (i % 2 ? 1 : -1) * w * 0.45), c = BULBS[k];
        dot(ctx, x, y, w * (0.7 + 0.35 * glow), c, 0.12 + 0.2 * glow);
        dot(ctx, x, y, w * 0.4, c, 0.6 + 0.4 * glow);
      }
      return undefined;
    }
    default:
      return pencilLine(ctx, ax, ay, bx, by, col, w, seed);
  }
}
