// Watch a finished game again: its timelapse (timelapse.js) played on a small board in a taped card.
// Play / pause, a pencil line to scrub along, and the game clock. Co-op games show everyone's pencils.
import { Game, PuzzleCode, Boards } from './core.js';
import { formatTime } from './store.js';
import { el, dialog, theme, sk } from './ui.js';
import { icon } from './icons.js';
import { BoardView } from './board.js';
import { pencilColor, pencilStyle, pencilSwatch, pencilLine, pencilCircle, pencilFx, pencilAccent } from './sketch.js';
import { factory, diffLabel } from './common.js';
import { Recorder, Kind, findTimelapse, playbackTimes, hintEvents } from './timelapse.js';
import { canMakeVideo, createVideoCapture, drawVideoFrame, saveVideo } from './replay-video.js';

/** Opens the timelapse of a history entry ({code, tl, ms}). Returns false when there isn't one. */
export function replayDialog(entry) {
  const code = PuzzleCode.find(entry.code || '');
  const data = findTimelapse(entry.tl);
  if (!code || !data) return false;

  const canvas = el('canvas', { class: 'replay', 'aria-label': 'Timelapse of your game' });
  const loading = el('div', { class: 'loading', text: 'sharpening pencils…' });
  const ring = el('span', { class: 'ring' }, icon('play', 26));
  const playBtn = el('button', { type: 'button', class: 'tool', 'aria-label': 'Play' }, ring);
  sk(ring, { kind: 'wash', fill: 'accentTint', stroke: 'accent' });
  const line = el('canvas', { class: 'scrub', 'aria-label': 'Move through the game', role: 'slider' });
  const clock = el('div', { class: 'clock', text: '0:00' });
  const who = el('div', { class: 'players center', hidden: true });
  // Where a hint was taken (a little lit bulb on the line) and, when one just happened, who took it.
  const note = el('div', { class: 'replaynote center', 'aria-live': 'polite' });
  const saveBtn = canMakeVideo() ? el('button', { type: 'button', class: 'tool', 'aria-label': 'Save as video' }, icon('download', 24)) : null;
  const col = el('div', { class: 'col replaycard', style: 'gap:8px' },
    el('div', { class: 'boardframe' }, canvas, loading), el('div', { class: 'replaybar' }, playBtn, line, clock, ...(saveBtn ? [saveBtn] : [])), note, who);

  let board = null, game = null, rec = null, at = [], total = 0, hints = [], status = '', cap = null;
  let idx = 0, pos = 0, playing = false, ended = false, raf = 0, lastFrame = 0, closed = false;
  const d = dialog(col, { onClose: () => { closed = true; if (cap) cap.cancel(); cancelAnimationFrame(raf); if (board) board.destroy(); } });

  const setIcon = name => { ring.querySelector('svg').replaceWith(icon(name, 26)); playBtn.setAttribute('aria-label', { play: 'Play', pause: 'Pause', restart: 'Watch again' }[name]); };

  const drawLine = () => {
    const r = line.getBoundingClientRect();
    if (r.width < 1) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (line.width !== Math.round(r.width * dpr)) { line.width = Math.round(r.width * dpr); line.height = Math.round(r.height * dpr); }
    const ctx = line.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, line.width, line.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const y = r.height / 2, x0 = 6, x1 = r.width - 6;
    pencilLine(ctx, x0, y, x1, y, theme.pal.inkSoft, 1.6, 7, 2);
    const f = total > 0 ? Math.min(1, pos / total) : 0;
    if (f > 0) pencilLine(ctx, x0, y, x0 + (x1 - x0) * f, y, theme.accent, 3.4, 11, 2);
    // A hint: a small ring and tick above the line, in the pencil of whoever took it.
    hints.forEach((h, k) => {
      const x = x0 + (x1 - x0) * (total > 0 ? at[h.i] / total : 0);
      const c = hintColor(h);
      pencilLine(ctx, x, y - 2, x, y - 7, c, 2, 30 + k, 1);
      pencilCircle(ctx, x, y - 12, 4.2, c, 2, 40 + k);
    });
    ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * f, y, 5, 0, Math.PI * 2); ctx.fillStyle = theme.accent; ctx.fill();
    line.setAttribute('aria-valuenow', String(Math.round(f * 100)));
  };

  const coop = () => !!rec && rec.players.size >= 2;
  const hintColor = h => (coop() && rec.players.has(h.player) ? pencilColor(rec.players.get(h.player)[0], theme.night) : theme.pal.hint);
  /** "Sam took a hint · 1:23" for a few seconds after a hint (co-op names who; alone it just says when). */
  const hintNote = () => {
    let h = null;
    for (const e of hints) if (at[e.i] <= pos && pos < at[e.i] + 3000) h = e;
    if (!h) return null;
    const what = h.clear ? 'cleared mistakes' : 'took a hint';
    const nm = coop() ? (rec.players.has(h.player) && rec.players.get(h.player)[1]) || 'Friend' : '';
    return { text: nm ? `${nm} ${what} · ${formatTime(h.t)}` : `${h.clear ? 'Cleared mistakes' : 'Hint'} · ${formatTime(h.t)}`, color: hintColor(h) };
  };
  const showNote = () => {
    const h = hintNote();
    note.textContent = status || (h ? h.text : '');
    note.style.color = !status && h ? h.color : '';
  };

  const apply = mv => {
    game.marks[mv.edge] = mv.value;
    game.owner[mv.edge] = mv.player & 255;
    if (mv.kind === Kind.HINT && mv.value) game.hinted[mv.edge] = 1;
  };
  /** Back to the empty board (also ends the win glow). */
  const rewind = () => { game.marks.fill(0); game.owner.fill(0); game.hinted.fill(0); idx = 0; board.setGame(game); };
  /** Shows the board as it was at playback time [p]. */
  const showAt = p => {
    if (idx > 0 && at[idx - 1] > p) rewind();
    while (idx < at.length && at[idx] <= p) apply(rec.moves[idx++]);
    pos = Math.max(0, Math.min(total, p));
    clock.textContent = formatTime(idx >= at.length ? entry.ms || rec.lastT : idx ? rec.moves[idx - 1].t : 0);
    board.invalidate();
    drawLine();
    showNote();
  };

  // Save as video: play it once more, recording every picture, then keep the file.
  const videoFrame = ctx => {
    const h = hintNote();
    const names = coop() ? [...rec.players.values()].map(([, nm]) => nm || 'Friend').join(' · ') : '';
    drawVideoFrame(ctx, canvas, {
      title: `Fenceline · ${Boards.label(code.shape, code.width, code.height)} ${diffLabel(code.difficulty)}`,
      clock: clock.textContent, note: h ? h.text : names, noteColor: h ? h.color : null,
      look: { pal: theme.pal, font: getComputedStyle(document.body).fontFamily || 'sans-serif' },
    });
  };
  const finishVideo = async () => {
    const c = cap;
    await new Promise(r => setTimeout(r, 2200)); // hold on the finished board
    if (closed) { c.cancel(); return; }
    status = 'Saving…'; showNote();
    const blob = await c.stop();
    const name = `fenceline-${new Date().toISOString().slice(0, 10)}-${code.width}x${code.height}.${c.ext}`;
    try { status = await saveVideo(blob, name); } catch (e) { status = "Couldn't save the video."; }
    cap = null; saveBtn.disabled = false;
    if (!closed) showNote();
  };
  const makeVideo = () => {
    if (!game || cap) return;
    pause(); ended = false; rewind(); showAt(0);
    status = 'Recording… keep this open.';
    try { cap = createVideoCapture(videoFrame); cap.start(); } catch (e) { cap = null; status = "Couldn't make a video here."; showNote(); return; }
    saveBtn.disabled = true;
    start();
  };
  if (saveBtn) saveBtn.addEventListener('click', makeVideo);

  const finish = () => {
    playing = false; ended = true;
    setIcon('restart');
    if (game.isSolved()) board.playSolved({ celebrate: false });
    if (cap) finishVideo();
  };
  const tick = now => {
    raf = 0;
    if (closed || !playing) return;
    pos += now - lastFrame; lastFrame = now;
    showAt(pos);
    if (pos >= total) { finish(); return; }
    raf = requestAnimationFrame(tick);
  };
  const start = () => {
    if (!cap) status = '';
    if (ended || pos >= total) { ended = false; rewind(); showAt(0); }
    playing = true; setIcon('pause');
    lastFrame = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const pause = () => { playing = false; setIcon('play'); cancelAnimationFrame(raf); raf = 0; };
  playBtn.addEventListener('click', () => { if (!game || cap) return; if (playing) pause(); else start(); });

  // Tap or drag along the line to jump to any moment.
  const seek = ev => {
    if (!game || cap) return;
    status = '';
    const r = line.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (ev.clientX - r.left - 6) / Math.max(1, r.width - 12)));
    if (ended) { ended = false; setIcon('play'); rewind(); }
    showAt(f * total);
    if (f >= 1 && !playing) finish();
  };
  line.addEventListener('pointerdown', ev => { line.setPointerCapture(ev.pointerId); seek(ev); });
  line.addEventListener('pointermove', ev => { if (line.hasPointerCapture(ev.pointerId)) seek(ev); });

  factory.gen('thumb', code.width, code.height, code.difficulty, code.seed, code.shape).then(p => {
    if (closed) return;
    try { rec = Recorder.decode(data, p.grid.edgeCount); } catch (e) { loading.textContent = "This one can't be played back."; return; }
    loading.hidden = true;
    game = new Game(p);
    board = new BoardView(canvas);
    board.locked = true; board.showErrors = false; board.palette = theme.pal; board.pencilColor = theme.accent;
    if (rec.players.size) {
      // Co-op: each fence in the pencil (colour and line style) of whoever drew it.
      board.ownerColors = Array.from({ length: 256 }, (_, i) => rec.players.has(i) ? pencilColor(rec.players.get(i)[0], theme.night) : theme.accent);
      board.ownerStyles = Array.from({ length: 256 }, (_, i) => rec.players.has(i) ? pencilStyle(rec.players.get(i)[0]) : 'solid');
      board.ownerFx = Array.from({ length: 256 }, (_, i) => rec.players.has(i) ? pencilFx(rec.players.get(i)[0]) : '');
      board.ownerAccents = Array.from({ length: 256 }, (_, i) => rec.players.has(i) ? pencilAccent(rec.players.get(i)[0]) : '#FFFFFF');
      board.night = theme.night;
      who.replaceChildren(...[...rec.players.values()].map(([pc, nm]) => el('span', { class: 'pl' }, pencilSwatch(pc, theme.night), nm || 'Friend')));
      who.hidden = rec.players.size < 2;
    }
    board.setGame(game);
    ({ at, total } = playbackTimes(rec.moves));
    hints = hintEvents(rec.moves);
    showAt(0);
    setTimeout(() => { if (!closed && !playing && pos === 0) start(); }, 400);
  }, () => { loading.textContent = "Oops, that puzzle wouldn't draw."; });
  return d;
}
