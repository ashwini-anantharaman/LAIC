// BEN's silent reference line — the platform's `full_ben` baseline, run in the
// browser.
//
// On the platform a background job plays every board through BEN once and
// stores the result; a solo challenge has no background and no store, so the
// same line is folded here, in the page, while the learner plays their own. It
// is the identical computation: one GameState, all four seats answered by
// `decide`, through @bridge/engine's pure reducer.
//
// WHERE IT STOPS is not this module's decision — `challengeBoardIsOver` in
// @bridge/challenges owns that rule, and a bidding-only line therefore stops
// the moment the auction closes, without playing a card BEN would never be
// asked for.
//
// DEGRADE, NEVER BREAK. An unreachable BEN, an illegal answer or an aborted
// board all return null, and the results surface then says "BEN has not played
// this board" rather than inventing one.

import {
  applyEvent,
  initialState,
  legalCalls,
  legalPlays,
  resultLabel,
  scoreBoard,
  type GameState,
} from "@bridge/engine";
import { challengeBoardIsOver } from "@bridge/challenges";
import { contractLabel, type Card, type Seat, type Vul } from "@bridge/events";
import type { BridgeDecide } from "./BridgeTable";
import type { SoloLine } from "./soloResults";

/** A hard ceiling on the fold. An auction is at most a few dozen calls and a
 *  played board is 52 cards; anything past this is a decider that has stopped
 *  making progress, and a tutorial must not spin. */
const MAX_STEPS = 400;

export interface BenReferenceInput {
  hands: Record<Seat, Card[]>;
  dealer: Seat;
  vul: Vul;
  /** The seat the LEARNER sits — the side the raw score is signed for. */
  humanSeat: Seat;
  biddingOnly: boolean;
  decide: BridgeDecide;
  /** Set true to abandon the line (the board changed, the block unmounted). */
  cancelled: () => boolean;
}

export async function runBenReferenceLine(input: BenReferenceInput): Promise<SoloLine | null> {
  const { hands, dealer, vul, humanSeat, biddingOnly, decide, cancelled } = input;
  let state: GameState = initialState("ben-reference", dealer, vul, hands);
  let seq = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (cancelled()) return null;
    if (challengeBoardIsOver(state.phase, biddingOnly)) break;

    const seat = state.turn;
    let answer;
    try {
      answer = await decide(state, seat);
    } catch {
      return null;
    }
    if (cancelled()) return null;
    if (!answer) return null;

    if (state.phase === "auction" && answer.call) {
      if (!legalCalls(state.auction, seat).has(answer.call)) return null;
      state = applyEvent(state, {
        category: "bid-event",
        seq: (seq += 1),
        ts: Date.now(),
        boardRef: state.boardRef,
        seat,
        call: answer.call,
        fallback: false,
      });
      continue;
    }
    if (state.phase === "play" && answer.card) {
      const card = answer.card;
      if (!legalPlays(state, seat).some((c) => c.suit === card.suit && c.rank === card.rank))
        return null;
      state = applyEvent(state, {
        category: "play-event",
        seq: (seq += 1),
        ts: Date.now(),
        boardRef: state.boardRef,
        seat,
        card,
        fallback: false,
      });
      continue;
    }
    // An answer of the wrong kind for the phase is as unusable as none at all.
    return null;
  }

  return freezeLine(state, humanSeat, biddingOnly);
}

/**
 * A finished GameState as a comparable line. The raw score is flipped for an
 * E/W seat so the figure always reads "good for the learner" — the convention
 * `ChallengePlay.rawScore` uses, and the reason two lines can be compared at
 * all. NO SCORE IS NOT A SCORE OF ZERO: a bidding-only line leaves it absent.
 */
export function freezeLine(
  state: GameState,
  humanSeat: Seat,
  biddingOnly: boolean,
): SoloLine {
  const score = biddingOnly ? null : scoreBoard(state);
  const rawScore = score
    ? humanSeat === "N" || humanSeat === "S"
      ? score.nsScore
      : -score.nsScore
    : undefined;
  return {
    contract: state.contract ?? null,
    ...(state.contract ? { contractLabel: contractLabel(state.contract) } : {}),
    ...(score ? { resultLabel: resultLabel(score) } : {}),
    ...(rawScore === undefined ? {} : { rawScore }),
  };
}
