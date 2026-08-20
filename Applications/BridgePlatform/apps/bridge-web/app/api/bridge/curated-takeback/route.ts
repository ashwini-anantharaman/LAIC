// POST /api/bridge/curated-takeback — the learner accepts the coach's nudge
// and returns to the charted line.
//
// WHY THIS IS NOT ONE UNDO. The nudge offers "take it back" the moment the
// learner's own action first leaves the line, and sessionService().undo()
// drops exactly ONE action — the last one, whoever made it. Those two facts
// only agree for the instant before the robots reply. AutoAdvance is already
// playing them while the learner reads the bubble, so by the time the button
// is pressed the last action is usually a robot's card: one undo took that
// back, the learner's diverging card stayed exactly where it was, and the
// button looked broken because nothing it promised had happened.
//
// So the target is a STATE, not a count: the board goes back to where it left
// the coach's line, however many robot replies landed in between — none,
// three, or a whole trick.
//
// AND IT IS ONE WRITE (bug report 2026-08-19: "sometimes the takeback mechanism
// lags and doesn't work"). This used to loop `undo()` until `pathStatus` said
// on-line, and each turn of that loop was two store reads, a write and a full
// event replay — four of them on a mid-trick divergence, against Postgres, with
// the learner watching a button that had already stopped saying anything. The
// line is a PREFIX, so the arithmetic is exact without trying: everything from
// the divergence onward comes off, which `undoActions` does in a single read and
// a single write.
//
// Body: { sessionId } → { ok, undone } — `undone` is how many actions came
// off, so the caller can tell a real rewind from a no-op.

import { NextResponse } from "next/server";

import { corsOptions, withCors } from "@/lib/cors";
import { lineOf, pathStatus } from "@/lib/curated";
import { getBridgeContext } from "@/lib/nexus";
import { libraryStore, sessionService } from "@/lib/sessions";
import type { Seat } from "@bridge/events";
import { playsFrom } from "@/lib/coach/turn";

/**
 * A whole trick of robot replies plus the learner's own card is four; twice
 * that is slack for an auction divergence answered by three passes. The cap
 * exists so a learner who wandered off the line several tricks ago — the nudge
 * expires, but this door stays open — cannot unwind half a board in one tap.
 */
const MAX_UNDOS = 8;

export const OPTIONS = corsOptions("POST");

export async function POST(request: Request): Promise<NextResponse> {
  return withCors(await handle(request), "POST");
}

async function handle(request: Request): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!view.record.curated) {
    return NextResponse.json({ error: "not a curated board" }, { status: 400 });
  }

  // The seat the caller holds IS the authorization: this takes back their own
  // move on their own board. Deliberately NOT the generic `table.undo`
  // capability — that governs the table's Undo button, and a club that turns
  // it off must not thereby break the coach's own nudge, which is the whole
  // teaching mechanism of a curated deal.
  const seat = (
    Object.entries(view.record.seats) as [Seat, (typeof view.record.seats)["N"]][]
  ).find(([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId)?.[0];
  if (!seat) return NextResponse.json({ error: "not your board" }, { status: 403 });

  const entry = await libraryStore().getEntry(view.record.curated.entryId);
  const line = entry ? lineOf(entry) : null;
  if (!line) return NextResponse.json({ error: "no line to return to" }, { status: 409 });

  const state = view.state;
  // The seat they are CHOOSING FROM: a learner dealt dummy plays the declarer's
  // hand when that chair is a robot's, and the line questions must be asked
  // about that chair or the take-back is offered for a move it thinks was
  // somebody else's.
  const from = playsFrom(view.record, state, seat);
  const status = pathStatus(state, line, seat, from);

  // Already on the line — nothing to take back. Answer honestly rather than
  // undoing a good move because the bubble was a beat stale.
  if (status.onPath) return NextResponse.json({ ok: true, undone: 0 });
  if (!status.divergedAt) {
    // Off the line with no locatable divergence: the entry's line was edited
    // out from under this session. Nothing to rejoin.
    return NextResponse.json({ ok: false, undone: 0 }, { status: 409 });
  }

  /** How many actions were on the board BEFORE the divergence. */
  const before =
    status.divergedAt.kind === "call"
      ? status.divergedAt.auctionIndex
      : state.auction.length + status.divergedAt.trickIndex * 4 + status.divergedAt.playIndex;
  const total = state.auction.length + state.tricks.reduce((n, t) => n + t.plays.length, 0);
  const count = Math.min(total - before, MAX_UNDOS);
  if (count <= 0) return NextResponse.json({ ok: false, undone: 0 });

  const after = await sessionService().undoActions(sessionId, count);
  const onLine = pathStatus(after.state, line, seat, from).onPath;
  return NextResponse.json({ ok: onLine, undone: count });
}
