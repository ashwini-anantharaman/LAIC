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
// So the target is a STATE, not a count: undo until the session is back on
// the coach's line. That is the promise the bubble makes ("take it back and
// see why?"), and it is right however many robot replies landed in between —
// none, three, or a whole trick.
//
// Body: { sessionId } → { ok, undone } — `undone` is how many actions came
// off, so the caller can tell a real rewind from a no-op.

import { NextResponse } from "next/server";

import { corsOptions, withCors } from "@/lib/cors";
import { lineOf, pathStatus } from "@/lib/curated";
import { getBridgeContext } from "@/lib/nexus";
import { libraryStore, sessionService } from "@/lib/sessions";
import type { Seat } from "@bridge/events";

/**
 * A whole trick of robot replies plus the learner's own card is four; twice
 * that is slack for an auction divergence answered by three passes. The cap
 * exists so a line that can never be rejoined (a curated entry edited out
 * from under a live session) unwinds a board instead of looping forever.
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

  /** Actions on the board — the only thing an undo can lower. */
  const actionCount = (s: typeof view.state): number =>
    s.auction.length + s.tricks.reduce((n, t) => n + t.plays.length, 0);

  let undone = 0;
  let state = view.state;
  let count = actionCount(state);
  // Already on the line — nothing to take back. Answer honestly rather than
  // undoing a good move because the bubble was a beat stale.
  while (!pathStatus(state, line, seat).onPath && undone < MAX_UNDOS) {
    const next = await sessionService().undo(sessionId);
    const nextCount = actionCount(next.state);
    // undo() is a no-op once the event log is empty. Compare the ACTION
    // COUNT, not the state object: undo returns a freshly built view every
    // time, so an identity check never fires and the loop would spin to the
    // cap against a board with nothing left to take back.
    if (nextCount >= count) break;
    count = nextCount;
    state = next.state;
    undone++;
  }

  const onLine = pathStatus(state, line, seat).onPath;
  return NextResponse.json({ ok: onLine, undone });
}
