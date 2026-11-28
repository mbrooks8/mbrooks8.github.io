// The Android app runs this same web game in a WebView and adds a small bridge,
// window.FencelineAndroid. Everything app-only goes through here; in a normal browser
// `native` is null and every helper falls back to the web APIs.

export const native = (typeof window !== 'undefined' && window.FencelineAndroid) || null;
export const isApp = !!native;

function call(name, ...args) {
  if (!native || typeof native[name] !== 'function') return undefined;
  try { return native[name](...args); } catch (e) { console.error('bridge', name, e); return undefined; }
}

export function platform() { return isApp ? String(call('platform') || 'android') : 'web'; }
/** Ads are on only in the Play Store production app; never on the web, for testers or in the website APK. */
export function adsOn() { return isApp && call('ads') === true; }

// ---- one-time import of the old (1.x) app's settings, stats, history and saved game ----

const PREFIX = 'fenceline.';
function migrate() {
  if (!isApp) return;
  try {
    if (localStorage.getItem(PREFIX + 'migrated')) return;
    let prefs = {};
    try { prefs = JSON.parse(call('legacyPrefs') || '{}') || {}; } catch (e) { prefs = {}; }
    for (const [k, v] of Object.entries(prefs)) {
      if (v === null || v === undefined || typeof v === 'object') continue;
      if (localStorage.getItem(PREFIX + k) !== null) continue; // never overwrite what the web app already has
      localStorage.setItem(PREFIX + k, String(v));
    }
    localStorage.setItem(PREFIX + 'migrated', '1');
  } catch (e) { /* storage blocked: nothing to keep it in */ }
}
migrate();

// ---- small helpers ----

/** Shares text: the app's share sheet, else the browser's, else copies it. Returns 'shared' | 'copied' | 'failed'. */
export async function share(text, title = 'Fenceline') {
  if (isApp) { call('share', text, title); return 'shared'; }
  if (navigator.share) {
    try { await navigator.share({ text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'shared'; }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

export async function copyText(s) {
  if (isApp) { call('copyText', s); return true; }
  try { await navigator.clipboard.writeText(s); return true; } catch (e) { /* fall back */ }
  const t = document.createElement('textarea');
  t.value = s; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.append(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
  t.remove();
  return ok;
}

/** Clipboard text, or null when it can't be read. */
export async function readClipboard() {
  if (isApp) { const t = call('readClipboard'); return t == null ? null : String(t); }
  if (navigator.clipboard && navigator.clipboard.readText) {
    try { return await navigator.clipboard.readText(); } catch (e) { return null; }
  }
  return null;
}
export const canReadClipboard = () => isApp || !!(navigator.clipboard && navigator.clipboard.readText);

export const canVibrate = () => isApp || !!navigator.vibrate;
export function vibrate(ms) {
  if (isApp) { call('vibrate', ms); return; }
  if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
}

export const canKeepAwake = () => isApp || !!navigator.wakeLock;
let wakeLock = null;
export async function keepScreenOn(on) {
  if (isApp) { call('keepScreenOn', !!on); return; }
  try {
    if (on && !wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; }
}

// ---- Google Play Games leaderboards (Android app only; the web has none) ----

/** True when this app build has leaderboards switched on (Play Games ids filled in). */
export function gamesOn() { return isApp && call('gamesOn') === true; }
/** Sends a score to one board (key from points.js). Fire and forget; Play keeps the best. */
export function gamesSubmit(key, score) { if (gamesOn()) call('gamesSubmit', String(key), String(Math.round(score))); }
/** Opens Play's own board screen: one board, or all of them when key is empty. Asks the player to sign in first if needed. */
export function gamesShow(key = '') { call('gamesShow', String(key)); }

export function deviceName() { return isApp ? String(call('deviceName') || '').slice(0, 20) : ''; }

/** Can this app save a file to the phone (video from the replay)? Older app builds can't. */
export const canSaveFile = () => isApp && !!native && typeof native.saveStart === 'function';

/**
 * Saves [blob] as [name] on the phone (Movies/Fenceline), in pieces so a long video never sits in one huge string.
 * Returns where it went ("Movies/Fenceline"), or '' when it didn't work.
 */
export async function saveFile(blob, name) {
  if (!canSaveFile()) return '';
  const type = (blob.type || 'video/mp4').split(';')[0];
  if (call('saveStart', name, type) !== true) return '';
  const CHUNK = 192 * 1024;
  for (let at = 0; at < blob.size; at += CHUNK) {
    const text = await new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => res('');
      r.readAsDataURL(blob.slice(at, at + CHUNK));
    });
    const b64 = text.slice(text.indexOf(',') + 1);
    if (!b64 || call('saveChunk', b64) !== true) { call('saveAbort'); return ''; }
  }
  return String(call('saveEnd') || '');
}

/** Can the app hand the video it just saved to the share sheet? Older app builds can't. */
export const canShareSaved = () => canSaveFile() && typeof native.shareSaved === 'function';
/** Opens the share sheet for the video saveFile just wrote. Returns true when it opened. */
export function shareSaved() { return canShareSaved() && call('shareSaved') === true; }

// ---- events from the app ----

const handlers = new Map();
/** Listens for a bridge event ('nearby-message', 'open-url', ...). Returns an unsubscribe function. */
export function onNative(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(fn);
  return () => handlers.get(type).delete(fn);
}
window.fencelineNative = (type, payload) => {
  let p = payload;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { /* keep as is */ } }
  const set = handlers.get(type);
  if (set) for (const fn of [...set]) { try { fn(p || {}); } catch (e) { console.error(e); } }
};

// ---- Android back button ----

let backHandler = null;
/** The app's back handler: return true when it did something (closed a dialog, left a game). */
export function setBackHandler(fn) { backHandler = fn; }
window.fencelineBack = () => {
  try { return !!(backHandler && backHandler()); } catch (e) { console.error(e); return false; }
};
// ---- links ----

/**
 * What a link asks for: { code } for a shared puzzle, { join } for a room invite, or null.
 * Understands ?p=CODE, ?join=CODE, /fenceline/p/CODE and fenceline://p/CODE.
 */
export function parseLink(url) {
  const s = String(url || '');
  let q = '';
  try { q = new URL(s, 'https://mbrooks8.github.io/fenceline/').search; } catch (e) { q = ''; }
  const params = new URLSearchParams(q);
  if (params.get('join')) return { join: params.get('join') };
  if (params.get('p') || params.get('code')) return { code: params.get('p') || params.get('code') };
  const m = s.match(/(?:\/p\/|fenceline:\/\/p\/)([^?#\s]+)/i);
  if (m) { try { return { code: decodeURIComponent(m[1]) }; } catch (e) { return { code: m[1] }; } }
  if (/F1-/i.test(s)) return { code: s };
  return null;
}
