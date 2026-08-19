// WHERE EACH SEAT IS DRAWN, from the viewer's chair.
//
// The phone tier has room for one hand plus dummy, so the seat it draws at the
// bottom is the seat it can be played from. That was the literal "S" until
// 2026-08-18 — true of every table here, because quick play, challenges and
// assignments all seat their human South. A curated deal broke it twice: its
// coach chooses where the learner sits, and while AUTHORING they hold all four
// chairs at once, so the seat on turn is whichever one they are playing.
//
// The mapping is the ordinary one a bridge table uses: you at the bottom, your
// partner opposite, your left-hand opponent on the left — which is to say, the
// compass turned until your seat reaches South.
//
// A VIEWER IN SOUTH, OR IN NO SEAT, GETS THE IDENTITY. That is what makes this
// safe to put under every table: nothing that existed before this moves.

import type { Seat } from "@bridge/events";

/** Clockwise, the order the auction and the play both travel. */
const CLOCKWISE: Seat[] = ["N", "E", "S", "W"];

const quarterTurns = (viewer: Seat | null): number =>
  CLOCKWISE.indexOf(viewer ?? "S") - CLOCKWISE.indexOf("S");

/** The screen position a seat occupies — "S" is the bottom of the phone tier. */
export function positionOf(seat: Seat, viewer: Seat | null): Seat {
  return CLOCKWISE[(CLOCKWISE.indexOf(seat) - quarterTurns(viewer) + 8) % 4]!;
}

/** The inverse: whose hand is drawn at a screen position. */
export function seatAtPosition(position: Seat, viewer: Seat | null): Seat {
  return CLOCKWISE[(CLOCKWISE.indexOf(position) + quarterTurns(viewer) + 8) % 4]!;
}
