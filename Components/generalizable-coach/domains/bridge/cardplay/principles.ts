/**
 * Zone 3 — Bridge: the card-play principle engine.
 *
 * Deterministic, full-information checks for a handful of HIGH-CONFIDENCE
 * play-of-the-hand principles (Watson). These serve two roles in the hybrid
 * design:
 *   - explanation: name the principle behind the double-dummy verdict, and
 *   - fallback correctness: when no solver is wired, flag only clear, safe
 *     violations and stay silent otherwise (better no advice than wrong advice).
 *
 * Every principle is intentionally conservative — it only fires when the
 * situation is unambiguous — and severities are capped modestly, leaving the
 * oracle to assign major/critical when it is present.
 */
import type { Seat } from "../plugin/events.js";
import type { Severity } from "../../../platform/types/index.js";
import { parseHand, type SuitLetter } from "../evaluator/hand.js";
import * as C from "../plugin/constants.js";
import type { LiveCardPlayState, TrickCard } from "./LiveCardPlayEvaluator.js";

const RANK_ORDER = "23456789TJQKA";

export function rankValue(card: string): number {
  return RANK_ORDER.indexOf(card.slice(1).toUpperCase());
}
export function suitOf(card: string): string {
  return card[0]?.toUpperCase() ?? "";
}
function partnerOf(seat: Seat): Seat {
  return ({ N: "S", S: "N", E: "W", W: "E" } as const)[seat];
}
function isHonor(card: string): boolean {
  return rankValue(card) >= RANK_ORDER.indexOf("J"); // J, Q, K, A
}

/** Rank values the seat holds in a suit, high→low, from the full-info hands. */
function holdingIn(state: LiveCardPlayState, seat: Seat, suit: string): number[] {
  const hand = state.hands[seat];
  if (!hand) return [];
  const ranks = parseHand(hand).suits[suit as SuitLetter] ?? "";
  return [...ranks.toUpperCase().replace(/10/g, "T")]
    .map((ch) => RANK_ORDER.indexOf(ch))
    .filter((v) => v >= 0)
    .sort((a, b) => b - a);
}

/** Index of the card currently winning the trick, honoring trump. */
function winningIndex(trick: TrickCard[], trump: string, leadSuit: string): number {
  let best = 0;
  for (let i = 1; i < trick.length; i++) {
    if (beats(trick[i].card, trick[best].card, trump, leadSuit)) best = i;
  }
  return best;
}
/** Does `a` beat `b` given trump + the led suit? */
function beats(a: string, b: string, trump: string, leadSuit: string): boolean {
  const sa = suitOf(a);
  const sb = suitOf(b);
  const aTrump = trump !== "NT" && sa === trump;
  const bTrump = trump !== "NT" && sb === trump;
  if (aTrump && !bTrump) return true;
  if (!aTrump && bTrump) return false;
  if (aTrump && bTrump) return rankValue(a) > rankValue(b);
  // neither trump: only a card of the led suit can win
  if (sa !== leadSuit) return false;
  if (sb !== leadSuit) return true;
  return rankValue(a) > rankValue(b);
}

export interface PrincipleFinding {
  /** did the play follow the principle? */
  ok: boolean;
  concept: string;
  skill: string;
  /** machine-readable rationale (fed to the LLM/heuristic phrasing) */
  reason: string;
  severityIfWrong: Severity;
}

/**
 * Evaluate the applicable principle(s) for the learner's played card.
 * Returns findings only for principles that clearly apply; an empty array
 * means "no high-confidence principle in play here".
 */
export function runPrinciples(
  state: LiveCardPlayState,
  played: string,
): PrincipleFinding[] {
  const pos = state.trickSoFar.length; // 0=lead,1=2nd,2=3rd,3=4th
  if (pos === 0) return []; // opening/on-lead principles out of scope for v1

  const leadSuit = state.leadSuit ?? suitOf(state.trickSoFar[0].card);
  const learner = state.playFromSeat;

  // Principles below concern following the led suit; ruffs/discards are the
  // oracle's job.
  if (suitOf(played) !== leadSuit) return [];

  const trump = state.trump;
  const winIdx = winningIndex(state.trickSoFar, trump, leadSuit);
  const winner = state.trickSoFar[winIdx];
  const winnerIsPartner = winner.seat === partnerOf(learner);
  const holding = holdingIn(state, learner, leadSuit); // high→low
  const playedVal = rankValue(played);
  const lowest = holding.length ? holding[holding.length - 1] : playedVal;

  const findings: PrincipleFinding[] = [];

  if (pos === 3) {
    // Fourth hand: win as cheaply as possible; never overtake a winning partner.
    if (winnerIsPartner) {
      const ok = playedVal === lowest || !isHonor(played);
      findings.push({
        ok,
        concept: C.CONCEPT_COUNTING,
        skill: C.SKILL_PLAN_TRICKS,
        reason: ok
          ? "Partner was already winning the trick, so playing low preserves your high cards."
          : "Partner was already winning the trick — there was no need to spend a high card; play low.",
        severityIfWrong: "minor",
      });
    } else {
      // Opponent winning: if you can win cheaply, do; don't overpay.
      const winners = holding.filter((v) => beats(leadSuit + RANK_ORDER[v], winner.card, trump, leadSuit));
      if (winners.length > 0) {
        const cheapestWin = Math.min(...winners);
        const ok = playedVal === cheapestWin;
        findings.push({
          ok,
          concept: C.CONCEPT_COUNTING,
          skill: C.SKILL_PLAN_TRICKS,
          reason: ok
            ? "You won the trick with the cheapest card that does the job."
            : "When you can win, take it as cheaply as possible — a lower winning card keeps the rest as tricks.",
          severityIfWrong: "minor",
        });
      }
    }
  } else if (pos === 2) {
    // Third hand high (partner led): contribute your highest when it can matter.
    const leaderIsPartner = state.trickSoFar[0].seat === partnerOf(learner);
    if (leaderIsPartner && holding.length > 0) {
      const highest = holding[0];
      const highestCard = leadSuit + RANK_ORDER[highest];
      const highestBeatsCurrent = beats(highestCard, winner.card, trump, leadSuit);
      // Only flag when a higher card would actually have won/pushed the trick.
      if (highestBeatsCurrent && playedVal < highest) {
        findings.push({
          ok: false,
          concept: C.CONCEPT_THIRD_HAND_HIGH,
          skill: C.SKILL_THIRD_HAND_HIGH,
          reason:
            "Third hand high — partner led, and your higher card would have contributed to the trick; playing low let the opponents off cheaply.",
          severityIfWrong: "moderate",
        });
      } else {
        findings.push({
          ok: true,
          concept: C.CONCEPT_THIRD_HAND_HIGH,
          skill: C.SKILL_THIRD_HAND_HIGH,
          reason: "Third hand high — you contributed appropriately on partner's lead.",
          severityIfWrong: "moderate",
        });
      }
    }
  } else if (pos === 1) {
    // Second hand low: don't rise with an honor over a small card without cause.
    const ledCard = state.trickSoFar[0].card;
    const ledLow = !isHonor(ledCard);
    if (ledLow && holding.length >= 2) {
      const ok = !(isHonor(played) && playedVal > lowest);
      findings.push({
        ok,
        concept: C.CONCEPT_SECOND_HAND_LOW,
        skill: C.SKILL_SECOND_HAND_LOW,
        reason: ok
          ? "Second hand low — you didn't waste an honor on a small card."
          : "Second hand low — a small card was led, so rising with an honor here usually just gives declarer a trick; play low.",
        severityIfWrong: "minor",
      });
    }
  }

  return findings;
}
