// Leaderboards: points are always counted (they show in Stats); with the Android app the scores also go to Google Play Games.
import { store } from './store.js';
import { Boards } from './core.js';
import { winPoints, scoresForWin, BOARDS } from './points.js';
import { gamesOn, gamesSubmit, gamesShow } from './native.js';

/** Call right after store.recordWin: adds the points and sends the scores. Returns the points earned. */
export function recordScores(puzzle, ms, hints, daily) {
  const difficulty = puzzle.difficulty || 'EASY';
  const earned = winPoints({ cells: puzzle.width * puzzle.height, difficulty, hints, daily });
  store.addPoints(earned);
  if (gamesOn()) {
    const scores = scoresForWin({
      shapeCode: puzzle.shape.code,
      size: Boards.key(puzzle.shape, puzzle.width, puzzle.height),
      difficulty, ms, hints, daily,
      totals: { points: store.points, solved: store.solved(difficulty), noHint: store.noHintWins, streak: store.bestStreak },
    });
    for (const s of scores) gamesSubmit(s.key, s.score);
  }
  return earned;
}

/** Everything again, e.g. after signing in for the first time: sends the player's running totals. */
export function sendTotals() {
  if (!gamesOn()) return;
  gamesSubmit('points', store.points);
  for (const d of ['EASY', 'MEDIUM', 'HARD']) if (store.solved(d)) gamesSubmit('solved_' + d.toLowerCase(), store.solved(d));
  if (store.noHintWins) gamesSubmit('nohint', store.noHintWins);
  if (store.bestStreak) gamesSubmit('streak', store.bestStreak);
}

export function leaderboardsOn() { return gamesOn(); }
export function showLeaderboards(key = '') { sendTotals(); gamesShow(key); }
export { BOARDS };
