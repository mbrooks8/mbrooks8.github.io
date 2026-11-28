// Soft pencil-and-paper sounds, all made on the fly with Web Audio (no sound files).
// Scratches are filtered noise with a grainy envelope; chimes are little wooden/marimba tones.
// Nothing plays until the first tap (browsers need one), and nothing at all with Sound off.
import { store } from './store.js';
import { startMusic } from './music.js';

let ctx = null, out = null, noise = null, musicBus = null;
let lastAt = {};

function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    // iPhone: mix with the person's music instead of stopping it.
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
  } catch (e) { /* not supported */ }
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return null; }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4;
  out = ctx.createGain();
  musicBus = ctx.createGain();
  out.connect(comp); musicBus.connect(comp); comp.connect(ctx.destination);
  applyVolumes();
  // One second of soft (pinkish) noise, reused by every scratch.
  const n = ctx.sampleRate;
  noise = ctx.createBuffer(1, n, n);
  const d = noise.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + 0.029 * w; b1 = 0.985 * b1 + 0.032 * w; b2 = 0.95 * b2 + 0.048 * w;
    d[i] = (b0 + b1 + b2 + w * 0.18) * 0.55;
  }
  return ctx;
}

/** Sets the sound-effects and music levels from Settings (call again whenever a slider moves). */
export function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  out.gain.setTargetAtTime(0.7 * (store.sfxVolume / 100) ** 2, t, 0.02);
  musicBus.gain.setTargetAtTime(store.sound ? (store.musicVolume / 100) ** 2 : 0, t, 0.05);
}

/** For music.js: the shared audio context and the music level control (null if audio isn't available). */
export function musicAudio() {
  const c = audio();
  return c ? { ctx: c, bus: musicBus, note, noise } : null;
}

/** Call from a tap: wakes the audio up (browsers only allow it after a gesture). */
export function unlockSound() {
  if (!store.sound) return;
  const c = audio();
  if (c && c.state !== 'running') c.resume().catch(() => {});
  startMusic();
}

function ready() {
  if (!store.sound) return null;
  const c = audio();
  if (!c) return null;
  if (c.state === 'closed') return null;
  // Still waking up: sounds queue and play the moment it does.
  if (c.state !== 'running') c.resume().catch(() => {});
  return c;
}

/** A pencil-ish scratch: band-passed noise with a grainy, uneven envelope. */
function scratch(c, t, { dur = 0.12, freq = 3000, q = 1, gain = 0.5, sweep = 1, grain = 10, hp = 700 } = {}) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = q;
  bp.frequency.setValueAtTime(freq * (0.92 + Math.random() * 0.16), t);
  bp.frequency.linearRampToValueAtTime(freq * sweep, t + dur);
  const hpf = c.createBiquadFilter();
  hpf.type = 'highpass'; hpf.frequency.value = hp;
  const g = c.createGain();
  // Grain: graphite catching on paper fibres.
  const steps = 32, curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const x = i / (steps - 1);
    const shape = Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 0.7;
    const bumps = 0.65 + 0.35 * Math.abs(Math.sin(x * grain * Math.PI + Math.random()));
    curve[i] = Math.max(0, shape * bumps * gain * 2.5 * (0.85 + Math.random() * 0.3));
  }
  curve[steps - 1] = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.setValueCurveAtTime(curve, t + 0.002, dur);
  src.connect(bp); bp.connect(hpf); hpf.connect(g); g.connect(out);
  src.start(t, Math.random() * 0.7, dur + 0.05);
}

/** The soft tap of a pencil tip touching the paper. */
function tap(c, t, { gain = 0.35, freq = 900 } = {}) {
  const src = c.createBufferSource();
  src.buffer = noise;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain * 2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  src.connect(lp); lp.connect(g); g.connect(out);
  src.start(t, Math.random() * 0.8, 0.05);
}

/** A little wooden note (marimba-ish): a sine with a quick, quiet overtone. */
export function note(c, t, f, { gain = 0.22, dur = 0.55, bright = 0.25, dest } = {}) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
  const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 4.01;
  const g2 = c.createGain();
  g2.gain.setValueAtTime(bright, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + Math.min(0.12, dur));
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
  o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(dest || out);
  o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}

// A gentle scale (major pentatonic), so any run of notes sounds friendly.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];

const SOUNDS = {
  fence(c, t) { tap(c, t); scratch(c, t + 0.008, { dur: 0.11 + Math.random() * 0.04, freq: 2900, sweep: 1.15, gain: 0.55 }); },
  cross(c, t) {
    scratch(c, t, { dur: 0.055, freq: 3800, q: 1.3, gain: 0.42, grain: 4 });
    scratch(c, t + 0.085, { dur: 0.055, freq: 3500, q: 1.3, gain: 0.42, grain: 4 });
  },
  // A rubber eraser: lower, softer, back and forth.
  erase(c, t) {
    scratch(c, t, { dur: 0.09, freq: 900, q: 0.8, gain: 0.5, sweep: 1.25, grain: 3, hp: 250 });
    scratch(c, t + 0.1, { dur: 0.08, freq: 1050, q: 0.8, gain: 0.38, sweep: 0.85, grain: 3, hp: 250 });
  },
  // Someone else's pencil on the shared co-op board: the same scratch, quieter.
  friend(c, t) { scratch(c, t, { dur: 0.09, freq: 2600, gain: 0.22 }); },
  // Undo / redo: a quick paper flick.
  flick(c, t) { scratch(c, t, { dur: 0.05, freq: 5200, q: 0.6, gain: 0.25, grain: 2, hp: 2000 }); },
  hint(c, t) { note(c, t, 1318.51, { gain: 0.1, dur: 0.5, bright: 0.4 }); note(c, t + 0.09, 1567.98, { gain: 0.09, dur: 0.6, bright: 0.4 }); },
  oops(c, t) { note(c, t, 392, { gain: 0.14, dur: 0.3, bright: 0.1 }); note(c, t + 0.12, 349.23, { gain: 0.12, dur: 0.35, bright: 0.1 }); },
  ping(c, t) { note(c, t, 880, { gain: 0.2, dur: 0.4 }); note(c, t + 0.14, 1318.51, { gain: 0.15, dur: 0.5 }); },
  join(c, t) { note(c, t, 659.25, { gain: 0.16, dur: 0.45 }); note(c, t + 0.12, 987.77, { gain: 0.16, dur: 0.6 }); },
  leave(c, t) { note(c, t, 783.99, { gain: 0.11, dur: 0.4 }); note(c, t + 0.13, 587.33, { gain: 0.11, dur: 0.5 }); },
  tick(c, t) { note(c, t, 523.25, { gain: 0.3, dur: 0.25, bright: 0.35 }); },
  go(c, t) { note(c, t, 1046.5, { gain: 0.2, dur: 0.5, bright: 0.35 }); note(c, t, 659.25, { gain: 0.12, dur: 0.5 }); },
  // Someone else won the race: a kind little "well played".
  done(c, t) { note(c, t, 783.99, { gain: 0.14, dur: 0.45 }); note(c, t + 0.15, 659.25, { gain: 0.14, dur: 0.45 }); note(c, t + 0.3, 783.99, { gain: 0.14, dur: 0.7 }); },
  // Paper confetti.
  rustle(c, t) {
    for (let i = 0; i < 6; i++) scratch(c, t + i * 0.05 + Math.random() * 0.03, { dur: 0.07, freq: 1800 + Math.random() * 2400, q: 0.7, gain: 0.16, grain: 2, hp: 900 });
  },
};

/** Plays a sound by name. Rapid repeats of the same sound are thinned out. */
export function play(name) {
  const c = ready();
  if (!c || !SOUNDS[name]) return;
  const now = c.currentTime;
  if (lastAt[name] && now - lastAt[name] < 0.04) return;
  lastAt[name] = now;
  try { SOUNDS[name](c, now + 0.005); } catch (e) { /* never let a sound break the game */ }
}

/** The win: notes climb along with the loop being traced (over [ms]), then a soft chord and confetti rustle. */
export function playWin(ms = 1200) {
  const c = ready();
  if (!c) return;
  try {
    const t0 = c.currentTime + 0.02, span = Math.max(0.5, ms / 1000);
    const run = [0, 2, 3, 4, 5, 7];
    run.forEach((k, i) => note(c, t0 + span * i / run.length, SCALE[k], { gain: 0.15, dur: 0.5 }));
    const end = t0 + span;
    [SCALE[0], SCALE[2], SCALE[3], SCALE[5]].forEach((f, i) => note(c, end + i * 0.025, f, { gain: 0.12, dur: 1.4, bright: 0.18 }));
    SOUNDS.rustle(c, end + 0.05);
  } catch (e) { /* ignore */ }
}

/** Stops audio while the page is hidden, so it never plays in someone's pocket. */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') ctx.suspend().catch(() => {});
    else if (store.sound) ctx.resume().catch(() => {});
  });
  // The first touch anywhere wakes the audio up.
  const wake = () => unlockSound();
  document.addEventListener('pointerdown', wake, { capture: true, passive: true });
  document.addEventListener('keydown', wake, { capture: true });
}
