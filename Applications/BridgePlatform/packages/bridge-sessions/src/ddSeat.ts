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
//   BIDS — the knowledge base the session is already playing on, through the
//   ordinary KB decider. Seeing all four hands is no help in an auction (a bid
//   has to be readable by partner, and a robot that peeked would bid slams
//   nobody could explain), so the auction stays honest: this seat bids from the
//   same written rules a learner is being taught, and it does it instantly.
//
// Unlike BEN this needs nothing injected — no endpoint, no key, no service — so
// SessionService builds it directly and it works in tests and offline.

import { createKbDecider, legalPlays, type Decision, type GameState } from "@bridge/engine";
import type { Call, Card, Seat } from "@bridge/events";
import type { CompiledKb } from "@bridge/kb";

import { solvePlay } from "./ddsSolver";
import type { SeatDecider } from "./index";

/** The label a double dummy seat carries — plates and traces show it. */
export const DD_SEAT_LABEL = "Solver · double dummy";

const RANK_NAME: Record<number, string> = {
  10: "T", 11: "J", 12: "Q", 13: "K", 14: "A",
};
const cardName = (c: Card) => `${c.suit}${RANK_NAME[c.rank] ?? c.rank}`;

export interface DdDeciderOptions {
  compiled: CompiledKb;
  sessionId: string;
  seat: Seat;
}

/**
 * A seat that bids from the knowledge base and plays double dummy.
 *
 * `decidePlay` is asked for the DUMMY's card too — the engine routes the
 * dummy's turn to the declarer's decider — which needs no special handling
 * here, because the solver is given the acting seat and can see every hand
 * either way.
 */
export function createDdDecider(options: DdDeciderOptions): SeatDecider {
  const { compiled, sessionId, seat } = options;
  // The auction runs on the session's own KB. An empty pack list means "every
  // pack this knowledge base has", which is what an unconfigured robot should
  // know — see effectiveSurface().
  const bidder = createKbDecider({
    compiled,
    player: { enabledPackIds: [], settingOverrides: {}, decisionPolicyId: "first_match" },
    seed: `${sessionId}_${seat}_dd`,
  });

  return {
    decideBid: (state: GameState, actingSeat: Seat): Promise<Decision<Call>> =>
      bidder.decideBid(state, actingSeat),

    async decidePlay(state: GameState, actingSeat: Seat): Promise<Decision<Card>> {
      // The engine's own view of what may be played is the guard on everything
      // the solver returns.
      const legal = legalPlays(state, actingSeat);
      const legalSet = new Set(legal.map((c) => `${c.suit}${c.rank}`));

      const degrade = async (why: string): Promise<Decision<Card>> => {
        const d = await bidder.decidePlay(state, actingSeat);
        return { ...d, fallback: true, reason: `${why} — ${d.reason}` };
      };

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
