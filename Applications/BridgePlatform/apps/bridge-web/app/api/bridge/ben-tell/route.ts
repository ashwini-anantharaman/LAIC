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
import type { BenCardResult } from "@/lib/benSeat";
import { createBenTableClient, originalHand, parseBenCard, playedToBen } from "@/lib/benSeat";
import { auctionToCtx, handToPbn, pbnRank, vulToBen } from "@/lib/benchmark";
import { callLabel, cardLabel } from "@/lib/coach/position";
import { corsOptions, withCors } from "@/lib/cors";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";
import { decisionIsTheirs, playsFrom } from "@/lib/coach/turn";
import { partnerOf } from "@bridge/events";

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

export const OPTIONS = corsOptions("GET");

export async function GET(request: Request): Promise<NextResponse> {
  return withCors(await handle(request), "GET");
}

async function handle(request: Request): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
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

  // ?at=<auction index> — BEN's view of a PAST call of the caller's own, for
  // the end-of-board takeaway card. Two gates on top of the seat check: the
  // auction must be OVER (a read of an earlier position, served live, could
  // still steer the decision in front of them), and the indexed call must be
  // the caller's — BEN reasoning from an opponent's seat reads a hand the
  // caller never held.
  const atParam = url.searchParams.get("at");
  if (atParam !== null) {
    const at = Number(atParam);
    if (!Number.isInteger(at) || at < 0 || at >= state.auction.length) {
      return NextResponse.json({ tell: null, reason: "no such call" });
    }
    if (state.phase === "auction") {
      return NextResponse.json({ tell: null, reason: "still bidding" });
    }
    if (state.auction[at]!.seat !== seat) {
      return NextResponse.json({ tell: null, reason: "not your call" });
    }

    const prefix = state.auction.slice(0, at);
    let result;
    try {
      // The hand AS DEALT — by the time the auction is over, the play may
      // have emptied state.hands.
      result = await client().bid({
        hand: handToPbn(originalHand(state, seat)),
        seat,
        dealer: state.dealer,
        vul: vulToBen(state.vul),
        ctx: auctionToCtx(prefix),
      });
    } catch (e) {
      console.warn(`[coach] ben-tell past bid failed for ${sessionId}: ${(e as Error).message}`);
      return NextResponse.json({ tell: null, reason: "unreachable" });
    }
    return NextResponse.json(callTell(result, legalCalls(prefix, seat)));
  }

  // ?play=<trick>-<index> — BEN's view of a PAST card of the caller's own,
  // for the History screen's "what if". The same shape of gates as ?at=:
  // the BOARD must be over (an earlier position's read, served mid-play,
  // could still steer the cards left to play — simulations leak layout), and
  // the indexed card must have been the caller's DECISION — their own card,
  // or dummy's while they were the declarer choosing it.
  const playParam = url.searchParams.get("play");
  if (playParam !== null) {
    const m = /^(\d+)-(\d+)$/.exec(playParam);
    const ti = m ? Number(m[1]) : -1;
    const pi = m ? Number(m[2]) : -1;
    const trick = state.tricks[ti];
    const target = trick?.plays[pi];
    if (!target) return NextResponse.json({ tell: null, reason: "no such card" });
    if (state.phase === "auction" || state.phase === "play") {
      return NextResponse.json({ tell: null, reason: "board still live" });
    }
    const declarer = state.contract?.declarer;
    const dummySeat = declarer ? PARTNER[declarer] : undefined;
    const wasMine =
      (target.seat === seat && seat !== dummySeat) ||
      (seat === declarer && target.seat === dummySeat);
    if (!wasMine) return NextResponse.json({ tell: null, reason: "not your card" });

    // The play BEFORE this card, in play order — BEN replays it to the spot.
    const before = state.tricks.flatMap((t, i) =>
      t.plays.filter((_, j) => i < ti || (i === ti && j < pi)).map((p) => p),
    );
    const prefix = before.map((p) => `${p.card.suit}${pbnRank(p.card.rank)}`).join("");

    // Legality at that spot, from the public record alone: the cards the
    // hand still HELD (dealt minus already played), following the led suit
    // where it could — the whole of bridge's play legality.
    const playedByHand = new Set(
      before.filter((p) => p.seat === target.seat).map((p) => `${p.card.suit}${p.card.rank}`),
    );
    const held = originalHand(state, target.seat).filter(
      (c) => !playedByHand.has(`${c.suit}${c.rank}`),
    );
    const ledSuit = pi > 0 ? trick!.plays[0]!.card.suit : null;
    const follow = ledSuit ? held.filter((c) => c.suit === ledSuit) : [];
    const legalThen = new Set((follow.length ? follow : held).map((c) => `${c.suit}${c.rank}`));

    // Ask as the seat the caller actually controlled — the declarer when the
    // card was dummy's — matching benSeat's own decider.
    const requestSeat = declarer && target.seat === dummySeat ? declarer : target.seat;
    let result;
    try {
      result =
        prefix === ""
          ? // The opening lead: dummy was still hidden, /lead sees only the hand.
            await client().lead({
              hand: handToPbn(originalHand(state, target.seat)),
              seat: target.seat,
              dealer: state.dealer,
              vul: vulToBen(state.vul),
              ctx: auctionToCtx(state.auction),
            })
          : await client().play({
              hand: handToPbn(originalHand(state, requestSeat)),
              dummy: dummySeat ? handToPbn(originalHand(state, dummySeat)) : "",
              seat: requestSeat,
              dealer: state.dealer,
              vul: vulToBen(state.vul),
              ctx: auctionToCtx(state.auction),
              played: prefix,
            });
    } catch (e) {
      console.warn(`[coach] ben-tell past play failed for ${sessionId}: ${(e as Error).message}`);
      return NextResponse.json({ tell: null, reason: "unreachable" });
    }
    return NextResponse.json(cardTell(result, legalThen));
  }

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

    return NextResponse.json(callTell(result, legalCalls(state.auction, seat)));
  }

  if (state.phase !== "play") return NextResponse.json({ tell: null, reason: "not playing" });

  // Whose card is on the table now, and is it the caller's to choose? Declarer
  // chooses dummy's cards too, and a learner dealt dummy plays the declarer's
  // hand when that chair is a robot's — lib/coach/turn.ts owns both.
  if (!decisionIsTheirs(record, state, seat))
    return NextResponse.json({ tell: null, reason: "not your turn" });
  const from = playsFrom(record, state, seat);

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
            hand: handToPbn(originalHand(state, from)),
            seat: from,
            dealer: state.dealer,
            vul: vulToBen(state.vul),
            ctx: auctionToCtx(state.auction),
          })
        : await client().play({
            // AS THE CHAIR THEY PLAY FROM. At dummy's turn the question is the
            // declarer's to answer, and under a takeover that chair is not the
            // one the learner was dealt.
            hand: handToPbn(originalHand(state, from)),
            dummy: handToPbn(originalHand(state, partnerOf(from))),
            seat: from,
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
  return NextResponse.json(cardTell(result, legalSet));
}

/**
 * BEN's answer to a card position, shaped for the panel — shared by the live
 * "what would BEN do now" branch and the History screen's past-position read,
 * so the two can never phrase the same answer differently. `legalSet` holds
 * "S7"-style keys for the cards legal at THAT spot.
 */
function cardTell(
  result: BenCardResult,
  legalSet: ReadonlySet<string>,
): { tell: BenTell } | { tell: null; reason: string } {
  const chosen = parseBenCard(result.card);
  if (!chosen || !legalSet.has(`${chosen.suit}${chosen.rank}`)) {
    return { tell: null, reason: "no answer" };
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
  return { tell };
}

/**
 * BEN's answer to a bidding position, shaped for the panel — shared by the
 * live "what would BEN do now" branch and the takeaway's past-position read,
 * so the two can never phrase the same answer differently.
 */
function callTell(
  result: Awaited<ReturnType<ReturnType<typeof createBenTableClient>["bid"]>>,
  legal: ReturnType<typeof legalCalls>,
): { tell: BenTell } | { tell: null; reason: string } {
  if (!legal.has(result.bid)) return { tell: null, reason: "no answer" };

  const top = result.candidates.find((c) => c.call === result.bid);
  return {
    tell: {
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
    },
  };
}
