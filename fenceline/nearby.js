// Same-room play in the Android app: Google Nearby Connections (Bluetooth + Wi-Fi, no internet),
// through the app's bridge. A port of the 1.x app's NearbyLink.kt with the same advert names, so
// this app and 1.x phones can see and join each other. The Room logic is room.js, as online.
import { Room } from './room.js';
import { native, onNative } from './native.js';

/** How long a guest looks for the new host before trying the next player (GameActivity used 12 s). */
const FIND_HOST_MS = 12000;

/**
 * Short ASCII endpoint name, e.g. "C|25x25 easy|Sam's Pixel|k3pq|0" (Bluetooth adverts have
 * little room): mode, board, device, room id and hosting term.
 */
export function hostName(coop, board, device, room = '', term = 0) {
  const dev = [...String(device || '')].filter(ch => { const c = ch.charCodeAt(0); return c >= 32 && c <= 126 && ch !== '|'; }).join('').slice(0, 16);
  return `${coop ? 'C' : 'V'}|${board}|${dev}|${room}|${term}`;
}

/** Turns a host's endpoint name back into a friendly title. */
export function hostTitle(name) {
  const f = String(name).split('|');
  if (f.length < 3) return name;
  return `${f[0] === 'C' ? 'Co-op' : 'Versus'} · ${f[1].replace('x', '×')} · ${f[2]}`;
}

/**
 * A link to one same-room game, with the same surface as net.js's Link: set `ui` to the room
 * listener (plus onError, onStatus and onHostsChanged), use `room`, and `close()` when done.
 */
export class NearbyLink {
  constructor() {
    this.room = null; this.ui = {};
    this.hosts = new Map(); // endpoint id -> { id, title, room, term }
    this.peers = new Set();
    this.closed = false;
    this.discovering = false;
    this.seekRoom = null; this.seekTerm = 0; this.seekTimer = 0;
    this.myName = 'Phone';
    this.coop = false; this.board = '';
    this.offs = [
      onNative('nearby-found', e => this.found(e)),
      onNative('nearby-lost', e => { this.hosts.delete(e.id); this.emit('onHostsChanged'); }),
      onNative('nearby-connected', e => this.connected(e.id)),
      onNative('nearby-failed', e => this.failed(e)),
      onNative('nearby-disconnected', e => { if (this.peers.delete(e.id) && this.room) this.room.disconnected(e.id); }),
      onNative('nearby-message', e => { if (this.room && typeof e.text === 'string') this.room.received(e.id, e.text); }),
      onNative('nearby-error', e => this.emit('onError', e.text || "Couldn't reach Nearby. Are Bluetooth and Location on?")),
    ];
  }

  get code() { return ''; }
  get connectedToAny() { return this.peers.size > 0; }

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

  event(name, room, ...args) {
    if (name === 'onHostMoving') this.findAgain(room.roomId, room.term, FIND_HOST_MS, () => room.hostNotFound());
    if (name === 'onBecameHost') this.takeOver();
    if (name === 'onJoinRequest' && !(this.ui && this.ui.onJoinRequest)) { room.approve(args[0]); return; }
    return this.emit(name, room, ...args);
  }

  /** Permissions, Play services, Bluetooth and Location: resolves when ready, throws a friendly message if not. */
  prepare() {
    if (!native) return Promise.reject(new Error('Same-room play needs the Android app.'));
    return new Promise((resolve, reject) => {
      let done = false;
      const off = onNative('nearby-ready', e => {
        if (done) return;
        done = true; off();
        if (e.ok) resolve(); else reject(new Error(e.text || 'Playing together needs the Nearby devices and Location permissions.'));
      });
      try { native.nearbyPrepare(); } catch (err) { done = true; off(); reject(new Error("Couldn't start Nearby.")); }
    });
  }

  /** Host: opens a room and shows up for nearby phones (e.g. "Co-op · 25×25 easy · Sam's Pixel"). */
  async host(name, pencil, id, { coop, board }) {
    this.myName = name || 'Phone';
    this.coop = !!coop; this.board = board;
    this.emit('onStatus', 'Starting Nearby…');
    await this.prepare();
    if (this.closed) throw new Error('closed');
    const room = this.makeRoom(true, this.myName, pencil, id);
    this.advertise();
    this.emit('onStatus', 'Visible to nearby phones.');
    return room;
  }

  advertise() {
    if (this.closed || !this.room) return;
    native.nearbyAdvertise(hostName(this.coop, this.board, this.myName, this.room.roomId, this.room.term));
  }

  /** The host left and this phone hosts now: stop looking and show up for the others. */
  takeOver() {
    // A guest taking over advertises the first host's game (Room keeps its setup "MODE|SHAPE|w|h|DIFF").
    const f = String((this.room && this.room.setup) || '').split('|');
    if (f.length >= 5) { this.coop = f[0] === 'COOP'; this.board = `${f[2]}x${f[3]} ${f[4].toLowerCase()}`; }
    this.stopSeeking();
    this.stopDiscovery();
    try { native.nearbyStopAdvertising(); } catch (e) { /* ignore */ }
    this.advertise();
  }

  /** Guest: starts looking for hosts; call join() with one from `hosts`. */
  async look(name, pencil, id) {
    this.myName = name || 'Phone';
    this.emit('onStatus', 'Starting Nearby…');
    await this.prepare();
    if (this.closed) throw new Error('closed');
    const room = this.makeRoom(false, this.myName, pencil, id);
    this.startDiscovery();
    this.emit('onStatus', 'Searching nearby…');
    return room;
  }

  join(hostId) { if (!this.closed) native.nearbyConnect(hostId); }

  /** Host: stop showing up for new players. (Not used while games can be joined in progress.) */
  stopAdvertising() { try { native.nearbyStopAdvertising(); } catch (e) { /* ignore */ } }

  startDiscovery() {
    if (this.discovering || this.closed) return;
    this.discovering = true;
    native.nearbyDiscover();
  }

  stopDiscovery() {
    if (!this.discovering) return;
    this.discovering = false;
    try { native.nearbyStopDiscovery(); } catch (e) { /* ignore */ }
  }

  found(e) {
    const f = String(e.name || '').split('|');
    const h = { id: e.id, name: e.name, title: hostTitle(e.name || ''), room: f[3] || '', term: parseInt(f[4], 10) || 0 };
    this.hosts.set(e.id, h);
    this.emit('onHostsChanged');
    // Our game, hosted by whoever took over (or the old host, if only we dropped): rejoin it.
    if (this.seekRoom != null && h.room === this.seekRoom && h.term >= this.seekTerm && !this.connectedToAny) this.join(e.id);
  }

  connected(id) {
    this.peers.add(id);
    const r = this.room;
    if (!r) return;
    if (!r.isHost) { this.stopSeeking(); this.stopDiscovery(); this.emit('onStatus', ''); }
    r.connected(id);
  }

  failed(e) {
    // Finding the game again: try that phone once more in a moment.
    if (this.seekRoom != null) { setTimeout(() => { if (this.seekRoom != null && !this.closed) this.join(e.id); }, 1500); return; }
    if (this.room && !this.room.isHost) this.emit('onError', e.text || "Couldn't join. Try again?");
  }

  /**
   * Guest whose host left: look for our room again (advertised by the new host) and reconnect.
   * Calls onTimeout if nobody turns up within timeoutMs.
   */
  findAgain(roomId, term, timeoutMs, onTimeout) {
    this.stopSeeking();
    this.seekRoom = roomId; this.seekTerm = term;
    this.emit('onStatus', 'Finding the new host…');
    for (const h of this.hosts.values()) if (h.room === roomId && h.term >= term) { this.join(h.id); break; }
    this.startDiscovery();
    this.seekTimer = setTimeout(() => {
      if (this.seekRoom != null && !this.connectedToAny && !this.closed) { this.seekRoom = null; onTimeout(); }
    }, timeoutMs);
  }

  stopSeeking() { clearTimeout(this.seekTimer); this.seekTimer = 0; this.seekRoom = null; }

  send(peer, text) {
    if (this.closed || this.peers.size === 0) return;
    if (peer != null && !this.peers.has(peer)) return;
    native.nearbySend(peer == null ? '' : peer, text);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stopSeeking();
    for (const off of this.offs) off();
    try { native.nearbyStop(); } catch (e) { /* ignore */ }
    this.peers.clear(); this.hosts.clear();
  }
}
