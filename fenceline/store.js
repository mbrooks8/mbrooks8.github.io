// Settings, stats, history and the saved game, kept in localStorage.
// Every access is guarded: private windows and blocked storage just behave like a fresh install.
import { Shape, Boards } from './core.js';

const P = 'fenceline.';
const mem = {};
function get(k, def) {
  try { const v = localStorage.getItem(P + k); if (v !== null) return v; } catch (e) { /* storage blocked */ }
  return k in mem ? mem[k] : def;
}
function set(k, v) {
  mem[k] = v === null ? undefined : String(v);
  try { if (v === null) localStorage.removeItem(P + k); else localStorage.setItem(P + k, String(v)); } catch (e) { /* storage blocked */ }
}
const bool = (k, def) => { const v = get(k, null); return v === null || v === undefined ? def : v === 'true'; };
const int = (k, def) => { const v = parseInt(get(k, ''), 10); return Number.isFinite(v) ? v : def; };

function dayString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function today() { return dayString(new Date()); }
export function yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return dayString(d); }

export const HISTORY_MAX = 200;
const DIFFS = ['EASY', 'MEDIUM', 'HARD'];

let memInstallId = null;
export const store = {
  get autoCross() { return bool('autoCross', false); }, set autoCross(v) { set('autoCross', v); },
  get showErrors() { return bool('showErrors', true); }, set showErrors(v) { set('showErrors', v); },
  get showTimer() { return bool('showTimer', true); }, set showTimer(v) { set('showTimer', v); },
  get sound() { return bool('sound', true); }, set sound(v) { set('sound', v); },
  get haptics() { return bool('haptics', true); }, set haptics(v) { set('haptics', v); },
  get keepAwake() { return bool('keepAwake', true); }, set keepAwake(v) { set('keepAwake', v); },
  get noHints() { return bool('noHints', false); }, set noHints(v) { set('noHints', v); },
  get plainNumbers() { return bool('plainNumbers', false); }, set plainNumbers(v) { set('plainNumbers', v); },
  get pencil() { return int('pencil', 0); }, set pencil(v) { set('pencil', v); },
  /** 'system' | 'day' | 'night' */
  get theme() { const t = get('theme', 'system'); return ['system', 'day', 'night'].includes(t) ? t : 'system'; },
  set theme(v) { set('theme', v); },
  get lastShape() { return Shape.entries.find(s => s.name === get('lastShape', 'SQUARE')) || Shape.SQUARE; },
  set lastShape(v) { set('lastShape', v.name); },
  get lastSize() {
    const sh = this.lastShape;
    const k = sh === Shape.SQUARE ? 'lastSize' : 'lastSize_' + sh.name;
    const v = get(k, null);
    const sizes = Boards.sizes(sh);
    return sizes.includes(v) ? v : (Boards.defaultSize ? Boards.defaultSize(sh) : sizes[1]);
  },
  set lastSize(v) { const sh = this.lastShape; set(sh === Shape.SQUARE ? 'lastSize' : 'lastSize_' + sh.name, v); },
  get lastDifficulty() { const d = get('lastDiff', 'EASY'); return DIFFS.includes(d) ? d : 'EASY'; },
  set lastDifficulty(v) { set('lastDiff', v); },
  get tutorialStep() { return int('tutorialStep', 0); }, set tutorialStep(v) { set('tutorialStep', v); },
  get seenIntro() { return bool('seenIntro', false); }, set seenIntro(v) { set('seenIntro', v); },

  /** Android app: how Play together connects, 'online' or 'nearby'. */
  get mpVia() { return get('mpVia', 'online') === 'nearby' ? 'nearby' : 'online'; }, set mpVia(v) { set('mpVia', v === 'nearby' ? 'nearby' : 'online'); },
  get playerName() { return (get('playerName', '') || '').slice(0, 20); }, set playerName(v) { set('playerName', String(v || '').slice(0, 20)); },
  /** Random id for this browser, so a host can give a returning player their seat back. */
  get installId() {
    // Kept in memory too, so it stays the same for this visit even where storage is blocked.
    let id = memInstallId || get('installId', null);
    if (!id) { id = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8); set('installId', id); }
    memInstallId = id;
    return id;
  },

  get savedGame() { return get('saved', null) || null; }, set savedGame(v) { set('saved', v); },
  get savedMode() { return get('savedMode', 'free') || 'free'; }, set savedMode(v) { set('savedMode', v); },

  solved(d) { return int('solved_' + d, 0); },
  best(size, d) { return int(`best_${size}_${d}`, 0); },
  totalTime(d) { return int('time_' + d, 0); },
  get dailyStreak() { return [today(), yesterday()].includes(get('dailyLast', '')) ? int('dailyStreak', 0) : 0; },
  get bestStreak() { return int('bestStreak', 0); },
  get dailyDoneToday() { return get('dailyLast', '') === today(); },
  get noHintWins() { return int('noHintWins', 0); },

  /** Records a win; returns true when it is a new best time. */
  recordWin(size, d, ms, hints, daily) {
    set('solved_' + d, this.solved(d) + 1);
    set('time_' + d, this.totalTime(d) + ms);
    if (hints === 0) set('noHintWins', this.noHintWins + 1);
    const prev = this.best(size, d);
    const isBest = hints === 0 && (prev === 0 || ms < prev);
    if (isBest) set(`best_${size}_${d}`, ms);
    if (daily && !this.dailyDoneToday) {
      const streak = this.dailyStreak + 1;
      set('dailyStreak', streak);
      set('dailyLast', today());
      if (streak > this.bestStreak) set('bestStreak', streak);
    }
    return isBest;
  },

  /** Solved puzzles, newest first: {code, ms, hints, date, kind}. */
  get history() {
    return (get('history', '') || '').split('\n').map(line => {
      const f = line.split('|');
      if (f.length < 5) return null;
      return { code: f[0], ms: +f[1] || 0, hints: +f[2] || 0, date: f[3], kind: f[4] };
    }).filter(Boolean);
  },
  addHistory(code, ms, hints, kind) {
    const line = `${code}|${ms}|${hints}|${today()}|${kind}`;
    const rest = (get('history', '') || '').split('\n').filter(l => l.trim()).slice(0, HISTORY_MAX - 1);
    set('history', [line, ...rest].join('\n'));
  },
};

export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const two = n => String(n).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
}
