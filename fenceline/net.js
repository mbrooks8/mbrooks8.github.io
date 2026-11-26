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
    p.on('disconnected', () => { if (!this.closed) try { p.reconnect(); } catch (_) {} });
    p.on('error', (e) => { if (e && e.type !== 'peer-unavailable') this.emit('onError', friendly(e).message); });
  }

  // ---- joining ----
  async join(code, name, pencil, id) {
    const Peer = await loadPeerJS();
    const room = this.makeRoom(false, name, pencil, id);
    const c = cleanCode(code);
    if (c.length !== 4) throw new Error('Room codes have 4 letters.');
    this.peer = await openPeer(Peer).catch((e) => { throw friendly(e); });
    this.peer.on('disconnected', () => { if (!this.closed) try { this.peer.reconnect(); } catch (_) {} });
    // Hosting may have moved, so the room could be on a later term: try them all, newest answer wins.
    const tries = [];
    for (let t = 0; t < JOIN_TERMS; t++) tries.push(this.dial(hostId(c, t), 8000).then((conn) => ({ conn, t }), () => null));
    const got = (await Promise.all(tries)).filter(Boolean).sort((a, b) => b.t - a.t);
    if (!got.length) { this.peer.destroy(); throw new Error(`No room ${c.toUpperCase()} right now. Check the code with your friend.`); }
    for (const g of got.slice(1)) try { g.conn.close(); } catch (_) {}
    room.roomId = c; room.term = got[0].t;
    this.attachHost(got[0].conn);
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
    conn.on('data', (d) => { if (typeof d === 'string' && this.hostConn === conn) this.room.received('host', d); });
    const gone = () => { if (this.hostConn !== conn || this.closed) return; this.hostConn = null; this.room.disconnected('host'); };
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
    this.closed = true;
    clearTimeout(this.findTimer);
    for (const c of this.conns.values()) try { c.close(); } catch (_) {}
    this.conns.clear();
    try { if (this.hostConn) this.hostConn.close(); } catch (_) {}
    try { if (this.hostPeer) this.hostPeer.destroy(); } catch (_) {}
    try { if (this.peer) this.peer.destroy(); } catch (_) {}
  }
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
