// Hand-condition evaluation (Knowledge Rework §2): the boolean expression
// tree over typed predicates, with $setting numeric-parameter resolution —
// an agreement's inline range setting binds straight into its own rules.

import { isContractBid, rankLabel, type Call, type Hand, type Rank, type Suit } from "@bridge/events";
import type { HcpRange, SettingValue } from "@bridge/config";
import type { HandCondition, HandPredicate, NumParam, SuitRef } from "@bridge/kb";
import { hcp, isBalanced, longestSuits, shape, suitCounts } from "../hand";
import type { SeatAuctionFacts } from "./auctionContext";

export interface ConditionEnv {
  values: Record<string, SettingValue>;
  facts: SeatAuctionFacts;
  /** Setting keys consulted during evaluation (cited on the trace). */
  consulted: Set<string>;
}

export function resolveNumParam(param: NumParam, env: ConditionEnv): number | undefined {
  if (typeof param === "number") return param;
  env.consulted.add(param.$setting);
  const value = env.values[param.$setting];
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const range = value as HcpRange;
    return param.field === "high" ? range.high : range.low;
  }
  return undefined;
}

const suitOfBid = (call: Call | undefined): Suit | null => {
  if (!call || !isContractBid(call)) return null;
  const strain = call[1];
  return strain === "N" ? null : (strain as Suit);
};

export function resolveSuitRef(ref: SuitRef, hand: Hand, env: ConditionEnv): Suit | null {
  switch (ref) {
    case "partner_last_bid_suit":
      return suitOfBid(env.facts.partnerLast);
    case "partner_first_bid_suit":
      return suitOfBid(env.facts.partnerFirstBid);
    case "rho_bid_suit":
      return suitOfBid(env.facts.rhoLast);
    case "lho_bid_suit":
      return suitOfBid(env.facts.lhoLast);
    case "own_longest_suit":
      return longestSuits(hand)[0]?.suit ?? null;
    case "own_shortest_suit": {
      const counts = suitCounts(hand);
      let best: Suit | null = null;
      for (const suit of ["S", "H", "D", "C"] as Suit[]) {
        if (best === null || counts[suit] < counts[best]) best = suit;
      }
      return best;
    }
    case "own_first_bid_suit":
      return suitOfBid(env.facts.ownFirstBid);
    case "only_unbid_suit": {
      const unbid = (["S", "H", "D", "C"] as Suit[]).filter(
        (su) => !env.facts.suitsBid.includes(su),
      );
      return unbid.length === 1 ? unbid[0]! : null;
    }
    case "own_last_bid_suit":
      return suitOfBid(env.facts.ownLastBid);
    default:
      return ref;
  }
}

/** HCP + long-suit points (1 per card beyond the 4th in each suit). */
export function totalPoints(hand: Hand): number {
  const counts = suitCounts(hand);
  const long = Object.values(counts).reduce((sum, n) => sum + Math.max(0, n - 4), 0);
  return hcp(hand) + long;
}

function inRange(
  actual: number,
  range: { min?: NumParam; max?: NumParam },
  env: ConditionEnv,
): boolean {
  const min = range.min !== undefined ? resolveNumParam(range.min, env) : undefined;
  const max = range.max !== undefined ? resolveNumParam(range.max, env) : undefined;
  if (min !== undefined && actual < min) return false;
  if (max !== undefined && actual > max) return false;
  return true;
}

/** Two of top three / three of top five honors in the suit. */
function suitQualityOk(
  hand: Hand,
  suit: Suit,
  quality: "two_of_top_three" | "three_of_top_five",
): boolean {
  const ranks = hand.filter((c) => c.suit === suit).map((c) => c.rank);
  if (quality === "two_of_top_three")
    return ranks.filter((r) => r >= 12).length >= 2;
  return ranks.filter((r) => r >= 10).length >= 3;
}

/** A=always, K+1 card, Q+2, J+3 — the standard stopper approximation. */
function hasStopper(hand: Hand, suit: Suit): boolean {
  const cards = hand.filter((c) => c.suit === suit);
  const has = (rank: number) => cards.some((c) => c.rank === rank);
  if (has(14)) return true;
  if (has(13) && cards.length >= 2) return true;
  if (has(12) && cards.length >= 3) return true;
  if (has(11) && cards.length >= 4) return true;
  return false;
}

/** RKCB keycards: the four aces plus the ref suit's king. */
function keycardCount(hand: Hand, suit: Suit): number {
  return (
    hand.filter((c) => c.rank === 14).length +
    (hand.some((c) => c.suit === suit && c.rank === 13) ? 1 : 0)
  );
}

/**
 * Estimated playing tricks. Per suit: A=1; K=1 with two-plus cards (0.5
 * alone); Q=0.5 with three-plus; +1 per card beyond the third when the suit
 * is headed by a top-three honor (a ragged long suit promises nothing).
 */
function playingTricks(hand: Hand): number {
  let tricks = 0;
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    const cards = hand.filter((c) => c.suit === suit);
    const has = (r: number) => cards.some((c) => c.rank === r);
    if (has(14)) tricks += 1;
    if (has(13)) tricks += cards.length >= 2 ? 1 : 0.5;
    if (has(12) && cards.length >= 3) tricks += 0.5;
    if (has(14) || has(13) || has(12)) tricks += Math.max(0, cards.length - 3);
  }
  return tricks;
}

function evalPredicate(pred: HandPredicate, hand: Hand, env: ConditionEnv): boolean {
  if ("hcp" in pred) return inRange(hcp(hand), pred.hcp, env);
  if ("totalPoints" in pred) return inRange(totalPoints(hand), pred.totalPoints, env);
  if ("suitLength" in pred) {
    const suit = resolveSuitRef(pred.suitLength.suit, hand, env);
    if (!suit) return false;
    return inRange(suitCounts(hand)[suit], pred.suitLength, env);
  }
  if ("longestSuitAmong" in pred) {
    const longest = longestSuits(hand);
    return longest.some((l) => pred.longestSuitAmong.suits.includes(l.suit));
  }
  if ("balanced" in pred) return isBalanced(hand) === pred.balanced;
  if ("suitQuality" in pred) {
    const suit = resolveSuitRef(pred.suitQuality.suit, hand, env);
    return suit !== null && suitQualityOk(hand, suit, pred.suitQuality.quality);
  }
  if ("hasStopperIn" in pred) {
    const suit = resolveSuitRef(pred.hasStopperIn.suit, hand, env);
    return suit !== null && hasStopper(hand, suit);
  }
  if ("aces" in pred)
    return inRange(hand.filter((c) => c.rank === 14).length, pred.aces, env);
  if ("kings" in pred)
    return inRange(hand.filter((c) => c.rank === 13).length, pred.kings, env);
  if ("keycards" in pred) {
    const suit = resolveSuitRef(pred.keycards.suit, hand, env);
    if (!suit) return false;
    return inRange(keycardCount(hand, suit), pred.keycards, env);
  }
  if ("playingTricks" in pred) return inRange(playingTricks(hand), pred.playingTricks, env);
  if ("holds" in pred) {
    const suit = resolveSuitRef(pred.holds.suit, hand, env);
    return suit !== null && hand.some((c) => c.suit === suit && c.rank === pred.holds.rank);
  }
  return false;
}

export function evalCondition(cond: HandCondition, hand: Hand, env: ConditionEnv): boolean {
  if ("all" in cond) return cond.all.every((c) => evalCondition(c, hand, env));
  if ("any" in cond) return cond.any.some((c) => evalCondition(c, hand, env));
  if ("not" in cond) return !evalCondition(cond.not, hand, env);
  return evalPredicate(cond, hand, env);
}

// ---------------------------------------------------------------------------
// Failure explanation — needed-vs-held strings for the decision trace
// ---------------------------------------------------------------------------

const SUIT_GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

const SUIT_REF_TEXT: Record<Exclude<SuitRef, Suit>, string> = {
  partner_last_bid_suit: "partner's suit",
  partner_first_bid_suit: "partner's first suit",
  rho_bid_suit: "RHO's suit",
  lho_bid_suit: "LHO's suit",
  own_longest_suit: "my longest suit",
  own_shortest_suit: "my shortest suit",
  own_first_bid_suit: "my first bid suit",
  own_last_bid_suit: "my last bid suit",
  only_unbid_suit: "the fourth (only unbid) suit",
};

const suitRefText = (ref: SuitRef): string =>
  ref in SUIT_GLYPH ? SUIT_GLYPH[ref as Suit] : SUIT_REF_TEXT[ref as Exclude<SuitRef, Suit>];

/** "15–17" | "15+" | "at most 17" (collapses min===max to the bare number). */
function rangeText(range: { min?: NumParam; max?: NumParam }, env: ConditionEnv): string {
  const min = range.min !== undefined ? resolveNumParam(range.min, env) : undefined;
  const max = range.max !== undefined ? resolveNumParam(range.max, env) : undefined;
  if (min !== undefined && max !== undefined) return min === max ? `${min}` : `${min}–${max}`;
  if (min !== undefined) return `${min}+`;
  if (max !== undefined) return `at most ${max}`;
  return "any";
}

/** The requirement half of a needed-vs-held string (no "needed", no held). */
function describePredicate(pred: HandPredicate, env: ConditionEnv): string {
  if ("hcp" in pred) return `${rangeText(pred.hcp, env)} HCP`;
  if ("totalPoints" in pred) return `${rangeText(pred.totalPoints, env)} total points`;
  if ("suitLength" in pred)
    return `${rangeText(pred.suitLength, env)} cards in ${suitRefText(pred.suitLength.suit)}`;
  if ("longestSuitAmong" in pred)
    return `longest suit among ${pred.longestSuitAmong.suits.map((s) => SUIT_GLYPH[s]).join("/")}`;
  if ("balanced" in pred) return pred.balanced ? "a balanced hand" : "an unbalanced hand";
  if ("suitQuality" in pred) {
    const which =
      pred.suitQuality.quality === "two_of_top_three"
        ? "two of the top three"
        : "three of the top five";
    return `${which} honors in ${suitRefText(pred.suitQuality.suit)}`;
  }
  if ("hasStopperIn" in pred) return `a stopper in ${suitRefText(pred.hasStopperIn.suit)}`;
  if ("aces" in pred) return `${rangeText(pred.aces, env)} aces`;
  if ("kings" in pred) return `${rangeText(pred.kings, env)} kings`;
  if ("keycards" in pred)
    return `${rangeText(pred.keycards, env)} keycards for ${suitRefText(pred.keycards.suit)}`;
  if ("holds" in pred) {
    const rank = rankLabel(pred.holds.rank as Rank);
    const suit = pred.holds.suit;
    return suit in SUIT_GLYPH ? `the ${SUIT_GLYPH[suit as Suit]}${rank}` : `the ${rank} of ${suitRefText(suit)}`;
  }
  if ("playingTricks" in pred) return `${rangeText(pred.playingTricks, env)} playing tricks`;
  return "unknown condition";
}

/** Requirement summary of a whole subtree (for any/not combinators). */
function describeCondition(cond: HandCondition, env: ConditionEnv): string {
  if ("all" in cond) return cond.all.map((c) => describeCondition(c, env)).join(" and ");
  if ("any" in cond) return `one of: ${cond.any.map((c) => describeCondition(c, env)).join(" / ")}`;
  if ("not" in cond) return `not ${describeCondition(cond.not, env)}`;
  return describePredicate(cond, env);
}

/** One failing leaf → "needed <requirement>, held <actual>". */
function explainPredicate(pred: HandPredicate, hand: Hand, env: ConditionEnv): string {
  const needed = `needed ${describePredicate(pred, env)}`;
  // Predicates on an unresolvable contextual suit fail with no held value.
  if ("suitLength" in pred) {
    const suit = resolveSuitRef(pred.suitLength.suit, hand, env);
    if (!suit) return `${needed} (no such suit yet)`;
    return `${needed}, held ${suitCounts(hand)[suit]}`;
  }
  if ("keycards" in pred) {
    const suit = resolveSuitRef(pred.keycards.suit, hand, env);
    if (!suit) return `${needed} (no such suit yet)`;
    return `${needed}, held ${keycardCount(hand, suit)}`;
  }
  if ("suitQuality" in pred || "hasStopperIn" in pred || "holds" in pred) {
    const ref =
      "suitQuality" in pred
        ? pred.suitQuality.suit
        : "hasStopperIn" in pred
          ? pred.hasStopperIn.suit
          : pred.holds.suit;
    return resolveSuitRef(ref, hand, env) ? needed : `${needed} (no such suit yet)`;
  }
  if ("hcp" in pred) return `${needed}, held ${hcp(hand)}`;
  if ("totalPoints" in pred) return `${needed}, held ${totalPoints(hand)}`;
  if ("longestSuitAmong" in pred)
    return `${needed}, held longest ${longestSuits(hand).map((l) => SUIT_GLYPH[l.suit]).join("/")}`;
  if ("balanced" in pred) return `${needed}, held ${shape(hand).join("-")}`;
  if ("aces" in pred) return `${needed}, held ${hand.filter((c) => c.rank === 14).length}`;
  if ("kings" in pred) return `${needed}, held ${hand.filter((c) => c.rank === 13).length}`;
  if ("playingTricks" in pred) return `${needed}, held ${playingTricks(hand)}`;
  return needed;
}

/** Human strings for every failing leaf of a condition tree — same walk as
 *  evalCondition, but reporting instead of deciding. Only called on rules
 *  whose conditions already failed. */
export function explainFailures(cond: HandCondition, hand: Hand, env: ConditionEnv): string[] {
  if (evalCondition(cond, hand, env)) return []; // defensive: nothing failed
  if ("all" in cond) return cond.all.flatMap((c) => explainFailures(c, hand, env));
  if ("any" in cond)
    return [`needed one of: ${cond.any.map((c) => describeCondition(c, env)).join(" / ")}`];
  if ("not" in cond) return [`needed not: ${describeCondition(cond.not, env)}`];
  return [explainPredicate(cond, hand, env)];
}
