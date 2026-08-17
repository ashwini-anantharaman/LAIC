// GET /api/bridge/state-reads?sessionId=… — the Position states' bid
// inference, by Claude alone (boss direction 2026-08-15: no knowledge base
// in this path). Answers with ready-to-draw cards for the My partner /
// Partnership / Theirs panes, grouped and captioned; the deterministic
// panes (My state, Advanced) never come through here.
//
// Cached per (session, auction) — the auction IS the position for a read of
// the bidding, so every card played during the play phase reuses the same
// answer, and a new call is a new key. Same in-flight sharing as play-hints:
// two screens asking at once join one model call.

import { NextResponse } from "next/server";

import { originalHand } from "@/lib/benSeat";
import { getBridgeContext } from "@/lib/nexus";
import { corsOptions, withCors } from "@/lib/cors";
import { generateStateReads, readsToCards, stateReadsConfigured } from "@/lib/coach/stateReads";
import type { KnownCard } from "@/lib/coach/think";
import { sessionService } from "@/lib/sessions";

// A read of a long auction with thinking sits over the 10-15s default.
export const maxDuration = 45;

const MAX_ENTRIES = 200;
const cache = new Map<string, KnownCard[]>();
const inFlight = new Map<string, Promise<{ cards: KnownCard[] } | { reason: string }>>();

function remember(key: string, cards: KnownCard[]): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, cards);
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
  if (!stateReadsConfigured()) return NextResponse.json({ cards: null, reason: "unconfigured" });

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { record, state } = view;

  const seat = (Object.entries(record.seats) as [string, (typeof record.seats)["N"]][]).find(
    ([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId,
  )?.[0] as "N" | "E" | "S" | "W" | undefined;
  if (!seat) return NextResponse.json({ cards: null, reason: "not seated" });

  // Nothing to read until somebody has BID — passes alone say little enough
  // that the deterministic empty states tell the truth better.
  if (!state.auction.some((a) => a.call !== "P")) {
    return NextResponse.json({ cards: [], reason: "no bids yet" });
  }

  // The read refreshes at TRICK BOUNDARIES during the play (owner direction
  // 2026-08-15: "update the state during play as well") — completed tricks
  // join the key, so each finished trick is one new model call and the four
  // cards inside a trick share the previous read.
  const done = state.tricks.filter((t) => t.plays.length === 4);
  const trickSig = done
    .map((t) => t.plays.map((p) => `${p.seat}${p.card.suit}${p.card.rank}`).join(""))
    .join("|");
  const key = `${sessionId}:${state.auction.map((a) => `${a.seat}${a.call}`).join(",")}:${trickSig}:${seat}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json({ cards: hit, cached: true });

  const running = inFlight.get(key);
  if (running) {
    const joined = await running;
    return "cards" in joined
      ? NextResponse.json({ cards: joined.cards, cached: true })
      : NextResponse.json({ cards: null, reason: joined.reason });
  }

  // The DEALT hand, not the shrinking live one — the read is of the auction,
  // and mid-play the auction was bid with all thirteen cards.
  const hand = originalHand(state, seat);
  // The play context, once a contract exists: dummy's hand is public after
  // the opening lead; completed tricks only, matching the cache key.
  const contract = state.contract;
  const dummySeat = contract
    ? (({ N: "S", S: "N", E: "W", W: "E" }) as const)[contract.declarer]
    : null;
  const leadMade = state.tricks.some((t) => t.plays.length > 0);
  const play =
    contract && state.phase === "play"
      ? {
          contractLabel: `${contract.level}${contract.strain === "N" ? "NT" : contract.strain}${
            contract.doubled === 1 ? " doubled" : contract.doubled === 2 ? " redoubled" : ""
          } by ${contract.declarer}`,
          declarer: contract.declarer,
          dummy: dummySeat!,
          ...(leadMade && dummySeat ? { dummyHand: originalHand(state, dummySeat) } : {}),
          tricks: done.map((t) => ({
            plays: t.plays,
            ...(t.winner ? { winner: t.winner } : {}),
          })),
        }
      : undefined;

  const work = (async (): Promise<{ cards: KnownCard[] } | { reason: string }> => {
    const result = await generateStateReads({
      dealer: record.board.dealer,
      vul: String(state.vul),
      auction: state.auction,
      seat,
      hand,
      ...(play ? { play } : {}),
    });
    if (!("reads" in result)) {
      console.warn(`[coach] state-reads no-answer (${result.reason}) for ${sessionId}`);
      return { reason: result.reason };
    }
    const cards = readsToCards(result.reads, { auction: state.auction, seat, hand });
    remember(key, cards);
    return { cards };
  })();
  inFlight.set(key, work);
  try {
    const result = await work;
    return "cards" in result
      ? NextResponse.json({ cards: result.cards })
      : NextResponse.json({ cards: null, reason: result.reason });
  } finally {
    inFlight.delete(key);
  }
}
