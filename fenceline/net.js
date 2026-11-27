// Online play together over WebRTC, using PeerJS's free public signalling server
// (no account, no server of our own). Players only talk to the host (a star), as on Android.
//
// The host's PeerJS id is "fenceline-v1-<room>-<term>": the 4-letter room code friends type, plus
// the hosting term, which goes up each time hosting moves. So when a host leaves, everyone knows
// the id the next host will take, and reconnects to it.
import { Room } from './room.js';

const PREFIX = 'fenceline-v1-';
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
/** How long a guest waits for the next host to show up before trying the one after. */
const FIND_HOST_MS = 12000;
/** How many terms to try when joining by code (hosting may have moved a few times). */
const JOIN_TERMS = 6;
/** How long a guest keeps trying its host (with the app open) before deciding the host has left. */
const HOST_GRACE_MS = 10000;
/** A guest that was away this long reconnects on return, even if the old channel looks open. */
const STALE_MS = 30000;
/** Signalling-server trouble: never shown mid-game; the link quietly reconnects. */
const SIGNAL_ERRORS = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

let peerjsLoad = null;
export function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!peerjsLoad) {
    peerjsLoad = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL; s.async = true;
      s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS did not load')));
      s.onerror = () => { peerjsLoad = null; reject(new Error("Couldn't reach the play-together service. Check your connection.")); };
      document.head.appendChild(s);
    });
  }
  return peerjsLoad;
}

export const cleanCode = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/[o]/g, '0').replace(/[il]/g, '1').slice(0, 4);
const hostId = (room, term) => `${PREFIX}${room}-${term}`;

/** Options for new Peer(): window.FENCELINE_PEER (e.g. a local test server) wins over the public cloud. */
function peerOptions() { return Object.assign({ debug: 0 }, window.FENCELINE_PEER || {}); }

function openPeer(Peer, id) {
  return new Promise((resolve, reject) => {
    const p = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    const fail = (e) => { cleanup(); try { p.destroy(); } catch (_) {} reject(e); };
    const ok = () => { cleanup(); resolve(p); };
    const cleanup = () => { p.off('open', ok); p.off('error', fail); };
    p.on('open', ok); p.on('error', fail);
  });
}

/**
 * A link to one online room. Set `link.ui` to an object with any of Room's listener methods
 * (onLobby, onMessage, onPlayerLeft, onHostLost, onHostMoving, onBecameHost, onJoinRequest,
 * onJoined, onDenied) plus onError(text) and onStatus(text).
 */
export class Link {
  constructor() {
    this.room = null; this.peer = null; this.hostPeer = null;
    this.conns = new Map(); // host: peer id -> DataConnection
    this.hostConn = null;   // guest: the connection to the host
    this.ui = {};
    this.closed = false;
    this.findTimer = 0;
    this.recovering = false; this.healing = false; this.healTimer = 0; this.hiddenAt = 0;
    this.onVis = () => {
      if (!visible()) { this.hiddenAt = Date.now(); return; }
      const away = this.hiddenAt ? Date.now() - this.hiddenAt : 0;
      this.hiddenAt = 0;
      this.wake(away);
    };
    this.onOnline = () => this.wake(0);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVis);
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
    this.onPageHide = (e) => { if (!e.persisted) this.close(); };
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide);
  }

  get code() { return this.room ? this.room.roomId.toUpperCase() : ''; }

  emit(name, ...args) { const f = this.ui && this.ui[name]; if (f) return f.call(this.ui, ...args); }

  makeRoom(isHost, name, pencil, id) {
    const room = new Room(isHost, name, pencil, id, (peer, text) => this.send(peer, text));
    const link = this;
    room.listener = new Proxy({}, {
      get(_, key) {
        if (typeof key !== 'string' || !key.startsWith('on')) return undefined;
        return (r, ...args) => link.event(key, r, ...args);
      },
    });
    this.room = room;
    return room;
  }

  /** Room events: the link reacts to hosting changes, then the UI hears about everything. */
  event(name, room, ...args) {
    if (name === 'onHostMoving') this.findHost(room.term + 1);
    if (name === 'onBecameHost') this.becomeHost();
    if (name === 'onJoinRequest' && !(this.ui && this.ui.onJoinRequest)) { room.approve(args[0]); return; }
    return this.emit(name, room, ...args);
  }

  // ---- hosting ----
  async host(name, pencil, id) {
    const Peer = await loadPeerJS();
    const room = this.makeRoom(true, name, pencil, id);
    // A taken code is very unlikely; try a few.
    for (let i = 0; i < 5; i++) {
      try { this.hostPeer = await openPeer(Peer, hostId(room.roomId, room.term)); break; } catch (e) {
        if (!(e && e.type === 'unavailable-id')) throw friendly(e);
        room.roomId = randomRoom();
      }
    }
    if (!this.hostPeer) throw new Error("Couldn't make a room. Try again.");
    this.listen(this.hostPeer);
    this.startHealing();
    return room;
  }

  listen(p) {
    p.on('connection', (conn) => {
      conn.on('open', () => { this.conns.set(conn.peer, conn); this.room.connected(conn.peer); });
      conn.on('data', (d) => { if (typeof d === 'string') this.room.received(conn.peer, d); });
      const gone = () => { if (this.conns.get(conn.peer) === conn) { this.conns.delete(conn.peer); this.room.disconnected(conn.peer); } };
      conn.on('close', gone); conn.on('error', gone);
      watchIce(conn, gone);
    });
    this.keepAlive(p, () => this.heal());
  }

  // ---- staying connected (phones sleep, switch networks, close the app for a bit) ----

  /** Reconnects a peer to the signalling server whenever it drops, quietly, with backoff. */
  keepAlive(p, onBack) {
    let n = 0, t = 0, wasDown = false;
    const retry = (now) => {
      clearTimeout(t);
      if (this.closed || p.destroyed || !p.disconnected) return;
      t = setTimeout(() => {
        if (this.closed || p.destroyed || !p.disconnected) return;
        if (!visible()) return; // try again when the app is back
        n++;
        try { p.reconnect(); } catch (_) { /* already reconnecting */ }
        retry(false); // check again later in case this attempt goes nowhere
      }, now ? 0 : Math.min(8000, 500 * 2 ** n));
    };
    p._flRetry = () => { n = 0; retry(true); };
    p.on('disconnected', () => { wasDown = true; retry(false); });
    p.on('open', () => { n = 0; clearTimeout(t); if (wasDown) { wasDown = false; if (onBack) onBack(); } });
    p.on('error', (e) => {
      if (e && SIGNAL_ERRORS.has(e.type)) retry(false);
      else if (e && e.type !== 'peer-unavailable') console.warn('play together:', e.type, e.message);
    });
  }

  /** The app came back (or the network did): check every connection and mend what broke. */
  wake(away) {
    if (this.closed || !this.room) return;
    for (const p of [this.peer, this.hostPeer]) if (p && !p.destroyed && p.disconnected && p._flRetry) p._flRetry();
    const room = this.room;
    if (room.isHost) { if (this.hostPeer && this.hostPeer.destroyed) this.reopenHost(); this.heal(); return; }
    if (room.me < 0) return;
    const c = this.hostConn;
    const pc = c && c.peerConnection;
    const healthy = c && c.open && pc && ['connected', 'completed', 'checking', 'new'].includes(pc.iceConnectionState);
    if (!healthy || away > STALE_MS) {
      if (c) { this.hostConn = null; try { c.close(); } catch (_) {} }
      this.recover();
    }
  }

  /** A peer we can dial from, connected to the signalling server (made again if it died). */
  async ensurePeer() {
    const p = this.peer;
    if (p && !p.destroyed && p.open) return true;
    if (p && !p.destroyed && p.disconnected) {
      try { p.reconnect(); } catch (_) { /* already reconnecting */ }
      if (await waitOpen(p, 5000)) return true;
    }
    try { if (p) p.destroy(); } catch (_) {}
    this.peer = null;
    const Peer = await loadPeerJS().catch(() => null);
    if (!Peer || this.closed) return false;
    this.peer = await openPeer(Peer).catch(() => null);
    if (this.peer) this.keepAlive(this.peer);
    return !!this.peer;
  }

  /**
   * Dials terms from..to of a room at once; the newest host that answers wins. Missing ids only
   * fail after the signalling server's ~5 s timeout, so once one host answers we wait just a moment
   * for a newer one instead of waiting for every miss.
   */
  async dialNewest(room, from, to, timeout) {
    if (!this.peer || !this.peer.open) return null;
    const got = [];
    let decided = false, settle = null, left = 0, grace = 0;
    const quiet = new Promise((resolve) => { settle = resolve; });
    for (let t = Math.max(0, from); t <= to; t++) {
      left++;
      this.dial(hostId(room, t), timeout).then((conn) => {
        if (decided) { try { conn.close(); } catch (_) {} return; } // answered too late
        got.push({ conn, t });
        if (t === to) settle(); // the newest possible one: nothing to wait for
        else if (!grace) grace = setTimeout(settle, 1200);
      }, () => {}).finally(() => { if (--left === 0) settle(); });
    }
    if (!left) return null;
    await quiet;
    decided = true;
    clearTimeout(grace);
    const pick = got.slice().sort((a, b) => b.t - a.t)[0] || null;
    for (const g of got) if (g !== pick) try { g.conn.close(); } catch (_) {}
    return pick;
  }

  /**
   * Guest: the line to the host broke. Usually the host (or this phone) just slept for a moment,
   * so find the host again quietly, and only if it's really gone hand hosting on (Room.moveHost).
   */
  async recover() {
    if (this.recovering || this.closed) return;
    const room = this.room;
    if (!room || room.isHost) return;
    if (room.me < 0 || !room.roomId) { room.disconnected('host'); return; }
    this.recovering = true;
    const shout = setTimeout(() => { if (this.recovering) this.emit('onStatus', 'Reconnecting…'); }, 3000);
    let since = Date.now();
    try {
      while (!this.closed && !room.isHost && !this.hostConn) {
        if (!visible()) { await untilVisible(); since = Date.now(); continue; }
        await this.ensurePeer();
        const got = await this.dialNewest(room.roomId, room.term, room.term + 3, 4000);
        if (got) {
          if (this.closed || room.isHost || this.hostConn) { try { got.conn.close(); } catch (_) {} return; }
          if (got.t > room.term) room.term = got.t;
          this.attachHost(got.conn);
          return;
        }
        if (Date.now() - since > HOST_GRACE_MS) { room.disconnected('host'); return; }
        await sleep(1500);
      }
    } finally {
      clearTimeout(shout);
      this.recovering = false;
      this.emit('onStatus', '');
    }
  }

  /** Host: check now and then that nobody took over hosting while we were away (a newer term). */
  startHealing() {
    clearInterval(this.healTimer);
    this.healTimer = setInterval(() => {
      const r = this.room;
      if (visible() && r && r.isHost && r.players.some((p) => p !== r.me && r.away[p])) this.heal();
    }, 10000);
  }

  async heal() {
    const room = this.room;
    if (this.healing || this.closed || !room || !room.isHost) return;
    this.healing = true;
    try {
      if (!(await this.ensurePeer())) return;
      const got = await this.dialNewest(room.roomId, room.term + 1, room.term + 3, 4000);
      if (!got) return;
      if (this.closed || !room.isHost) { try { got.conn.close(); } catch (_) {} return; }
      // Someone hosts a newer term: the others moved on while we were away. Join them.
      for (const c of this.conns.values()) try { c.close(); } catch (_) {}
      this.conns.clear();
      const hp = this.hostPeer; this.hostPeer = null;
      try { if (hp) hp.destroy(); } catch (_) {}
      room.isHost = false; room.term = got.t; room.waitingFor = -1;
      room.peerPlayer.clear(); room.pending.clear();
      this.attachHost(got.conn);
      this.emit('onLobby', room);
    } finally { this.healing = false; }
  }

  /** Host: our id on the signalling server died for good; take it again. */
  async reopenHost() {
    const room = this.room;
    const Peer = await loadPeerJS().catch(() => null);
    for (let i = 0; Peer && i < 8 && !this.closed && room.isHost && (!this.hostPeer || this.hostPeer.destroyed); i++) {
      try { this.hostPeer = await openPeer(Peer, hostId(room.roomId, room.term)); this.listen(this.hostPeer); return; } catch (_) { await sleep(1500); }
    }
  }

  // ---- joining ----
  async join(code, name, pencil, id) {
    const Peer = await loadPeerJS();
    const room = this.makeRoom(false, name, pencil, id);
    const c = cleanCode(code);
    if (c.length !== 4) throw new Error('Room codes have 4 letters.');
    this.peer = await openPeer(Peer).catch((e) => { throw friendly(e); });
    this.keepAlive(this.peer);
    // Hosting may have moved, so the room could be on a later term: try them all, newest answer wins.
    const got = await this.dialNewest(c, 0, JOIN_TERMS - 1, 8000);
    if (!got) { this.peer.destroy(); this.peer = null; throw new Error(`No room ${c.toUpperCase()} right now. Check the code with your friend.`); }
    room.roomId = c; room.term = got.t;
    this.attachHost(got.conn);
    return room;
  }

  /** Connects to a peer id; resolves once the data channel is open. */
  dial(id, timeout) {
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(id, { reliable: true, serialization: 'raw' });
      let done = false;
      const fail = () => { if (done) return; done = true; this.peer.off('error', onErr); try { conn.close(); } catch (_) {} reject(new Error('no answer')); };
      const onErr = (e) => { if (e && e.type === 'peer-unavailable' && String(e.message || '').includes(id)) fail(); };
      this.peer.on('error', onErr);
      setTimeout(fail, timeout);
      conn.on('open', () => { if (done) return; done = true; this.peer.off('error', onErr); resolve(conn); });
      conn.on('error', fail);
    });
  }

  attachHost(conn) {
    this.hostConn = conn;
    conn.on('data', (d) => {
      if (typeof d !== 'string' || this.hostConn !== conn) return;
      // The host saying goodbye (it left on purpose): hand hosting on right away, no waiting.
      if (d === `LEFT\t${this.room.hostSeat}`) conn._flBye = true;
      this.room.received('host', d);
    });
    const gone = () => {
      if (this.hostConn !== conn || this.closed) return;
      this.hostConn = null;
      if (conn._flBye) this.room.disconnected('host'); else this.recover();
    };
    conn.on('close', gone); conn.on('error', gone);
    watchIce(conn, gone);
    this.room.connected('host');
  }

  /** Guest: the host left; the next host will take this term's id. */
  findHost(term) {
    clearTimeout(this.findTimer);
    this.emit('onStatus', 'Finding the new host…');
    const room = this.room;
    const want = room.waitingFor;
    const id = hostId(room.roomId, term);
    const attempt = (left) => {
      if (this.closed || room.isHost || room.waitingFor !== want) return;
      this.dial(id, 3000).then((conn) => {
        if (this.closed || room.isHost || room.waitingFor !== want) { try { conn.close(); } catch (_) {} return; }
        clearTimeout(this.findTimer);
        this.attachHost(conn);
        this.emit('onStatus', '');
      }, () => { if (left > 0) setTimeout(() => attempt(left - 1), 800); });
    };
    attempt(Math.ceil(FIND_HOST_MS / 3800));
    this.findTimer = setTimeout(() => { if (!room.isHost && room.waitingFor === want) room.hostNotFound(); }, FIND_HOST_MS);
  }

  /** This phone hosts now: take the next term's id so the others find us. */
  async becomeHost() {
    clearTimeout(this.findTimer);
    this.emit('onStatus', 'You host now. Waiting for the others…');
    const room = this.room;
    const Peer = await loadPeerJS();
    for (let i = 0; i < 8 && !this.closed; i++) {
      try {
        this.hostPeer = await openPeer(Peer, hostId(room.roomId, room.term));
        this.listen(this.hostPeer);
        this.startHealing();
        this.emit('onStatus', '');
        return;
      } catch (e) {
        // The old id can take a moment to free up on the server; keep trying.
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    this.emit('onError', "Couldn't keep the room going. Try making a new one.");
  }

  send(peer, text) {
    if (this.room && this.room.isHost) {
      if (peer == null) { for (const c of this.conns.values()) safeSend(c, text); }
      else { const c = this.conns.get(peer); if (c) safeSend(c, text); }
    } else if (this.hostConn) safeSend(this.hostConn, text);
  }

  close() {
    // Host leaving on purpose: tell everyone, so the next host takes over at once.
    if (!this.closed && this.room && this.room.isHost) try { this.room.broadcast({ t: 'LEFT', player: this.room.me }); } catch (_) {}
    this.closed = true;
    clearTimeout(this.findTimer);
    clearInterval(this.healTimer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVis);
    if (typeof window !== 'undefined') { window.removeEventListener('online', this.onOnline); window.removeEventListener('pagehide', this.onPageHide); }
    for (const c of this.conns.values()) try { c.close(); } catch (_) {}
    this.conns.clear();
    try { if (this.hostConn) this.hostConn.close(); } catch (_) {}
    try { if (this.hostPeer) this.hostPeer.destroy(); } catch (_) {}
    try { if (this.peer) this.peer.destroy(); } catch (_) {}
  }
}

function waitOpen(p, ms) {
  return new Promise((resolve) => {
    if (p.open) { resolve(true); return; }
    const done = (v) => { clearTimeout(t); p.off('open', ok); resolve(v); };
    const ok = () => done(true);
    const t = setTimeout(() => done(false), ms);
    p.on('open', ok);
  });
}

function untilVisible() {
  return new Promise((resolve) => {
    if (visible()) { resolve(); return; }
    const on = () => { if (visible()) { document.removeEventListener('visibilitychange', on); resolve(); } };
    document.addEventListener('visibilitychange', on);
  });
}

function safeSend(conn, text) { try { if (conn.open) conn.send(text); } catch (_) {} }

/** Phones that sleep or lose signal don't always close the channel; watch the connection itself. */
function watchIce(conn, gone) {
  const pc = conn.peerConnection;
  if (!pc) return;
  let t = 0;
  pc.addEventListener('iceconnectionstatechange', () => {
    const s = pc.iceConnectionState;
    clearTimeout(t);
    if (s === 'failed' || s === 'closed') gone();
    else if (s === 'disconnected') t = setTimeout(gone, 6000);
  });
}

function randomRoom() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = ''; for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

function friendly(e) {
  const t = e && e.type;
  if (t === 'browser-incompatible') return new Error("This browser can't play together. Try Safari or Chrome.");
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return new Error("Couldn't reach the play-together service. Check your connection.");
  return new Error((e && e.message) || 'Something went wrong. Try again.');
}
