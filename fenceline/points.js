// Points and the leaderboard list. Pure functions, no screens, so they are easy to test.
// The app (Android, Google Play Games) keeps one board per key below; see android/.../PlayGames.kt and games.xml.

const LEVEL = { EASY: 1, MEDIUM: 2, HARD: 3 };

/**
 * Points for one finished puzzle: a size step (1, 2 or 3) times a level step (1, 2 or 3), so 1 to 9 points.
 * No hints adds half again (rounded up). The daily adds 5. Co-op: every player who put fence pieces in the loop gets the same.
 * The hardest size on the hardest level is worth 9 (+5 with no hints).
 */
export const DAILY_BONUS = 5;

/** 1 for a small board, 2 for a middle one, 3 for a big one (by how many cells it has, whatever its shape). */
export function sizeStep(cells) {
  const n = cells | 0;
  return n <= 64 ? 1 : n <= 128 ? 2 : 3;
}

export function winPoints({ cells, difficulty, hints, daily }) {
  const base = sizeStep(cells) * (LEVEL[difficulty] || 1);
  return base + (hints ? 0 : Math.ceil(base / 2)) + (daily ? DAILY_BONUS : 0);
}

const DIFFS = ['EASY', 'MEDIUM', 'HARD'];
const cap = s => s[0] + s.slice(1).toLowerCase();

/** Every board: { key, label, group, time? }. `time` boards are fastest-time (smaller is better); the rest count up. */
export const BOARDS = [
  { key: 'points', label: 'Total points', group: 'Totals' },
  ...DIFFS.map(d => ({ key: 'solved_' + d.toLowerCase(), label: `${cap(d)} puzzles solved`, group: 'Totals' })),
  { key: 'streak', label: 'Daily streak', group: 'Totals' },
  { key: 'daily_time', label: "Today's daily, fastest", group: 'Fastest', time: true },
];

/**
 * The scores to send after a finished puzzle: [{ key, score }].
 * `totals` holds the player's running numbers after this win (points, solved at this level, streak).
 * The daily time only counts with no hints.
 */
export function scoresForWin({ difficulty, ms, hints, daily, totals }) {
  const out = [
    { key: 'points', score: totals.points },
    { key: 'solved_' + difficulty.toLowerCase(), score: totals.solved },
  ];
  if (daily) {
    out.push({ key: 'streak', score: totals.streak });
    if (!hints) out.push({ key: 'daily_time', score: ms });
  }
  return out;
}
