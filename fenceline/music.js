// Gentle background music, made on the fly with Web Audio (no sound files): a slow, soft chord
// loop with a few sparse wooden notes on top. The level comes from Settings (Music) and it is
// silent with Sound off. sound.js pauses all audio while the page is hidden.
import { store } from './store.js';
import { musicAudio, applyVolumes } from './sound.js';

// Four relaxed chords (C, Am, F, G) as low pad notes, with pentatonic notes to wander over.
const CHORDS = [[130.81, 196, 261.63], [110, 164.81, 220], [87.31, 130.81, 174.61], [98, 146.83, 196]];
const MELODY = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
const BAR = 6; // seconds per chord

let timer = null, nextAt = 0, bar = 0, m = null;

function pad(t, freqs) {
  const { ctx, bus } = m;
  freqs.forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * (1 + (i - 1) * 0.0015);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 2);
    g.gain.linearRampToValueAtTime(0.0001, t + BAR + 1.5);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + BAR + 1.6);
  });
}

function schedule() {
  const { ctx, bus, note } = m;
  if (ctx.state !== 'running') { nextAt = Math.max(nextAt, ctx.currentTime); return; }
  while (nextAt < ctx.currentTime + 4) {
    pad(nextAt, CHORDS[bar % CHORDS.length]);
    // A couple of soft notes a bar, never the same pattern twice.
    for (let i = 0; i < 4; i++) {
      if (Math.random() < 0.55) note(ctx, nextAt + 0.5 + i * 1.4 + Math.random() * 0.3, MELODY[Math.floor(Math.random() * MELODY.length)], { gain: 0.07, dur: 1.2, bright: 0.12, dest: bus });
    }
    nextAt += BAR; bar++;
  }
}

/** Starts the music loop (once; safe to call again). Called from the first tap. */
export function startMusic() {
  if (timer || !store.sound) return;
  m = m || musicAudio();
  if (!m) return;
  nextAt = m.ctx.currentTime + 0.2;
  applyVolumes();
  timer = setInterval(schedule, 1000);
  schedule();
}
