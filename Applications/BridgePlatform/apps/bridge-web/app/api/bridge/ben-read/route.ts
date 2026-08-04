// GET /api/bridge/ben-read?sessionId=… — BEN's read of the other three hands.
//
// On demand, never on render: BEN takes 8–22 seconds (measured), so this exists
// precisely so the table does not wait on it. The learner taps, this answers.
//
// The CLIENT SENDS ONLY A SESSION ID. Everything that matters — whose hand to
// ask about, what the auction is — is read server-side from the session record.
// Accepting a hand from the browser would let anyone ask BEN to read a hand
// they cannot see, which is the whole game.

import { NextResponse } from "next/server";

import { benConfigured, benRead } from "@/lib/benRead";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

export async function GET(request: Request): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  if (!benConfigured()) return NextResponse.json({ read: null, reason: "unconfigured" });

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { record, state } = view;

  // The caller's OWN seat at this table, or nothing. A watcher gets no read —
  // there is no "your hand" to reason from, and handing out a read of a seat
  // you are not sitting in leaks the auction's shape to a spectator.
  const seat = (Object.entries(record.seats) as [typeof state.turn, (typeof record.seats)[typeof state.turn]][])
    .find(([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId)?.[0];
  if (!seat) return NextResponse.json({ read: null, reason: "not seated" });
  if (state.phase !== "auction") return NextResponse.json({ read: null, reason: "not bidding" });

  const read = await benRead(state, seat);
  return NextResponse.json(read ? { read } : { read: null, reason: "no answer" });
}
