// The little feelings a co-op player can send with a ping. Only the key goes over the wire;
// each phone draws its own glyph, and an unknown key (a newer app) shows as a plain ping.
export const PING_KINDS = [
  { key: 'heart', glyph: '❤️', word: 'Love it' },
  { key: 'thumbs', glyph: '👍', word: 'Good' },
  { key: 'question', glyph: '❓', word: 'Huh?' },
  { key: 'cheer', glyph: '🎉', word: 'Yay' },
  { key: 'think', glyph: '🤔', word: 'Hmm' },
  { key: 'oops', glyph: '😅', word: 'Oops' },
];

/** The glyph for a key, or '' for a plain ping or anything unknown. */
export function pingGlyph(key) {
  const k = PING_KINDS.find(p => p.key === key);
  return k ? k.glyph : '';
}

/**
 * Anti-spam for pings. Three pings in any three seconds are free; after that each ping must wait
 * 3 seconds, and after three of those, 5 seconds. Ten quiet seconds start it all over, so someone
 * pinging every few seconds is never held up. [slack] under 1 makes it more forgiving (for pings we receive).
 */
export class PingLimiter {
  constructor(slack = 1) { this.slack = slack; this.reset(); }
  reset() { this.recent = []; this.level = 0; this.gated = 0; this.last = -Infinity; }
  /** True if a ping at [now] (ms) may go; counts it when it does. */
  allow(now) {
    if (now - this.last >= 10000) this.reset();
    this.recent = this.recent.filter(t => t > now - 3000);
    let ok = false;
    if (this.level === 0 && this.recent.length < 3) ok = true;
    else {
      if (this.level === 0) { this.level = 1; this.gated = 0; }
      if (now - this.last >= (this.level === 1 ? 3000 : 5000) * this.slack) {
        ok = true;
        if (++this.gated >= 3 && this.level === 1) { this.level = 2; this.gated = 0; }
      }
    }
    if (ok) { this.recent.push(now); this.last = now; }
    return ok;
  }
}
