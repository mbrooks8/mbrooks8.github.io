// Play together, inside the game screen: lobby, countdown, versus results, co-op board sync,
// joining a game in progress, and moving the host when the host leaves.
// showGame (app.js) calls createPlay(ctx); ctx is the game screen's shared state (see showGame).
// The room logic itself (seats, protocol) is room.js; transports are net.js (online) and nearby.js (Android).
import { Shape, Edge, Game, PuzzleCode, Boards } from './core.js';
import { store, formatTime } from './store.js';
import { theme, el, text, button, chip, dialog } from './ui.js';
import { pencilColor, pencilStyle, pencilSwatch } from './sketch.js';
import { Mode, CoopBoard, SEATS, parsePuzzle as roomParse } from './room.js';
import { Link } from './net.js';
import { NearbyLink } from './nearby.js';
import { play } from './sound.js';
import { GROUP_SIZES, JOIN_BASE, cap, diffLabel, factory, shareText, defaultName } from './common.js';
import { leaveGame } from './app.js';

export function createPlay(ctx) {
  const { opts, board, title, loading, noteText, playersText, setNote, showLoading, refresh, start } = ctx;
  // Play together.
  let link = null, room = null, coop = null;
  let mpMode = opts.mpMode || Mode.VERSUS, mpW = opts.w || 7, mpH = opts.h || 7, mpDiff = opts.d || 'EASY', mpShape = opts.shape || Shape.SQUARE;
  let lobbyD = null, lobbyCol = null, lobbyStatus = '', resultsD = null, resultsCol = null;
  let countingDown = false, hostPuzzle = null, startWhenReady = false, lastSentProgress = -1, lastProgAt = 0, progTimer = 0;
  let lastLocalEdit = -Infinity, round = 0, syncTimer = 0, countTimer = 0, soonTimer = 0, soonLeft = 0, soonText = null, roomCode = opts.code || '';
  const nearby = opts.via === 'nearby'; // Android app, same room over Nearby (else online)
  const progress = new Map(), finished = new Map(); // finished: player -> [ms, hints, place]
  const wantsRematch = new Set(); // players who asked for another round

  // ---- play together (online) ----------------------------------------------

  const shared = () => ctx.mode === 'mp' && mpMode === Mode.COOP && !!room;
  // "X left, Y hosts now" stays readable while people reconnect right after it.
  let hostNote = '', hostNoteAt = -1e9, statusNote = '';
  const leftTimers = new Map(), toldLeft = new Set();
  let wokeAt = -1e9;
  const onWake = () => { if (document.visibilityState !== 'hidden') wokeAt = performance.now(); };
  document.addEventListener('visibilitychange', onWake);
  const moveNote = t => { hostNote = t; hostNoteAt = performance.now(); setNote(t); };
  const laterNote = t => setNote(performance.now() - hostNoteAt < 6000 ? `${hostNote} ${t}` : t);
  const isHost = () => !!(room && room.isHost);
  const nameOf = p => (room && p === room.me) ? 'You' : (room && room.names[p]) || 'Friend';
  const colorOf = p => pencilColor(room ? (room.pencils[p] || 0) : 0, theme.night);
  const styleOf = p => pencilStyle(room ? (room.pencils[p] || 0) : 0);
  const boardLabelOf = (sh, w, h, d) => `${Boards.label(sh, w, h)} ${diffLabel(d)}`;
  // Players away for a while drop off the list (they keep their seat, colour and fences if they come back).
  const AWAY_SHOWN_MS = 30000;
  const awaySince = new Map();
  let awayTimer = 0;
  const shownPlayers = r => {
    const now = performance.now();
    let next = Infinity;
    const out = r.players.filter(p => {
      if (!r.away[p]) { awaySince.delete(p); return true; }
      if (!awaySince.has(p)) awaySince.set(p, now);
      const left = awaySince.get(p) + AWAY_SHOWN_MS - now;
      if (left > 0) next = Math.min(next, left);
      return left > 0;
    });
    clearTimeout(awayTimer);
    if (next < Infinity) awayTimer = setTimeout(() => { if (!ctx.disposed) { updatePlayers(); fillLobby(); } }, next + 50);
    return out;
  };
  /** ★ marks whoever hosts right now (it moves when hosting moves). */
  const star = p => (room && p === (room.isHost ? room.me : room.hostSeat) ? '★ ' : '');
  const dotLine = (p, label) => el('span', { class: 'pl' }, pencilSwatch(room ? (room.pencils[p] || 0) : 0, theme.night), label);

  const linkUi = {
    onLobby(r) {
      if (!r.isHost && r.me >= 0 && lobbyStatus === 'Asking to join…') lobbyStatus = '';
      fillLobby(); updatePlayers();
    },
    onMessage(r, msg) {
      switch (msg.t) {
        case 'START': if (!r.isHost) {
          mpMode = msg.mode;
          let p;
          try { p = parsePuzzleText(msg.puzzle); } catch (e) { console.error(e); return; }
          // Rejoining the round we were already in: keep our board (and versus time).
          const same = ctx.game && ctx.mode === 'mp' && round === msg.round && ctx.game.puzzle.encode(true) === p.encode(true);
          round = msg.round;
          startRound(p, same);
        } break;
        case 'PING': board.showPing(msg.vertex, colorOf(msg.player), msg.x, msg.y); play('ping'); setNote(`${nameOf(msg.player)} says: look here!`); break;
        case 'PROG': progress.set(msg.player, msg.fraction); updatePlayers(); fillResults(); break;
        case 'DONE':
          // Someone else got there first: a kind little "well played".
          if (msg.place === 1 && msg.player !== r.me && !finished.has(msg.player)) play('done');
          finished.set(msg.player, [msg.ms, msg.hints, msg.place]);
          progress.set(msg.player, 1);
          updatePlayers();
          if (!resultsD) showResults(); else fillResults();
          break;
        case 'MARK': case 'STATE':
          // Skip a full sync that may predate our own very latest edit; the next one catches up.
          if (msg.t === 'STATE' && performance.now() - lastLocalEdit < 1500) return;
          if (coop && coop.apply(msg)) { if (msg.t === 'MARK') play('friend'); board.invalidate(); refresh(); }
          break;
        case 'REMATCH': {
          // Round over: the next one starts by itself in a few seconds, so the host still has time to change
          // the board. Someone still drawing: the host decides.
          const roundOver = mpMode === Mode.COOP ? !!(ctx.game && ctx.game.isSolved()) : r.here.every(p => finished.has(p));
          wantsRematch.add(msg.player);
          setNote(`${nameOf(msg.player)} wants another round!`);
          if (r.isHost && roundOver) startSoon();
          if (resultsCol) fillResults();
          break;
        }
      }
    },
    onPlayerLeft(r, player) {
      // Phones drop out for a moment all the time (screen off, app switch). Only say so if they stay gone.
      // (And if this phone was the one asleep, the others are just finding it again.)
      clearTimeout(leftTimers.get(player));
      const later = () => leftTimers.set(player, setTimeout(() => {
        if (document.visibilityState === 'hidden' || performance.now() - wokeAt < 10000) { later(); return; }
        leftTimers.delete(player);
        if (ctx.game && room && room.away[player]) { setNote(`${nameOf(player)} dropped out. They can join again.`); toldLeft.add(player); play('leave'); }
      }, 10000));
      later();
      progress.delete(player);
      updatePlayers(); fillResults();
    },
    onHostLost() {
      const had = !!room && room.me >= 0;
      if (link) link.close();
      link = null; room = null;
      if (!ctx.game) { lobbyStatus = had ? 'Lost the connection.' : lobbyStatus || 'Lost the connection.'; fillLobby(); return; }
      updatePlayers();
      lostDialog();
    },
    onHostMoving(r, from, to) {
      const msg = `${r.names[from] || 'The host'} left. ${r.names[to] || 'A friend'} is hosting now…`;
      if (ctx.game && ctx.mode === 'mp') moveNote(msg); else { lobbyStatus = msg; fillLobby(); }
      updatePlayers();
    },
    onBecameHost(r, from) {
      loadSetup(r.setup);
      const msg = `${r.names[from] || 'The host'} left. You're hosting now.`;
      if (ctx.game && ctx.mode === 'mp') moveNote(msg); else lobbyStatus = msg;
      prepareNextPuzzle();
      if (coop) scheduleSync();
      fillLobby(); fillResults(); updatePlayers();
    },
    onJoinRequest(r, peer, name, returning) { askToJoin(r, peer, name, returning); },
    onJoined(r, player, returning) {
      clearTimeout(leftTimers.get(player)); leftTimers.delete(player);
      if (!returning || toldLeft.delete(player)) { laterNote(`${nameOf(player)} ${returning ? 'is back' : 'joined'}!`); play('join'); }
      if (mpMode === Mode.COOP && coop) coop.syncAll(); // catch them up on the shared board
      updatePlayers(); fillResults();
    },
    onDenied() { lobbyStatus = 'The host said not now, or the game is full.'; fillLobby(); },
    onHostsChanged() { fillLobby(); },
    onError(t) { lobbyStatus = t; fillLobby(); if (!lobbyD) setNote(t); },
    onStatus(t) {
      if (ctx.game && ctx.mode === 'mp') {
        if (t) { laterNote(t); statusNote = noteText.textContent; }
        else if (statusNote && noteText.textContent === statusNote) { setNote(''); statusNote = ''; }
      }
      else { lobbyStatus = t; fillLobby(); }
    },
  };

  const parsePuzzleText = t => roomParse(t);

  const setupText = () => `${mpMode}|${mpShape.name}|${mpW}|${mpH}|${mpDiff}`;
  /** A new host carries on with the first host's settings (for the next puzzle). */
  const loadSetup = setup => {
    const f = String(setup || '').split('|');
    if (f.length < 5) return;
    if (!ctx.game || ctx.mode !== 'mp') mpMode = f[0] === Mode.COOP ? Mode.COOP : Mode.VERSUS;
    mpShape = Shape.entries.find(x => x.name === f[1]) || mpShape;
    mpW = parseInt(f[2], 10) || mpW;
    mpH = parseInt(f[3], 10) || mpH;
    if (['EASY', 'MEDIUM', 'HARD'].includes(f[4])) mpDiff = f[4];
  };

  const startMultiplayer = async () => {
    ctx.mode = 'mp';
    title.replaceChildren();
    loading.textContent = '';
    showLoading();
    openLink(opts.role === 'join' ? 'join' : 'host');
  };

  const openLink = async role => {
    link = nearby ? new NearbyLink() : new Link();
    link.ui = linkUi;
    if (window.__fenceline) window.__fenceline.link = link;
    lobbyStatus = nearby ? 'Starting Nearby…' : role === 'host' ? 'Making a room…' : `Looking for room ${roomCode.toUpperCase()}…`;
    showLobby();
    const myLink = link;
    const myName = defaultName();
    try {
      if (role === 'host') {
        prepareNextPuzzle();
        room = nearby
          ? await link.host(myName || 'Host', store.pencil, store.installId, { coop: mpMode === Mode.COOP, board: `${mpW}x${mpH} ${diffLabel(mpDiff)}` })
          : await link.host(myName || 'Host', store.pencil, store.installId);
        if (ctx.disposed || link !== myLink) { myLink.close(); return; }
        room.setup = setupText();
        if (!nearby) roomCode = room.roomId;
        lobbyStatus = nearby ? 'Visible to nearby phones.' : 'Send your friends the code.';
      } else if (nearby) {
        room = await link.look(myName || '', store.pencil, store.installId);
        if (ctx.disposed || link !== myLink) { myLink.close(); return; }
        lobbyStatus = 'Searching nearby…';
      } else {
        room = await link.join(roomCode, myName || '', store.pencil, store.installId);
        if (ctx.disposed || link !== myLink) { myLink.close(); return; }
        lobbyStatus = 'Asking to join…';
      }
    } catch (e) {
      if (ctx.disposed || link !== myLink) return;
      lobbyStatus = (e && e.message) || 'Something went wrong. Try again.';
      try { link.close(); } catch (_) { /* ignore */ }
      link = null; room = null;
    }
    fillLobby();
    updatePlayers();
  };

  /** Guest who lost the host: look for the game again. The host lets you back into your old seat. */
  const rejoin = () => { openLink('join'); };

  /** Host: start building the next puzzle now so Start (or Rematch) is quick, even on big boards. */
  const prepareNextPuzzle = () => {
    hostPuzzle = null;
    const want = setupText();
    factory.request(mpW, mpH, mpDiff, PuzzleCode.randomSeed(), mpShape).then(p => {
      if (ctx.disposed || want !== setupText()) return;
      hostPuzzle = p;
      if (startWhenReady) launchRound();
    }, err => { console.error(err); lobbyStatus = "Oops, that puzzle wouldn't draw."; fillLobby(); });
  };

  const showLobby = () => {
    if (lobbyD) { fillLobby(); return; }
    lobbyCol = el('div', { class: 'col' });
    lobbyD = dialog(lobbyCol, { cancelable: false });
    fillLobby();
  };

  const shareInvite = () => {
    const c = (room ? room.roomId : roomCode).toUpperCase();
    shareText(`Join my Fenceline game!\n${JOIN_BASE}${c}\nRoom code: ${c}`, t => { lobbyStatus = t; fillLobby(); });
  };

  const fillLobby = () => {
    const col = lobbyCol;
    if (!col) return;
    const r = room;
    const kids = [];
    if (nearby && r && !r.isHost && r.me < 0) {
      // Same room: pick a game from the phones close by (as in the 1.x app).
      kids.push(text('Looking for games…', { size: 24, bold: true }));
      const hosts = link && link.hosts ? [...link.hosts.values()] : [];
      if (!hosts.length) kids.push(text('Ask a friend to tap Host.', { size: 15, color: 'inkSoft' }));
      for (const h of hosts) kids.push(button(h.title, () => { lobbyStatus = 'Asking to join…'; fillLobby(); link.join(h.id); }, { size: 16, kind: 'outline' }));
    } else if (!r || (!r.isHost && r.me < 0)) {
      kids.push(text(opts.role === 'host' && !r ? (nearby ? 'Starting Nearby…' : 'Making a room…') : nearby ? 'Looking for games…' : 'Joining…', { size: 24, bold: true }));
      if (roomCode && !nearby) kids.push(text(`Room ${roomCode.toUpperCase()}`, { size: 15, color: 'inkSoft' }));
    } else {
      const ready = r.here.length >= 2;
      kids.push(text(r.isHost ? (ready ? 'Ready when you are!' : 'Waiting for friends…') : "You're in!", { size: 24, bold: true }));
      let setup = r.isHost ? null : r.setup.split('|');
      const label = r.isHost ? `${mpMode === Mode.COOP ? 'Co-op' : 'Versus'} · ${boardLabelOf(mpShape, mpW, mpH, mpDiff)}`
        : setup && setup.length >= 5 ? `${setup[0] === Mode.COOP ? 'Co-op' : 'Versus'} · ${boardLabelOf(Shape.entries.find(x => x.name === setup[1]) || Shape.SQUARE, setup[2], setup[3], setup[4])}` : '';
      if (label) kids.push(text(label, { size: 15, color: 'inkSoft' }));
      if (r.isHost && !nearby) {
        kids.push(el('div', { class: 'roomcode' }, el('div', { class: 'lbl2', text: 'Room code' }), el('div', { class: 'big', text: r.roomId.toUpperCase() })));
        kids.push(button('Share invite', shareInvite, { size: 16 }));
      }
      kids.push(el('div', { class: 'plist' }, ...shownPlayers(r).map(p => dotLine(p, star(p) + (p === r.me ? `${r.names[p]} (you)` : r.names[p] || '') + (r.away[p] ? ' (away)' : '')))));
      if (r.isHost) {
        const b = button('Start', () => { if (r.here.length >= 2) launchRound(); }, { size: 20, kind: 'primary' });
        b.classList.toggle('dim', !ready);
        kids.push(el('div', { class: 'gap8' }, b));
      } else kids.push(text('The host starts the game.', { size: 15, color: 'inkSoft' }));
    }
    if (lobbyStatus) kids.push(text(lobbyStatus, { size: 15, color: 'inkSoft' }));
    if (!room && link == null) kids.push(button('Try again', () => openLink(opts.role === 'join' ? 'join' : 'host'), { size: 16, kind: 'outline' }));
    kids.push(button('Cancel', () => leaveGame(), { size: 16 }));
    col.replaceChildren(...kids);
  };

  /** Host: someone asked for another round. Count down, so there's still time to tap Change board. */
  const NEXT_IN = 10;
  const startSoon = () => {
    if (soonTimer) return;
    soonLeft = NEXT_IN;
    const tick = () => {
      if (ctx.disposed) return;
      if (soonLeft <= 0) { soonTimer = 0; launchRound(); return; }
      if (soonText) soonText.textContent = `Next game in ${soonLeft}…`;
      soonLeft--;
      soonTimer = setTimeout(tick, 1000);
    };
    tick();
  };
  const stopSoon = () => { clearTimeout(soonTimer); soonTimer = 0; if (soonText) soonText.textContent = ''; };

  /** Host: start a round with the prepared puzzle (or as soon as it's ready). */
  const launchRound = () => {
    const r = room;
    stopSoon();
    if (!r || !r.isHost) return;
    const p = hostPuzzle;
    if (!p) {
      startWhenReady = true;
      lobbyStatus = 'Sketching the puzzle…'; fillLobby();
      setNote('Sketching the next puzzle…');
      return;
    }
    startWhenReady = false;
    r.start(mpMode, p);
    startRound(p, false);
    prepareNextPuzzle();
  };

  const startRound = (p, keep) => {
    const r = room;
    if (!r || ctx.disposed) return;
    if (r.isHost) round = r.round;
    if (lobbyD) { lobbyD.close(); lobbyD = null; lobbyCol = null; }
    if (resultsD) { resultsD.close(); resultsD = null; resultsCol = null; }
    if (coop) { coop.detach(); coop = null; }
    progress.clear(); finished.clear(); wantsRematch.clear(); lastSentProgress = -1;
    const g = keep ? ctx.game : new Game(p);
    g.localPlayer = Math.max(0, r.me);
    if (mpMode === Mode.COOP) {
      coop = new CoopBoard(g, r);
      const send = g.onLocalChange;
      g.onLocalChange = (e, v, h) => { lastLocalEdit = performance.now(); if (send) send(e, v, h); };
      board.ownerColors = Array.from({ length: SEATS }, (_, i) => colorOf(i)); board.ownerStyles = Array.from({ length: SEATS }, (_, i) => styleOf(i));
      board.onPing = (v, x, y) => { board.showPing(v, colorOf(r.me), x, y); if (room) room.broadcast({ t: 'PING', player: room.me, vertex: v, x, y }); };
    } else {
      board.ownerColors = null; board.ownerStyles = null;
      board.onPing = null;
      board.pingArmed = false;
    }
    ctx.mode = 'mp';
    if (!keep) start(g); else { board.invalidate(); laterNote("You're back in!"); }
    playersText.hidden = false;
    updatePlayers();
    clearTimeout(syncTimer);
    // Versus: everyone (and anyone joining late) gets a 3-2-1; your own time starts after it.
    if (mpMode === Mode.VERSUS) { if (!keep) countdown(3); else refresh(); }
    else if (r.isHost) scheduleSync();
  };

  /** Co-op host: send the whole board every few seconds, so everyone stays in step. */
  const scheduleSync = () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function tick() {
      if (!coop || !isHost() || ctx.disposed) return;
      if (!(ctx.game && ctx.game.isSolved())) coop.syncAll();
      syncTimer = setTimeout(tick, 3000);
    }, 3000);
  };

  const countdown = n => {
    countingDown = true;
    board.locked = true;
    loading.hidden = false;
    loading.classList.add('count');
    loading.textContent = n > 0 ? String(n) : 'Go!';
    play(n > 0 ? 'tick' : 'go');
    clearTimeout(countTimer);
    if (n > 0) { countTimer = setTimeout(() => countdown(n - 1), 900); return; }
    countTimer = setTimeout(() => {
      loading.hidden = true;
      loading.classList.remove('count');
      countingDown = false;
      board.locked = false;
      ctx.resumedAt = performance.now();
      if (ctx.game) ctx.game.elapsedMs = 0;
    }, 500);
  };

  const sendProgress = g => {
    const r = room;
    if (!r || mpMode !== Mode.VERSUS || r.me < 0) return;
    const p = g.progress();
    if (Math.abs(p - lastSentProgress) < 0.01) return;
    progress.set(r.me, p);
    updatePlayers();
    // At most a few updates a second; the last one always goes out.
    const now = performance.now();
    const send = () => { progTimer = 0; lastProgAt = performance.now(); lastSentProgress = p; if (room) room.broadcast({ t: 'PROG', player: room.me, fraction: Math.round(p * 1000) / 1000 }); };
    clearTimeout(progTimer);
    if (now - lastProgAt > 300 || p >= 1) send(); else progTimer = setTimeout(() => sendProgress(ctx.game), 300 - (now - lastProgAt));
  };

  const updatePlayers = () => {
    const r = room;
    if (ctx.mode !== 'mp') return;
    if (!r) { playersText.replaceChildren('Playing solo'); return; }
    if (mpMode === Mode.COOP) { // late joiners too
      board.ownerColors = Array.from({ length: SEATS }, (_, i) => colorOf(i));
      board.ownerStyles = Array.from({ length: SEATS }, (_, i) => styleOf(i));
    }
    const shown = shownPlayers(r);
    const many = shown.length > 4;
    playersText.replaceChildren(...shown.map(p => {
      const label = star(p) + nameOf(p).slice(0, many ? 8 : 12) + (r.away[p] ? ' (away)' : '');
      return dotLine(p, mpMode === Mode.VERSUS ? `${label} ${Math.floor((progress.get(p) || 0) * 100)}%` : label);
    }));
  };

  const mpSolved = (g, showMs = 1300) => {
    const r = room;
    if (mpMode === Mode.VERSUS) {
      if (r && r.me >= 0) {
        const d = r.finish(g.elapsedMs, g.hintsUsed);
        const prev = finished.get(r.me);
        finished.set(r.me, [g.elapsedMs, g.hintsUsed, d ? d.place : (prev ? prev[2] : 0)]);
        progress.set(r.me, 1);
      }
      updatePlayers();
      setTimeout(() => { if (ctx.disposed) return; if (!resultsD) showResults(); else fillResults(); }, showMs);
    } else {
      setTimeout(() => { if (!ctx.disposed) showResults(); }, showMs);
    }
  };

  const showResults = () => {
    if (ctx.disposed) return;
    if (resultsD) resultsD.close();
    resultsCol = el('div', { class: 'col' });
    resultsD = dialog(resultsCol, { cancelable: false });
    fillResults();
  };

  const fillResults = () => {
    const col = resultsCol, g = ctx.game;
    if (!col || !g) return;
    const r = room;
    const players = r ? r.players : [];
    const kids = [];
    if (mpMode === Mode.COOP) {
      kids.push(text('Solved together!', { size: 30, bold: true, color: 'accent', cls: 'center' }));
      const hints = g.hintsUsed === 0 ? 'no hints' : `${g.hintsUsed} hint${g.hintsUsed === 1 ? '' : 's'}`;
      kids.push(text(`Time ${formatTime(g.elapsedMs)} · ${hints}`, { size: 18, cls: 'center' }));
      kids.push(el('div', { class: 'plist center' }, ...players.map(p => {
        let n = 0; for (let e = 0; e < g.grid.edgeCount; e++) if (g.marks[e] === Edge.LINE && g.owner[e] === p) n++;
        return dotLine(p, `${nameOf(p)}: ${n} piece${n === 1 ? '' : 's'}`);
      })));
    } else {
      // The host numbers finishes as they arrive, so the first loop in real time wins (late joiners too).
      let winner = null;
      for (const [p, f] of finished) if (f[2] === 1) { winner = p; break; }
      const head = winner == null ? 'Race on!' : (r && winner === r.me) ? 'You win!' : `${nameOf(winner)} wins!`;
      const h = text(head, { size: 30, bold: true, cls: 'center' });
      h.style.color = winner != null ? colorOf(winner) : theme.accent;
      kids.push(h);
      const rank = p => { const f = finished.get(p); return f ? (f[2] > 0 ? f[2] : 99) : 100; };
      const order = players.slice().sort((a, b) => rank(a) - rank(b) || (progress.get(b) || 0) - (progress.get(a) || 0));
      kids.push(el('div', { class: 'plist' }, ...order.map(p => {
        const f = finished.get(p);
        const line = f ? `${nameOf(p)}: ${formatTime(f[0])} · ` + (f[1] === 0 ? 'no hints' : `${f[1]} hint${f[1] === 1 ? '' : 's'}`)
          : `${nameOf(p)}: still drawing (${Math.floor((progress.get(p) || 0) * 100)}%)`;
        return dotLine(p, line);
      })));
      if (!g.isSolved()) kids.push(button('Keep drawing', () => { if (resultsD) resultsD.close(); resultsD = null; resultsCol = null; }, { size: 17 }));
    }
    if (r && wantsRematch.size) {
      const asks = [...wantsRematch].filter(p => p !== r.me).map(nameOf);
      const t = wantsRematch.has(r.me) && !r.isHost ? 'Asked the host for another round…' : asks.length ? `${asks.join(', ')} ${asks.length === 1 ? 'wants' : 'want'} another round!` : '';
      if (t) kids.push(text(t, { size: 15, color: 'inkSoft', cls: 'center' }));
    }
    soonText = text(soonTimer ? `Next game in ${soonLeft + 1}…` : '', { size: 17, bold: true, color: 'accent', cls: 'center' });
    if (soonTimer) kids.push(soonText);
    if (r) {
      kids.push(button(mpMode === Mode.COOP ? 'Play again' : 'Rematch', () => {
        if (r.isHost) launchRound(); else { r.broadcast({ t: 'REMATCH', player: r.me }); wantsRematch.add(r.me); setNote('Asked the host for another round…'); fillResults(); }
      }, { size: 20, kind: 'primary' }));
      if (r.isHost) kids.push(button('Change board', () => { stopSoon(); nextBoardDialog(); }, { size: 16 }));
    }
    kids.push(button('Leave', () => leaveGame(), { size: 16 }));
    col.replaceChildren(...kids);
  };

  /** Host, after a round: pick the shape, size and difficulty of the next one, then start it. */
  const nextBoardDialog = () => {
    let d;
    let shape = mpShape, size = `${mpW}x${mpH}`, diff = mpDiff;
    const col = el('div', { class: 'col' });
    const fill = () => {
      const sizes = Boards.sizes(shape).concat(mpMode === Mode.COOP ? GROUP_SIZES[shape.name] || [] : []);
      if (!sizes.includes(size)) size = Boards.defaultSize ? Boards.defaultSize(shape) : sizes[1];
      const kids = [
        text('Next board', { size: 26, bold: true }),
        el('div', { class: 'row gap6' }, ...Shape.entries.map(sh => chip(sh.label, shape === sh, () => { shape = sh; fill(); }, { size: 13 }))),
        text(`${shape.label} board`, { size: 15, color: 'inkSoft' }),
      ];
      for (let i = 0; i < sizes.length; i += 4) {
        kids.push(el('div', { class: 'row gap6' }, ...sizes.slice(i, i + 4).map(s =>
          chip(s.replace('x', '×'), size === s, () => { size = s; fill(); }))));
      }
      kids.push(el('div', { class: 'row gap6' }, ...['EASY', 'MEDIUM', 'HARD'].map(dd => chip(cap(dd), diff === dd, () => { diff = dd; fill(); }))));
      kids.push(el('div', { class: 'row gap14' },
        button('Back', () => d.close(), { size: 17 }),
        button('Start', () => {
          d.close();
          const [w, h] = size.split('x').map(Number);
          const changed = shape !== mpShape || w !== mpW || h !== mpH || diff !== mpDiff;
          mpShape = shape; mpW = w; mpH = h; mpDiff = diff;
          if (changed) {
            if (room) room.setup = setupText();
            prepareNextPuzzle();
          }
          if (resultsD) { resultsD.close(); resultsD = null; resultsCol = null; }
          launchRound();
        }, { size: 18, kind: 'primary' })));
      col.replaceChildren(...kids);
    };
    fill();
    d = dialog(col);
  };

  /** Host: someone wants into the running game. */
  const askToJoin = (r, peer, name, returning) => {
    let d;
    d = dialog(el('div', { class: 'col' },
      text(returning ? `${name} is back!` : `${name} wants to join`, { size: 22, bold: true }),
      text(returning ? 'Let them back into their seat?' : 'Let them into this game?', { size: 16, color: 'inkSoft' }),
      el('div', { class: 'row gap14' },
        button('Not now', () => { d.close(); r.deny(peer); }, { size: 17 }),
        button('Let in', () => { d.close(); r.approve(peer); }, { size: 18, kind: 'primary' })),
    ), { cancelable: false });
  };

  /** Guest: the host's phone went away. */
  const lostDialog = () => {
    let d;
    d = dialog(el('div', { class: 'col' },
      text('Lost the connection', { size: 22, bold: true }),
      text('Rejoin to get your seat back, or keep drawing on your own.', { size: 16, color: 'inkSoft' }),
      el('div', { class: 'row gap14' },
        button('Keep drawing', () => { d.close(); setNote('Playing solo.'); updatePlayers(); }, { size: 16 }),
        button('Rejoin', () => { d.close(); rejoin(); }, { size: 18, kind: 'primary' })),
    ));
  };

  return {
    get room() { return room; },
    get coop() { return coop; },
    get mpMode() { return mpMode; },
    get countingDown() { return countingDown; },
    nearby, shared, colorOf, sendProgress, mpSolved, startMultiplayer,
    /** The game screen is closing. */
    dispose() {
      document.removeEventListener('visibilitychange', onWake);
      for (const t of leftTimers.values()) clearTimeout(t);
      clearTimeout(awayTimer);
      clearTimeout(syncTimer); clearTimeout(countTimer); clearTimeout(progTimer); clearTimeout(soonTimer);
      if (coop) coop.detach();
      if (link) link.close();
      link = null; room = null;
    },
  };
}
