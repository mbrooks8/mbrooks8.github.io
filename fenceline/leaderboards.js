// Leaderboards: points are always counted (they show in Stats); with the Android app the scores also go to Google Play Games.
import { store } from './store.js';
import { winPoints, scoresForWin, BOARDS } from './points.js';
import { gamesOn, gamesSubmit, gamesShow } from './native.js';

/** Call right after store.recordWin: adds the points and sends the scores. Returns the points earned. */
export function recordScores(puzzle, ms, hints, daily, repeat = false) {
  const difficulty = puzzle.difficulty || 'EASY';
  const earned = repeat ? 0 : winPoints({ cells: puzzle.width * puzzle.height, difficulty, hints, daily });
  store.addPoints(earned);
  if (gamesOn()) {
    let scores = scoresForWin({
      difficulty, ms, hints, daily,
      totals: { points: store.points, solved: store.solved(difficulty), streak: store.bestStreak },
    });
    if (repeat) scores = scores.filter(s => s.key !== 'points' && !s.key.startsWith('solved_')); // totals did not change
    for (const s of scores) gamesSubmit(s.key, s.score);
  }
  return earned;
}

/** Everything again, e.g. after signing in for the first time: sends the player's running totals. */
export function sendTotals() {
  if (!gamesOn()) return;
  gamesSubmit('points', store.points);
  for (const d of ['EASY', 'MEDIUM', 'HARD']) if (store.solved(d)) gamesSubmit('solved_' + d.toLowerCase(), store.solved(d));
  if (store.bestStreak) gamesSubmit('streak', store.bestStreak);
}

export function leaderboardsOn() { return gamesOn(); }
export function showLeaderboards(key = '') { sendTotals(); gamesShow(key); }
export { BOARDS };
