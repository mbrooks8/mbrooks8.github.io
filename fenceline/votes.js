// Co-op hint votes: the rules, with no screen in them (the little card is in vote-ui.js).
// Anyone asks for a Hint or Clear mistakes, everyone who is here votes for 5 seconds, and the majority wins.
// Players who don't vote stay out of the count, the asker counts as yes, and a tie means no hint.
// One vote at a time, with a pause after each so nobody can spam it.

export const VOTE_MS = 5000;        // how long people have to vote
export const GAP_MS = 8000;         // pause after any vote before the next can start
export const NO_ASK_MS = 30000;     // pause for someone whose own vote didn't pass
export const LATE_MS = 3000;        // phones that never hear the result close the card this much later

export class VoteBox {
  /** [gap] / [noAsk] (ms) can be shortened for tests. */
  constructor({ gap = GAP_MS, noAsk = NO_ASK_MS } = {}) { this.gap = gap; this.noAsk = noAsk; this.cur = null; this.gapUntil = -Infinity; this.askUntil = {}; }

  /** '' if [player] may ask now, else 'busy' (a vote is open) or 'wait' (a pause is running). */
  canAsk(player, now) {
    if (this.cur) return 'busy';
    if (now < this.gapUntil || now < (this.askUntil[player] ?? -Infinity)) return 'wait';
    return '';
  }

  /** Start a vote. [voters] are the seats here; the asker is one of them and counts as yes. */
  open(player, kind, voters, now) {
    if (this.cur) return false;
    const set = new Set(voters); set.add(player);
    this.cur = { player, kind, voters: set, ballots: new Map([[player, true]]), at: now };
    return true;
  }

  /** Record a ballot for the open vote asked by [forPlayer]; false if it doesn't count. */
  cast(forPlayer, voter, yes) {
    const v = this.cur;
    if (!v || v.player !== forPlayer || !v.voters.has(voter) || voter === v.player) return false;
    v.ballots.set(voter, !!yes);
    return true;
  }

  get yes() { let n = 0; if (this.cur) for (const b of this.cur.ballots.values()) if (b) n++; return n; }
  get no() { let n = 0; if (this.cur) for (const b of this.cur.ballots.values()) if (!b) n++; return n; }
  /** Everyone who is here has voted (the vote can end early). */
  get everyoneVoted() { return !!this.cur && this.cur.ballots.size >= this.cur.voters.size; }
  /** Majority of the votes cast; a tie is a no. */
  get passes() { return this.yes > this.no; }

  /** End the open vote and start the pauses. */
  close(pass, now) {
    const v = this.cur;
    if (!v) return;
    this.cur = null;
    this.gapUntil = now + this.gap;
    if (!pass) this.askUntil[v.player] = now + this.noAsk;
  }
}
