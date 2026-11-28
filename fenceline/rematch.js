// The "Play again" countdown. The first player who isn't the host to ask starts it; every other one
// who asks takes a few seconds off, so a table of eager players gets the next round quickly.
// Every phone runs its own copy from the same asks, so whoever hosts next can carry on where it left off.

export const START_SECONDS = 10; // after the first ask
export const SPEEDUP_SECONDS = 3; // taken off by each further ask
export const MIN_SECONDS = 3; // never faster than this, so the host can still change the board
export const LAST_CALL_SECONDS = 30; // versus: friends still racing get this long once the finishers are ready

export class RematchClock {
  constructor() { this.deadline = 0; }
  /** Has a countdown been started (it may already be over)? */
  get started() { return this.deadline > 0; }
  /** Milliseconds left (0 when over or not started). */
  remaining(now) { return this.started ? Math.max(0, this.deadline - now) : 0; }
  /** A player who isn't the host asked for another round. */
  ask(now) {
    if (!this.started) { this.deadline = now + START_SECONDS * 1000; return; }
    const left = this.remaining(now);
    // Faster only: a countdown that is already under the minimum is left alone.
    this.deadline = now + Math.min(left, Math.max(MIN_SECONDS * 1000, left - SPEEDUP_SECONDS * 1000));
  }
  /** Versus, friends still drawing: the finishers are ready, so the racers get a last call (never longer than one already running). */
  lastCall(now) { if (!this.started) this.deadline = now + LAST_CALL_SECONDS * 1000; }
  /** Everyone still here has finished: a running last call shortens to the usual countdown. */
  allDone(now) { if (this.started) this.deadline = Math.min(this.deadline, now + START_SECONDS * 1000); }
  stop() { this.deadline = 0; }
}
