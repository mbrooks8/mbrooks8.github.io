// The game screen: one puzzle (free play, daily, lessons, a shared code, or play together).
// Layout, timer, autosave, hints, the ⋯ menu, lessons and the win card. Play together is in play.js.
import { isApp } from './native.js';
import { Edge, Shape, Boards, dailySeed, PuzzleCode, Tutorial, Game } from './core.js';
import { store, formatTime } from './store.js';
import { el, onThemeChange, dialog, theme, text, button, sk, volumeSlider } from './ui.js';
import { icon } from './icons.js';
import { BoardView } from './board.js';
import { Mode } from './room.js';
import { play } from './sound.js';
import { PING_KINDS, pingGlyph } from './pings.js';
import { ownedPings } from './cosmetics.js';
import { isTodaysDaily, SHARE_BASE, shareText, diffLabel, JOIN_BASE, factory, isAndroid, keepAwake } from './common.js';
import { createPlay } from './play.js';
import { Recorder, Kind, keepTimelapse, newTimelapseId } from './timelapse.js';
import { timelapseRow } from './timelapse-row.js';
import { leaveGame, setScreen, showMenu } from './app.js';
import * as ads from './ads.js';
import { recordScores } from './leaderboards.js';
import { winPoints } from './points.js';
import { pencilFx, pencilAccent } from './sketch.js';

export function showGame(opts) {
  let mode = opts.mode, step = opts.step || 0;
  let game = null, resumedAt = 0, winShown = false, winCard = null, guide = [], guideAt = 0, disposed = false;
  // Every move, for the timelapse in Stats (timelapse.js). resumeTl: the saved one, when continuing.
  let rec = null, resumeTl = null;
  // Hints taken on this puzzle, and videos watched for more (ads.js: only the production app limits hints).
  let hintsTaken = 0, hintVideos = 0;
  const hintsOff = () => store.noHints && mode !== 'tutorial';

  // Layout.
  const back = el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Back' }, icon('back', 26));
  back.addEventListener('click', () => { save(); leaveGame(); });
  const title = el('div', { class: 'gtitle' });
  const timerText = el('div', { class: 'timer' });
  const menuBtn = el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Menu' }, icon('dots', 28));
  menuBtn.addEventListener('click', () => { menuDialog(); tourEvent('menu'); });
  // Just back, the timer and ⋯ (a small line above the timer only in lessons).
  const top = el('div', { class: 'topbar' }, back, el('div', { class: 'topmid' }, title, timerText), menuBtn);
  const appLink = el('div', { class: 'applink', hidden: true });
  const note = sk(el('div', { class: 'note', hidden: true }), { stroke: 'inkSoft', width: 1.6 });
  const noteText = el('span');
  note.append(noteText);
  note.addEventListener('click', () => { if (mode !== 'tutorial') setNote(''); });
  // Notes float over the top of the board so a ping or hint never pushes the board down (lessons keep theirs in the flow).
  const setNote = s => { noteText.textContent = s; note.classList.toggle('float', mode !== 'tutorial'); note.hidden = !s; };
  const canvas = el('canvas', { class: 'board', 'aria-label': 'Puzzle board' });
  const loading = el('div', { class: 'loading', text: 'sharpening pencils…' });
  const boardFrame = el('div', { class: 'boardframe' }, canvas, loading);
  // Bottom bar: Undo and Redo as ringed icons, the pen (with one word, so you know the mode), and co-op Ping.
  const tool = (name, word, aria, onClick, { kind = 'ring', cls = '' } = {}) => {
    const ring = el('span', { class: 'ring' }, icon(name, 28));
    const b = el('button', { type: 'button', class: 'tool ' + cls, 'aria-label': aria }, ring, el('span', { class: 'word', text: word }));
    sk(ring, kind === 'wash' ? { kind: 'wash', fill: 'accentTint', stroke: 'accent' } : { kind: 'ring', stroke: 'inkSoft', width: 1.6 });
    b.addEventListener('click', onClick);
    b._set = (n, w, a) => { ring.querySelector('svg').replaceWith(icon(n, 28)); b.querySelector('.word').textContent = w; b.setAttribute('aria-label', a); };
    return b;
  };
  // A finished puzzle stays finished: undo would un-solve a win that is already counted.
  const undoBtn = tool('undo', '', 'Undo', () => { if (!game || game.isSolved()) return; if (game.canUndo) play('flick'); track(); game.undo(); track(Kind.UNDO); board.clearHighlights(); refresh(); save(); tourEvent('undo'); });
  const redoBtn = tool('redo', '', 'Redo', () => { if (!game || game.isSolved()) return; if (game.canRedo) play('flick'); game.redo(); board.clearHighlights(); refresh(); save(); tourEvent('redo'); });
  // Pen: Fence -> X -> Draw (drag from dot to dot) -> Fence.
  const penBtn = tool('pen', 'Fence', 'Pen: Fence', () => {
    if (board.drawPen) { board.drawPen = false; board.crossPen = false; }
    else if (board.crossPen) { board.crossPen = false; board.drawPen = true; }
    else board.crossPen = true;
    refresh();
    tourEvent(board.drawPen ? 'pen-draw' : board.crossPen ? 'pen-x' : 'pen-fence');
  }, { kind: 'wash', cls: 'pen' });
  // Co-op: Ping, then tap anywhere on the board to point everyone at that spot.
  const pingBtn = tool('ping', 'Ping', 'Ping', () => { board.pingArmed = !board.pingArmed; refresh(); if (board.pingArmed) setNote('Tap anywhere to show everyone.'); });
  pingBtn.hidden = true;
  // Press and hold Ping: a small sticky note of feelings. The pick stays until changed; the button shows it.
  let pickerOpen = false, held = false, holdTimer = 0;
  const picker = el('div', { class: 'pingpicker', hidden: true });
  const setKind = key => {
    board.pingKind = key; store.pingKind = key;
    const g = pingGlyph(key), ring = pingBtn.querySelector('.ring');
    const old = ring.querySelector('svg, .glyph');
    old.replaceWith(g ? el('span', { class: 'glyph', text: g }) : icon('ping', 28));
    pingBtn.setAttribute('aria-label', g ? 'Ping ' + (PING_KINDS.find(k => k.key === key).word) : 'Ping');
  };
  const closePicker = () => { pickerOpen = false; picker.hidden = true; };
  if (store.pingKind) setKind(store.pingKind); // the feeling picked in the wardrobe (or last time)
  const pickBtn = (key, glyph, word) => el('button', {
    type: 'button', class: 'pick' + (board.pingKind === key ? ' sel' : ''), 'aria-label': word,
    onclick: () => { setKind(key); closePicker(); board.pingArmed = true; refresh(); setNote('Tap anywhere to show everyone.'); },
  }, glyph ? el('span', { class: 'glyph', text: glyph }) : icon('ping', 26));
  const openPicker = () => {
    picker.replaceChildren(pickBtn('', '', 'Plain ping'), ...ownedPings(store.owned).map(k => pickBtn(k.key, k.glyph, k.word)));
    picker.hidden = false; pickerOpen = true;
  };
  pingBtn.addEventListener('pointerdown', () => { held = false; clearTimeout(holdTimer); holdTimer = setTimeout(() => { held = true; openPicker(); }, 450); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) pingBtn.addEventListener(ev, () => clearTimeout(holdTimer));
  pingBtn.addEventListener('contextmenu', e => e.preventDefault());
  // A hold opens the note instead of arming the ping (capture: runs before the button's own click).
  pingBtn.addEventListener('click', e => { if (held) { held = false; e.stopImmediatePropagation(); } else if (pickerOpen) closePicker(); }, true);
  const bar = el('div', { class: 'bottombar tools' }, picker, undoBtn, redoBtn, pingBtn, penBtn);
  const playersText = el('div', { class: 'players', hidden: true });
  const root = el('div', { class: 'game' }, top, playersText, appLink, note, boardFrame, bar);

  const board = new BoardView(canvas);
  board.sounds = true;
  board.onPingDone = () => { refresh(); if (!board.pingLimited) setNote(''); board.pingLimited = false; };
  board.onPingLimited = () => { board.pingLimited = true; setNote('Easy on the pings, give it a moment.'); };
  if (window.__fenceline) window.__fenceline.board = board;
  board.onChanged = () => { if (mode !== 'tutorial' && !board.stroking) setNote(''); advanceGuide(); refresh(); save(); };
  board.onOffGuide = () => { const s = guide[guideAt]; if (s) setNote('Try the glowing gap. ' + s.text); };

  const applySettings = () => {
    board.palette = theme.pal;
    board.pencilColor = theme.accent;
    board.pencilFx = pencilFx(store.pencil); board.pencilAccent = pencilAccent(store.pencil); board.night = theme.night;
    board.showErrors = store.showErrors;
    board.haptics = store.haptics;
    board.plainNumbers = store.plainNumbers;
    if (game) game.autoCross = store.autoCross;
    timerText.hidden = !store.showTimer;
    keepAwake(store.keepAwake);
    board.invalidate();
  };

  // Timer and saving.
  const bankTime = () => {
    const now = performance.now();
    if (game && !game.isSolved() && resumedAt > 0 && !mp.countingDown && !ads.adPlaying() && document.visibilityState === 'visible') game.elapsedMs += Math.max(0, now - resumedAt);
    resumedAt = now;
  };
  const updateTimer = () => { if (!game) return; bankTime(); timerText.textContent = formatTime(game.elapsedMs); };
  const ticker = setInterval(updateTimer, 1000);
  /** Writes down what changed on the board since last time (time = playing time, like the timer). */
  const track = (kind = Kind.MOVE) => { if (rec && game) { bankTime(); rec.sample(game, game.elapsedMs, kind); } };
  const save = () => {
    if (!game) return;
    bankTime();
    game.elapsedMs = Math.round(game.elapsedMs);
    if (mode === 'mp') return;
    if (game.isSolved()) {
      const s = store.savedGame;
      if (s && s.startsWith(game.puzzle.encode(true))) { store.savedGame = null; store.savedTimelapse = null; }
      return;
    }
    store.savedGame = game.saveString();
    store.savedMode = mode;
    store.savedTimelapse = rec ? game.puzzle.encode(true) + '\n' + rec.encode() : null;
  };
  const onVis = () => {
    if (document.visibilityState === 'hidden') { save(); }
    else { resumedAt = performance.now(); keepAwake(store.keepAwake); }
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', save);
  const onTheme = () => { applySettings(); };
  onThemeChange.add(onTheme);

  const showTrouble = e => { loading.hidden = false; loading.textContent = `This game wouldn't open (${e && e.message ? e.message : e}). Go back and start a new one.`; };
  board.onError = showTrouble;

  const dailyLocked = p => isTodaysDaily(p) && store.dailyDoneToday;
  const dailyDoneNote = () => { loading.hidden = false; board.locked = true; loading.textContent = "You finished today's daily. A new one comes tomorrow!"; };
  const showLoading = () => { loading.hidden = false; board.locked = true; };

  const refresh = () => {
    if (!game) return;
    track();
    const over = game.isSolved();
    undoBtn.classList.toggle('dim', over || !game.canUndo);
    redoBtn.classList.toggle('dim', over || !game.canRedo);
    const pen = board.drawPen ? ['draw', 'Draw'] : board.crossPen ? ['x', 'X'] : ['pen', 'Fence'];
    if (penBtn._mode !== pen[1]) { penBtn._mode = pen[1]; penBtn._set(pen[0], pen[1], 'Pen: ' + pen[1]); }
    pingBtn.hidden = !board.onPing;
    pingBtn.classList.toggle('on', board.pingArmed);
    board.invalidate();
    if (mode === 'mp') mp.sendProgress(game);
    if (game.isSolved() && !winShown) onSolved(false);
  };

  const start = g => {
    if (disposed) return;
    loading.hidden = true;
    board.locked = false;
    winShown = false;
    game = g;
    hintsTaken = 0; hintVideos = 0;
    ads.banner(mode !== 'tutorial' && mode !== 'mp');
    rec = resumeTl && resumeTl.seen.length === g.grid.edgeCount ? resumeTl : new Recorder(g.grid.edgeCount);
    resumeTl = null;
    g.autoCross = store.autoCross;
    applySettings();
    board.setGame(g);
    // No headline (the board says what it is; the code lives in Share), except which lesson this is.
    const head = mode === 'tutorial' ? `Lesson ${step + 1} of ${Tutorial.steps.length}` : '';
    title.replaceChildren(head ? el('div', { class: 'head', text: head }) : '');
    setNote(mode === 'tutorial' ? Tutorial.steps[step].tip : '');
    startGuide(g);
    resumedAt = performance.now();
    updateTimer();
    refresh();
    save();
    if (g.isSolved()) onSolved(true);
  };

  let asked = 0; // newest puzzle asked for
  const newPuzzle = (w, h, d, seed, shape) => {
    mode = 'free';
    showLoading();
    loading.textContent = 'sharpening pencils…';
    setNote('');
    // Very big boards (from a code) can take a while to draw; say so rather than look stuck.
    const ask = ++asked;
    setTimeout(() => { if (!disposed && ask === asked && !loading.hidden) loading.textContent = 'Big board! This one takes a little while to draw…'; }, 3000);
    factory.request(w, h, d, seed, shape).then(p => start(new Game(p)), err => {
      loading.textContent = "Oops, that puzzle wouldn't draw. Go back and try again.";
      console.error(err);
    });
  };

  const startTutorial = (i, goal = true) => {
    mode = 'tutorial'; step = i;
    store.tutorialStep = i;
    const p = Tutorial.puzzle(i);
    const g = new Game(p);
    for (const e of Tutorial.prepared(i, p)) g.setMark(e, Edge.LINE);
    g.undoStack.length = 0; // the lesson's own fences are part of the puzzle, not something to undo
    start(g);
    if (i === 0 && goal) showGoal();
  };

  // Guided lessons.
  const startGuide = g => {
    guide = mode === 'tutorial' ? Tutorial.guide(step, g.puzzle) : [];
    guideAt = 0;
    advanceGuide();
  };
  const advanceGuide = () => {
    const g = game;
    if (!g) return;
    while (guideAt < guide.length && (guide[guideAt].wait ? guide[guideAt].waitDone : guide[guideAt].edges.every(e => g.marks[e] === guide[guideAt].value))) guideAt++;
    if (guideAt >= guide.length) {
      guide = [];
      board.setGuide([], false);
      glowTool('');
      return;
    }
    const s = guide[guideAt];
    board.setGuide(s.edges.filter(e => g.marks[e] !== s.value), true);
    glowTool(s.wait || '');
    setNote(s.text);
  };
  /** The controls tour (lesson 3): a step that waits for a button moves on when it is used. */
  const tourEvent = name => {
    const s = guide[guideAt];
    if (mode === 'tutorial' && s && s.wait === name) { s.waitDone = true; advanceGuide(); }
  };
  /** Pulse the button the tour is asking for (undo, redo, pen, menu). */
  const glowTool = name => {
    const target = { undo: undoBtn, redo: redoBtn, 'pen-x': penBtn, 'pen-draw': penBtn, 'pen-fence': penBtn, menu: menuBtn }[name];
    for (const b of [undoBtn, redoBtn, penBtn, menuBtn]) b.classList.toggle('tourglow', b === target);
  };

  /** Before the first lesson: what you're aiming for, and a finished puzzle to look at. */
  const showGoal = () => {
    let d;
    const done = new Game(Tutorial.goalPuzzle());
    for (let e = 0; e < done.grid.edgeCount; e++) if (done.puzzle.solution[e]) done.setMark(e, Edge.LINE);
    const mini = el('canvas', { class: 'mini' });
    const col = el('div', { class: 'col' },
      text('The goal', { size: 26, bold: true }),
      text('Join the dots into one closed fence. Each number tells how many of its 4 sides are fence.', { size: 16 }),
      mini,
      text('Once a fence goes all the way around and every number is satisfied, a puzzle is finished.', { size: 15, color: 'inkSoft' }),
      text('Tap the gap between two dots to draw a fence. Press and hold a gap to mark it X.', { size: 16, cls: 'gap10' }),
      el('div', { class: 'gap14' }, button('Show me how', () => d.close(), { size: 18, accent: 'accent' })),
    );
    let mb = null;
    d = dialog(col, { onClose: () => mb && mb.destroy() });
    mb = new BoardView(mini);
    mb.locked = true; mb.showErrors = false; mb.palette = theme.pal; mb.pencilColor = theme.accent;
    mb.setGame(done);
    setTimeout(() => mb.playSolved({ celebrate: false }), 250);
  };

  // Tools.
  /** Co-op: every phone counts the hinted pieces on the shared board plus each Clear mistakes anyone used (same number for all). */
  const sharedHints = () => {
    if (!mp.shared() || !game) return;
    let n = game.clearsUsed; for (const h of game.hinted) if (h) n++;
    game.hintsUsed = n;
  };
  /** Production app only: after the free hints, a short video for each extra one (never blocks if none loads). */
  const mayHint = async () => {
    if (mode === 'tutorial' || ads.hintFree(hintsTaken, hintVideos)) return true;
    const r = await ads.offerHintVideo();
    if (r === 'earned') hintVideos++;
    return r !== 'no' && !disposed;
  };
  const hint = async (voted = false) => {
    if (!game || game.isSolved()) return;
    let h = game.findHint();
    if (!h) return;
    if (h.isFix) { // wrong marks first: circle them (free). Clear mistakes in the ⋯ menu erases them, and that counts as a hint.
      board.flashMistakes(h.wrong);
      play('oops');
      setNote(h.reason + ' Clear mistakes in the ⋯ menu erases them.');
      return;
    }
    // Co-op: Hint is a vote. If it passes, the asker's phone takes it (and pays any free-hint / video) and everyone sees it.
    if (!voted && mp.shared()) { mp.ask('hint', () => hint(true)); return; }
    if (!await mayHint()) return;
    const g = game;
    if (!g || g.isSolved()) return;
    h = g.findHint();
    if (!h || h.isFix) return;
    hintsTaken++;
    g.applyHint(h);
    play('hint');
    board.showHint(h.edge, h.focusCell, h.focusVertex);
    setNote(h.reason);
    refresh(); save();
    tourEvent('hint');
  };

  /** Erases every wrong mark. It counts as a hint: in stats, the win card, the free-hint limit (a video after that) and co-op for everyone. */
  const clearMistakes = async (voted = false) => {
    const g = game;
    if (!g || g.isSolved()) return;
    if (!g.mistakes().length) { setNote('No mistakes!'); return; }
    if (!voted && mp.shared()) { mp.ask('clear', () => clearMistakes(true)); return; }
    if (!await mayHint()) return;
    if (game !== g || g.isSolved()) return;
    track();
    const n = g.clearMistakes();
    if (!n) { setNote('No mistakes!'); return; }
    hintsTaken++;
    if (mp.shared() && mp.coop) mp.coop.clearedMistakes();
    sharedHints();
    track(Kind.HINT); // the replay shows it as a hint, with who took it
    play('erase');
    board.clearHighlights();
    setNote(`Erased ${n} mark${n === 1 ? '' : 's'}.`);
    refresh(); save();
    tourEvent('clear');
  };

  const check = () => {
    const g = game;
    if (!g) return;
    const wrong = g.mistakes();
    if (!wrong.length) setNote('All good so far!');
    else {
      board.flashMistakes(wrong);
      setNote(`${wrong.length} wrong mark${wrong.length === 1 ? '' : 's'}, circled in red.`);
    }
  };

  const shareMsg = timeMs => {
    const p = game && game.puzzle;
    const code = p && PuzzleCode.of(p);
    if (!code) return null;
    const what = mode === 'daily' ? "today's daily" : `this ${Boards.label(p.shape, p.width, p.height)} ${diffLabel(p.difficulty)}`;
    const brag = timeMs != null ? ` I did it in ${formatTime(timeMs)}.` : '';
    return `Try ${what} Fenceline puzzle!${brag}\n${SHARE_BASE}${code}\nCode: ${code}`;
  };
  const sharePuzzle = timeMs => { const t = shareMsg(timeMs); if (t) shareText(t, setNote); };

  /** The ⋯ menu: a sticky note under the button. */
  const menuDialog = () => {
    let d;
    const col = el('div', { class: 'col', style: 'gap:0' });
    const item = (ic, label, action, color, sub) => {
      const b = el('button', { type: 'button', class: 'noteitem' }, icon(ic, 24, color), el('span', {}, label, sub && mode === 'tutorial' ? el('span', { class: 'sub', 'aria-hidden': 'true', text: sub }) : ''));
      b.addEventListener('click', () => { d.close(); action(); });
      col.append(b);
    };
    const multi = mode === 'mp';
    // Hint circles any wrong marks, else draws the next piece. Clear mistakes erases them and counts as a hint.
    // With "No hints" on it is Check, which only looks for mistakes.
    item(hintsOff() ? 'check' : 'bulb', hintsOff() ? 'Check' : 'Hint', () => hintsOff() ? check() : hint(), 'var(--hint)', 'shows the next move');
    item('eraser', 'Clear mistakes', () => clearMistakes(), undefined, 'erases marks that are wrong');
    // A finished daily stays finished: no starting it over for another go.
    if (!multi && !(game && dailyLocked(game.puzzle))) item('restart', 'Start over', confirmReset, undefined, 'wipes the board');
    col.append(el('hr', { class: 'divider', style: 'margin:6px 0' }));
    if (multi && mp.room && !mp.nearby && mp.room.roomId) item('invite', 'Invite', () => {
      const c = mp.room.roomId.toUpperCase();
      shareText(`Join my Fenceline game!\n${JOIN_BASE}${c}\nRoom code: ${c}`, setNote);
    });
    if (mode !== 'tutorial' && game && PuzzleCode.of(game.puzzle)) item('share', 'Share', () => sharePuzzle(null));
    if (mode === 'free') item('newp', 'New puzzle', () => {
      const p = game && game.puzzle;
      if (p) newPuzzle(p.width, p.height, p.difficulty || 'EASY', null, p.shape);
    });
    if (multi) item('leave', 'Leave game', () => leaveGame());
    // Volume, shared with Settings (hidden while Sound is off).
    if (store.sound) col.append(el('hr', { class: 'divider', style: 'margin:6px 0' }), volumeSlider('Effects', 'sfxVolume', 'fence'), volumeSlider('Music', 'musicVolume'));
    d = dialog(col, { place: 'note' });
  };

  const confirmReset = () => {
    let d;
    d = dialog(el('div', { class: 'col' },
      text('Start over?', { size: 24, bold: true }),
      text(mp.shared() ? "This clears everyone's lines on the shared board." : 'This clears all your marks. The timer keeps going.', { size: 16, color: 'inkSoft' }),
      el('div', { class: 'row gap14' },
        button('Cancel', () => d.close(), { size: 17 }),
        button('Start over', () => {
          d.close();
          if (mode === 'tutorial') { // start the lesson over, with its own fences back in place
            const ms = game ? game.elapsedMs : 0;
            board.clearHighlights();
            startTutorial(step, false);
            if (game) game.elapsedMs = ms;
            return;
          }
          if (game) game.reset();
          winShown = false; board.clearCelebration();
          if (winCard) { winCard.close(); winCard = null; } // the win card goes with the win, and finishing again plays the show again
          board.clearHighlights();
          if (mp.shared() && mp.coop) mp.coop.syncAll(); // host also sends the whole board, so everyone lands on the same blank board
          setNote('');
          refresh(); save();
        }, { size: 17, kind: 'primary' })),
    ), { closeX: false });
  };

  /** Points for a finished Play together game. Co-op: nothing for someone who drew no piece of the loop. */
  const mpPoints = g => {
    const r = mp.room;
    if (mp.mpMode === Mode.COOP && r && r.me >= 0) {
      let mine = 0;
      for (let e = 0; e < g.grid.edgeCount; e++) if (g.marks[e] === Edge.LINE && g.owner[e] === r.me) mine++;
      if (!mine) return 0;
    }
    const p = g.puzzle;
    return winPoints({ cells: p.width * p.height, difficulty: p.difficulty || 'EASY', hints: g.hintsUsed, daily: false });
  };

  const onSolved = alreadyDone => {
    const g = game;
    if (!g) return;
    winShown = true;
    bankTime();
    g.elapsedMs = Math.round(g.elapsedMs);
    // The win show (loop glow, shading, confetti, tune); the card waits for it.
    // Co-op confetti comes in everyone's pencil colours.
    board.confettiColors = mode === 'mp' && mp.mpMode === Mode.COOP && mp.room ? mp.room.players.map(mp.colorOf) : null;
    const showMs = alreadyDone ? 0 : Math.max(1300, Math.min(5000, board.playSolved()));
    const code = PuzzleCode.of(g.puzzle);
    const daily = mode === 'daily' && isTodaysDaily(g.puzzle); // a daily finished after midnight is just a puzzle
    const kind = daily ? 'daily' : mode !== 'mp' ? '' : mp.mpMode === Mode.COOP ? 'coop' : 'versus';
    const tl = !alreadyDone && mode !== 'tutorial' && code ? keepRecording(g) : '';
    if (!alreadyDone && mode !== 'tutorial' && code) store.addHistory(code.toString(), g.elapsedMs, g.hintsUsed, kind, tl);
    const tlEntry = tl ? { code: code.toString(), tl, ms: g.elapsedMs } : null;
    if (mode === 'mp') { // Play together: versus gives every finisher the puzzle's points; co-op, everyone who drew part of the loop
      let got = 0;
      const repeat = !alreadyDone && store.isPaid(code); // same board paid for before: nothing again
      if (!alreadyDone) { board.buzz(40); got = repeat ? 0 : mpPoints(g); store.addPoints(got); if (got > 0) store.markPaid(code); }
      mp.mpSolved(g, showMs, got, tlEntry, repeat);
      return;
    }
    if (!alreadyDone && mode !== 'tutorial') ads.noteWin();
    const p = g.puzzle;
    const size = Boards.key(p.shape, p.width, p.height);
    const repeat = !alreadyDone && mode !== 'tutorial' && store.isPaid(code); // solved on this device before: no points, no count
    const best = !alreadyDone && mode !== 'tutorial' ? store.recordWin(size, p.difficulty || 'EASY', g.elapsedMs, g.hintsUsed, daily, repeat) : false;
    const earned = !alreadyDone && mode !== 'tutorial' ? recordScores(p, g.elapsedMs, g.hintsUsed, daily, repeat) : 0;
    if (!alreadyDone && mode !== 'tutorial') store.markPaid(code);
    store.savedGame = null;
    if (!alreadyDone) board.buzz(40);
    setTimeout(() => { if (!disposed) showWin(g, best, earned, tlEntry, repeat); }, showMs);
  };

  /** Keeps this game's timelapse (co-op: with everyone's pencil and name); returns its id for the history. */
  const keepRecording = g => {
    if (!rec || !rec.moves.length) return '';
    rec.sample(g, g.elapsedMs);
    const r = mp.room;
    if (mode === 'mp' && mp.shared() && r) {
      for (const p of new Set(rec.moves.map(m => m.player))) rec.setPlayer(p, r.pencils[p] || 0, p === r.me ? (store.playerName || r.names[p]) : r.names[p]);
    }
    const id = newTimelapseId();
    try { keepTimelapse(id, rec.encode()); } catch (e) { return ''; }
    return id;
  };

  /** The win card: a taped card at the bottom, so the shaded loop stays in view above it. */
  const showWin = (g, newBest, earned = 0, tlEntry = null, repeat = false) => {
    let d;
    const cheers = ['Lovely loop!', 'Neatly fenced!', 'All closed up!', 'Beautifully done!', "That's the one!"];
    const seed = g.puzzle.seed == null ? 0n : BigInt(g.puzzle.seed);
    const idx = Number(((seed % 5n) + 5n) % 5n);
    const kids = [el('div', { class: 'cheer' }, icon('sprig', 28, 'var(--done)', 1.5), el('span', { text: cheers[idx] }))];
    const line = el('div', { class: 'line' }, `${formatTime(g.elapsedMs)} · ${g.hintsUsed === 0 ? 'no hints' : `${g.hintsUsed} hint${g.hintsUsed === 1 ? '' : 's'}`}`);
    if (mode === 'daily' && isTodaysDaily(g.puzzle)) line.append(' · ', icon('candle', 16, 'var(--hint)'), String(store.dailyStreak));
    kids.push(line);
    if (earned > 0) kids.push(text(`+${earned.toLocaleString('en-US')} points`, { size: 16, color: 'inkSoft', cls: 'center' }));
    else if (repeat) kids.push(text('Already solved, so no points', { size: 15, color: 'inkSoft', cls: 'center' }));
    if (newBest) kids.push(text('★ New best! ★', { size: 17, bold: true, color: 'hint', cls: 'center' }));
    const links = [];
    if (mode === 'tutorial') {
      store.markLessonDone(step);
      if (step + 1 < Tutorial.steps.length) {
        kids.push(el('div', { class: 'gap12' }, button('Next lesson', () => { d.close(); startTutorial(step + 1); }, { size: 21, kind: 'primary' })));
      } else {
        store.tutorialStep = 0;
        kids.push(text("You've got the basics!", { size: 16, cls: 'center' }));
        kids.push(el('div', { class: 'gap8' }, button('Play a 3×3', () => { d.close(); newPuzzle(3, 3, 'EASY', null, Shape.SQUARE); }, { size: 21, kind: 'primary' })));
      }
    } else if (mode === 'free') {
      kids.push(el('div', { class: 'gap12' }, button('Next puzzle', async () => {
        d.close();
        await ads.betweenPuzzles(); // now and then a short video (production app only)
        if (disposed) return;
        const p = g.puzzle;
        newPuzzle(p.width, p.height, p.difficulty || 'EASY', null, p.shape);
      }, { size: 21, kind: 'primary' })));
    }
    if (mode !== 'tutorial' && PuzzleCode.of(g.puzzle)) links.push(button('Challenge a friend', () => sharePuzzle(g.elapsedMs), { size: 17, kind: 'link' }));
    links.push(button('Menu', () => { d.close(); leaveGame(); }, { size: 17, kind: 'link' }));
    const tlr = timelapseRow(tlEntry);
    if (tlr) kids.push(tlr);
    kids.push(el('div', { class: 'links' }, ...links));
    const unshrink = () => { root.classList.remove('won'); root.style.removeProperty('--wonPad'); };
    d = dialog(el('div', { class: 'col wincard', style: 'gap:6px' }, ...kids), { place: 'bottom', closeX: false, onClose: unshrink });
    winCard = d;
    // Make room: the board shrinks to sit above the card.
    requestAnimationFrame(() => {
      const card = document.querySelector('.overlay.place-bottom .card');
      if (!card || disposed) return;
      root.style.setProperty('--wonPad', Math.round(card.getBoundingClientRect().height) - bar.getBoundingClientRect().height + 8 + 'px');
      root.classList.add('won');
    });
  };

  // Play together (lobby, rounds, co-op sync, joining, host moves) lives in play.js.
  const ctx = {
    opts, root, board, title, loading, noteText, playersText, setNote, showLoading, refresh, start,
    get mode() { return mode; }, set mode(v) { mode = v; },
    get step() { return step; }, set step(v) { step = v; },
    get game() { return game; }, set game(v) { game = v; },
    get resumedAt() { return resumedAt; }, set resumedAt(v) { resumedAt = v; },
    get disposed() { return disposed; },
  };
  const mp = createPlay(ctx);

  setScreen('game', root, () => {
    disposed = true;
    ads.banner(false);
    save();
    clearInterval(ticker);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', save);
    onThemeChange.delete(onTheme);
    mp.dispose();
    board.destroy();
    keepAwake(false);
  });
  applySettings();
  showLoading();

  // What to play.
  if (mode === 'continue') {
    let g = null;
    try { g = store.savedGame ? Game.load(store.savedGame) : null; } catch (e) { g = null; }
    const tl = store.savedTimelapse, key = g ? g.puzzle.encode(true) + '\n' : null;
    if (g && tl && tl.startsWith(key)) { try { resumeTl = Recorder.decode(tl.slice(key.length), g.grid.edgeCount); } catch (e) { resumeTl = null; } }
    mode = store.savedMode;
    if (mode === 'daily' && g && !isTodaysDaily(g.puzzle)) mode = 'free'; // yesterday's daily doesn't count for today
    step = store.tutorialStep;
    const oldLesson = mode === 'tutorial' && (step < 0 || step >= Tutorial.steps.length || !g || g.puzzle.encode(false) !== Tutorial.puzzle(step).encode(false));
    if (oldLesson) startTutorial(Math.max(0, Math.min(Tutorial.steps.length - 1, step)));
    else if (g) {
      // Wait for the screen to be laid out first (a new puzzle always does, while it is being drawn),
      // and say what went wrong instead of leaving a blank board.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (disposed) return;
        try { start(g); } catch (e) { console.error(e); showTrouble(e); }
      }));
    } else { mode = 'free'; showMenu(); }
  } else if (mode === 'daily') {
    if (store.dailyDoneToday) { dailyDoneNote(); return; }
    factory.request(10, 10, 'MEDIUM', dailySeed(new Date()), Shape.SQUARE).then(p => start(new Game(p)), err => { loading.textContent = "Oops, today's puzzle wouldn't draw."; console.error(err); });
  } else if (mode === 'tutorial') {
    startTutorial(step, !opts.noGoal);
  } else if (mode === 'mp') {
    mp.startMultiplayer();
  } else if (mode === 'code') {
    const code = PuzzleCode.find(opts.code || '');
    if (!code) { showMenu(); return; }
    if (dailyLocked(code)) { dailyDoneNote(); return; } // the daily's own code can't be used to play it again
    if (isAndroid && !isApp) {
      const href = `intent://p/${encodeURIComponent(code)}#Intent;scheme=fenceline;package=com.fenceline.app;end`;
      appLink.replaceChildren('Got the Android app? ', el('a', { href }, 'Open it there'));
      appLink.hidden = false;
    }
    newPuzzle(code.width, code.height, code.difficulty, code.seed, code.shape);
  } else {
    newPuzzle(opts.w, opts.h, opts.d, null, opts.shape);
  }
}
