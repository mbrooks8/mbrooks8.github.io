// Shared bits used across screens: links, device checks, labels, the puzzle factory (workers), sharing.
import { share as nativeShare, deviceName, keepScreenOn } from './native.js';
import { dailySeed, PuzzleCode, Shape, Puzzle, PuzzleGenerator } from './core.js';
import { store } from './store.js';

export const SHARE_BASE = 'https://mbrooks8.github.io/fenceline/?p=';
export const JOIN_BASE = 'https://mbrooks8.github.io/fenceline/?join=';

/** Big boards for co-op group play, about 400 to 900 cells. */
export const GROUP_SIZES = {
  SQUARE: ['20x20', '25x25', '30x30'],
  HEX: ['18x22', '22x28', '26x34'],
  TRIANGLE: ['14x15', '17x19', '20x22'],
  CAIRO: ['14x16', '17x20', '20x23'],
};
export const isAndroid = /Android/i.test(navigator.userAgent);
export const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
export const cap = s => s.charAt(0) + s.slice(1).toLowerCase();
/** True when [p] is today's daily puzzle (a daily left over from an earlier day is just a puzzle now). */
export const isTodaysDaily = p => !!p && p.seed != null && BigInt(p.seed) === dailySeed(new Date()) && p.shape === Shape.SQUARE && p.width === 10 && p.height === 10;
export const diffLabel = d => (d || '').toLowerCase();

// ---- puzzle factory: generates in workers and keeps the next one ready ----

export const factory = {
  workers: {}, nextId: 1, pending: new Map(), ready: null, noWorker: false,

  worker(kind) {
    if (this.noWorker) return null;
    if (this.workers[kind]) return this.workers[kind];
    let w;
    try { w = new Worker('./worker.js', { type: 'module' }); } catch (e) { this.noWorker = true; return null; }
    w.onmessage = ev => {
      const m = ev.data || {};
      const job = this.pending.get(m.id);
      if (!job) return;
      this.pending.delete(m.id);
      if (m.error) { job.reject(new Error(m.error)); return; }
      try {
        const p0 = Puzzle.decode(m.text);
        job.resolve(new Puzzle(p0.width, p0.height, p0.clues, p0.solution, m.difficulty, BigInt(m.seed), p0.shape));
      } catch (e) { job.reject(e); }
    };
    w.onerror = ev => {
      // A worker that can't start (old browser): finish its jobs here instead.
      ev.preventDefault && ev.preventDefault();
      this.noWorker = true;
      for (const [id, job] of this.pending) if (job.kind === kind) { this.pending.delete(id); this.local(job); }
      try { w.terminate(); } catch (e) { /* ignore */ }
      delete this.workers[kind];
    };
    return (this.workers[kind] = w);
  },

  local(job) {
    setTimeout(() => {
      try { job.resolve(PuzzleGenerator.generate(job.w, job.h, job.d, job.seed, job.shape)); } catch (e) { job.reject(e); }
    }, 30);
  },

  gen(kind, w, h, d, seed, shape) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const job = { id, kind, w, h, d, seed, shape, resolve, reject };
      const wk = this.worker(kind);
      if (!wk) { this.local(job); return; }
      this.pending.set(id, job);
      wk.postMessage({ id, width: w, height: h, difficulty: d, seed: seed.toString(), shape: shape.code });
    });
  },

  key: (w, h, d, s) => `${s.code}${w}x${h}/${d}`,

  request(w, h, d, seed, shape) {
    const k = this.key(w, h, d, shape);
    if (seed == null && this.ready && this.ready.key === k) {
      const p = this.ready.promise;
      this.ready = null;
      p.then(() => this.prefetch(w, h, d, shape), () => {});
      return p.catch(() => this.gen('fg', w, h, d, PuzzleCode.randomSeed(), shape));
    }
    const p = this.gen('fg', w, h, d, seed == null ? PuzzleCode.randomSeed() : seed, shape);
    if (seed == null) p.then(() => this.prefetch(w, h, d, shape), () => {});
    return p;
  },

  /** Builds the next puzzle for these settings in the background. */
  prefetch(w, h, d, shape) {
    if (this.noWorker) return;
    const k = this.key(w, h, d, shape);
    if (this.ready && this.ready.key === k) return;
    const entry = { key: k, promise: this.gen('bg', w, h, d, PuzzleCode.randomSeed(), shape) };
    entry.promise.catch(() => { if (this.ready === entry) this.ready = null; });
    this.ready = entry;
  },
};

// ---- keep the screen on while playing ----

export const keepAwake = on => keepScreenOn(on);

export async function shareText(textBody, note) {
  const how = await nativeShare(textBody);
  if (how === 'shared') return;
  if (note) note(how === 'copied' ? 'Copied! Paste it to a friend.' : textBody);
}


/** The name other players see: what you typed last time, else (in the app) this phone's name. */
export function defaultName() { return store.playerName || deviceName(); }
