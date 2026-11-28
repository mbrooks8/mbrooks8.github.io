// Timelapse: every fence, X, erase, undo and hint of a game, with its time, so a finished puzzle
// can be watched again from Stats. Kept small: about 3 letters per move, and only the newest games.
// No screens in here (the player is replay.js), so the tests can run it in Node.
import { Edge } from './core.js';
import { store } from './store.js';

/** What made a change: a normal move, an undo, or a hint. */
export const Kind = { MOVE: 0, UNDO: 1, HINT: 2 };

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const TICK = 100; // times are kept to a tenth of a second
export const MAX_MOVES = 6000; // a very long game stops recording here (about 18 KB)
export const KEEP = 40; // timelapses kept, newest first
export const KEEP_CHARS = 300000; // and no more than this much text in all

/** Whole numbers as letters: 5 bits a letter, the low ones first; letters 32-63 mean "more follows". */
function putNum(out, n) {
  n = Math.max(0, Math.floor(n));
  while (n >= 32) { out.push(ABC[32 + (n % 32)]); n = Math.floor(n / 32); }
  out.push(ABC[n]);
}
function reader(s, i) {
  return {
    get done() { return i >= s.length; },
    num() {
      let n = 0, mul = 1;
      for (;;) {
        if (i >= s.length) throw new Error('timelapse ends early');
        const c = ABC.indexOf(s[i++]);
        if (c < 0) throw new Error('bad timelapse letter');
        n += (c & 31) * mul; mul *= 32;
        if (c < 32) return n;
      }
    },
  };
}
const cleanName = s => String(s || '').replace(/[;~^\n|]/g, ' ').trim().slice(0, 16);

/**
 * Watches a game's marks and writes down each change: {t, edge, value, player, kind}.
 * Call sample() after anything that may change the board (it compares with what it saw last).
 */
export class Recorder {
  constructor(edgeCount) {
    this.seen = new Uint8Array(edgeCount);
    this.moves = [];
    this.lastT = 0;
    this.full = false;
    /** Co-op: seat -> [pencil, name], for colours and the names under the replay. */
    this.players = new Map();
  }

  sample(game, t, kind = Kind.MOVE) {
    if (!game || game.marks.length !== this.seen.length) return 0;
    const m = game.marks, seen = this.seen;
    t = Math.max(this.lastT, Math.round(t / TICK) * TICK);
    let n = 0;
    for (let e = 0; e < m.length; e++) {
      if (m[e] === seen[e]) continue;
      seen[e] = m[e];
      if (this.full) continue;
      if (this.moves.length >= MAX_MOVES) { this.full = true; continue; }
      const k = game.hinted[e] && m[e] !== Edge.UNKNOWN ? Kind.HINT : kind;
      this.moves.push({ t, edge: e, value: m[e], player: game.owner ? game.owner[e] : 0, kind: k });
      n++;
    }
    this.lastT = t;
    return n;
  }

  setPlayer(seat, pencil, name) { this.players.set(seat, [pencil | 0, cleanName(name)]); }

  /** "1;<players>;<moves>": players as seat^pencil^name joined by ~, moves as letters. */
  encode() {
    const ps = [...this.players].map(([s, [pc, nm]]) => `${s}^${pc}^${nm}`).join('~');
    const out = [];
    let t = 0, who = 0;
    for (const mv of this.moves) {
      const turn = mv.player !== who;
      putNum(out, (mv.t - t) / TICK);
      putNum(out, (((mv.edge * 3 + mv.value) * 3 + mv.kind) * 2) + (turn ? 1 : 0));
      if (turn) putNum(out, mv.player);
      t = mv.t; who = mv.player;
    }
    return `1;${ps};${out.join('')}`;
  }

  /** Reads encode() back. The board it saw is the board after the last move. */
  static decode(text, edgeCount) {
    const parts = String(text || '').split(';');
    if (parts.length !== 3 || parts[0] !== '1') throw new Error('not a timelapse');
    const r = new Recorder(edgeCount);
    for (const p of parts[1] ? parts[1].split('~') : []) {
      const [s, pc, nm] = p.split('^');
      if (/^\d+$/.test(s)) r.players.set(+s, [+pc || 0, nm || '']);
    }
    const rd = reader(parts[2], 0);
    let t = 0, who = 0;
    while (!rd.done) {
      t += rd.num() * TICK;
      let x = rd.num();
      if (x % 2) who = rd.num();
      x = Math.floor(x / 2);
      const kind = x % 3; x = Math.floor(x / 3);
      const value = x % 3, edge = Math.floor(x / 3);
      if (edge >= edgeCount) throw new Error('timelapse is for another board');
      r.moves.push({ t, edge, value, player: who, kind });
      r.seen[edge] = value;
    }
    r.lastT = t;
    r.full = r.moves.length >= MAX_MOVES;
    return r;
  }
}

/**
 * The hints in a game, for the replay: one event per hint, even when it changed several pieces at once
 * (Clear mistakes). {i: first move, t: game time, player: who took it, clear: it only erased marks}.
 * Old timelapses (and games with no hints) simply have none.
 */
export function hintEvents(moves) {
  const out = [];
  moves.forEach((m, i) => {
    if (m.kind !== Kind.HINT) return;
    const last = out[out.length - 1];
    if (last && last.t === m.t && last.player === m.player && last.last === i - 1) { last.last = i; last.clear = last.clear && !m.value; return; }
    out.push({ i, last: i, t: m.t, player: m.player, clear: !m.value });
  });
  return out;
}

// ---- kept in localStorage ----

const lines = () => (store.timelapses || '').split('\n').filter(l => l.includes(' '));

/** Saves a finished game's timelapse under [id]; the oldest ones go when there are too many. */
export function keepTimelapse(id, data) {
  const out = [`${id} ${data}`];
  let size = out[0].length;
  for (const l of lines()) {
    if (l.startsWith(id + ' ')) continue;
    if (out.length >= KEEP || size + l.length > KEEP_CHARS) break;
    out.push(l); size += l.length + 1;
  }
  store.timelapses = out.join('\n');
}

/** Ids of the kept timelapses. */
export const timelapseIds = () => new Set(lines().map(l => l.slice(0, l.indexOf(' '))));

export function findTimelapse(id) {
  if (!id) return null;
  const l = lines().find(x => x.startsWith(id + ' '));
  return l ? l.slice(id.length + 1) : null;
}

export const newTimelapseId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/**
 * Playback times: long pauses are cut to [maxGap] ms, then everything is sped up so the whole game
 * plays in about [target] ms (never slower than real time). Returns {at: ms per move, total}.
 */
export function playbackTimes(moves, { maxGap = 1500, target = null } = {}) {
  const at = new Array(moves.length);
  let p = 0, prev = 0;
  moves.forEach((m, i) => { p += Math.min(maxGap, Math.max(0, m.t - prev)); prev = m.t; at[i] = p; });
  const goal = target != null ? target : Math.min(20000, Math.max(5000, moves.length * 120));
  const speed = Math.max(1, p / goal);
  for (let i = 0; i < at.length; i++) at[i] /= speed;
  return { at, total: p / speed };
}
