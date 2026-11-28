// The open-rooms list for online play. There is no server of our own, so the list is made of
// the signalling server's own bookkeeping: a host who makes an "Open" room also takes one of a
// few fixed listing ids ("fenceline-v1-open-0" .. "-23"). Anyone looking dials those ids; a free
// one just doesn't answer, a taken one sends a tiny card about its room. When the host leaves,
// closes the app or loses the network the id disappears by itself, so nothing goes stale.
// Private rooms never take a listing id. Nothing here changes the room wire protocol.

const PREFIX = 'fenceline-v1-open-';
/** How many open rooms can be listed at once. */
export const SLOTS = 24;
/** The most rooms ever shown. */
const SHOWN = 12;
const slotId = (n) => `${PREFIX}${n}`;
const peerOptions = () => Object.assign({ debug: 0 }, (typeof window !== 'undefined' && window.FENCELINE_PEER) || {});

/** Keeps only what a listing may say, so a stranger's card can never be more than a few plain words. */
export function cleanCard(raw) {
  let c;
  try { c = typeof raw === 'string' ? JSON.parse(raw) : null; } catch (_) { return null; }
  if (!c || typeof c !== 'object') return null;
  const code = String(c.r || '').toLowerCase();
  if (!/^[a-z0-9]{4}$/.test(code)) return null;
  const text = (v, n) => [...String(v == null ? '' : v)].filter((ch) => { const k = ch.charCodeAt(0); return k >= 32 && k !== 127 && k !== 0x2028 && k !== 0x2029; }).join('').trim().slice(0, n);
  const players = Math.max(1, Math.min(99, parseInt(c.n, 10) || 1));
  return { code, coop: c.c === 'C', board: text(c.b, 24), host: text(c.h, 20) || 'Someone', players, playing: c.g === 1 };
}

export function makeCard({ coop, board, host, players, playing, code }) {
  return JSON.stringify({ r: code, c: coop ? 'C' : 'V', b: board, h: host, n: players, g: playing ? 1 : 0 });
}

/** Host side: shows one room in the list for as long as this object is open. `info()` is asked fresh each time. */
export class Listing {
  constructor(Peer, info) { this.Peer = Peer; this.info = info; this.peer = null; this.closed = false; this.slot = -1; }

  /** Takes a free listing id (tries them in a random order). Resolves true when listed, false if the list is full. */
  async open() {
    const order = [...Array(SLOTS).keys()].sort(() => Math.random() - 0.5);
    for (const n of order) {
      if (this.closed) return false;
      const p = await tryPeer(this.Peer, slotId(n));
      if (!p) continue;
      if (this.closed) { try { p.destroy(); } catch (_) {} return false; }
      this.peer = p; this.slot = n;
      p.on('connection', (conn) => {
        conn.on('open', () => {
          try { conn.send(makeCard(this.info())); } catch (_) {}
          setTimeout(() => { try { conn.close(); } catch (_) {} }, 4000); // the finder hangs up first; this is only a safety net
        });
        conn.on('error', () => {});
      });
      p.on('disconnected', () => { if (!this.closed && !p.destroyed) { try { p.reconnect(); } catch (_) {} } });
      p.on('error', () => {});
      return true;
    }
    return false;
  }

  close() {
    this.closed = true;
    try { if (this.peer) this.peer.destroy(); } catch (_) {}
    this.peer = null;
  }
}

function tryPeer(Peer, id) {
  return new Promise((resolve) => {
    let p;
    try { p = new Peer(id, peerOptions()); } catch (_) { resolve(null); return; }
    const done = (v) => { p.off('open', ok); p.off('error', bad); resolve(v); };
    const ok = () => done(p);
    const bad = () => { try { p.destroy(); } catch (_) {} done(null); };
    p.on('open', ok); p.on('error', bad);
  });
}

/**
 * Guest side: asks every listing id at once and calls onRoom(card) for each room as it answers.
 * Resolves with all the rooms (newest first as they came) once every id has answered or timed out.
 * Pass an existing connected `peer` to reuse it, or leave it out to make (and close) one.
 */
export async function findOpenRooms(Peer, { onRoom, timeout = 7000, peer = null, signal = null } = {}) {
  const own = !peer;
  const p = peer || await tryPeer(Peer, undefined);
  if (!p) throw new Error("Couldn't reach the play-together service. Check your connection.");
  const seen = new Map();
  const asks = [];
  for (let n = 0; n < SLOTS; n++) asks.push(ask(p, slotId(n), timeout).then((raw) => {
    if (signal && signal.aborted) return;
    const card = cleanCard(raw);
    if (!card || seen.has(card.code) || seen.size >= SHOWN) return;
    seen.set(card.code, card);
    if (onRoom) onRoom(card);
  }, () => {}));
  try { await Promise.all(asks); } finally { if (own) try { p.destroy(); } catch (_) {} }
  return [...seen.values()];
}

/** Dials one listing id and resolves with the card text it sends (rejects when nobody answers). */
function ask(p, id, timeout) {
  return new Promise((resolve, reject) => {
    let done = false, timer = 0, conn = null;
    const finish = (fn, v) => {
      if (done) return; done = true; clearTimeout(timer); p.off('error', onErr);
      try { if (conn) conn.close(); } catch (_) {}
      fn(v);
    };
    const onErr = (e) => { if (e && e.type === 'peer-unavailable' && String(e.message || '').includes(id)) finish(reject, new Error('free')); };
    p.on('error', onErr);
    timer = setTimeout(() => finish(reject, new Error('no answer')), timeout);
    try { conn = p.connect(id, { reliable: true, serialization: 'raw' }); } catch (_) { finish(reject, new Error('no answer')); return; }
    conn.on('data', (d) => { if (typeof d === 'string') finish(resolve, d); });
    conn.on('error', () => finish(reject, new Error('no answer')));
  });
}
