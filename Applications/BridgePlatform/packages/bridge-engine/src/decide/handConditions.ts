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
    case "agreed_suit":
      // Facts-only (partnership inference); absent → unresolvable (rule skips).
      return env.facts.inference?.agreedSuit ?? null;
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
  // ---- partnership predicates (Pillar A) — all absence-tolerant -------------
  if ("partnerShownHcp" in pred) {
    const ps = env.facts.inference?.partnerShown;
    const min = num(pred.partnerShownHcp.min, env);
    const max = num(pred.partnerShownHcp.max, env);
    if (min !== undefined && (ps?.hcpMin ?? 0) < min) return false;
    if (max !== undefined && (ps?.hcpMax === undefined || ps.hcpMax > max)) return false;
    return true;
  }
  if ("partnerShownLength" in pred) {
    const suit = resolveSuitRef(pred.partnerShownLength.suit, hand, env);
    if (!suit) return false;
    const ps = env.facts.inference?.partnerShown;
    const min = num(pred.partnerShownLength.min, env);
    const max = num(pred.partnerShownLength.max, env);
    if (min !== undefined && (ps?.suitMin[suit] ?? 0) < min) return false;
    if (max !== undefined && (ps?.suitMax[suit] === undefined || ps.suitMax[suit]! > max)) return false;
    return true;
  }
  if ("combinedHcp" in pred) {
    const ps = env.facts.inference?.partnerShown;
    const own = hcp(hand);
    const min = num(pred.combinedHcp.min, env);
    const max = num(pred.combinedHcp.max, env);
    if (min !== undefined && own + (ps?.hcpMin ?? 0) < min) return false;
    // A combined ceiling needs partner's ceiling; unknown → unbounded → can't pass.
    if (max !== undefined && (ps?.hcpMax === undefined || own + ps.hcpMax > max)) return false;
    return true;
  }
  if ("combinedKeycards" in pred) {
    const range = combinedKeycardRange(hand, env);
    if (!range) return false;
    const min = num(pred.combinedKeycards.min, env);
    const max = num(pred.combinedKeycards.max, env);
    if (min !== undefined && range.min < min) return false;
    if (max !== undefined && range.max > max) return false;
    return true;
  }
  if ("keycardsMissing" in pred) {
    const range = combinedKeycardRange(hand, env);
    if (!range) return false;
    const missMin = KEYCARDS_TOTAL - range.max;
    const missMax = KEYCARDS_TOTAL - range.min;
    const min = num(pred.keycardsMissing.min, env);
    const max = num(pred.keycardsMissing.max, env);
    if (min !== undefined && missMin < min) return false;
    if (max !== undefined && missMax > max) return false;
    return true;
  }
  if ("fitEstablished" in pred) {
    const minCombined = num(pred.fitEstablished.minCombined, env) ?? 8;
    const which = pred.fitEstablished.suit;
    let candidates: Suit[];
    if (which === "any_major") candidates = ["H", "S"];
    else if (which === undefined || which === "any") candidates = ["S", "H", "D", "C"];
    else {
      const s = resolveSuitRef(which, hand, env);
      if (!s) return false;
      candidates = [s];
    }
    const counts = suitCounts(hand);
    const ps = env.facts.inference?.partnerShown;
    return candidates.some((suit) => counts[suit] + (ps?.suitMin[suit] ?? 0) >= minCombined);
  }
  if ("unshownSupport" in pred) {
    const suit = resolveSuitRef(pred.unshownSupport.suit, hand, env);
    if (!suit) return false;
    const target = num(pred.unshownSupport.min, env) ?? 1;
    const own = suitCounts(hand)[suit];
    const shown = env.facts.inference?.selfShown.suitMin[suit] ?? 0;
    return own >= target && shown < target;
  }
  return false;
}

/** Resolve a numeric parameter, or undefined when absent. */
function num(p: NumParam | undefined, env: ConditionEnv): number | undefined {
  return p !== undefined ? resolveNumParam(p, env) : undefined;
}

const KEYCARDS_TOTAL = 5; // four aces + the trump king (RKCB)

/**
 * The combined-keycard range for the agreed suit: my keycards + partner's
 * decoded possibilities. null when there is no agreed suit or partner has shown
 * no keycards (an ask/response the inference could decode).
 */
function combinedKeycardRange(
  hand: Hand,
  env: ConditionEnv,
): { min: number; max: number } | null {
  const inf = env.facts.inference;
  const suit = inf?.agreedSuit;
  const kc = inf?.partnerShownKeycards;
  if (!suit || !kc || !kc.length) return null;
  const own = keycardCount(hand, suit);
  return { min: own + Math.min(...kc), max: own + Math.max(...kc) };
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
  agreed_suit: "the agreed suit",
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
  if ("partnerShownHcp" in pred)
    return `partner has shown ${rangeText(pred.partnerShownHcp, env)} HCP`;
  if ("partnerShownLength" in pred)
    return `partner has shown ${rangeText(pred.partnerShownLength, env)} cards in ${suitRefText(pred.partnerShownLength.suit)}`;
  if ("combinedHcp" in pred) return `${rangeText(pred.combinedHcp, env)} combined HCP`;
  if ("combinedKeycards" in pred)
    return `${rangeText(pred.combinedKeycards, env)} combined keycards`;
  if ("keycardsMissing" in pred)
    return `${rangeText(pred.keycardsMissing, env)} keycards missing`;
  if ("fitEstablished" in pred) {
    const which = pred.fitEstablished.suit;
    const where =
      which === "any_major"
        ? "a major"
        : which === undefined || which === "any"
          ? "any suit"
          : suitRefText(which);
    const min = pred.fitEstablished.minCombined;
    const n = min !== undefined ? (resolveNumParam(min, env) ?? 8) : 8;
    return `a ${n}+ card fit in ${where}`;
  }
  if ("unshownSupport" in pred)
    return `undisclosed ${rangeText({ min: pred.unshownSupport.min }, env)} support in ${suitRefText(pred.unshownSupport.suit)}`;
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
  const shownText = (min?: number, max?: number): string =>
    min === undefined && max === undefined
      ? "nothing"
      : min !== undefined && max !== undefined
        ? min === max
          ? `${min}`
          : `${min}–${max}`
        : min !== undefined
          ? `${min}+`
          : `at most ${max}`;
  if ("partnerShownHcp" in pred) {
    const ps = env.facts.inference?.partnerShown;
    return `${needed}, partner has shown ${shownText(ps?.hcpMin, ps?.hcpMax)}`;
  }
  if ("combinedHcp" in pred) {
    const ps = env.facts.inference?.partnerShown;
    return `${needed}, held ${hcp(hand)} + partner ${shownText(ps?.hcpMin, ps?.hcpMax)}`;
  }
  if ("partnerShownLength" in pred) {
    const suit = resolveSuitRef(pred.partnerShownLength.suit, hand, env);
    if (!suit) return `${needed} (no such suit yet)`;
    const ps = env.facts.inference?.partnerShown;
    return `${needed}, partner has shown ${shownText(ps?.suitMin[suit], ps?.suitMax[suit])}`;
  }
  if ("combinedKeycards" in pred || "keycardsMissing" in pred) {
    const range = combinedKeycardRange(hand, env);
    return range ? `${needed}, combined ${range.min}–${range.max}` : `${needed} (no keycard answer yet)`;
  }
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
