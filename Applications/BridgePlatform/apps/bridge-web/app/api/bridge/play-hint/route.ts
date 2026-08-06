// GET /api/bridge/play-hint?sessionId=… — what to play, right now.
//
// On demand because the panel's `asked` budget allows a seven-card search, which
// costs seconds — that cannot sit in a page render. Here it runs once, because
// someone asked and is watching a spinner.
//
// Goes through the SAME panel that judges a played card, with `asking: true`.
// It used to call its own fallback chain, which meant the two directions
// consulted different authorities in different orders — and the invariant test
// asserting otherwise passed, because it exercised the panel while this route
// did not.
//
// Like the BEN route, the CLIENT SENDS ONLY A SESSION ID. Which hand to reason
// from comes from the session record and must be the caller's own seat —
// otherwise this endpoint reads a hand you are not allowed to see and hands you
// its best card, which is the game.

import { NextResponse } from "next/server";

import { advisePlay } from "@/lib/coach/advise";
import { partnershipSystem } from "@/lib/coach/verdicts";
import { kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

const PARTNER: Record<string, string> = { N: "S", S: "N", E: "W", W: "E" };

export async function GET(request: Request): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { record, state } = view;

  const seat = (Object.entries(record.seats) as [string, (typeof record.seats)["N"]][]).find(
    ([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId,
  )?.[0];
  if (!seat) return NextResponse.json({ hint: null, reason: "not seated" });
  if (state.phase !== "play") return NextResponse.json({ hint: null, reason: "not playing" });

  // Whose card is on the table now, and is it the caller's to choose? Declarer
  // chooses dummy's cards too, so both count as theirs; dummy chooses nothing.
  const declarer = state.contract?.declarer;
  const dummy = declarer ? PARTNER[declarer] : undefined;
  const mine = state.turn === seat || (seat === declarer && state.turn === dummy);
  if (!mine) return NextResponse.json({ hint: null, reason: "not your turn" });

  const advice = await advisePlay({
    state,
    learnerSeat: seat as never,
    actor: state.turn,
    system: {
      compiled: await sessionService().compiledFor(record),
      player: partnershipSystem(record.seats, seat as never),
    },
    // The knowledge base, so the advice can quote the agreement it came from
    // rather than just naming a card.
    kb: kbStore(),
  });

  if (!advice.best.length) {
    return NextResponse.json({ hint: null, reason: advice.silentBecause ?? "no answer" });
  }
  // FIELD BY FIELD, not `{ hint: advice }`.
  //
  // The advice now carries the solver's cost table, and spreading the object shipped
  // it to the browser. A trick count is not a card, so nothing was technically
  // leaked — but a table pricing EVERY legal card is derived from all four hands, and
  // enough of them tells a determined player about the layout. The panel has no use
  // for it either: the explanation is written server-side in `play-why`.
  //
  // So the response is built explicitly. The next server-only field added to
  // `PlayAdvice` then reaches the client only if somebody names it here.
  return NextResponse.json({
    hint: {
      best: advice.best,
      source: advice.source,
      // The card to lead with when several tie. Convention's choice, not the
      // solver's — the panel labels it accordingly.
      ...(advice.prefer ? { prefer: advice.prefer } : {}),
      ...(advice.because ? { because: advice.because } : {}),
      ...(advice.corroborated ? { corroborated: true } : {}),
      ...(advice.contradicted ? { contradicted: true } : {}),
    },
  });
}
