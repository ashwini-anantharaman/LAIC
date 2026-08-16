// The double dummy seat (2026-08-15) — a table character that plays fast.
//
// WHY IT EXISTS. BEN is a neural engine behind an HTTP call: 20-45s to choose a
// card, plus a cold start. A board is 39 robot cards, so a full deal against BEN
// is a long wait. This seat answers in milliseconds with no network at all,
// which turns "leave it running and come back" into "play a board".
//
// THE SPLIT. Bidding and card play are different problems and this seat treats
// them differently:
//
//   CARDS — the double dummy solver (ddsSolver.ts, the real DDS in WebAssembly),
//   which sees all four hands and plays the card that wins the most tricks
//   against best defence. Exact, everywhere in the hand, in milliseconds. Very
//   strong, and knowingly unfair: it knows where every card is. That is what
//   "double dummy" means and it is the price of the speed.
//
//   BIDS — a small self-contained natural bidder (ddBidder.ts). Seeing all four
//   hands is no help in an auction — a bid has to be readable by partner, and a
//   robot that peeked would bid slams nobody could explain — so the solver is
//   not consulted for calls at all.
//
//   IT DOES NOT USE THE KNOWLEDGE BASE. It used to, and that was a mistake: the
//   KB house player is shelved, and challenges forbid seating it "not even as a
//   fallback", so bidding through it quietly reintroduced the shelved player
//   into scored boards. The KB is not to be used here at all (owner,
//   2026-08-16).
//
// So this seat needs nothing injected and nothing configured — no endpoint, no
// key, no service, and no compiled knowledge base. SessionService builds it
// directly and it works in tests and offline.

import { legalCalls, legalPlays, type Decision, type GameState } from "@bridge/engine";
import type { Call, Card, Seat } from "@bridge/events";

import { chooseCall, fallbackCard } from "./ddBidder";
import { solvePlay } from "./ddsSolver";
import type { SeatDecider } from "./index";

/** The label a double dummy seat carries — plates and traces show it. */
export const DD_SEAT_LABEL = "Solver · double dummy";

const RANK_NAME: Record<number, string> = {
  10: "T", 11: "J", 12: "Q", 13: "K", 14: "A",
};
const cardName = (c: Card) => `${c.suit}${RANK_NAME[c.rank] ?? c.rank}`;

export interface DdDeciderOptions {
  /** Only used to label traces; this seat has no per-session configuration. */
  sessionId?: string;
  seat?: Seat;
}

/**
 * A seat that bids from the knowledge base and plays double dummy.
 *
 * `decidePlay` is asked for the DUMMY's card too — the engine routes the
 * dummy's turn to the declarer's decider — which needs no special handling
 * here, because the solver is given the acting seat and can see every hand
 * either way.
 */
export function createDdDecider(_options: DdDeciderOptions = {}): SeatDecider {
  return {
    async decideBid(state: GameState, actingSeat: Seat): Promise<Decision<Call>> {
      const chosen = chooseCall(state, actingSeat);
      return {
        action: chosen.call,
        candidates: [...legalCalls(state.auction, actingSeat)],
        trace: [],
        citedSettings: [],
        facts: { source: "natural-bidder" },
        reason: chosen.why,
        rejected: [],
        fallback: false,
      };
    },

    async decidePlay(state: GameState, actingSeat: Seat): Promise<Decision<Card>> {
      // The engine's own view of what may be played is the guard on everything
      // the solver returns.
      const legal = legalPlays(state, actingSeat);
      const legalSet = new Set(legal.map((c) => `${c.suit}${c.rank}`));

      // The gap-filler is a rule, not another decider — reaching for the KB
      // here would put the shelved house player back on the board by the side
      // door, which is exactly what this seat must never do.
      const degrade = (why: string): Decision<Card> => ({
        action: fallbackCard(state, actingSeat, legal),
        candidates: [...legal],
        trace: [],
        citedSettings: [],
        facts: { source: "double-dummy", degraded: true },
        reason: `${why} — played the lowest legal card`,
        rejected: [],
        fallback: true,
      });

      let solved: Awaited<ReturnType<typeof solvePlay>>;
      try {
        solved = await solvePlay(state, actingSeat);
      } catch (e) {
        // A solver that throws must not take the table down with it.
        return degrade(`The solver failed (${(e as Error).message})`);
      }
      // solvePlay REFUSES a position it should not answer about rather than
      // guessing, and that refusal has to stay a refusal here.
      if (!solved) return degrade("The solver could not read this position");
      const best = solved;
      if (!legalSet.has(`${best.card.suit}${best.card.rank}`))
        return degrade(`The solver chose ${cardName(best.card)}, which is not legal here`);

      const plural = (n: number) => `${n} trick${n === 1 ? "" : "s"}`;
      return {
        action: best.card,
        candidates: legal.length ? [...legal] : [best.card],
        trace: [],
        citedSettings: [],
        facts: { source: "double-dummy", tricks: best.tricks },
        reason: `Double dummy — takes ${plural(best.tricks)} from here against best defence`,
        rejected: best.candidates
          .filter((c) => c.tricks !== best.tricks)
          .slice(0, 4)
          .map((c) => ({ action: cardName(c.card), why: plural(c.tricks) })),
        fallback: false,
      };
    },
  };
}
