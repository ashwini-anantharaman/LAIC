// GET /api/bridge/ben-tell?sessionId=… — what BEN would do, right now.
//
// The coach panel's TELL screen puts two authorities side by side: the coach's
// own answer (play-hint, through the advice panel) and this — the neural
// engine's choice for the same decision, with its candidate scores. A second
// opinion, labelled as one: BEN is a different kind of player, and seeing
// where it agrees with the rulebook is itself coaching.
//
// On demand, never on render: BEN's /play runs full simulations (20-45s
// measured); /bid is ~1.5s warm. The learner taps, this answers.
//
// The CLIENT SENDS ONLY A SESSION ID. The seat comes from the session record
// and must be the caller's own, and BEN is only asked while the decision is
// the caller's to make — otherwise this endpoint hands a watcher (or an
// opponent) an engine's read of a hand they cannot see, which is the game.

import { legalCalls, legalPlays } from "@bridge/engine";
import type { Seat } from "@bridge/events";
import { NextResponse } from "next/server";

import { benConfigured } from "@/lib/benRead";
import { createBenTableClient, originalHand, parseBenCard, playedToBen } from "@/lib/benSeat";
import { auctionToCtx, handToPbn, vulToBen } from "@/lib/benchmark";
import { callLabel, cardLabel } from "@/lib/coach/position";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

const PARTNER: Record<string, Seat> = { N: "S", S: "N", E: "W", W: "E" };

/** What the panel draws: BEN's choice, and what it weighed against it. */
interface BenTell {
  kind: "call" | "card";
  /** The choice, in table labels — "1♥", "Pass", "10♦". */
  action: string;
  /** BEN's own wording for it, when the service provides one. */
  because?: string;
  /** The chosen action's neural score, when provided. */
  score?: number;
  /** What it considered instead, best first. */
  alternatives: { action: string; score?: number; because?: string }[];
}

// Serverless time limit: /play simulations sit far above the default.
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  if (!benConfigured()) return NextResponse.json({ tell: null, reason: "unconfigured" });

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { record, state } = view;

  const seat = (Object.entries(record.seats) as [Seat, (typeof record.seats)["N"]][]).find(
    ([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId,
  )?.[0];
  if (!seat) return NextResponse.json({ tell: null, reason: "not seated" });

  // Bounded below the function's own limit, so a slow BEN ends as an honest
  // "no answer" instead of a killed function.
  const client = () => createBenTableClient({ timeoutMs: 50_000 });

  if (state.phase === "auction") {
    if (state.turn !== seat) return NextResponse.json({ tell: null, reason: "not your turn" });

    let result;
    try {
      result = await client().bid({
        hand: handToPbn(state.hands[seat]),
        seat,
        dealer: state.dealer,
        vul: vulToBen(state.vul),
        ctx: auctionToCtx(state.auction),
      });
    } catch (e) {
      console.warn(`[coach] ben-tell bid failed for ${sessionId}: ${(e as Error).message}`);
      return NextResponse.json({ tell: null, reason: "unreachable" });
    }

    const legal = legalCalls(state.auction, seat);
    if (!legal.has(result.bid)) return NextResponse.json({ tell: null, reason: "no answer" });

    const top = result.candidates.find((c) => c.call === result.bid);
    const tell: BenTell = {
      kind: "call",
      action: callLabel(result.bid),
      ...(top?.explanation ? { because: top.explanation } : {}),
      ...(typeof top?.insta_score === "number" ? { score: top.insta_score } : {}),
      alternatives: result.candidates
        .filter((c) => c.call !== result.bid && legal.has(c.call))
        .slice(0, 4)
        .map((c) => ({
          action: callLabel(c.call),
          ...(typeof c.insta_score === "number" ? { score: c.insta_score } : {}),
          ...(c.explanation ? { because: c.explanation } : {}),
        })),
    };
    return NextResponse.json({ tell });
  }

  if (state.phase !== "play") return NextResponse.json({ tell: null, reason: "not playing" });

  // Whose card is on the table now, and is it the caller's to choose?
  // Declarer chooses dummy's cards too; dummy chooses nothing.
  const declarer = state.contract?.declarer;
  const dummySeat = declarer ? PARTNER[declarer] : undefined;
  const mine = state.turn === seat || (seat === declarer && state.turn === dummySeat);
  if (!mine) return NextResponse.json({ tell: null, reason: "not your turn" });

  const played = playedToBen(state);
  let result;
  try {
    // The opening lead: dummy is still hidden, /lead sees only the hand.
    // Later cards: BEN infers who is on play from `played`; at dummy's turn we
    // ask as the declarer — the seat the caller actually controls — matching
    // benSeat's own decider.
    result =
      played === ""
        ? await client().lead({
            hand: handToPbn(originalHand(state, seat)),
            seat,
            dealer: state.dealer,
            vul: vulToBen(state.vul),
            ctx: auctionToCtx(state.auction),
          })
        : await client().play({
            hand: handToPbn(originalHand(state, seat)),
            dummy: dummySeat ? handToPbn(originalHand(state, dummySeat)) : "",
            seat,
            dealer: state.dealer,
            vul: vulToBen(state.vul),
            ctx: auctionToCtx(state.auction),
            played,
          });
  } catch (e) {
    console.warn(`[coach] ben-tell play failed for ${sessionId}: ${(e as Error).message}`);
    return NextResponse.json({ tell: null, reason: "unreachable" });
  }

  // Engine-legal cards for the hand on play — the guard on everything BEN
  // says. An illegal or unreadable answer is "no answer", never an error.
  const legalSet = new Set(legalPlays(state, state.turn).map((c) => `${c.suit}${c.rank}`));
  const chosen = parseBenCard(result.card);
  if (!chosen || !legalSet.has(`${chosen.suit}${chosen.rank}`)) {
    return NextResponse.json({ tell: null, reason: "no answer" });
  }

  const top = result.candidates.find((c) => c.card === result.card);
  const tell: BenTell = {
    kind: "card",
    action: cardLabel(chosen),
    ...(top?.explanation ? { because: top.explanation } : {}),
    ...(typeof top?.insta_score === "number" ? { score: top.insta_score } : {}),
    alternatives: result.candidates
      .flatMap((c) => {
        if (!c.card || c.card === result.card) return [];
        const card = parseBenCard(c.card);
        // Candidates outside the legal set never reach the client — they can
        // only be noise, and noise wearing a card face reads as advice.
        if (!card || !legalSet.has(`${card.suit}${card.rank}`)) return [];
        return [
          {
            action: cardLabel(card),
            ...(typeof c.insta_score === "number" ? { score: c.insta_score } : {}),
            ...(c.explanation ? { because: c.explanation } : {}),
          },
        ];
      })
      .slice(0, 4),
  };
  return NextResponse.json({ tell });
}
