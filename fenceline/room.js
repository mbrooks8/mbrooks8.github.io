// Play together: a port of the Android app's core/Room.kt (same text protocol), so the
// transport underneath (here WebRTC through PeerJS) is the only thing that differs.
import { Puzzle } from './core.js';
import { EXTRA_PENCILS as STORE_PENCILS } from './pencils.js';
const EXTRA_PENCIL_COUNT = STORE_PENCILS.length;

export const Mode = { VERSUS: 'VERSUS', COOP: 'COOP' };
export const SEATS = 32;
export const PENCILS = 5;
/** Pencils bought in the store are numbered from 100 (see sketch.js EXTRA_PENCILS); older phones draw them in a plain colour. */
export const EXTRA_PENCIL_BASE = 100, EXTRA_PENCILS = EXTRA_PENCIL_COUNT; // the store's pencils are numbered from 100 (web/pencils.js lists them; add only at the end)
export const RECENT_MS = 15000;

const clean = (s, max = 24) => String(s ?? '').replace(/[\t\u001f\n\r]/g, ' ').slice(0, max);

// ---- messages (same wire text as Msg.encode / Msg.decode in Kotlin) ----
export const Msg = {
  encode(m) {
    switch (m.t) {
      case 'HELLO': return `HELLO\t${clean(m.name)}\t${m.pencil}\t${clean(m.id)}`;
      case 'PENCIL': return `PENCIL\t${m.pencil}`;
      case 'WELCOME': return `WELCOME\t${m.player}`;
      case 'DENIED': return 'DENIED';
      case 'LOBBY': {
        const seats = m.names.map((_, i) =>
          `${clean(m.names[i] ?? '')}\u001f${m.pencils[i] ?? 0}\u001f${m.away[i] ? 1 : 0}\u001f${clean(m.ids[i] ?? '')}`);
        return `LOBBY\t${clean(m.room)}\u001f${m.term}\u001f${m.host}\u001f${clean(m.setup, 60)}\u001f${clean(m.bg || '', 20)}\t` + seats.join('\t');
      }
      case 'START': return `START\t${m.mode}\t${m.round}\t${m.puzzle}`;
      case 'PROG': return `PROG\t${m.player}\t${m.fraction}`;
      case 'DONE': return `DONE\t${m.player}\t${m.ms}\t${m.hints}\t${m.place || 0}`;
      case 'MARK': return `MARK\t${m.player}\t${m.edge}\t${m.value}\t${m.hint ? 1 : 0}`;
      case 'STATE': return `STATE\t${m.board}`;
      case 'PING': return `PING\t${m.player}\t${m.vertex}` + (m.x != null && m.y != null ? `\t${+m.x.toFixed(3)}\t${+m.y.toFixed(3)}` + (m.kind ? `\t${m.kind}` : '') : '');
      case 'REMATCH': return `REMATCH\t${m.player}`;
      case 'LEFT': return `LEFT\t${m.player}`;
      case 'VOTE': return `VOTE\t${m.player}\t${m.kind === 'clear' ? 'clear' : 'hint'}`; // co-op: asks everyone to vote on a Hint or Clear mistakes (older phones ignore it)
      case 'BALLOT': return `BALLOT\t${m.player}\t${m.for}\t${m.yes ? 1 : 0}`; // a vote on the open question asked by seat [for]
      case 'VOTEEND': return `VOTEEND\t${m.player}\t${m.pass ? 1 : 0}`; // the asker tells everyone how it went
      case 'LOOK': return `LOOK\t${m.player}\t${m.lines}`; // versus: a racer's fence so far, for friends who finished to watch (older phones ignore it)
      case 'CLEARED': return `CLEARED\t${m.player}`; // co-op: Clear mistakes was used (counts as a hint; older phones ignore it)
    }
    return '';
  },
  decode(text) {
    try {
      const f = String(text).split('\t');
      const int = (x) => { const v = parseInt(x, 10); if (Number.isNaN(v)) throw new Error('bad'); return v; };
      switch (f[0]) {
        case 'HELLO': return { t: 'HELLO', name: f[1], pencil: int(f[2]), id: f[3] ?? '' };
        case 'PENCIL': return { t: 'PENCIL', pencil: int(f[1]) }; // a guest picks another colour (phones that don't know it ignore it)
        case 'WELCOME': return { t: 'WELCOME', player: int(f[1]) };
        case 'DENIED': return { t: 'DENIED' };
        case 'LOBBY': {
          const meta = f[1].split('\u001f');
          const seats = f.slice(2).map((x) => x.split('\u001f'));
          return {
            t: 'LOBBY', names: seats.map((s) => s[0] || null), pencils: seats.map((s) => (s[1] != null ? int(s[1]) : 0)),
            away: seats.map((s) => s[2] === '1'), room: meta[0], term: int(meta[1]), host: int(meta[2]),
            ids: seats.map((s) => s[3] || null), setup: meta[3] ?? '', bg: meta[4] ?? '', // paper the host plays on (older phones ignore it)
          };
        }
        case 'START': if (f[1] !== 'VERSUS' && f[1] !== 'COOP') return null; return { t: 'START', mode: f[1], puzzle: f[3], round: int(f[2]) };
        case 'PROG': return { t: 'PROG', player: int(f[1]), fraction: parseFloat(f[2]) };
        case 'DONE': return { t: 'DONE', player: int(f[1]), ms: int(f[2]), hints: int(f[3]), place: f[4] != null ? int(f[4]) : 0 };
        case 'MARK': return { t: 'MARK', player: int(f[1]), edge: int(f[2]), value: int(f[3]), hint: f[4] === '1' };
        case 'STATE': return { t: 'STATE', board: f[1] };
        case 'PING': {
          // The exact spot (x, y in edge lengths) follows the nearest dot; 1.x phones send only the dot.
          const x = parseFloat(f[3]), y = parseFloat(f[4]);
          const m = { t: 'PING', player: int(f[1]), vertex: int(f[2]) };
          if (Number.isFinite(x) && Number.isFinite(y)) { m.x = x; m.y = y; }
          // An emoji key follows the spot; older apps ignore it and show a plain ping.
          if (/^[a-z]{1,12}$/.test(f[5] || '')) m.kind = f[5];
          return m;
        }
        case 'REMATCH': return { t: 'REMATCH', player: int(f[1]) };
        case 'LEFT': return { t: 'LEFT', player: int(f[1]) };
        case 'CLEARED': return { t: 'CLEARED', player: int(f[1]) };
        case 'LOOK': return /^[0-9a-f]{0,4000}$/.test(f[2] || '') ? { t: 'LOOK', player: int(f[1]), lines: f[2] || '' } : null;
        case 'VOTE': return { t: 'VOTE', player: int(f[1]), kind: f[2] === 'clear' ? 'clear' : 'hint' };
        case 'BALLOT': return { t: 'BALLOT', player: int(f[1]), for: int(f[2]), yes: f[3] === '1' };
        case 'VOTEEND': return { t: 'VOTEEND', player: int(f[1]), pass: f[2] === '1' };
      }
    } catch (e) { /* bad message */ }
    return null;
  },
};

/** A name to match a returning player by ('' for blank or made-up "Friend 3" names). */
function sameName(s) {
  const n = String(s || '').trim().toLowerCase();
  return !n || /^friend( \d+)?$/.test(n) ? '' : n;
}

function newRoomId() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

/** Puzzle with clues, solution, difficulty and seed, so guests need not regenerate big boards. */
export function puzzleText(p) { return p.encode(true) + '|' + (p.difficulty || '') + '|' + (p.seed != null ? p.seed.toString() : ''); }
export function parsePuzzle(text) {
  const parts = text.split('|');
  const p = Puzzle.decode(parts[0]);
  const diff = parts[1] || null;
  const seed = parts[2] && /^-?\d+$/.test(parts[2]) ? BigInt(parts[2]) : null;
  return new Puzzle(p.width, p.height, p.clues, p.solution, diff, seed, p.shape);
}

/**
 * Room logic for one device. The transport calls connected / disconnected / received;
 * the room calls send(peer, text) (peer = null means everyone I'm connected to) and reports to listener.
 * Listener methods (all optional): onLobby, onMessage(room, msg), onPlayerLeft(room, p), onHostLost,
 * onHostMoving(room, from, to), onBecameHost(room, from), onJoinRequest(room, peer, name, returning),
 * onJoined(room, player, returning), onDenied.
 */
export class Room {
  constructor(isHost, myName, myPencil, myId, send) {
    this.myName = myName; this.myPencil = myPencil; this.myId = myId || ''; this._send = send;
    this.listener = {};
    this.isHost = isHost;
    this.me = isHost ? 0 : -1;
    this.hostSeat = 0;
    this.roomId = isHost ? newRoomId() : '';
    this.term = 0;
    this._setup = '';
    this.background = ''; // the host's paper (an id from cosmetics.js); co-op plays on it
    this.waitingFor = -1;
    this.skipped = new Set();
    this.leftAt = new Array(SEATS).fill(-1e15);
    this.now = () => Date.now();
    this.names = new Array(SEATS).fill(null); if (isHost) this.names[0] = myName;
    this.pencils = new Array(SEATS).fill(0); if (isHost) this.pencils[0] = myPencil;
    this.away = new Array(SEATS).fill(false);
    this.seatIds = new Array(SEATS).fill(null); if (isHost) this.seatIds[0] = this.myId.slice(0, 24) || null;
    this.peerPlayer = new Map();
    this.pending = new Map();
    this.started = false;
    this.round = 0;
    this.current = null;
    this.dones = [];
    this.capacity = SEATS;
  }

  L(name, ...args) { const f = this.listener && this.listener[name]; if (f) return f.call(this.listener, this, ...args); if (name === 'onJoinRequest') this.approve(args[0]); }

  get setup() { return this._setup; }
  set setup(v) { this._setup = v; if (this.isHost && this.playerCount > 1) this.broadcast(this.lobby()); }

  get playerCount() { return this.names.filter((n) => n != null).length; }
  get players() { const out = []; this.names.forEach((n, i) => { if (n != null) out.push(i); }); return out; }
  get here() { return this.players.filter((p) => !this.away[p]); }
  get isFull() { return this.here.length >= Math.min(this.capacity, SEATS); }

  // ---- transport events ----
  connected(peer) { if (!this.isHost) this._send(peer, Msg.encode({ t: 'HELLO', name: this.myName, pencil: this.myPencil, id: this.myId })); }

  disconnected(peer) {
    if (!this.isHost) {
      if (this.me < 0 || !this.roomId) { this.L('onHostLost'); return; }
      const from = this.hostSeat;
      this.away[from] = true;
      this.moveHost(from);
      return;
    }
    this.pending.delete(peer);
    if (!this.peerPlayer.has(peer)) return;
    const p = this.peerPlayer.get(peer); this.peerPlayer.delete(peer);
    this.away[p] = true;
    this.broadcast({ t: 'LEFT', player: p });
    this.broadcast(this.lobby());
    this.L('onPlayerLeft', p);
    this.L('onLobby');
  }

  received(peer, text) {
    const msg = Msg.decode(text);
    if (!msg) return;
    if (this.isHost) this.hostReceive(peer, msg); else this.guestReceive(msg);
  }

  moveHost(from) {
    const t = this.now();
    const cands = this.players.filter((p) => p !== from && !this.skipped.has(p) && (!this.away[p] || t - this.leftAt[p] <= RECENT_MS));
    const next = cands.length ? Math.min(...cands) : this.me;
    if (next === this.me) this.takeOver(from);
    else { this.waitingFor = next; this.L('onHostMoving', from, next); }
  }

  hostNotFound() {
    if (this.isHost || this.waitingFor < 0) return;
    const gone = this.waitingFor;
    this.skipped.add(gone);
    this.away[gone] = true;
    this.moveHost(gone);
  }

  takeOver(from) {
    this.isHost = true;
    this.hostSeat = this.me;
    this.term++;
    this.waitingFor = -1;
    this.skipped.clear();
    this.peerPlayer.clear(); this.pending.clear();
    for (const p of this.players) if (p !== this.me) this.away[p] = true;
    this.L('onBecameHost', from);
    this.L('onLobby');
  }

  /** The seat this same device (same id) had, even if its old connection hasn't timed out yet, or -1. */
  sameDeviceSeat(hello) {
    const id = (hello.id || '').slice(0, 24);
    if (id) for (let i = 0; i < SEATS; i++) if (i !== this.me && this.seatIds[i] === id) return i;
    return -1;
  }

  returningSeat(hello) {
    const dev = this.sameDeviceSeat(hello);
    if (dev >= 0) return dev;
    // Same person on another browser or app (an iPhone link opens Safari, not the home-screen app):
    // give them back the seat of an away player with the same name.
    const nm = sameName(hello.name);
    if (nm) for (let i = 0; i < SEATS; i++) if (i !== this.me && this.away[i] && sameName(this.names[i]) === nm) return i;
    return -1;
  }

  /** Away seats that are this same player again (left over from older versions): fold them away. */
  dropDuplicates(seat, hello) {
    const id = (hello.id || '').slice(0, 24), nm = sameName(hello.name);
    let n = 0;
    for (let i = 0; i < SEATS; i++) {
      if (i === seat || i === this.me || !this.away[i] || this.names[i] == null) continue;
      if ((id && this.seatIds[i] === id) || (nm && sameName(this.names[i]) === nm)) {
        this.names[i] = null; this.seatIds[i] = null; this.away[i] = false; n++;
      }
    }
    return n;
  }

  hostReceive(peer, msg) {
    switch (msg.t) {
      case 'HELLO': {
        if (this.pending.has(peer)) return;
        if (this.peerPlayer.has(peer)) { this.peerPlayer.delete(peer); this.seat(peer, msg); return; } // reconnected: catch it up again
        if (this.isFull) { this._send(peer, Msg.encode({ t: 'DENIED' })); return; }
        // Mid-game, only the same device walks straight back in. Someone matched just by name could be
        // a different person with the same name, so the host is asked first ("Sam is back!").
        if (!this.started || this.sameDeviceSeat(msg) >= 0) { this.seat(peer, msg); return; }
        this.pending.set(peer, msg);
        this.L('onJoinRequest', peer, (msg.name || '').trim() || 'A friend', this.returningSeat(msg) >= 0);
        return;
      }
      case 'PENCIL': {
        if (!this.peerPlayer.has(peer)) return;
        const seat = this.peerPlayer.get(peer);
        this.pencils[seat] = this.freePencil(msg.pencil, seat, this.pencils[seat]);
        this.broadcast(this.lobby());
        this.L('onLobby');
        return;
      }
      case 'PROG': case 'DONE': case 'MARK': case 'REMATCH': case 'PING': case 'CLEARED': case 'VOTE': case 'BALLOT': case 'VOTEEND': case 'LOOK': {
        if (!this.peerPlayer.has(peer)) return;
        const from = this.peerPlayer.get(peer);
        let fixed = { ...msg, player: from };
        if (msg.t === 'DONE') { fixed = this.placed(fixed); if (!fixed) return; }
        const text = Msg.encode(fixed);
        for (const other of this.peerPlayer.keys()) if (other !== peer || fixed.t === 'DONE') this._send(other, text);
        this.L('onMessage', fixed);
        return;
      }
    }
  }

  placed(d) {
    if (this.dones.some((x) => x.player === d.player)) return null;
    const out = { ...d, place: this.dones.length + 1 };
    this.dones.push(out);
    return out;
  }

  approve(peer) {
    const hello = this.pending.get(peer); if (!hello) return;
    this.pending.delete(peer);
    if (this.isFull) { this._send(peer, Msg.encode({ t: 'DENIED' })); return; }
    this.seat(peer, hello);
  }

  deny(peer) { if (this.pending.delete(peer)) this._send(peer, Msg.encode({ t: 'DENIED' })); }

  seat(peer, hello) {
    const back = this.returningSeat(hello);
    let seat = back;
    if (seat < 0) {
      seat = -1;
      for (let i = 0; i < SEATS; i++) if (i !== this.me && this.names[i] == null) { seat = i; break; }
      if (seat < 0) for (let i = 0; i < SEATS; i++) if (i !== this.me && this.away[i]) { seat = i; break; }
      if (seat < 0) { this._send(peer, Msg.encode({ t: 'DENIED' })); return; }
    }
    for (const [pp, s] of this.peerPlayer) if (s === seat && pp !== peer) this.peerPlayer.delete(pp); // its old, stale connection
    this.peerPlayer.set(peer, seat);
    this.names[seat] = (hello.name || '').trim() ? hello.name : `Friend ${seat}`;
    this.away[seat] = false;
    this.seatIds[seat] = (hello.id || '').slice(0, 24) || null;
    // Fold away any leftover duplicate seats of the people who are here (this one and the rest).
    for (const p of this.players) if (!this.away[p]) this.dropDuplicates(p, { id: this.seatIds[p], name: this.names[p] });
    if (back < 0) this.pencils[seat] = this.freePencil(hello.pencil, seat);
    this._send(peer, Msg.encode({ t: 'WELCOME', player: seat }));
    this.broadcast(this.lobby());
    if (this.current) {
      this._send(peer, Msg.encode(this.current));
      for (const d of this.dones) this._send(peer, Msg.encode(d));
    }
    this.L('onLobby');
    if (this.current) this.L('onJoined', seat, back >= 0);
  }

  guestReceive(msg) {
    switch (msg.t) {
      case 'WELCOME': this.me = msg.player; this.waitingFor = -1; this.skipped.clear(); return;
      case 'DENIED': this.L('onDenied'); return;
      case 'LOBBY': {
        if (msg.term < this.term && msg.room === this.roomId) return;
        this.roomId = msg.room; this.term = msg.term; this.hostSeat = msg.host;
        if (msg.setup) this._setup = msg.setup;
        this.background = msg.bg || '';
        for (let i = 0; i < SEATS; i++) {
          this.seatIds[i] = msg.ids[i] ?? null;
          this.names[i] = msg.names[i] ?? null;
          this.pencils[i] = msg.pencils[i] ?? 0;
          this.away[i] = msg.away[i] ?? false;
        }
        this.L('onLobby');
        return;
      }
      case 'START': {
        this.started = true; this.round = msg.round;
        const same = this.current && this.current.round === msg.round && this.current.puzzle === msg.puzzle && this.current.mode === msg.mode;
        if (!same) { this.current = msg; this.dones = []; }
        this.L('onMessage', msg);
        return;
      }
      case 'DONE':
        if (msg.place > 0 && !this.dones.some((d) => d.player === msg.player)) this.dones.push(msg);
        this.L('onMessage', msg);
        return;
      case 'LEFT': this.away[msg.player] = true; this.leftAt[msg.player] = this.now(); this.L('onPlayerLeft', msg.player); return;
      default: this.L('onMessage', msg);
    }
  }

  /**
   * The pencil [seat] gets: [wanted] if it exists, else [keep] when it is given, else the plain first one.
   * Friends may share a pencil: they keep the colour and each gets another line pattern (sketch.js seatStyles).
   */
  freePencil(wanted, seat, keep = -1) {
    const real = (wanted >= 0 && wanted < PENCILS) || (wanted >= EXTRA_PENCIL_BASE && wanted < EXTRA_PENCIL_BASE + EXTRA_PENCILS);
    if (real) return wanted;
    return keep >= 0 ? keep : 0;
  }

  /** Pick another pencil colour once in the room (returns false for a number that is not a pencil). */
  setPencil(wanted) {
    if (this.me < 0) { this.myPencil = wanted; return true; }
    const mine = this.pencils[this.me];
    const got = this.freePencil(wanted, this.me, mine);
    if (got !== wanted) return false;
    this.myPencil = wanted;
    this.pencils[this.me] = wanted;
    if (this.isHost) { this.broadcast(this.lobby()); this.L('onLobby'); } else this.broadcast({ t: 'PENCIL', pencil: wanted });
    return true;
  }

  /** The host tells everyone which paper co-op is played on. */
  setBackground(id) {
    this.background = id || '';
    if (this.isHost) this.broadcast(this.lobby());
  }

  lobby() {
    let last = -1; this.names.forEach((n, i) => { if (n != null) last = i; });
    const n = Math.max(1, last + 1);
    return {
      t: 'LOBBY', names: this.names.slice(0, n), pencils: this.pencils.slice(0, n), away: this.away.slice(0, n),
      room: this.roomId, term: this.term, host: this.hostSeat, ids: this.seatIds.slice(0, n), setup: this._setup, bg: this.background,
    };
  }

  // ---- local actions ----
  broadcast(msg) { this._send(null, Msg.encode(msg)); }

  finish(ms, hints) {
    if (!this.isHost) { this.broadcast({ t: 'DONE', player: this.me, ms, hints, place: 0 }); return null; }
    const d = this.placed({ t: 'DONE', player: this.me, ms, hints, place: 0 });
    if (!d) return null;
    this.broadcast(d);
    return d;
  }

  start(mode, puzzle) {
    if (!this.isHost) throw new Error('only the host starts');
    this.started = true;
    this.round++;
    this.dones = [];
    const s = { t: 'START', mode, puzzle: puzzleText(puzzle), round: this.round };
    this.current = s;
    this.broadcast(s);
  }
}

/** Keeps one shared co-op Game in step with the room: local edits go out, remote ones come in. */
export class CoopBoard {
  constructor(game, room) {
    this.game = game; this.room = room;
    game.localPlayer = room.me;
    game.onLocalChange = (e, v, h) => room.broadcast({ t: 'MARK', player: room.me, edge: e, value: v, hint: h });
  }
  apply(msg) {
    if (msg.t === 'MARK') { this.game.applyRemote(msg.edge, msg.value, msg.player, msg.hint); return true; }
    if (msg.t === 'CLEARED') { this.game.applyRemoteClear(); return true; }
    if (msg.t === 'STATE') {
      if (!this.room.isHost && msg.board !== this.game.boardState()) { this.game.loadBoardState(msg.board); return true; }
      return false;
    }
    return false;
  }
  /** Tell everyone this phone used Clear mistakes (a hint for the whole team). */
  clearedMistakes() { this.room.broadcast({ t: 'CLEARED', player: this.room.me }); }
  syncAll() { if (this.room.isHost) this.room.broadcast({ t: 'STATE', board: this.game.boardState() }); }
  detach() { this.game.onLocalChange = null; }
}
