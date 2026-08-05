// POST /api/bridge/event-qa — a learner's question about the board.
//
// Body: { sessionId, question, eventId? }. With an eventId the question is
// anchored to one event — the id is the SAME one the coach panel's rows carry
// ("call-3", "play-6-1") — and the call's meaning is replayed from the
// compiled KB. Without one it is a general question about the position (the
// panel's chat). Everything else is recomputed server-side: the seat comes
// from the session record and the event from the server's own view of the
// board. The client asserts nothing but the question — a crafted request
// cannot ask about a hand its user cannot see, because the position handed to
// the model is built from the caller's OWN seat every time.
//
// The model receives a VisiblePosition (no field for concealed hands — see
// lib/coach/visible.ts) and its answer is validated against the cards the
// learner may legitimately have seen before it is returned.

import { NextResponse } from "next/server";

import { originalHand } from "@/lib/benSeat";
import { bidMeaningReader } from "@/lib/bidMeanings";
import { answerEventQuestion, qaConfigured, qaPosition } from "@/lib/coach/eventQa";
import { lookingAt } from "@/lib/coach/looking";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

const MAX_QUESTION = 300;

export async function POST(request: Request): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { sessionId?: unknown; eventId?: unknown; question?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { sessionId, eventId } = body;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (typeof sessionId !== "string" || !question || (eventId !== undefined && typeof eventId !== "string")) {
    return NextResponse.json({ error: "sessionId and question required" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION) {
    return NextResponse.json({ answer: null, reason: "question too long" });
  }
  if (!qaConfigured()) return NextResponse.json({ answer: null, reason: "unconfigured" });

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
  if (!seat) return NextResponse.json({ answer: null, reason: "not seated" });

  // The event, rebuilt from the server's board — the same builder the panel's
  // rows come from, so the ids line up by construction. The whole history is
  // searchable: past tricks and the auction stay askable all board long. No
  // eventId means a general question about the position (the panel's chat).
  const looking = lookingAt(state, seat as never);
  const event = eventId
    ? looking?.eventGroups.flatMap((g) => g.events).find((e) => e.id === eventId)
    : undefined;
  if (eventId && !event) return NextResponse.json({ answer: null, reason: "unknown event" });

  // A call's meaning, replayed at the moment it was made — same source as the
  // bidding grid and the panel's expanded rows.
  let meaning: string | undefined;
  if (event && event.kind === "call" && event.auctionIndex !== undefined) {
    const meanings = bidMeaningReader({
      compiled: await sessionService().compiledFor(record),
    }).forAuction({
      boardRef: record.board.name,
      dealer: record.board.dealer,
      vul: state.vul,
      hands: {
        N: originalHand(state, "N"),
        E: originalHand(state, "E"),
        S: originalHand(state, "S"),
        W: originalHand(state, "W"),
      },
      auction: state.auction,
    });
    const m = meanings[event.auctionIndex];
    if (m) meaning = `${m.label}${m.shows ? ` — ${m.shows}` : ""}`;
  }

  const pos = qaPosition(state, seat as never);
  if (!pos) return NextResponse.json({ answer: null, reason: "nothing to ask about" });

  const result = await answerEventQuestion({
    pos,
    eventLabel: event?.label ?? "the position as it stands",
    ...(meaning ? { meaning } : {}),
    question,
  });

  if (!("answer" in result)) {
    // Leaks and drift are logged for whoever is watching; the learner just
    // sees that the coach has no answer, which is the honest surface.
    if (result.reason === "leaked" || result.reason === "malformed") {
      console.warn(`[coach] event-qa rejected (${result.reason}) for ${eventId}`);
    }
    return NextResponse.json({ answer: null, reason: result.reason });
  }
  return NextResponse.json({ answer: result.answer });
}
