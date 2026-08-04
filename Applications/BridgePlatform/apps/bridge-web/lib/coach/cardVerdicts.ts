// Building the full-information position the card assessors read.
//
// Was once also the card-verdict producer and the on-demand hint's own fallback
// chain; both have moved to the panel (assessors/) and to advise.ts, so what
// remains is the translation from a bridge GameState into the shape the coaching
// component's card-play evaluator expects.
//
// A CALL is judged against the partnership's rulebook: the system either has an
// agreement for the position or it doesn't. A CARD has no rulebook. What makes
// a card right is what it costs, which means searching the play out — so this
// is the one place the coaching component knows something the bridge platform
// does not, and the one place the host defers to it rather than the reverse.
//
// Two layers, in the component's `LiveCardPlayEvaluator`:
//   · the DOUBLE-DUMMY ORACLE, authoritative, but only on end-game positions.
//     `LocalDoubleDummyOracle` caps itself at a few cards per hand, because an
//     alpha-beta search over thirteen is not something to run while a page
//     renders. Past the cap it returns nothing rather than guessing.
//   · the PRINCIPLE ENGINE, which names the tactic ("second hand low") and
//     covers the rest of the hand.
// Where neither can judge, the result is low-confidence "acceptable", which the
// intervention policy reads as silence. The coach speaks only when it knows.
//
// FULL INFORMATION. The evaluator is given every hand, including ones the
// learner cannot see — that is what makes the verdict true rather than a guess
// from one seat. Nothing it returns may leak an unseen card: the note says
// whether the play cost a trick, never what is sitting in West's hand.

import { createKbDecider, legalPlays } from "@bridge/engine";
import type { GameState, KbPlayerConfig } from "@bridge/engine";
import { partnerOf } from "@bridge/events";
import type { Card, Seat } from "@bridge/events";
import { cardCode } from "./tableEvents";
import type { CompiledKb } from "@bridge/kb";
import type { EvaluationResult, VerdictSource } from "@laic/coach/core";
export { partnershipSystem } from "./verdicts";
import {
  LiveCardPlayEvaluator,
  LocalDoubleDummyOracle,
  runPrinciples,
  type LiveCardPlayState,
} from "@laic/coach/domains/bridge";

/** "S:AK4 H:Q2 D:- C:9" — the shape the evaluator parses. */
const SUIT_ORDER = ["S", "H", "D", "C"] as const;
function renderHand(cards: readonly Card[]): string {
  return SUIT_ORDER.map((suit) => {
    const ranks = cards
      .filter((c) => c.suit === suit)
      .sort((a, b) => b.rank - a.rank)
      .map((c) => "..23456789TJQKA"[c.rank])
      .join("");
    return `${suit}:${ranks || "-"}`;
  }).join(" ");
}

const STRAIN_LABEL: Record<string, string> = { S: "S", H: "H", D: "D", C: "C", N: "NT" };

/**
 * Which skill a card exercises. Coarse, from the role and whether we're on
 * lead — the same compromise the bidding side makes, for the same reason:
 * nothing links compiled knowledge to the taxonomy's skill ids yet.
 */
function skillFor(role: string, onLead: boolean, tricksPlayed: number): string {
  if (role === "declarer") return tricksPlayed === 0 ? "sk_declarer_planning" : "sk_declarer_planning";
  if (onLead && tricksPlayed === 0) return "sk_opening_leads";
  return "sk_following_suit";
}

/**
 * Build the full-information position the evaluator needs, from the game state
 * as it was BEFORE the card was played.
 */
export function livePlayState(
  state: GameState,
  learnerSeat: Seat,
  playFromSeat: Seat,
): LiveCardPlayState | null {
  const contract = state.contract;
  if (!contract) return null;

  const dummySeat = partnerOf(contract.declarer);
  const trick = state.tricks[state.tricks.length - 1];
  const inProgress = trick && trick.plays.length > 0 && trick.plays.length < 4;
  const role: LiveCardPlayState["role"] =
    learnerSeat === contract.declarer
      ? "declarer"
      : learnerSeat === dummySeat
        ? "dummy"
        : "defender";

  const hands = Object.fromEntries(
    (["N", "E", "S", "W"] as Seat[]).map((s) => [s, renderHand(state.hands[s] ?? [])]),
  ) as LiveCardPlayState["hands"];

  const legal = legalPlays(state, playFromSeat).map(cardCode);
  if (!legal.length) return null;

  return {
    contract: `${contract.level}${STRAIN_LABEL[contract.strain] ?? contract.strain}`,
    trump: (contract.strain === "N" ? "NT" : contract.strain) as LiveCardPlayState["trump"],
    declarer: contract.declarer,
    learnerSeat,
    role,
    dummySeat,
    hands,
    playFromSeat,
    toLead: !inProgress,
    ...(inProgress && trick.plays[0] ? { leadSuit: trick.plays[0].card.suit } : {}),
    trickSoFar: inProgress
      ? trick.plays.map((p) => ({ seat: p.seat, card: cardCode(p.card) }))
      : [],
    legalCards: legal,
    tricksPlayed: state.tricks.filter((t) => t.plays.length === 4).length,
  };
}
