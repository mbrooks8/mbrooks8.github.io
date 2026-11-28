// Ads, only in the Play Store production app (adsOn() in native.js). The web, testers and the website APK never
// get here: every function below does nothing there. The Android side (android/app/src/ads/.../Ads.kt) loads
// and plays them; this file decides when. See ADMOB.md.
//
// - a banner under the game screen (never on the main menu, in lessons or in Play together)
// - now and then a video between puzzles, when you tap Next puzzle
// - an optional video for an extra hint, after the free ones
// A video that isn't ready never blocks anything: the hint is just given, the next puzzle just starts.
import { native, adsOn, onNative } from './native.js';
import { store } from './store.js';
import { el, dialog, text, button } from './ui.js';

/** All the numbers in one place. */
export const AD_RULES = {
  freeHints: 3,      // free hints per puzzle; after that Hint offers a short video
  videoEvery: 3,     // a video between puzzles after every 3rd finished puzzle...
  videoGapMin: 4,    // ...and never two within 4 minutes
  waitMs: 180000,    // give up on an ad that never says it's done
};

function call(name, ...args) {
  if (!adsOn() || !native || typeof native[name] !== 'function') return undefined;
  try { return native[name](...args); } catch (e) { console.error('ads', name, e); return undefined; }
}
const ready = kind => call('adReady', kind) === true;

let playing = false;
/** True while a video is on screen (the game's timer doesn't run then). */
export const adPlaying = () => playing;

/** Plays a video; resolves with {shown, earned} once it's closed. */
function play(kind) {
  return new Promise(resolve => {
    let off = null, timer = 0;
    const finish = r => { if (!off) return; off(); off = null; clearTimeout(timer); playing = false; resolve(r); };
    off = onNative('ad-done', r => { if (r.kind === kind) finish({ shown: !!r.shown, earned: !!r.earned }); });
    timer = setTimeout(() => finish({ shown: false, earned: false }), AD_RULES.waitMs);
    playing = true;
    call('adShow', kind);
  });
}

/** The banner under the game screen. */
export function banner(show) { if (adsOn()) call('adBanner', !!show); }

/** A puzzle was finished (not a lesson, not Play together). */
export function noteWin() { if (adsOn()) store.adWins = store.adWins + 1; }

/** Before the next puzzle: maybe a video. Resolves when it's time to go on. */
export async function betweenPuzzles() {
  if (!adsOn()) return;
  const gapOk = Date.now() - store.adLast >= AD_RULES.videoGapMin * 60000;
  if (store.adWins < AD_RULES.videoEvery || !gapOk || !ready('video')) return;
  const r = await play('video');
  if (r.shown) { store.adWins = 0; store.adLast = Date.now(); }
}

/** Is this hint free? used = hints taken on this puzzle, earned = videos watched for it. */
export const hintFree = (used, earned) => !adsOn() || used < AD_RULES.freeHints + earned;

/**
 * After the free hints: asks whether to watch a video for one more.
 * Resolves 'earned' (watched it), 'none' (no video ready, so the hint is free) or 'no' (said no or closed it early).
 */
export function offerHintVideo() {
  if (!adsOn() || !ready('reward')) return Promise.resolve('none');
  return new Promise(resolve => {
    let d, answered = false;
    const answer = v => { if (answered) return; answered = true; d.close(); resolve(v); };
    d = dialog(el('div', { class: 'col' },
      text('Watch a short video for another hint?', { size: 20, cls: 'center' }),
      el('div', { class: 'row gap14' },
        button('Not now', () => answer('no'), { size: 17 }),
        button('Watch', async () => {
          answered = true; d.close();
          const r = await play('reward');
          resolve(r.earned ? 'earned' : r.shown ? 'no' : 'none');
        }, { size: 17, kind: 'primary' })),
    ), { closeX: false, onClose: () => { if (!answered) { answered = true; resolve('no'); } } });
  });
}

/** EU/UK: a way to change the ad consent later (Settings shows it only when Google says it's needed). */
export const privacyChoicesNeeded = () => call('adPrivacyRequired') === true;
export function privacyChoices() { call('adPrivacyOptions'); }
