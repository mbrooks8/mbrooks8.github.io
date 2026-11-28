// Versus after the first loop: everyone else keeps racing, and friends who are done watch them.
// The rules (play.js follows them on every phone, so a new host carries on the same way):
// - The first loop wins. Later loops get the next place and their own time; every finisher gets points.
// - Nothing pops up over a racer's board. A racer can tap the players row to see the standings.
// - Racers send their fence now and then (LOOK) once someone has finished; only finished players see it.
// - Rematch while friends still race: when the host asks, or every finisher still here has asked, the racers get a
//   last call (rematch.js LAST_CALL_SECONDS). The host can also start right away. When the last racer finishes or
//   leaves, it shortens to the usual countdown.
// - Whoever hasn't finished when the next round starts, or left, simply has no time (no points, no place).
import { Edge } from './core.js';

/** The fence so far, four pieces to a hex digit. */
export function packLines(marks) {
  let s = '';
  for (let i = 0; i < marks.length; i += 4) {
    let v = 0;
    for (let b = 0; b < 4 && i + b < marks.length; b++) if (marks[i + b] === Edge.LINE) v |= 1 << b;
    s += v.toString(16);
  }
  return s;
}

/** Back to one flag per piece (null when it doesn't fit this board). */
export function unpackLines(hex, edgeCount) {
  if (typeof hex !== 'string' || hex.length !== Math.ceil(edgeCount / 4)) return null;
  const out = new Uint8Array(edgeCount);
  for (let i = 0; i < hex.length; i++) {
    const v = parseInt(hex[i], 16);
    for (let b = 0; b < 4 && 4 * i + b < edgeCount; b++) out[4 * i + b] = (v >> b) & 1;
  }
  return out;
}

/** Should the racers get their last call? [finished] and [wants] answer .has(seat). */
export function lastCallDue(here, finished, wants, hostSeat) {
  if (wants.has(hostSeat)) return true;
  const done = here.filter(p => finished.has(p));
  return done.length > 0 && done.length < here.length && done.every(p => wants.has(p));
}

export const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
