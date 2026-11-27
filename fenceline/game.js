// The game screen: one puzzle (free play, daily, lessons, a shared code, or play together).
// Layout, timer, autosave, hints, the ⋯ menu, lessons and the win card. Play together is in play.js.
import { isApp } from './native.js';
import { Edge, Shape, Boards, dailySeed, PuzzleCode, Tutorial, Game } from './core.js';
import { store, formatTime } from './store.js';
import { el, onThemeChange, dialog, theme, text, button, sk } from './ui.js';
import { icon } from './icons.js';
import { BoardView } from './board.js';
import { Mode } from './room.js';
import { play } from './sound.js';
import { isTodaysDaily, SHARE_BASE, shareText, diffLabel, JOIN_BASE, factory, isAndroid, keepAwake } from './common.js';
import { createPlay } from './play.js';
import { Recorder, Kind, keepTimelapse, newTimelapseId } from './timelapse.js';
import { leaveGame, setScreen, showMenu } from './app.js';

export function showGame(opts) {
  let mode = opts.mode, step = opts.step || 0;
  let game = null, resumedAt = 0, winShown = false, pendingFix = null, guide = [], guideAt = 0, disposed = false;
  // Every move, for the timelapse in Stats (timelapse.js). resumeTl: the saved one, when continuing.
  let rec = null, resumeTl = null;
  const hintsOff = () => store.noHints && mode !== 'tutorial';

  // Layout.
  const back = el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Back' }, icon('back', 26));
  back.addEventListener('click', () => { save(); leaveGame(); });
  const title = el('div', { class: 'gtitle' });
  const timerText = el('div', { class: 'timer' });
  const menuBtn = el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Menu' }, icon('dots', 28));
  menuBtn.addEventListener('click', () => menuDialog());
  // Just back, the timer and ⋯ (a small line above the timer only in lessons).
  const top = el('div', { class: 'topbar' }, back, el('div', { class: 'topmid' }, title, timerText), menuBtn);
  const appLink = el('div', { class: 'applink', hidden: true });
  const note = sk(el('div', { class: 'note', hidden: true }), { stroke: 'inkSoft', width: 1.6 });
  const noteText = el('span');
  note.append(noteText);
  note.addEventListener('click', () => { if (mode !== 'tutorial') setNote(''); });
  const setNote = s => { noteText.textContent = s; note.hidden = !s; };
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
  const undoBtn = tool('undo', '', 'Undo', () => { if (!game || game.isSolved()) return; if (game.canUndo) play('flick'); track(); game.undo(); track(Kind.UNDO); board.clearHighlights(); pendingFix = null; refresh(); save(); });
  const redoBtn = tool('redo', '', 'Redo', () => { if (!game || game.isSolved()) return; if (game.canRedo) play('flick'); game.redo(); board.clearHighlights(); pendingFix = null; refresh(); save(); });
  // Pen: Fence -> X -> Draw (drag from dot to dot) -> Fence.
  const penBtn = tool('pen', 'Fence', 'Pen: Fence', () => {
    if (board.drawPen) { board.drawPen = false; board.crossPen = false; }
    else if (board.crossPen) { board.crossPen = false; board.drawPen = true; }
    else board.crossPen = true;
    refresh();
  }, { kind: 'wash', cls: 'pen' });
  // Co-op: Ping, then tap anywhere on the board to point everyone at that spot.
  const pingBtn = tool('ping', 'Ping', 'Ping', () => { board.pingArmed = !board.pingArmed; refresh(); if (board.pingArmed) setNote('Tap anywhere to show everyone.'); });
  pingBtn.hidden = true;
  const bar = el('div', { class: 'bottombar tools' }, undoBtn, redoBtn, pingBtn, penBtn);
  const playersText = el('div', { class: 'players', hidden: true });
  const root = el('div', { class: 'game' }, top, playersText, appLink, note, boardFrame, bar);

  const board = new BoardView(canvas);
  board.sounds = true;
  board.onPingDone = () => { refresh(); setNote(''); };
  if (window.__fenceline) window.__fenceline.board = board;
  board.onChanged = () => { pendingFix = null; if (mode !== 'tutorial' && !board.stroking) setNote(''); advanceGuide(); refresh(); save(); };
  board.onOffGuide = () => { const s = guide[guideAt]; if (s) setNote('Try the glowing gap. ' + s.text); };

  const applySettings = () => {
    board.palette = theme.pal;
    board.pencilColor = theme.accent;
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
    if (game && !game.isSolved() && resumedAt > 0 && !mp.countingDown && document.visibilityState === 'visible') game.elapsedMs += Math.max(0, now - resumedAt);
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
    while (guideAt < guide.length && guide[guideAt].edges.every(e => g.marks[e] === guide[guideAt].value)) guideAt++;
    if (guideAt >= guide.length) {
      guide = [];
      board.setGuide([], false);
      return;
    }
    const s = guide[guideAt];
    board.setGuide(s.edges.filter(e => g.marks[e] !== s.value), true);
    setNote(s.text);
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
      text('A finished puzzle: one fence that goes all the way around, and every number matches. Each dot has two fence pieces, or none.', { size: 15, color: 'inkSoft' }),
      text('Tap the gap between two dots to draw a fence. Press and hold a gap to mark it X, a gap you know stays empty.', { size: 16, cls: 'gap10' }),
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
  /** Co-op: the shared board can only carry hinted pieces, so every phone counts just those (same number for all). */
  const sharedHints = () => {
    if (!mp.shared() || !game) return;
    let n = 0; for (const h of game.hinted) if (h) n++;
    game.hintsUsed = n;
  };
  const hint = () => {
    const g = game;
    if (!g || g.isSolved()) return;
    const h = g.findHint();
    if (!h) return;
    if (h.isFix) {
      const same = pendingFix && pendingFix.length === h.wrong.length && h.wrong.every(e => pendingFix.includes(e));
      if (same) {
        const n = g.clearMistakes();
        sharedHints();
        play('erase');
        board.clearHighlights();
        setNote(`Erased ${n} wrong mark${n === 1 ? '' : 's'}.`);
        pendingFix = null;
        refresh(); save();
      } else {
        board.flashMistakes(h.wrong);
        play('oops');
        setNote(h.reason + ' Hint again to erase.');
        pendingFix = h.wrong;
      }
      return;
    }
    pendingFix = null;
    g.applyHint(h);
    play('hint');
    board.showHint(h.edge, h.focusCell, h.focusVertex);
    setNote(h.reason);
    refresh(); save();
  };

  const check = () => {
    const g = game;
    if (!g) return;
    const wrong = g.mistakes();
    if (!wrong.length) setNote('All good so far!');
    else {
      board.flashMistakes(wrong);
      setNote(`${wrong.length} wrong mark${wrong.length === 1 ? '' : 's'}, circled in red.`);
      pendingFix = wrong;
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
    const item = (ic, label, action, color) => {
      const b = el('button', { type: 'button', class: 'noteitem' }, icon(ic, 24, color), el('span', { text: label }));
      b.addEventListener('click', () => { d.close(); action(); });
      col.append(b);
    };
    const multi = mode === 'mp';
    // Hint first circles any wrong marks (Hint again erases them), else draws the next piece.
    // With "No hints" on it is Check, which only looks for mistakes.
    item(hintsOff() ? 'check' : 'bulb', hintsOff() ? 'Check' : 'Hint', () => hintsOff() ? check() : hint(), 'var(--hint)');
    item('eraser', 'Clear mistakes', () => {
      const n = game ? game.clearMistakes() : 0;
      sharedHints();
      if (n) play('erase');
      setNote(n === 0 ? 'No mistakes!' : `Erased ${n} mark${n === 1 ? '' : 's'}.`);
      refresh(); save();
    });
    if (!multi) item('restart', 'Start over', confirmReset);
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
            board.clearHighlights(); pendingFix = null;
            startTutorial(step, false);
            if (game) game.elapsedMs = ms;
            return;
          }
          if (game) game.reset();
          board.clearHighlights(); pendingFix = null;
          if (mp.shared() && mp.coop) mp.coop.syncAll(); // host also sends the whole board, so everyone lands on the same blank board
          setNote('');
          refresh(); save();
        }, { size: 17, kind: 'primary' })),
    ), { closeX: false });
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
    if (!alreadyDone && mode !== 'tutorial' && code) store.addHistory(code.toString(), g.elapsedMs, g.hintsUsed, kind, keepRecording(g));
    if (mode === 'mp') { if (!alreadyDone) board.buzz(40); mp.mpSolved(g, showMs); return; }
    const p = g.puzzle;
    const size = Boards.key(p.shape, p.width, p.height);
    const best = !alreadyDone && mode !== 'tutorial' ? store.recordWin(size, p.difficulty || 'EASY', g.elapsedMs, g.hintsUsed, daily) : false;
    store.savedGame = null;
    if (!alreadyDone) board.buzz(40);
    setTimeout(() => { if (!disposed) showWin(g, best); }, showMs);
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
  const showWin = (g, newBest) => {
    let d;
    const cheers = ['Lovely loop!', 'Neatly fenced!', 'All closed up!', 'Beautifully done!', "That's the one!"];
    const seed = g.puzzle.seed == null ? 0n : BigInt(g.puzzle.seed);
    const idx = Number(((seed % 5n) + 5n) % 5n);
    const kids = [el('div', { class: 'cheer' }, icon('sprig', 28, 'var(--done)', 1.5), el('span', { text: cheers[idx] }))];
    const line = el('div', { class: 'line' }, `${formatTime(g.elapsedMs)} · ${g.hintsUsed === 0 ? 'no hints' : `${g.hintsUsed} hint${g.hintsUsed === 1 ? '' : 's'}`}`);
    if (mode === 'daily' && isTodaysDaily(g.puzzle)) line.append(' · ', icon('candle', 16, 'var(--hint)'), String(store.dailyStreak));
    kids.push(line);
    if (newBest) kids.push(text('★ New best! ★', { size: 17, bold: true, color: 'hint', cls: 'center' }));
    const links = [];
    if (mode === 'tutorial') {
      store.markLessonDone(step);
      if (step + 1 < Tutorial.steps.length) {
        kids.push(el('div', { class: 'gap12' }, button('Next lesson', () => { d.close(); startTutorial(step + 1); }, { size: 21, kind: 'primary' })));
      } else {
        store.tutorialStep = 0;
        kids.push(text("You've got the basics!", { size: 16, cls: 'center' }));
        kids.push(el('div', { class: 'gap8' }, button('Play a 5×5', () => { d.close(); newPuzzle(5, 5, 'EASY', null, Shape.SQUARE); }, { size: 21, kind: 'primary' })));
      }
    } else if (mode === 'free') {
      kids.push(el('div', { class: 'gap12' }, button('Next puzzle', () => {
        d.close();
        const p = g.puzzle;
        newPuzzle(p.width, p.height, p.difficulty || 'EASY', null, p.shape);
      }, { size: 21, kind: 'primary' })));
    }
    if (mode !== 'tutorial' && PuzzleCode.of(g.puzzle)) links.push(button('Challenge a friend', () => sharePuzzle(g.elapsedMs), { size: 17, kind: 'link' }));
    links.push(button('Menu', () => { d.close(); leaveGame(); }, { size: 17, kind: 'link' }));
    kids.push(el('div', { class: 'links' }, ...links));
    const unshrink = () => { root.classList.remove('won'); root.style.removeProperty('--wonPad'); };
    d = dialog(el('div', { class: 'col wincard', style: 'gap:6px' }, ...kids), { place: 'bottom', closeX: false, onClose: unshrink });
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
    opts, board, title, loading, noteText, playersText, setNote, showLoading, refresh, start,
    get mode() { return mode; }, set mode(v) { mode = v; },
    get step() { return step; }, set step(v) { step = v; },
    get game() { return game; }, set game(v) { game = v; },
    get resumedAt() { return resumedAt; }, set resumedAt(v) { resumedAt = v; },
    get disposed() { return disposed; },
  };
  const mp = createPlay(ctx);

  setScreen('game', root, () => {
    disposed = true;
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
    else if (g) start(g);
    else { mode = 'free'; showMenu(); }
  } else if (mode === 'daily') {
    factory.request(10, 10, 'MEDIUM', dailySeed(new Date()), Shape.SQUARE).then(p => start(new Game(p)), err => { loading.textContent = "Oops, today's puzzle wouldn't draw."; console.error(err); });
  } else if (mode === 'tutorial') {
    startTutorial(step, !opts.noGoal);
  } else if (mode === 'mp') {
    mp.startMultiplayer();
  } else if (mode === 'code') {
    const code = PuzzleCode.find(opts.code || '');
    if (!code) { showMenu(); return; }
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
