// Points and the leaderboard list. Pure functions, no screens, so they are easy to test.
// The app (Android, Google Play Games) keeps one board per key below; see android/.../PlayGames.kt and games.xml.

const LEVEL = { EASY: 1, MEDIUM: 2, HARD: 3 };

/** Points for one finished puzzle: squares on the board x level (1, 2, 3); half as much again with no hints; +100 for the daily. */
export function winPoints({ cells, difficulty, hints, daily }) {
  let p = Math.max(1, cells | 0) * (LEVEL[difficulty] || 1);
  if (!hints) p = Math.round(p * 1.5);
  return p + (daily ? 100 : 0);
}

/** Square sizes that get a "fastest time" board (every difficulty). */
export const TIMED_SIZES = ['5x5', '7x7', '10x10', '15x15'];
const DIFFS = ['EASY', 'MEDIUM', 'HARD'];
const cap = s => s[0] + s.slice(1).toLowerCase();

/** Every board: { key, label, group, time? }. `time` boards are fastest-time (smaller is better); the rest count up. */
export const BOARDS = [
  { key: 'points', label: 'Total points', group: 'Totals' },
  ...DIFFS.map(d => ({ key: 'solved_' + d.toLowerCase(), label: `${cap(d)} puzzles solved`, group: 'Totals' })),
  { key: 'nohint', label: 'Solved with no hints', group: 'Totals' },
  { key: 'streak', label: 'Daily streak', group: 'Totals' },
  { key: 'daily_time', label: "Today's daily, fastest", group: 'Fastest', time: true },
  ...TIMED_SIZES.flatMap(sz => DIFFS.map(d => ({
    key: `time_${sz}_${d.toLowerCase()}`, label: `${sz.replace('x', '×')} ${cap(d)}, fastest`, group: 'Fastest', time: true,
  }))),
];

/**
 * The scores to send after a finished puzzle: [{ key, score }].
 * `totals` holds the player's running numbers after this win (points, solved by level, noHint, streak).
 * Times only count with no hints, on square boards.
 */
export function scoresForWin({ shapeCode, size, difficulty, ms, hints, daily, totals }) {
  const out = [
    { key: 'points', score: totals.points },
    { key: 'solved_' + difficulty.toLowerCase(), score: totals.solved },
  ];
  if (!hints) out.push({ key: 'nohint', score: totals.noHint });
  if (daily) {
    out.push({ key: 'streak', score: totals.streak });
    if (!hints) out.push({ key: 'daily_time', score: ms });
  }
  const key = `time_${size}_${difficulty.toLowerCase()}`;
  if (!hints && !shapeCode && BOARDS.some(b => b.key === key)) out.push({ key, score: ms });
  return out;
}
