// GET /api/bridge/takeaway-line?sessionId=… — the takeaway card's "one thing
// to remember", written by the model from the card's own key moment.
//
// On demand, never on render: the deterministic card (chips, moment, cost
// lines, fallback sentence) is computed server-side with the page; only this
// one sentence costs a model call, so only this one waits behind a fetch. A
// no-answer is honest and harmless — the card already holds its fallback.
//
// Like play-hints and event-qa, the CLIENT SENDS ONLY A SESSION ID. The seat
// comes from the session record, the moment is recomputed here rather than
// trusted from the browser, and the auction must be OVER — this surface reads
// a finished board, and a mid-auction caller would be paying for a sentence
// about a decision that hasn't finished happening.

import { NextResponse } from "next/server";

import { boardTakeaway } from "@/lib/coach/takeaway";
import { generateTakeawayLine, takeawayLineConfigured } from "@/lib/coach/takeawayLine";
import { originalHand } from "@/lib/benSeat";
import { corsOptions, withCors } from "@/lib/cors";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

// Serverless time limit — a thinking model plus a cold start sits over the
// 10-15s default, and a killed function reads as "no line".
export const maxDuration = 60;

/**
 * Same board → same sentence, verbatim — the event-qa rule. Reopening the
 * sheet must find the line already read, not a paraphrase of it.
 */
const MAX_ENTRIES = 200;
const cache = new Map<string, string>();

/** Identical requests in the air share one model call (see play-why). */
const inFlight = new Map<string, Promise<{ line: string } | { reason: string }>>();

function remember(key: string, line: string): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, line);
}

export const OPTIONS = corsOptions("GET");

export async function GET(request: Request): Promise<NextResponse> {
  return withCors(await handle(request), "GET");
}

async function handle(request: Request): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  if (!takeawayLineConfigured()) return NextResponse.json({ line: null, reason: "unconfigured" });

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { record, state } = view;

  const seat = (Object.entries(record.seats) as [
    typeof state.turn,
    (typeof record.seats)["N"],
  ][]).find(([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId)?.[0];
  if (!seat) return NextResponse.json({ line: null, reason: "not seated" });

  // The auction has to be finished — the takeaway judges completed decisions.
  // (The card itself only appears at boardOver; this looser server gate is
  // fine because the line is built from the learner's own hand and the public
  // auction, so there is nothing here to leak.)
  if (state.phase === "auction") return NextResponse.json({ line: null, reason: "still bidding" });

  const dealtHands = {
    N: originalHand(state, "N"),
    E: originalHand(state, "E"),
    S: originalHand(state, "S"),
    W: originalHand(state, "W"),
  };
  const takeaway = await boardTakeaway({
    record,
    vul: state.vul,
    dealtHands,
    learnerSeat: seat,
    compiled: await sessionService().compiledFor(record),
  });
  if (!takeaway) return NextResponse.json({ line: null, reason: "nothing to say" });

  const key = `${sessionId}:${record.board.name}:${state.auction.length}:${takeaway.moment.auctionIndex}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json({ line: hit, cached: true });

  const running = inFlight.get(key);
  if (running) {
    const joined = await running;
    return "line" in joined
      ? NextResponse.json({ line: joined.line, cached: true })
      : NextResponse.json({ line: null, reason: joined.reason });
  }

  const hand = takeawayHand(dealtHands[seat]);
  const work = (async (): Promise<{ line: string } | { reason: string }> => {
    const result = await generateTakeawayLine({ moment: takeaway.moment, hand });
    if (!("line" in result)) {
      // Named failure classes only, never content — the event-qa logging rule.
      console.warn(`[coach] takeaway-line no-answer (${result.reason}) for ${sessionId}`);
      return { reason: result.reason };
    }
    remember(key, result.line);
    return result;
  })();
  inFlight.set(key, work);

  try {
    const out = await work;
    return "line" in out
      ? NextResponse.json({ line: out.line })
      : NextResponse.json({ line: null, reason: out.reason });
  } finally {
    inFlight.delete(key);
  }
}

/** "S:KQ874 H:A3 D:K92 C:J54" — the notation every coach prompt uses. */
function takeawayHand(cards: readonly { suit: string; rank: number }[]): string {
  return ["S", "H", "D", "C"]
    .map((suit) => {
      const ranks = cards
        .filter((c) => c.suit === suit)
        .sort((a, b) => b.rank - a.rank)
        .map((c) => "..23456789TJQKA"[c.rank])
        .join("");
      return `${suit}:${ranks || "-"}`;
    })
    .join(" ");
}
