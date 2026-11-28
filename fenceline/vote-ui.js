// The co-op hint vote: a small taped note at the top left of every player's screen (it floats, so the board never moves).
// Rules are in votes.js. Whoever asked runs the count and tells the others; if they drop out, the card just closes by itself.
import { VoteBox, VOTE_MS, LATE_MS } from './votes.js';
import { el, chip, sk } from './ui.js';

/** ctx: { root, getRoom(), nameOf(p), setNote(s) }. Returns { ask(kind, go), onMessage(msg), dispose() }. */
export function createVotes({ root, getRoom, nameOf, setNote }) {
  const opts = globalThis.FENCELINE_VOTES || {}; // (tests shorten the pauses)
  const box = new VoteBox(opts), HIDE_MS = opts.hide ?? 1800; // how long the result stays on the card
  let card = null, countEl = null, titleEl = null, btns = null, endTimer = 0, hideTimer = 0, mine = false, go = null, myVote = null;
  const now = () => performance.now();
  const WORDS = { hint: 'a hint', clear: 'to clear mistakes' };
  const noNote = kind => `Not enough yes votes, so ${kind === 'clear' ? 'the mistakes stay' : 'no hint'} this time.`;

  const hide = () => { clearTimeout(hideTimer); if (card) card.remove(); card = null; root.classList.remove('voting'); };
  const tally = () => { if (countEl) countEl.textContent = `${box.yes} yes · ${box.no} no`; };

  const show = () => {
    hide();
    const v = box.cur, room = getRoom();
    mine = v.player === room.me;
    titleEl = el('div', { class: 'votetitle', text: mine ? `You asked ${WORDS[v.kind] === 'a hint' ? 'for a hint' : 'to clear mistakes'}.` : `${nameOf(v.player)} wants ${WORDS[v.kind]}.` });
    countEl = el('div', { class: 'votecount' });
    const bar = el('div', { class: 'votebar' }, el('span', { style: `animation-duration:${VOTE_MS}ms` }));
    const vote = yes => {
      if (myVote !== null || !box.cur) return;
      myVote = yes;
      box.cast(box.cur.player, room.me, yes);
      room.broadcast({ t: 'BALLOT', player: room.me, for: box.cur.player, yes });
      showButtons(); tally(); maybeFinish();
    };
    btns = el('div', { class: 'row gap6 voterow' });
    const showButtons = () => {
      btns.replaceChildren();
      if (mine) { btns.append(el('span', { class: 'votemsg', text: 'Your vote counts as yes.' })); return; }
      btns.append(chip('Yes', myVote === true, () => vote(true), { size: 15 }), chip('No', myVote === false, () => vote(false), { size: 15 }));
    };
    showButtons();
    card = sk(el('div', { class: 'votecard', role: 'status' }, titleEl, bar, btns, countEl), { stroke: 'inkSoft', width: 1.6 });
    root.append(card);
    root.classList.add('voting');
    setNote('');
    tally();
  };

  const finish = (pass, text) => {
    clearTimeout(endTimer);
    box.close(pass, now());
    myVote = null;
    if (!card) return;
    btns.replaceChildren(el('span', { class: 'votemsg', text }));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_MS);
  };

  /** The asker's phone: all votes in, or the time is up. */
  const resolve = () => {
    const v = box.cur, room = getRoom();
    if (!v || !mine || !room) return;
    const pass = box.passes, kind = v.kind;
    room.broadcast({ t: 'VOTEEND', player: room.me, pass });
    const run = go; go = null;
    finish(pass, pass ? 'Yes wins!' : 'Not this time.');
    if (pass) { if (run) run(); } else setNote(noNote(kind));
  };
  const maybeFinish = () => { if (mine && box.everyoneVoted) resolve(); };

  const startTimers = () => {
    clearTimeout(endTimer);
    endTimer = setTimeout(() => {
      if (!box.cur) return;
      if (mine) resolve(); else finish(false, 'Time is up.'); // the asker never told us: just close the card
    }, mine ? VOTE_MS : VOTE_MS + LATE_MS);
  };

  return {
    /** This player asked for a hint ('hint') or Clear mistakes ('clear'); [run] does it if the vote passes. */
    ask(kind, run) {
      const room = getRoom();
      if (!room) { run(); return; }
      if (room.here.length <= 1) { run(); return; } // nobody to ask
      const why = box.canAsk(room.me, now());
      if (why) { setNote(why === 'busy' ? 'A vote is already open.' : 'Give it a moment before the next vote.'); return; }
      box.open(room.me, kind, room.here, now());
      go = run; myVote = null;
      room.broadcast({ t: 'VOTE', player: room.me, kind });
      show(); startTimers(); maybeFinish();
    },
    onMessage(msg) {
      const room = getRoom();
      if (!room || msg.player === room.me && msg.t !== 'BALLOT') return;
      if (msg.t === 'VOTE') {
        if (box.canAsk(msg.player, now())) return; // a vote is open or it's too soon: ignore floods
        box.open(msg.player, msg.kind, room.here, now());
        myVote = null; go = null;
        show(); startTimers();
      } else if (msg.t === 'BALLOT') {
        if (msg.player !== room.me && box.cast(msg.for, msg.player, msg.yes)) { tally(); maybeFinish(); }
      } else if (msg.t === 'VOTEEND') {
        if (box.cur && box.cur.player === msg.player && !mine) {
          const kind = box.cur.kind;
          finish(msg.pass, msg.pass ? 'Yes wins!' : 'Not this time.');
          if (!msg.pass) setNote(noNote(kind));
        }
      }
    },
    dispose() { clearTimeout(endTimer); hide(); },
  };
}
