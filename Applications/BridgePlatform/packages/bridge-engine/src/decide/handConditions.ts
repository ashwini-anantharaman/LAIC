// Hand-condition evaluation (Knowledge Rework §2): the boolean expression
// tree over typed predicates, with $setting numeric-parameter resolution —
// an agreement's inline range setting binds straight into its own rules.

import { isContractBid, type Call, type Hand, type Suit } from "@bridge/events";
import type { HcpRange, SettingValue } from "@bridge/config";
import type { HandCondition, HandPredicate, NumParam, SuitRef } from "@bridge/kb";
import { hcp, isBalanced, longestSuits, suitCounts } from "../hand";
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
    case "rho_bid_suit":
      return suitOfBid(env.facts.rhoLast);
    case "own_longest_suit":
      return longestSuits(hand)[0]?.suit ?? null;
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
  return false;
}

export function evalCondition(cond: HandCondition, hand: Hand, env: ConditionEnv): boolean {
  if ("all" in cond) return cond.all.every((c) => evalCondition(c, hand, env));
  if ("any" in cond) return cond.any.some((c) => evalCondition(c, hand, env));
  if ("not" in cond) return !evalCondition(cond.not, hand, env);
  return evalPredicate(cond, hand, env);
}
