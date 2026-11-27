// Fenceline core: a line-for-line port of the Android app's Kotlin core
// (Grid, Puzzle, PuzzleCode, Solver, Generator, Game, Tutorial).
// The generator must match the Kotlin one exactly so share codes make the same puzzle
// on every device, so keep any change here in step with core/src/main/kotlin.

// ---------------------------------------------------------------------------
// kotlin.random.Random(seed: Long): XorWow, exactly as in the Kotlin stdlib.
// ---------------------------------------------------------------------------
export class KRandom {
  constructor(seed) {
    const s = BigInt.asIntN(64, BigInt(seed));
    const seed1 = Number(BigInt.asIntN(32, s));
    const seed2 = Number(BigInt.asIntN(32, s >> 32n));
    this.x = seed1 | 0;
    this.y = seed2 | 0;
    this.z = 0;
    this.w = 0;
    this.v = ~seed1;
    this.addend = ((seed1 << 10) ^ (seed2 >>> 4)) | 0;
    if ((this.x | this.y | this.z | this.w | this.v) === 0) throw new Error('Initial state must have at least one non-zero element.');
    for (let i = 0; i < 64; i++) this.nextInt();
  }
  nextInt() {
    let t = this.x;
    t = t ^ (t >>> 2);
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    const v0 = this.v;
    this.w = v0;
    t = (t ^ (t << 1)) ^ v0 ^ (v0 << 4);
    this.v = t | 0;
    this.addend = (this.addend + 362437) | 0;
    return (t + this.addend) | 0;
  }
  nextBits(bitCount) {
    const r = this.nextInt();
    if (bitCount === 0) return 0;
    return (r >>> (32 - bitCount)) | 0;
  }
  /** nextInt(until) == nextInt(0, until) */
  nextIntBelow(n) {
    if (n <= 0) throw new Error('bound must be positive');
    if ((n & -n) === n) {
      const bitCount = 31 - Math.clz32(n);
      return this.nextBits(bitCount);
    }
    let bits, v;
    do {
      bits = this.nextInt() >>> 1;
      v = bits % n;
    } while (((bits - v + (n - 1)) | 0) < 0);
    return v;
  }
  nextDouble() {
    const hi = this.nextBits(26);
    const lo = this.nextBits(27);
    return (hi * 134217728 + lo) / 9007199254740992;
  }
}

/** Kotlin's Iterable.shuffled(random). */
function shuffled(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i >= 1; i--) {
    const j = rnd.nextIntBelow(i + 1);
    const t = a[j]; a[j] = a[i]; a[i] = t;
  }
  return a;
}

function range(n) { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = i; return a; }

// ---------------------------------------------------------------------------
// Shapes, difficulty, edge states
// ---------------------------------------------------------------------------
export const Shape = {
  SQUARE: { name: 'SQUARE', code: '', label: 'Square', ordinal: 0 },
  HEX: { name: 'HEX', code: 'H', label: 'Hexagon', ordinal: 1 },
  TRIANGLE: { name: 'TRIANGLE', code: 'T', label: 'Triangle', ordinal: 2 },
  CAIRO: { name: 'CAIRO', code: 'C', label: 'Cairo', ordinal: 3 },
};
Shape.entries = [Shape.SQUARE, Shape.HEX, Shape.TRIANGLE, Shape.CAIRO];
Shape.fromCode = (c) => Shape.entries.find((s) => s.code.toLowerCase() === String(c || '').toLowerCase()) || Shape.SQUARE;
Shape.fromName = (n) => Shape[n] || Shape.SQUARE;
Object.defineProperty(Shape, 'entries', { enumerable: false });
Object.defineProperty(Shape, 'fromCode', { enumerable: false });
Object.defineProperty(Shape, 'fromName', { enumerable: false });

export const Difficulty = { EASY: 'EASY', MEDIUM: 'MEDIUM', HARD: 'HARD' };
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
const dOrd = (d) => DIFFICULTIES.indexOf(d);

export const Edge = { UNKNOWN: 0, LINE: 1, CROSS: 2 };

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------
const gridCache = new Map();

function roundKey(x, y) { return Math.round(x * 1e4) + ',' + Math.round(y * 1e4); }

export class Grid {
  constructor(shape, width, height, vx, vy, edgeVertices, cellEdges, cellVertices) {
    this.shape = shape; this.width = width; this.height = height;
    this.vx = vx; this.vy = vy; this.edgeVertices = edgeVertices;
    this.cellEdges = cellEdges; this.cellVertices = cellVertices;
    this.cellCount = cellEdges.length;
    this.vertexCount = vx.length;
    this.edgeCount = edgeVertices.length / 2;

    const vl = Array.from({ length: this.vertexCount }, () => []);
    for (let e = 0; e < this.edgeCount; e++) { vl[edgeVertices[2 * e]].push(e); vl[edgeVertices[2 * e + 1]].push(e); }
    this.vertexEdges = vl.map((l) => Int32Array.from(l));

    const el = Array.from({ length: this.edgeCount }, () => []);
    for (let c = 0; c < this.cellCount; c++) for (const e of cellEdges[c]) el[e].push(c);
    this.edgeCells = el.map((l) => Int32Array.from(l));

    this.cellNeighbours = [];
    for (let c = 0; c < this.cellCount; c++) {
      const out = [];
      for (const e of cellEdges[c]) for (const o of this.edgeCells[e]) if (o !== c && !out.includes(o)) out.push(o);
      this.cellNeighbours.push(Int32Array.from(out));
    }

    this.cellCenterX = new Float64Array(this.cellCount);
    this.cellCenterY = new Float64Array(this.cellCount);
    for (let c = 0; c < this.cellCount; c++) {
      let sx = 0, sy = 0;
      for (const v of cellVertices[c]) { sx += vx[v]; sy += vy[v]; }
      this.cellCenterX[c] = sx / cellVertices[c].length;
      this.cellCenterY[c] = sy / cellVertices[c].length;
    }
    let L = 0;
    for (let e = 0; e < this.edgeCount; e++) {
      const a = edgeVertices[2 * e], b = edgeVertices[2 * e + 1];
      L += Math.hypot(vx[a] - vx[b], vy[a] - vy[b]);
    }
    this.edgeLength = L / this.edgeCount;
    let R = 0;
    for (let c = 0; c < this.cellCount; c++) {
      let m = Infinity;
      for (const e of cellEdges[c]) {
        const mx = (vx[edgeVertices[2 * e]] + vx[edgeVertices[2 * e + 1]]) / 2;
        const my = (vy[edgeVertices[2 * e]] + vy[edgeVertices[2 * e + 1]]) / 2;
        m = Math.min(m, Math.hypot(mx - this.cellCenterX[c], my - this.cellCenterY[c]));
      }
      R += m;
    }
    this.cellInnerRadius = R / this.cellCount;
    this.minX = Math.min(...vx); this.maxX = Math.max(...vx);
    this.minY = Math.min(...vy); this.maxY = Math.max(...vy);
  }

  otherEnd(e, v) { return this.edgeVertices[2 * e] === v ? this.edgeVertices[2 * e + 1] : this.edgeVertices[2 * e]; }

  get hCount() { return (this.height + 1) * this.width; }
  cell(r, c) { return r * this.width + c; }
  vertex(r, c) { return r * (this.width + 1) + c; }
  hEdge(r, c) { return r * this.width + c; }
  vEdge(r, c) { return this.hCount + r * (this.width + 1) + c; }

  static create(shape, width, height) {
    const key = shape.name + ':' + width + 'x' + height;
    let g = gridCache.get(key);
    if (!g) {
      if (!(width >= 1 && height >= 1)) throw new Error('Board must be at least 1x1');
      switch (shape) {
        case Shape.SQUARE: g = squareGrid(width, height); break;
        case Shape.HEX: g = fromPolygons(shape, width, height, hexPolygons(width, height)); break;
        case Shape.TRIANGLE: g = fromPolygons(shape, width, height, trianglePolygons(width, height)); break;
        case Shape.CAIRO: g = fromPolygons(shape, width, height, cairoPolygons(width, height)); break;
        default: throw new Error('Unknown shape');
      }
      gridCache.set(key, g);
    }
    return g;
  }
}

function squareGrid(w, h) {
  const n = (w + 1) * (h + 1);
  const vx = new Float64Array(n), vy = new Float64Array(n);
  for (let i = 0; i < n; i++) { vx[i] = i % (w + 1); vy[i] = Math.floor(i / (w + 1)); }
  const hCount = (h + 1) * w;
  const ev = new Int32Array(2 * (hCount + h * (w + 1)));
  const vtx = (r, c) => r * (w + 1) + c;
  for (let r = 0; r <= h; r++) for (let c = 0; c < w; c++) { const e = r * w + c; ev[2 * e] = vtx(r, c); ev[2 * e + 1] = vtx(r, c + 1); }
  for (let r = 0; r < h; r++) for (let c = 0; c <= w; c++) { const e = hCount + r * (w + 1) + c; ev[2 * e] = vtx(r, c); ev[2 * e + 1] = vtx(r + 1, c); }
  const ce = [], cv = [];
  for (let id = 0; id < w * h; id++) {
    const r = Math.floor(id / w), c = id % w;
    ce.push(Int32Array.of(r * w + c, (r + 1) * w + c, hCount + r * (w + 1) + c, hCount + r * (w + 1) + c + 1));
    cv.push(Int32Array.of(vtx(r, c), vtx(r, c + 1), vtx(r + 1, c + 1), vtx(r + 1, c)));
  }
  return new Grid(Shape.SQUARE, w, h, vx, vy, ev, ce, cv);
}

function fromPolygons(shape, w, h, polys) {
  const vid = new Map(); const xs = []; const ys = [];
  const eid = new Map(); const ev = [];
  const cellE = [], cellV = [];
  for (const p of polys) {
    const vs = p.map(([x, y]) => {
      const k = roundKey(x, y);
      let id = vid.get(k);
      if (id === undefined) { xs.push(x); ys.push(y); id = xs.length - 1; vid.set(k, id); }
      return id;
    });
    const es = vs.map((a, i) => {
      const b = vs[(i + 1) % vs.length];
      const k = Math.min(a, b) + ':' + Math.max(a, b);
      let id = eid.get(k);
      if (id === undefined) { ev.push(a, b); id = ev.length / 2 - 1; eid.set(k, id); }
      return id;
    });
    cellV.push(Int32Array.from(vs)); cellE.push(Int32Array.from(es));
  }
  return new Grid(shape, w, h, Float64Array.from(xs), Float64Array.from(ys), Int32Array.from(ev), cellE, cellV);
}

function hexPolygons(w, h) {
  const s3 = Math.sqrt(3);
  const out = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const cx = s3 * (c + 0.5 * (r % 2)), cy = 1.5 * r;
    const poly = [];
    for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (30 + 60 * k); poly.push([cx + Math.cos(a), cy + Math.sin(a)]); }
    out.push(poly);
  }
  return out;
}

function trianglePolygons(w, h) {
  const th = Math.sqrt(3) / 2;
  const p = (i, j) => [i + 0.5 * (j % 2), j * th];
  const out = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (j % 2 === 0) {
      out.push([p(i, j), p(i + 1, j), p(i, j + 1)]);
      out.push([p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)]);
    } else {
      out.push([p(i, j), p(i + 1, j + 1), p(i, j + 1)]);
      out.push([p(i, j), p(i + 1, j), p(i + 1, j + 1)]);
    }
  }
  return out;
}

function cairoPolygons(w, h) {
  const t = (-0.5 + Math.sqrt(1.75)) / 1.5;
  const pieces = new Map();
  const add = (k, poly) => { let l = pieces.get(k); if (!l) { l = []; pieces.set(k, l); } l.push(poly); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = x + 0.5, cy = y + 0.5;
    const a = [x, y], b = [x + 1, y], c = [x + 1, y + 1], d = [x, y + 1];
    if ((x + y) % 2 === 0) {
      const l = [cx - t / 2, cy], r = [cx + t / 2, cy];
      add(`v${x},${y}`, [a, l, d]); add(`v${x + 1},${y}`, [b, c, r]);
      add(`h${x},${y}`, [a, b, r, l]); add(`h${x},${y + 1}`, [d, l, r, c]);
    } else {
      const bt = [cx, cy - t / 2], tp = [cx, cy + t / 2];
      add(`h${x},${y}`, [a, b, bt]); add(`h${x},${y + 1}`, [d, tp, c]);
      add(`v${x},${y}`, [a, bt, tp, d]); add(`v${x + 1},${y}`, [b, c, tp, bt]);
    }
  }
  const out = [];
  for (const ps of pieces.values()) {
    if (ps.length !== 2) continue;
    const seen = new Set(); const pts = [];
    for (const q of ps[0].concat(ps[1])) { const k = roundKey(q[0], q[1]); if (!seen.has(k)) { seen.add(k); pts.push(q); } }
    let mx = 0, my = 0; for (const q of pts) { mx += q[0]; my += q[1]; } mx /= pts.length; my /= pts.length;
    const keyed = pts.map((q) => ({ q, a: Math.atan2(q[1] - my, q[0] - mx) }));
    keyed.sort((u, v) => u.a - v.a);
    out.push(keyed.map((k) => k.q));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Puzzle
// ---------------------------------------------------------------------------
export class Puzzle {
  constructor(width, height, clues, solution = null, difficulty = null, seed = null, shape = Shape.SQUARE) {
    this.width = width; this.height = height;
    this.clues = clues instanceof Int32Array ? clues : Int32Array.from(clues);
    this.solution = solution == null ? null : (solution instanceof Uint8Array ? solution : Uint8Array.from(solution, (b) => (b ? 1 : 0)));
    this.difficulty = difficulty; this.seed = seed == null ? null : BigInt(seed); this.shape = shape;
    this.grid = Grid.create(shape, width, height);
    if (this.clues.length !== this.grid.cellCount) throw new Error('Clue count does not match board size');
  }
  clue(r, c) { return this.clues[r * this.width + c]; }
  get clueCount() { let n = 0; for (const v of this.clues) if (v !== Puzzle.NO_CLUE) n++; return n; }
  encode(includeSolution = true) {
    let s = this.shape.code + this.width + 'x' + this.height + ':';
    for (const v of this.clues) s += v === Puzzle.NO_CLUE ? '.' : String(v);
    if (includeSolution && this.solution) { s += ':'; for (const b of this.solution) s += b ? '1' : '0'; }
    return s;
  }
  static decode(text) {
    const parts = text.trim().split(':');
    if (parts.length < 2) throw new Error('Expected WxH:clues[:solution]');
    const head = parts[0];
    const letter = /[A-Za-z]/.test(head[0]);
    const shape = letter ? Shape.fromCode(head[0]) : Shape.SQUARE;
    const [w, h] = head.slice(letter ? 1 : 0).toLowerCase().split('x').map((x) => parseInt(x, 10));
    const g = Grid.create(shape, w, h);
    const body = parts[1];
    if (body.length !== g.cellCount) throw new Error(`Expected ${g.cellCount} clue characters, got ${body.length}`);
    const clues = new Int32Array(g.cellCount);
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === '.' || ch === '-' || ch === ' ') clues[i] = Puzzle.NO_CLUE;
      else if (ch >= '0' && ch <= '9') clues[i] = ch.charCodeAt(0) - 48;
      else throw new Error(`Bad clue character '${ch}'`);
    }
    let solution = null;
    if (parts[2]) {
      if (parts[2].length !== g.edgeCount) throw new Error(`Expected ${g.edgeCount} solution characters`);
      solution = Uint8Array.from(parts[2], (c) => (c === '1' ? 1 : 0));
    }
    return new Puzzle(w, h, clues, solution, null, null, shape);
  }
}
Puzzle.NO_CLUE = -1;

// ---------------------------------------------------------------------------
// Puzzle codes, e.g. F1-10x10M-7K3QZP2A
// ---------------------------------------------------------------------------
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_RE = /F1-([HTC]?)(\d{1,2})[xX×](\d{1,2})([EMHemh])-([0-9A-Za-z]{1,13})/i;

export class PuzzleCode {
  constructor(width, height, difficulty, seed, shape = Shape.SQUARE) {
    this.width = width; this.height = height; this.difficulty = difficulty; this.seed = BigInt(seed); this.shape = shape;
  }
  toString() { return `${PuzzleCode.PREFIX}-${this.shape.code}${this.width}x${this.height}${this.difficulty[0]}-${PuzzleCode.base32(this.seed)}`; }
  generate() { return PuzzleGenerator.generate(this.width, this.height, this.difficulty, this.seed, this.shape); }

  static randomSeed() {
    // 1 until 2^40, like Random.nextLong(1, 1L shl 40)
    let v = 0n;
    while (v === 0n) {
      const hi = Math.floor(Math.random() * 256);
      const lo = Math.floor(Math.random() * 4294967296);
      v = (BigInt(hi) << 32n) | BigInt(lo);
    }
    return v;
  }
  static base32(v) {
    let x = BigInt.asUintN(64, BigInt(v));
    let s = '';
    do { s = ALPHABET[Number(x & 31n)] + s; x >>= 5n; } while (x !== 0n);
    return s;
  }
  static unbase32(s) {
    let x = 0n;
    for (const ch0 of s.toUpperCase()) {
      const ch = ch0 === 'O' ? '0' : (ch0 === 'I' || ch0 === 'L') ? '1' : ch0;
      const d = ALPHABET.indexOf(ch);
      if (d < 0) return null;
      x = BigInt.asIntN(64, (x << 5n) | BigInt(d));
    }
    return x;
  }
  static find(text) {
    const m = String(text).replace(/ /g, '').match(CODE_RE);
    if (!m) return null;
    const shape = Shape.fromCode(m[1]);
    const w = parseInt(m[2], 10), h = parseInt(m[3], 10);
    if (w < 2 || w > 40 || h < 2 || h > 40) return null;
    const dl = m[4].toUpperCase();
    const d = dl === 'E' ? 'EASY' : dl === 'M' ? 'MEDIUM' : 'HARD';
    const seed = PuzzleCode.unbase32(m[5]);
    if (seed === null) return null;
    return new PuzzleCode(w, h, d, seed, shape);
  }
  static of(p) {
    if (p.difficulty == null || p.seed == null) return null;
    return new PuzzleCode(p.width, p.height, p.difficulty, p.seed, p.shape);
  }
}
PuzzleCode.PREFIX = 'F1';

// ---------------------------------------------------------------------------
// Solver state
// ---------------------------------------------------------------------------
const K_EDGE = 0, K_PARENT = 1, K_COMP = 2, K_DEG = 3, K_SIZE = 4, K_EX = 5, K_EY = 6;

function grow(a, n) { const b = new Int32Array(n); b.set(a.subarray(0, Math.min(a.length, n))); return b; }

export class SolveState {
  constructor(grid, clues, src = null) {
    this.grid = grid; this.clues = clues;
    const V = grid.vertexCount;
    if (src) {
      this.edges = src.edges.slice(); this.parent = src.parent.slice(); this.compLines = src.compLines.slice();
      this.compSize = src.compSize.slice(); this.totalLines = src.totalLines; this.closed = src.closed;
      this.contradiction = src.contradiction; this.unknowns = src.unknowns; this.deg = src.deg.slice();
      this.ends = src.ends.slice(); this.endPos = src.endPos.slice(); this.endCount = src.endCount;
      this.endX = src.endX.slice(); this.endY = src.endY.slice(); this.pend = src.pend.slice(); this.pendSize = src.pendSize;
    } else {
      this.edges = new Uint8Array(grid.edgeCount);
      this.parent = new Int32Array(V); for (let i = 0; i < V; i++) this.parent[i] = i;
      this.compLines = new Int32Array(V);
      this.compSize = new Int32Array(V).fill(1);
      this.totalLines = 0; this.closed = false; this.contradiction = false; this.unknowns = grid.edgeCount;
      this.deg = new Int32Array(V); this.ends = new Int32Array(V); this.endPos = new Int32Array(V).fill(-1); this.endCount = 0;
      this.endX = new Int32Array(V); this.endY = new Int32Array(V);
      for (let i = 0; i < V; i++) { this.endX[i] = i; this.endY[i] = i; }
      this.pend = new Int32Array(16); this.pendSize = 0;
    }
    const qn = grid.cellCount + V;
    this.queue = new Int32Array(qn); this.queued = new Uint8Array(qn); this.qHead = 0; this.qSize = 0;
    this.marks = 0;
    this.tKind = new Int32Array(0); this.tIdx = new Int32Array(0); this.tOld = new Int32Array(0); this.tSize = 0;
    this.pendBase = 0; this.pendBases = [];
    this.closerBuf = new Int32Array(16);
  }

  copy() { return new SolveState(this.grid, this.clues, this); }
  get unknownCount() { return this.unknowns; }
  get isSolved() { return !this.contradiction && this.closed && this.unknowns === 0; }

  log(kind, idx, old) {
    if (this.marks === 0) return;
    if (this.tSize === this.tKind.length) {
      const n = Math.max(64, this.tSize * 2);
      this.tKind = grow(this.tKind, n); this.tIdx = grow(this.tIdx, n); this.tOld = grow(this.tOld, n);
    }
    this.tKind[this.tSize] = kind; this.tIdx[this.tSize] = idx; this.tOld[this.tSize] = old; this.tSize++;
  }

  mark() {
    this.clearQueue();
    this.marks++;
    this.pendBases.push(this.pendBase);
    this.pendBase = this.pendSize;
    return { trail: this.tSize, totalLines: this.totalLines, closed: this.closed, contradiction: this.contradiction, unknowns: this.unknowns, pendSize: this.pendSize };
  }

  undo(m) {
    this.clearQueue();
    while (this.tSize > m.trail) {
      this.tSize--;
      const i = this.tIdx[this.tSize], old = this.tOld[this.tSize];
      switch (this.tKind[this.tSize]) {
        case K_EDGE: this.edges[i] = old; break;
        case K_PARENT: this.parent[i] = old; break;
        case K_COMP: this.compLines[i] = old; break;
        case K_SIZE: this.compSize[i] = old; break;
        case K_DEG: this.setDeg(i, old); break;
        case K_EX: this.endX[i] = old; break;
        case K_EY: this.endY[i] = old; break;
      }
    }
    this.totalLines = m.totalLines; this.closed = m.closed; this.contradiction = m.contradiction; this.unknowns = m.unknowns;
    this.pendSize = m.pendSize;
    this.pendBase = this.pendBases.pop();
    this.marks--;
  }

  commit(m) {
    this.tSize = m.trail;
    this.pendBase = this.pendBases.pop();
    this.marks--;
  }

  changedSince(m, out) {
    let n = 0;
    for (let t = m.trail; t < this.tSize; t++) if (this.tKind[t] === K_EDGE) out[n++] = this.tIdx[t];
    return n;
  }

  clearQueue() {
    const q = this.queue, len = q.length;
    while (this.qSize > 0) {
      this.queued[q[this.qHead]] = 0;
      this.qHead = (this.qHead + 1) % len;
      this.qSize--;
    }
  }

  setDeg(v, d) {
    const wasEnd = this.deg[v] === 1;
    this.deg[v] = d;
    const isEnd = d === 1;
    if (wasEnd === isEnd) return;
    if (isEnd) {
      this.endPos[v] = this.endCount; this.ends[this.endCount++] = v;
    } else {
      const p = this.endPos[v]; const last = this.ends[--this.endCount];
      this.ends[p] = last; this.endPos[last] = p; this.endPos[v] = -1;
    }
  }

  find(v) {
    let x = v;
    const parent = this.parent;
    if (this.marks > 0) {
      while (parent[x] !== x) x = parent[x];
      return x;
    }
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  enqueue(item) {
    if (!this.queued[item]) {
      this.queued[item] = 1;
      this.queue[(this.qHead + this.qSize) % this.queue.length] = item;
      this.qSize++;
    }
  }

  setEdge(e, value) {
    this.log(K_EDGE, e, this.edges[e]);
    this.edges[e] = value;
    this.unknowns--;
  }

  set(e, value) {
    if (this.contradiction) return false;
    const cur = this.edges[e];
    if (cur === value) return true;
    if (cur !== Edge.UNKNOWN) { this.contradiction = true; return false; }
    this.setEdge(e, value);
    if (value === Edge.LINE) {
      if (this.closed) { this.contradiction = true; return false; }
      const g = this.grid;
      const va = g.edgeVertices[2 * e], vb = g.edgeVertices[2 * e + 1];
      this.log(K_DEG, va, this.deg[va]); this.setDeg(va, this.deg[va] + 1);
      this.log(K_DEG, vb, this.deg[vb]); this.setDeg(vb, this.deg[vb] + 1);
      const a = this.find(va);
      const b = this.find(vb);
      this.totalLines++;
      if (a === b) {
        this.log(K_COMP, a, this.compLines[a]);
        this.compLines[a]++;
        if (this.compLines[a] !== this.totalLines) { this.contradiction = true; return false; }
        this.closed = true;
        for (let x = 0; x < g.edgeCount; x++) if (this.edges[x] === Edge.UNKNOWN) {
          this.setEdge(x, Edge.CROSS);
          this.touch(x);
        }
      } else {
        const big = this.compSize[a] > this.compSize[b];
        const child = big ? b : a;
        const root = big ? a : b;
        this.log(K_PARENT, child, this.parent[child]);
        this.parent[child] = root;
        this.log(K_COMP, root, this.compLines[root]);
        this.compLines[root] += this.compLines[child] + 1;
        this.log(K_SIZE, root, this.compSize[root]);
        this.compSize[root] += this.compSize[child];
        const x = this.endX[a] === va ? this.endY[a] : this.endX[a];
        const y = this.endX[b] === vb ? this.endY[b] : this.endX[b];
        this.log(K_EX, root, this.endX[root]); this.endX[root] = x;
        this.log(K_EY, root, this.endY[root]); this.endY[root] = y;
        for (const f of g.vertexEdges[x]) if (this.edges[f] === Edge.UNKNOWN && g.otherEnd(f, x) === y) {
          if (this.pendSize === this.pend.length) this.pend = grow(this.pend, this.pendSize * 2);
          this.pend[this.pendSize++] = f;
        }
      }
    }
    this.touch(e);
    return true;
  }

  touch(e) {
    const g = this.grid;
    for (const c of g.edgeCells[e]) if (this.clues[c] >= 0) this.enqueue(c);
    this.enqueue(g.cellCount + g.edgeVertices[2 * e]);
    this.enqueue(g.cellCount + g.edgeVertices[2 * e + 1]);
  }

  propagate() {
    const g = this.grid;
    if (this.qSize === 0 && !this.contradiction) {
      for (let c = 0; c < g.cellCount; c++) if (this.clues[c] >= 0) this.enqueue(c);
      for (let v = 0; v < g.vertexCount; v++) this.enqueue(g.cellCount + v);
    }
    const q = this.queue, len = q.length;
    while (!this.contradiction) {
      while (this.qSize > 0 && !this.contradiction) {
        const item = q[this.qHead];
        this.qHead = (this.qHead + 1) % len;
        this.qSize--;
        this.queued[item] = 0;
        if (item < g.cellCount) this.checkCell(item); else this.checkVertex(item - g.cellCount);
      }
      if (this.contradiction) break;
      if (this.closed || !this.crossLoopClosers()) break;
    }
    if (!this.contradiction && this.unknowns === 0 && !this.closed) this.contradiction = true;
    return !this.contradiction;
  }

  checkCell(c) {
    const k = this.clues[c];
    if (k < 0) return;
    const es = this.grid.cellEdges[c];
    let lines = 0, unknown = 0;
    for (const e of es) { const v = this.edges[e]; if (v === Edge.LINE) lines++; else if (v === Edge.UNKNOWN) unknown++; }
    if (lines > k || lines + unknown < k) { this.contradiction = true; return; }
    if (unknown === 0) return;
    let fill;
    if (lines === k) fill = Edge.CROSS;
    else if (lines + unknown === k) fill = Edge.LINE;
    else return;
    for (const e of es) if (this.edges[e] === Edge.UNKNOWN && !this.set(e, fill)) return;
  }

  checkVertex(v) {
    const es = this.grid.vertexEdges[v];
    let lines = 0, unknown = 0;
    for (const e of es) { const x = this.edges[e]; if (x === Edge.LINE) lines++; else if (x === Edge.UNKNOWN) unknown++; }
    if (lines > 2) this.contradiction = true;
    else if (lines === 2) {
      for (const e of es) if (this.edges[e] === Edge.UNKNOWN && !this.set(e, Edge.CROSS)) return;
    } else if (lines === 1) {
      if (unknown === 0) this.contradiction = true;
      else if (unknown === 1) { for (const e of es) if (this.edges[e] === Edge.UNKNOWN) { this.set(e, Edge.LINE); return; } }
    } else if (unknown === 1) {
      for (const e of es) if (this.edges[e] === Edge.UNKNOWN) { this.set(e, Edge.CROSS); return; }
    }
  }

  crossLoopClosers() {
    const g = this.grid;
    let n = 0;
    let w = this.pendBase;
    for (let i = 0; i < this.pendSize; i++) {
      const e = this.pend[i];
      const live = this.edges[e] === Edge.UNKNOWN;
      if (i >= this.pendBase) { if (live) this.pend[w++] = e; }
      if (!live) continue;
      if (this.find(g.edgeVertices[2 * e]) !== this.find(g.edgeVertices[2 * e + 1])) continue;
      if (n === this.closerBuf.length) this.closerBuf = grow(this.closerBuf, n * 2);
      this.closerBuf[n++] = e;
    }
    this.pendSize = w;
    if (n === 0) return false;
    if (n > 1) this.closerBuf.subarray(0, n).sort();
    let changed = false;
    let prev = -1;
    for (let i = 0; i < n; i++) {
      const e = this.closerBuf[i];
      if (e === prev) continue;
      prev = e;
      const a = this.find(g.edgeVertices[2 * e]);
      if (this.compLines[a] !== this.totalLines || !this.closingCompletes(e)) {
        this.set(e, Edge.CROSS);
        changed = true;
        if (this.contradiction) return true;
      }
    }
    return changed;
  }

  closingCompletes(e) {
    const g = this.grid;
    for (let c = 0; c < g.cellCount; c++) {
      const k = this.clues[c];
      if (k < 0) continue;
      let lines = 0;
      for (const x of g.cellEdges[c]) if (this.edges[x] === Edge.LINE || x === e) lines++;
      if (lines !== k) return false;
    }
    return true;
  }

  firstPathEnd() {
    let best = -1;
    for (let i = 0; i < this.endCount; i++) if (best < 0 || this.ends[i] < best) best = this.ends[i];
    return best;
  }

  solutionArray() { return Uint8Array.from(this.edges, (v) => (v === Edge.LINE ? 1 : 0)); }
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------
export const Solver = {
  solveLogic(puzzle, level = 2, start = null) {
    const state = start ? start.copy() : new SolveState(puzzle.grid, puzzle.clues);
    if (!state.propagate()) return { state, solved: false, usedTrials: false };
    let usedTrials = false;
    if (level >= 2) {
      const n = state.grid.edgeCount;
      const changed = new Int32Array(n);
      const lineVal = new Uint8Array(n);
      const lineStamp = new Int32Array(n);
      let stamp = 0;
      const agreed = new Int32Array(n);
      let progress = true;
      while (progress && !state.isSolved && !state.contradiction) {
        progress = false;
        for (let e = 0; e < n; e++) {
          if (state.edges[e] !== Edge.UNKNOWN) continue;
          const m1 = state.mark();
          state.set(e, Edge.LINE); state.propagate();
          const lineBad = state.contradiction;
          stamp++;
          if (!lineBad) {
            const k = state.changedSince(m1, changed);
            for (let i = 0; i < k; i++) { const x = changed[i]; lineStamp[x] = stamp; lineVal[x] = state.edges[x]; }
          }
          state.undo(m1);
          const m2 = state.mark();
          state.set(e, Edge.CROSS); state.propagate();
          const crossBad = state.contradiction;
          let na = 0;
          if (!lineBad && !crossBad) {
            const k = state.changedSince(m2, changed);
            for (let i = 0; i < k; i++) {
              const x = changed[i];
              if (lineStamp[x] === stamp && lineVal[x] === state.edges[x]) agreed[na++] = x;
            }
          }
          const crossVals = na > 0 ? Uint8Array.from({ length: na }, (_, i) => state.edges[agreed[i]]) : null;
          state.undo(m2);
          if (lineBad && crossBad) { state.contradiction = true; break; }
          else if (lineBad) { state.set(e, Edge.CROSS); state.propagate(); progress = true; usedTrials = true; }
          else if (crossBad) { state.set(e, Edge.LINE); state.propagate(); progress = true; usedTrials = true; }
          else if (na > 0) {
            const order = range(na).sort((a, b) => agreed[a] - agreed[b]);
            let any = false;
            for (const i of order) {
              const x = agreed[i];
              if (state.edges[x] === Edge.UNKNOWN) { state.set(x, crossVals[i]); any = true; }
            }
            if (any) { progress = true; usedTrials = true; state.propagate(); }
          }
          if (state.contradiction || state.isSolved) break;
        }
      }
    }
    return { state, solved: state.isSolved, usedTrials };
  },

  logicSolves(puzzle, level = 2, start = null) {
    return Solver.logicFixpoint(puzzle, level, start).isSolved;
  },

  logicFixpoint(puzzle, level = 2, start = null, tryFirst = null, record = null) {
    const state = start ? start.copy() : new SolveState(puzzle.grid, puzzle.clues);
    if (!state.propagate() || level < 2 || state.isSolved) return state;
    const g = state.grid;
    const n = g.edgeCount;
    const changed = new Int32Array(n);
    const lineVal = new Uint8Array(n);
    const lineStamp = new Int32Array(n);
    let stamp = 0;
    const agreed = new Int32Array(n);
    const queue = new Int32Array(n);
    const inQueue = new Uint8Array(n);
    let qHead = 0, qSize = 0;
    const push = (e) => {
      if (inQueue[e] || state.edges[e] !== Edge.UNKNOWN) return;
      inQueue[e] = 1; queue[(qHead + qSize) % n] = e; qSize++;
    };
    const pushNear = (x) => {
      for (let k = 0; k <= 1; k++) for (const f of g.vertexEdges[g.edgeVertices[2 * x + k]]) push(f);
      for (const c of g.edgeCells[x]) for (const f of g.cellEdges[c]) push(f);
    };
    let cleanSweep = true;
    if (tryFirst) for (const e of tryFirst) push(e);
    for (let e = 0; e < n; e++) push(e);
    for (;;) {
      if (qSize === 0) {
        if (cleanSweep) return state;
        cleanSweep = true;
        for (let e = 0; e < n; e++) push(e);
        if (qSize === 0) return state;
      }
      const e = queue[qHead]; qHead = (qHead + 1) % n; qSize--;
      inQueue[e] = 0;
      if (state.edges[e] !== Edge.UNKNOWN) continue;
      const m1 = state.mark();
      state.set(e, Edge.LINE); state.propagate();
      const lineBad = state.contradiction;
      stamp++;
      if (!lineBad) {
        const k = state.changedSince(m1, changed);
        for (let i = 0; i < k; i++) { const x = changed[i]; lineStamp[x] = stamp; lineVal[x] = state.edges[x]; }
      }
      state.undo(m1);
      let na = 0;
      if (!lineBad) {
        const m2 = state.mark();
        state.set(e, Edge.CROSS); state.propagate();
        const crossBad = state.contradiction;
        if (!crossBad) {
          const k = state.changedSince(m2, changed);
          for (let i = 0; i < k; i++) {
            const x = changed[i];
            if (lineStamp[x] === stamp && lineVal[x] === state.edges[x]) agreed[na++] = x;
          }
          for (let i = 0; i < na; i++) lineVal[agreed[i]] = state.edges[agreed[i]];
        }
        state.undo(m2);
        if (crossBad) { agreed[0] = e; lineVal[e] = Edge.LINE; na = 1; }
      } else {
        agreed[0] = e; lineVal[e] = Edge.CROSS; na = 1;
      }
      if (na === 0) continue;
      if (record) record.push(e);
      const m = state.mark();
      for (let i = 0; i < na; i++) { const x = agreed[i]; if (state.edges[x] === Edge.UNKNOWN) state.set(x, lineVal[x]); }
      state.propagate();
      const k = state.changedSince(m, changed);
      state.commit(m);
      if (state.contradiction || state.isSolved) return state;
      cleanSweep = false;
      for (let i = 0; i < k; i++) pushNear(changed[i]);
    }
  },

  countSolutions(puzzle, limit = 2, maxNodes = 200000, start = null, onSolution = null) {
    const s = start ? start.copy() : new SolveState(puzzle.grid, puzzle.clues);
    let count = 0, nodes = 0, aborted = false;
    const dfs = () => {
      if (count >= limit || aborted) return;
      if (++nodes > maxNodes) { aborted = true; return; }
      if (!s.propagate()) return;
      if (s.isSolved) { count++; if (onSolution) onSolution(s.solutionArray()); return; }
      const e = pickBranchEdge(s);
      if (e < 0) return;
      for (const value of BRANCHES) {
        const m = s.mark();
        s.set(e, value);
        dfs();
        s.undo(m);
      }
    };
    dfs();
    return aborted && count < limit ? -1 : count;
  },

  isValidSolution(puzzle, lines) {
    const g = puzzle.grid;
    for (let c = 0; c < g.cellCount; c++) {
      const k = puzzle.clues[c];
      if (k >= 0) { let n = 0; for (const e of g.cellEdges[c]) if (lines[e]) n++; if (n !== k) return false; }
    }
    return Solver.isSingleLoop(g, lines);
  },

  isSingleLoop(g, lines) {
    let total = 0, start = -1;
    for (let e = 0; e < g.edgeCount; e++) if (lines[e]) { total++; if (start < 0) start = e; }
    if (total === 0) return false;
    for (let v = 0; v < g.vertexCount; v++) {
      let d = 0; for (const e of g.vertexEdges[v]) if (lines[e]) d++;
      if (d !== 0 && d !== 2) return false;
    }
    let prevEdge = start;
    const first = g.edgeVertices[2 * start];
    let v = g.edgeVertices[2 * start + 1];
    let length = 1;
    while (v !== first) {
      let next = -1;
      for (const e of g.vertexEdges[v]) if (e !== prevEdge && lines[e]) { next = e; break; }
      v = g.otherEnd(next, v);
      prevEdge = next;
      length++;
    }
    return length === total;
  },
};

const BRANCHES = [Edge.LINE, Edge.CROSS];

function pickBranchEdge(s) {
  const g = s.grid;
  const v = s.firstPathEnd();
  if (v >= 0) {
    let cand = -1;
    for (const e of g.vertexEdges[v]) if (s.edges[e] === Edge.UNKNOWN) cand = e;
    if (cand >= 0) return cand;
  }
  let best = -1, bestScore = -1;
  for (let c = 0; c < g.cellCount; c++) {
    const k = s.clues[c];
    if (k < 0) continue;
    let unknown = 0, cand = -1;
    for (const e of g.cellEdges[c]) if (s.edges[e] === Edge.UNKNOWN) { unknown++; cand = e; }
    if (unknown === 0) continue;
    const score = 10 - unknown + (k === 3 ? 2 : 0);
    if (score > bestScore) { bestScore = score; best = cand; }
  }
  if (best >= 0) return best;
  return s.edges.indexOf(Edge.UNKNOWN);
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------
export const LoopGenerator = {
  randomLoop(grid, rnd) {
    for (;;) { const loop = tryGrow(grid, rnd); if (loop) return loop; }
  },
  outline(g, inside) {
    const lines = new Uint8Array(g.edgeCount);
    for (let e = 0; e < g.edgeCount; e++) {
      const cells = g.edgeCells[e];
      const a = inside[cells[0]];
      const b = cells.length > 1 ? inside[cells[1]] : 0;
      lines[e] = (a ? 1 : 0) !== (b ? 1 : 0) ? 1 : 0;
    }
    return lines;
  },
};

function tryGrow(g, rnd) {
  const inside = new Uint8Array(g.cellCount);
  const targetFraction = 0.40 + rnd.nextDouble() * 0.25;
  const target = Math.max(1, Math.trunc(g.cellCount * targetFraction));
  inside[rnd.nextIntBelow(g.cellCount)] = 1;
  let size = 1, failures = 0;
  const frontier = [];
  while (size < target && failures < g.cellCount * 4) {
    frontier.length = 0;
    for (let c = 0; c < g.cellCount; c++) {
      if (inside[c]) continue;
      let any = false; for (const o of g.cellNeighbours[c]) if (inside[o]) { any = true; break; }
      if (any) frontier.push(c);
    }
    if (frontier.length === 0) break;
    const thin = frontier.filter((c) => { let n = 0; for (const o of g.cellNeighbours[c]) if (inside[o]) n++; return n === 1; });
    const pool = thin.length > 0 && rnd.nextDouble() < 0.7 ? thin : frontier;
    const c = pool[rnd.nextIntBelow(pool.length)];
    inside[c] = 1;
    if (Solver.isSingleLoop(g, LoopGenerator.outline(g, inside))) size++; else { inside[c] = 0; failures++; }
  }
  if (size < 2 && g.cellCount > 2) return null;
  return LoopGenerator.outline(g, inside);
}

const BIG_BOARD = 300, BIG_NODES = 2000, LOCAL_CELLS = 60, LOCAL_NODES = 2000;

class Removal {
  constructor(p, d, removed, loop, lastDerivation) {
    this.p = p; this.d = d; this.removed = removed; this.loop = loop; this.lastDerivation = lastDerivation;
    this.derivation = null;
  }
  acceptable() {
    const p = this.p, d = this.d;
    if (Solver.logicSolves(p, 1)) return true;
    if (d === 'EASY') return false;
    const local = Solver.logicFixpoint(p, 2, this.pinFarEdges());
    if (!local.isSolved) {
      if (d === 'MEDIUM') return false;
      if (Solver.countSolutions(p, 2, LOCAL_NODES, local) >= 2) return false;
    }
    return d === 'HARD' && p.grid.cellCount > BIG_BOARD ? this.bigHard() : this.plain();
  }
  plain() {
    switch (this.d) {
      case 'EASY': return false;
      case 'MEDIUM': return this.level2().isSolved;
      default: return this.level2().isSolved || Solver.countSolutions(this.p, 2, 20000) === 1;
    }
  }
  bigHard() {
    const l2 = this.level2();
    if (l2.isSolved) return true;
    if (l2.contradiction) return false;
    return Solver.countSolutions(this.p, 2, BIG_NODES, l2) === 1;
  }
  level2() {
    const rec = [];
    const r = Solver.logicFixpoint(this.p, 2, null, this.lastDerivation, rec);
    this.derivation = rec;
    return r;
  }
  pinFarEdges() {
    const g = this.p.grid;
    const near = new Uint8Array(g.cellCount);
    const bfs = new Int32Array(g.cellCount);
    let head = 0, tail = 0;
    near[this.removed] = 1; bfs[tail++] = this.removed;
    while (head < tail && tail < LOCAL_CELLS) {
      const ringEnd = tail;
      while (head < ringEnd) {
        const x = bfs[head++];
        for (const y of g.cellNeighbours[x]) if (!near[y]) { near[y] = 1; bfs[tail++] = y; }
      }
    }
    const s = new SolveState(g, this.p.clues);
    for (let e = 0; e < g.edgeCount; e++) {
      let isNear = false; for (const c of g.edgeCells[e]) if (near[c]) { isNear = true; break; }
      if (isNear) continue;
      s.set(e, this.loop[e] ? Edge.LINE : Edge.CROSS);
    }
    return s;
  }
}

export const PuzzleGenerator = {
  BIG_BOARD,
  generate(width, height, difficulty, seed, shape = Shape.SQUARE) {
    if (!(width >= 2 && width <= 40 && height >= 2 && height <= 40)) throw new Error('Board sides must be 2..40');
    if (seed == null) seed = PuzzleCode.randomSeed();
    seed = BigInt(seed);
    const rnd = new KRandom(seed);
    const grid = Grid.create(shape, width, height);
    let loop, clues, floorDifficulty, derivation = null;
    for (;;) {
      loop = LoopGenerator.randomLoop(grid, rnd);
      clues = new Int32Array(grid.cellCount);
      for (let c = 0; c < grid.cellCount; c++) { let n = 0; for (const e of grid.cellEdges[c]) if (loop[e]) n++; clues[c] = n; }
      const full = new Puzzle(width, height, clues, null, null, null, shape);
      const rec = [];
      if (Solver.logicSolves(full, 1)) floorDifficulty = 'EASY';
      else if (Solver.logicFixpoint(full, 2, null, null, rec).isSolved) floorDifficulty = 'MEDIUM';
      else if (Solver.countSolutions(full, 2, 50000) === 1) floorDifficulty = 'HARD';
      else continue;
      derivation = Int32Array.from(rec);
      break;
    }
    const level = dOrd(difficulty) >= dOrd(floorDifficulty) ? difficulty : floorDifficulty;
    const keepFloor = difficulty === 'EASY' ? Math.trunc(grid.cellCount * 0.45)
      : difficulty === 'MEDIUM' ? Math.trunc(grid.cellCount * 0.42) : 0;
    const order = shuffled(range(grid.cellCount), rnd);
    let clueCount = grid.cellCount;
    for (const c of order) {
      if (clueCount <= keepFloor) break;
      const saved = clues[c];
      clues[c] = Puzzle.NO_CLUE;
      const removal = new Removal(new Puzzle(width, height, clues, null, null, null, shape), level, c, loop, derivation);
      if (removal.acceptable()) {
        clueCount--;
        if (removal.derivation) derivation = Int32Array.from(removal.derivation);
      } else clues[c] = saved;
    }
    return new Puzzle(width, height, clues, loop, difficulty, seed, shape);
  },

  lesson(width, height, seed, keep = 0.75) {
    seed = BigInt(seed);
    const base = PuzzleGenerator.generate(width, height, 'EASY', seed);
    const loop = base.solution;
    const g = base.grid;
    const clues = base.clues.slice();
    const target = Math.trunc(g.cellCount * keep);
    const missing = shuffled(range(g.cellCount).filter((i) => clues[i] === Puzzle.NO_CLUE), new KRandom(seed ^ 0x5EEDn));
    let count = g.cellCount - missing.length;
    const board = () => new Puzzle(width, height, clues.slice(), loop, 'EASY', seed, base.shape);
    for (const c of missing) {
      if (count >= target && Solver.logicSolves(board(), 1)) break;
      let n = 0; for (const e of g.cellEdges[c]) if (loop[e]) n++;
      clues[c] = n;
      count++;
    }
    return board();
  },

  grade(p) {
    if (Solver.solveLogic(p, 1).solved) return 'EASY';
    if (Solver.solveLogic(p, 2).solved) return 'MEDIUM';
    return 'HARD';
  },
};

// ---------------------------------------------------------------------------
// Game: the player's side of a puzzle
// ---------------------------------------------------------------------------
export class Game {
  constructor(puzzle) {
    this.puzzle = puzzle;
    this.grid = puzzle.grid;
    const n = this.grid.edgeCount;
    this.marks = new Uint8Array(n);
    this.hinted = new Uint8Array(n);
    this.hintsUsed = 0;
    this.elapsedMs = 0;
    this.autoCross = false;
    this.onLocalChange = null;
    // Shared boards (co-op): who drew each mark, and this device's player id.
    this.owner = new Uint8Array(n);
    this.localPlayer = 0;
    this.undoStack = []; this.redoStack = []; this.pending = null;
    this._solution = null;
  }

  get solution() {
    if (!this._solution) {
      if (this.puzzle.solution) this._solution = this.puzzle.solution;
      else {
        let found = null;
        Solver.countSolutions(this.puzzle, 1, 2000000, null, (s) => { found = s; });
        this._solution = found || new Uint8Array(this.grid.edgeCount);
      }
    }
    return this._solution;
  }

  beginStroke() { if (this.pending == null) this.pending = []; }
  endStroke() {
    const p = this.pending; if (p == null) return;
    this.pending = null;
    if (p.length) { this.undoStack.push(p); this.redoStack.length = 0; }
    if (this.undoStack.length > 500) this.undoStack.shift();
  }

  cycle(edge, reverse = false) {
    const m = this.marks[edge];
    const next = !reverse
      ? (m === Edge.UNKNOWN ? Edge.LINE : m === Edge.LINE ? Edge.CROSS : Edge.UNKNOWN)
      : (m === Edge.UNKNOWN ? Edge.CROSS : m === Edge.CROSS ? Edge.LINE : Edge.UNKNOWN);
    this.setMark(edge, next);
  }

  setMark(edge, value) {
    if (this.hinted[edge] || this.marks[edge] === value || this.isSolved()) return;
    const own = this.pending == null;
    if (own) this.beginStroke();
    this.record(edge, value);
    if (this.autoCross && value === Edge.LINE) this.autoCrossAround(edge);
    if (own) this.endStroke();
  }

  record(edge, value) { this.pending.push({ edge, before: this.marks[edge], after: value }); this.put(edge, value); }
  put(edge, value) { this.marks[edge] = value; this.owner[edge] = this.localPlayer & 255; if (this.onLocalChange) this.onLocalChange(edge, value, !!this.hinted[edge]); }

  /** Applies a change made by another player. It never enters this player's undo history. */
  applyRemote(edge, value, by, isHint) {
    if (!(edge >= 0 && edge < this.grid.edgeCount)) return;
    this.marks[edge] = value;
    this.owner[edge] = by & 255;
    if (isHint && !this.hinted[edge]) { this.hinted[edge] = 1; this.hintsUsed++; }
  }

  /** Whole shared board as text (marks, owners, hints), same format as Android. */
  boardState() {
    let s = '';
    for (let e = 0; e < this.grid.edgeCount; e++) s += String.fromCharCode(48 + this.marks[e], 48 + this.owner[e]) + (this.hinted[e] ? '1' : '0');
    return s;
  }

  loadBoardState(text) {
    if (text.length !== this.grid.edgeCount * 3) return;
    let n = 0;
    for (let e = 0; e < this.grid.edgeCount; e++) {
      this.marks[e] = text.charCodeAt(3 * e) - 48;
      this.owner[e] = text.charCodeAt(3 * e + 1) - 48;
      this.hinted[e] = text[3 * e + 2] === '1' ? 1 : 0;
      if (this.hinted[e]) n++;
    }
    this.hintsUsed = n;
  }

  autoCrossAround(edge) {
    const g = this.grid;
    for (const c of g.edgeCells[edge]) {
      const k = this.puzzle.clues[c];
      if (k >= 0 && this.linesAround(c) === k) {
        for (const e of g.cellEdges[c]) if (this.marks[e] === Edge.UNKNOWN && !this.hinted[e]) this.record(e, Edge.CROSS);
      }
    }
    for (let side = 0; side <= 1; side++) {
      const v = g.edgeVertices[2 * edge + side];
      let n = 0; for (const e of g.vertexEdges[v]) if (this.marks[e] === Edge.LINE) n++;
      if (n === 2) for (const e of g.vertexEdges[v]) if (this.marks[e] === Edge.UNKNOWN && !this.hinted[e]) this.record(e, Edge.CROSS);
    }
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  undo() {
    const step = this.undoStack.pop(); if (!step) return false;
    for (let i = step.length - 1; i >= 0; i--) { const ch = step[i]; if (this.marks[ch.edge] === ch.after && !this.hinted[ch.edge]) this.put(ch.edge, ch.before); }
    this.redoStack.push(step);
    return true;
  }
  redo() {
    const step = this.redoStack.pop(); if (!step) return false;
    for (const ch of step) if (this.marks[ch.edge] === ch.before && !this.hinted[ch.edge]) this.put(ch.edge, ch.after);
    this.undoStack.push(step);
    return true;
  }
  reset() {
    const sol = this.solution;
    for (let e = 0; e < this.grid.edgeCount; e++) {
      const v = this.hinted[e] ? (sol[e] ? Edge.LINE : Edge.CROSS) : Edge.UNKNOWN;
      if (this.marks[e] !== v) this.put(e, v);
    }
    this.undoStack.length = 0; this.redoStack.length = 0;
  }

  linesAround(cell) { let n = 0; for (const e of this.grid.cellEdges[cell]) if (this.marks[e] === Edge.LINE) n++; return n; }

  clueStatus(cell) {
    const k = this.puzzle.clues[cell];
    if (k < 0) return 'OPEN';
    const es = this.grid.cellEdges[cell];
    const lines = this.linesAround(cell);
    let crosses = 0; for (const e of es) if (this.marks[e] === Edge.CROSS) crosses++;
    if (lines > k || es.length - crosses < k) return 'OVER';
    if (lines === k) return 'DONE';
    return 'OPEN';
  }

  vertexError(v) {
    let lines = 0, open = 0;
    for (const e of this.grid.vertexEdges[v]) { const m = this.marks[e]; if (m === Edge.LINE) lines++; else if (m === Edge.UNKNOWN) open++; }
    return lines > 2 || (lines === 1 && open === 0);
  }

  lineCount() { let n = 0; for (const m of this.marks) if (m === Edge.LINE) n++; return n; }

  isSolved() {
    const lines = Uint8Array.from(this.marks, (m) => (m === Edge.LINE ? 1 : 0));
    return Solver.isValidSolution(this.puzzle, lines);
  }

  mistakes() {
    const sol = this.solution, out = [];
    for (let e = 0; e < this.grid.edgeCount; e++) if ((this.marks[e] === Edge.LINE && !sol[e]) || (this.marks[e] === Edge.CROSS && sol[e])) out.push(e);
    return out;
  }

  progress() {
    const sol = this.solution;
    let total = 0, good = 0;
    for (let e = 0; e < sol.length; e++) if (sol[e]) { total++; if (this.marks[e] === Edge.LINE) good++; }
    return total === 0 ? 0 : good / total;
  }

  findHint() {
    if (this.isSolved()) return null;
    const g = this.grid, sol = this.solution, marks = this.marks, clues = this.puzzle.clues;
    const wrongLines = [], wrongCrosses = [];
    for (let e = 0; e < g.edgeCount; e++) {
      if (marks[e] === Edge.LINE && !sol[e]) wrongLines.push(e);
      if (marks[e] === Edge.CROSS && sol[e]) wrongCrosses.push(e);
    }
    if (wrongLines.length || wrongCrosses.length) {
      const n = wrongLines.length + wrongCrosses.length;
      return makeHint(-1, `${n} wrong mark${n === 1 ? '' : 's'}, circled in red.`, -1, -1, wrongLines.concat(wrongCrosses));
    }
    const missing = [];
    for (let e = 0; e < g.edgeCount; e++) if (sol[e] && marks[e] !== Edge.LINE) missing.push(e);
    if (!missing.length) return null;

    const state = new SolveState(g, clues);
    for (let e = 0; e < g.edgeCount; e++) if (marks[e] !== Edge.UNKNOWN) state.set(e, marks[e]);
    const basic = state.copy(); basic.propagate();
    let deduced = missing.filter((e) => basic.edges[e] === Edge.LINE);
    if (!deduced.length) {
      const deep = Solver.solveLogic(this.puzzle, 2, state).state;
      deduced = missing.filter((e) => deep.edges[e] === Edge.LINE);
    }
    const pool = deduced.length ? deduced : missing;
    const extendsPath = (e) => [0, 1].some((s) => {
      const v = g.edgeVertices[2 * e + s];
      let n = 0; for (const f of g.vertexEdges[v]) if (marks[f] === Edge.LINE) n++;
      return n === 1;
    });
    const withReason = pool.map((e) => [e, this.directReason(e)]);
    const pick = withReason.find((x) => x[1] && extendsPath(x[0]))
      || withReason.find((x) => x[1])
      || withReason.find((x) => extendsPath(x[0]))
      || withReason[0];
    const e = pick[0];
    if (pick[1]) return pick[1];
    const cells = g.edgeCells[e];
    let cell = cells[0];
    for (const c of cells) if (clues[c] >= 0) { cell = c; break; }
    const why = extendsPath(e) ? 'Your fence has to continue here.'
      : clues[cell] >= 0 ? `The ${clues[cell]} needs this side.` : 'The loop runs along here.';
    return makeHint(e, why, clues[cell] >= 0 ? cell : -1);
  }

  directReason(e) {
    const g = this.grid, marks = this.marks, clues = this.puzzle.clues;
    for (const c of g.edgeCells[e]) {
      const k = clues[c];
      if (k < 0) continue;
      const es = g.cellEdges[c];
      let lines = 0, open = 0;
      for (const x of es) { if (marks[x] === Edge.LINE) lines++; else if (marks[x] === Edge.UNKNOWN) open++; }
      if (lines + open === k) return makeHint(e, `The ${k} needs every free side.`, c);
      if (k === es.length - 1 && lines === 0 && open === es.length) {
        let zeroNext = false;
        for (const side of es) for (const o of g.edgeCells[side]) if (o !== c && clues[o] === 0) zeroNext = true;
        if (zeroNext) return makeHint(e, `A ${k} next to a 0 uses all its other sides.`, c);
        if (k === 3 && g.edgeCells[e].length === 1 && this.isCornerCell(c)) return makeHint(e, 'A 3 in a corner uses both outside edges.', c);
      }
    }
    for (let s = 0; s <= 1; s++) {
      const v = g.edgeVertices[2 * e + s];
      let lines = 0, open = 0;
      for (const x of g.vertexEdges[v]) { if (marks[x] === Edge.LINE) lines++; else if (marks[x] === Edge.UNKNOWN) open++; }
      if (lines === 1 && open === 1) return makeHint(e, 'This fence end has only one way out.', -1, v);
    }
    return null;
  }

  isCornerCell(c) {
    const g = this.grid;
    if (g.shape !== Shape.SQUARE) return false;
    const r = Math.floor(c / g.width), col = c % g.width;
    return (r === 0 || r === g.height - 1) && (col === 0 || col === g.width - 1);
  }

  applyHint(h) { this.hinted[h.edge] = 1; this.hintsUsed++; this.put(h.edge, Edge.LINE); }

  clearMistakes() {
    const wrong = this.mistakes();
    if (!wrong.length) return 0;
    this.beginStroke();
    for (const e of wrong) this.record(e, Edge.UNKNOWN);
    this.endStroke();
    return wrong.length;
  }

  saveString() {
    let s = this.puzzle.encode(true) + '|';
    for (const m of this.marks) s += m;
    s += '|';
    for (const h of this.hinted) s += h ? '1' : '0';
    s += '|' + this.hintsUsed + '|' + Math.round(this.elapsedMs);
    s += '|' + (this.puzzle.difficulty || '') + '|' + (this.puzzle.seed != null ? this.puzzle.seed.toString() : '');
    return s;
  }

  static load(text) {
    const parts = text.split('|');
    const p0 = Puzzle.decode(parts[0]);
    const diff = parts[5] ? parts[5] : null;
    const seed = parts[6] && /^-?\d+$/.test(parts[6]) ? BigInt(parts[6]) : null;
    const p = new Puzzle(p0.width, p0.height, p0.clues, p0.solution, diff, seed, p0.shape);
    const g = new Game(p);
    for (let i = 0; i < parts[1].length; i++) g.marks[i] = parts[1].charCodeAt(i) - 48;
    for (let i = 0; i < parts[2].length; i++) g.hinted[i] = parts[2][i] === '1' ? 1 : 0;
    g.hintsUsed = parseInt(parts[3], 10) || 0;
    g.elapsedMs = parseInt(parts[4], 10) || 0;
    return g;
  }
}

function makeHint(edge, reason, focusCell = -1, focusVertex = -1, wrong = []) {
  return { edge, reason, focusCell, focusVertex, wrong, isFix: wrong.length > 0, isLine: true };
}

// ---------------------------------------------------------------------------
// Tutorial
// ---------------------------------------------------------------------------
export const Tutorial = {
  steps: [
    { title: 'Draw and mark', tip: 'Each number tells how many of its 4 sides are fence.', kind: 'BASICS', size: 3, seed: 1n, keep: 0.8 },
    { title: 'Follow the dots', tip: 'Every dot has two fence pieces touching it, or none.', kind: 'DOTS', size: 3, seed: 13n, keep: 0.8 },
    { title: 'Starter tricks', tip: 'Start with the 0s, then the corners.', kind: 'TRICKS', size: 3, seed: 11n, keep: 0.8 },
  ],
  puzzle(i) { const s = Tutorial.steps[i]; return PuzzleGenerator.lesson(s.size, s.size, s.seed, s.keep); },
  goalPuzzle() { return PuzzleGenerator.lesson(3, 3, 3n, 0.8); },
  prepared(i, p) { return Tutorial.steps[i].kind === 'DOTS' ? loopOrder(p).slice(0, 2) : []; },

  guide(i, p) {
    const sol = p.solution; if (!sol) return [];
    const g = p.grid;
    const out = [];
    const done = new Set(Tutorial.prepared(i, p));
    const line = (text, edges) => { const e = edges.filter((x) => !done.has(x)); e.forEach((x) => done.add(x)); out.push({ text, edges: e, value: Edge.LINE }); };
    const cross = (text, edges) => { const e = edges.filter((x) => !done.has(x) && !sol[x]); e.forEach((x) => done.add(x)); out.push({ text, edges: e, value: Edge.CROSS }); };
    const outer = (c) => Array.from(g.cellEdges[c]).filter((e) => g.edgeCells[e].length === 1);
    const corners = [0, p.width - 1, p.width * (p.height - 1), p.width * p.height - 1];
    const zeros = range(g.cellCount).filter((c) => p.clues[c] === 0);
    const allSol = range(g.edgeCount).filter((e) => sol[e]);
    switch (Tutorial.steps[i].kind) {
      case 'BASICS': {
        const three = corners.concat(range(g.cellCount)).find((c) => p.clues[c] === 3);
        if (three !== undefined) {
          const fences = Array.from(g.cellEdges[three]).filter((e) => sol[e]).sort((a, b) => g.edgeCells[a].length - g.edgeCells[b].length);
          line('Tap the glowing gap to draw a fence.', fences.slice(0, 1));
          line('A 3 means three of its 4 sides are fence. Draw the other two glowing gaps.', fences.slice(1));
        }
        if (zeros.length) {
          const gaps = Array.from(g.cellEdges[zeros[0]]);
          cross('A 0 means none of its sides are fence. Press and hold the glowing gap to mark it X.', gaps.slice(0, 1));
          cross('Mark its other sides X too. Press and hold each one.', gaps.slice(1));
        }
        line('Now close the fence into one ring. Draw the glowing gaps.', allSol);
        break;
      }
      case 'DOTS': {
        const order = loopOrder(p);
        const shared = (a, b) => [0, 1].map((k) => g.edgeVertices[2 * a + k]).find((v) => v === g.edgeVertices[2 * b] || v === g.edgeVertices[2 * b + 1]);
        line('A fence never stops at a dot. This one has just one piece, so carry it on: draw the glowing gap.', [order[2]]);
        const full = [1, 2].map((k) => shared(order[k - 1], order[k])).find((v) => Array.from(g.vertexEdges[v]).some((e) => !sol[e]));
        if (full !== undefined) cross("This dot has two fence pieces now. That's the most a dot can have, so mark its other gaps X.", Array.from(g.vertexEdges[full]));
        line('Same again: carry the fence on.', [order[3]]);
        line('Keep going until the fence closes into one ring. Every dot ends with two pieces, or none.', order);
        break;
      }
      case 'TRICKS': {
        zeros.forEach((z, k) => cross(k === 0 ? 'A 0 has no fence on any side. Mark all its sides X.' : 'Another 0: X on all its sides too.', Array.from(g.cellEdges[z])));
        const c3 = corners.find((c) => p.clues[c] === 3);
        if (c3 !== undefined) line('A 3 in a corner: both outer sides are fence. If one were empty, the fence would stop at the corner dot.', outer(c3));
        const c1 = corners.find((c) => p.clues[c] === 1);
        if (c1 !== undefined) cross('A 1 in a corner: both outer sides stay empty. A fence there would stop at the corner dot.', outer(c1));
        line('Now finish the fence. Draw the glowing gaps.', allSol);
        break;
      }
    }
    return out.filter((s) => s.edges.length > 0);
  },
};

function loopOrder(p) {
  const g = p.grid, sol = p.solution;
  let first = -1; for (let e = 0; e < g.edgeCount; e++) if (sol[e]) { first = e; break; }
  const out = [first];
  let prev = first;
  let v = g.edgeVertices[2 * first + 1];
  for (;;) {
    let next = -1; for (const e of g.vertexEdges[v]) if (sol[e] && e !== prev) { next = e; break; }
    if (next === first) break;
    out.push(next);
    v = g.edgeVertices[2 * next] === v ? g.edgeVertices[2 * next + 1] : g.edgeVertices[2 * next];
    prev = next;
  }
  return out;
}

// ---------------------------------------------------------------------------
// App helpers shared with Android (Store.kt)
// ---------------------------------------------------------------------------
export const Boards = {
  sizes(shape) {
    switch (shape) {
      case Shape.SQUARE: return ['3x3', '5x5', '7x7', '10x10', '12x12', '15x15', '8x12', '10x16'];
      case Shape.HEX: return ['4x5', '6x7', '8x9', '9x12'];
      case Shape.TRIANGLE: return ['4x5', '6x7', '7x9', '8x11'];
      case Shape.CAIRO: return ['4x5', '6x6', '7x8', '8x10'];
    }
    return [];
  },
  /** Picker default: the second size, skipping the 3x3 beginner board. */
  defaultSize(shape) { return Boards.sizes(shape).filter((s) => s !== '3x3')[1]; },
  key(shape, w, h) { return `${shape.code}${w}x${h}`; },
  label(shape, w, h) { return shape === Shape.SQUARE ? `${w}×${h}` : `${shape.label} ${w}×${h}`; },
};

/** Same seed as the Android daily: yyyymmdd of the local date. */
export function dailySeed(date = new Date()) {
  return BigInt(date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate());
}
