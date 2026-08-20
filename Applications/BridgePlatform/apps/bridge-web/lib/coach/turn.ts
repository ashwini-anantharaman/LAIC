// WHOSE DECISION IS ON THE TABLE — the one answer the coach's doors share.
//
// A learner's own seat is not always the hand they are choosing from, and the
// coach's advice surfaces kept getting this wrong in the same way (bug report
// 2026-08-19: "Owlee and Ben is saying it is not my turn even though I am
// playing North"). Two rules stack:
//
//   DECLARER PLAYS DUMMY'S CARDS. When the learner declares, dummy's turn is
//   theirs — that one every door already had.
//
//   THE LEARNER NEVER SITS OUT. When the learner was dealt DUMMY and the
//   declarer's chair belongs to a ROBOT, they play the declarer's hand instead
//   of watching a machine play the board (the rule `controllingSeat` enforces in
//   @bridge/sessions, and `tableView` draws as `takeover`). This is the one the
//   doors missed: they compared the acting seat against the seat the learner was
//   DEALT, so a learner declaring from North while dealt South was told, at
//   every single decision, that it was not their turn — by Owlee, by BEN, and by
//   the why route, while the panel's own facts (built page-side from the right
//   seat) worked. Curated deals meet it constantly: the coach seats the learner,
//   and the robot partner often declares.
//
// So: `playsFrom` is the chair the learner is choosing from, and
// `decisionIsTheirs` is whether the card on the clock is theirs to pick. Every
// coach door asks these two rather than re-deriving the rule, because the rule
// was re-derived four times and wrong in all four.

import type { GameState } from "@bridge/engine";
import { partnerOf, type Seat } from "@bridge/events";

/** Just enough of a session record to know who is a person. */
interface SeatedRecord {
  seats: Record<Seat, { kind: string }>;
}

/**
 * The chair this learner is choosing from: their own, unless they were dealt
 * dummy and the declarer's chair is a robot's — then it is the declarer's.
 */
export function playsFrom(record: SeatedRecord, state: GameState, seat: Seat): Seat {
  if (state.phase !== "play" || !state.contract) return seat;
  const declarer = state.contract.declarer;
  if (partnerOf(declarer) !== seat) return seat;
  // Their partner declares. If a PERSON holds that chair it is theirs, not the
  // learner's — dummy really does sit out at a table with two people at it.
  return record.seats[declarer]?.kind === "human" ? seat : declarer;
}

/**
 * Is the decision on the table this learner's to make?
 *
 * True for their own card, and for dummy's card whenever they are the one
 * declaring — including the takeover case, where "declaring" is a chair they
 * were not dealt.
 */
export function decisionIsTheirs(record: SeatedRecord, state: GameState, seat: Seat): boolean {
  if (state.phase === "auction") return state.turn === seat;
  if (state.phase !== "play" || !state.contract) return false;
  const from = playsFrom(record, state, seat);
  const declarer = state.contract.declarer;
  return state.turn === from || (from === declarer && state.turn === partnerOf(declarer));
}
