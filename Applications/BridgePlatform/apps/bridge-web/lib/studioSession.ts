// IS THIS THE COACH'S STUDIO? — the one answer, for the doors that need it.
//
// The studio is an ORDINARY TABLE with a rail beside it (owner direction
// 2026-08-19: "reverse it back to how the play would be during New Play but
// with the annotation"). The coach sits in the learner's chair, house robots
// take the other three, and the platform's own turn-taking plays the board.
// Nothing about the seating is special any more — which is exactly why the
// studio needs a stamp to be recognizable at all.
//
// TWO SHAPES ANSWER YES, and the second is the reason this file exists:
//
//   · STAMPED — `record.authoring` is set and one of the chairs is the
//     caller's. Every studio sitting opened from the author route since
//     2026-08-19.
//   · ALL FOUR CHAIRS THE CALLER'S — the shape the studio had between
//     2026-08-18 and 2026-08-19, when the coach played every hand. Those
//     sittings are still on people's screens and still publish, so they keep
//     their chrome, their open hands and their turn-following "you"; the
//     resolver reads `allMine` for that last part.
//
// A viewer who is not seated (a spectator, an admin looking in) gets `false`
// from both, which is the honest answer: they may watch a board, never author
// one.

import type { SessionRecord } from "@bridge/sessions";
import type { Seat } from "@bridge/events";

const SEATS: readonly Seat[] = ["N", "E", "S", "W"];

export interface StudioAccess {
  /** This is an authoring sitting and the caller is seated in it. */
  studio: boolean;
  /** The LEGACY four-human-chairs studio (see above) — the resolver still
   *  follows the turn with "you" for these, and only for these. */
  allMine: boolean;
  /** The chairs the caller holds, in N/E/S/W order. */
  mine: Seat[];
  /** The chair the board is built FOR, when the record says so. */
  learnerSeat: Seat | null;
}

export function studioAccess(record: SessionRecord, nexusUserId: string): StudioAccess {
  const mine = SEATS.filter((seat) => {
    const chair = record.seats[seat];
    return chair.kind === "human" && chair.nexusUserId === nexusUserId;
  });
  const allMine = mine.length === SEATS.length;
  return {
    studio: mine.length > 0 && (!!record.authoring || allMine),
    allMine,
    mine,
    learnerSeat: record.authoring?.learnerSeat ?? null,
  };
}
