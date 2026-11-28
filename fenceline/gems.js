// Gems and Remove ads: real-money purchases through Google Play, in the Play Store production app only.
// The website, iPhone, testers and the website APK never show any of this (gemsOn() is false there).
// The Android side (android/app/src/ads/.../Billing.kt) talks to Play; this file turns purchases into gems.
// See docs/purchases.md.
//
// - Gem packs are consumable: Play sends the purchase, we add the gems (once per purchase token), then tell Play
//   to consume it so it can be bought again. A purchase that arrives twice (app closed halfway) only counts once.
// - Remove ads is bought once and kept by Play: the app asks Play at every start, so it comes back after a reinstall.
// - Nothing here is random: every pack and every good says exactly what you get.
import { native, isApp, onNative } from './native.js';
import { store } from './store.js';

/** The five packs: Play product id, gems, and how much extra that is over the smallest pack's rate (100 gems a dollar). */
export const GEM_PACKS = [
  { id: 'gems_5', gems: 500, extra: 0 },
  { id: 'gems_10', gems: 1100, extra: 100 },
  { id: 'gems_25', gems: 3000, extra: 500 },
  { id: 'gems_50', gems: 6500, extra: 1500 },
  { id: 'gems_100', gems: 14000, extra: 4000 },
];
export const REMOVE_ADS = 'remove_ads';
export const packById = id => GEM_PACKS.find(p => p.id === id) || null;

function call(name, ...args) {
  if (!isApp || !native || typeof native[name] !== 'function') return undefined;
  try { return native[name](...args); } catch (e) { console.error('billing', name, e); return undefined; }
}
const json = (s, def) => { try { return JSON.parse(s || '') ?? def; } catch (e) { return def; } };

/** Prices from Play, by product id ("$4.99", in the player's own currency). Empty until Play answers. */
export function prices() {
  const out = {};
  for (const p of json(call('billingProducts'), [])) if (p && p.id && p.price) out[p.id] = String(p.price);
  return out;
}

/** Can this app sell gems? Only the production app, and only once Play knows the products (set up in Play Console). */
export const gemsOn = () => isApp && call('billingOn') === true && GEM_PACKS.some(p => prices()[p.id]);
/** Can this app sell Remove ads? (It has ads, Play knows the product, and it isn't bought yet.) */
export const canRemoveAds = () => isApp && call('billingOn') === true && !!prices()[REMOVE_ADS] && !adsRemoved();
/** Has this player bought Remove ads? (Play's answer, remembered on the phone.) */
export const adsRemoved = () => call('billingAdsRemoved') === true;

const listeners = new Set();
/** Calls [fn] whenever gems, prices or Remove ads change. Returns an unsubscribe function. */
export function onGemsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const changed = () => { for (const fn of [...listeners]) { try { fn(); } catch (e) { console.error(e); } } };

/**
 * A gem pack purchase from Play: adds its gems once, then asks Play to consume it (consuming twice is harmless).
 * Returns the gems added (0 when it was already counted or isn't a gem pack).
 */
export function deliver(p, s = store, consume = token => call('billingConsume', token)) {
  const pack = p && packById(p.id);
  if (!pack || !p.token) return 0;
  const added = s.grantGems(p.token, pack.gems) ? pack.gems : 0;
  consume(String(p.token));
  return added;
}

let waiting = null;
/**
 * Opens Play's purchase sheet for [id] (a pack or Remove ads).
 * Resolves 'ok' (bought), 'pending' (paid by a slower method: gems arrive when Play says it went through),
 * 'cancelled' or 'error'.
 */
export function buy(id) {
  if (!isApp) return Promise.resolve('error');
  if (waiting) waiting('cancelled');
  return new Promise(resolve => {
    const timer = setTimeout(() => finish('error'), 10 * 60000);
    const finish = r => { if (waiting !== finish) return; waiting = null; clearTimeout(timer); resolve(r); };
    waiting = finish;
    if (call('billingBuy', String(id)) !== true) finish('error');
  });
}

/** Asks Play again for everything bought (Remove ads after a reinstall, gems that never arrived). */
export function restore() { call('billingRestore'); }

if (isApp) {
  onNative('billing-purchase', p => { if (deliver(p)) changed(); });
  onNative('billing-done', r => { if (waiting) waiting(String(r.result || 'error')); changed(); });
  onNative('billing-changed', () => changed());
  // Purchases Play sent before this page was listening.
  for (const p of json(call('billingPending'), [])) deliver(p);
}
