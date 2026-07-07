/**
 * Zone 3 — Bridge implementation: rule-based Beginner 1 bidding evaluator.
 *
 * Implements EvaluatorContract<BridgeGameState, BridgeBidAction>. Judges an
 * opening bid or a response to partner's 1-of-a-suit opening against
 * Standard American / SAYC-like beginner rules. Produces machine-readable
 * EvaluationResult; never learner-facing text.
 */
import type {
  EvaluatorContract,
  EvaluationResult,
  Correctness,
  Severity,
} from "../../../platform/types/index.js";
import type { BridgeGameState, BridgeBidAction } from "../plugin/events.js";
import {
  parseHand,
  isBalanced,
  longestMajor,
  parseBid,
  normalizeBid,
  biddableAtOneLevel,
  strainRank,
  type ParsedHand,
  type SuitLetter,
} from "./hand.js";
import * as C from "../plugin/constants.js";

interface Recommendation {
  /** the single best call, normalized (e.g. "1S", "1NT", "P") */
  best: string;
  /** reasonable alternatives that count as "acceptable" */
  acceptable: string[];
  conceptIds: string[];
  skillIds: string[];
  /** machine-readable rationale */
  reason: string;
}

const MINORS: SuitLetter[] = ["D", "C"];

/** Choose the opening call for a hand with no prior bidding. */
function recommendOpening(hand: ParsedHand): Recommendation {
  const { hcp } = hand;
  const balanced = isBalanced(hand);
  const major = longestMajor(hand);
  const has5Major = major.suit !== null && major.length >= 5;

  const baseConcepts = [
    C.CONCEPT_OPENING_BID,
    C.CONCEPT_HCP,
    C.CONCEPT_HAND_EVAL_BASIC,
  ];
  const baseSkills = [
    C.SKILL_OPENING_1SUIT,
    C.SKILL_HCP_COUNTING,
    C.SKILL_HAND_SHAPE,
  ];

  if (hcp < 12) {
    return {
      best: "P",
      acceptable: [],
      conceptIds: [C.CONCEPT_OPENING_BID, C.CONCEPT_HCP],
      skillIds: [C.SKILL_PASS_MINIMUM, C.SKILL_HCP_COUNTING],
      reason: `Only ${hcp} HCP — below the 12-point opening threshold, so Pass.`,
    };
  }

  if (hcp >= 15 && hcp <= 17 && balanced && !has5Major) {
    return {
      best: "1NT",
      acceptable: [],
      conceptIds: [...baseConcepts, C.CONCEPT_HAND_BALANCED],
      skillIds: [C.SKILL_OPENING_1SUIT, C.SKILL_HAND_SHAPE, C.SKILL_HCP_COUNTING],
      reason: `${hcp} HCP, balanced, no 5-card major — open 1NT.`,
    };
  }

  if (has5Major) {
    const suit = major.suit as SuitLetter;
    return {
      best: `1${suit}`,
      acceptable: [],
      conceptIds: baseConcepts,
      skillIds: baseSkills,
      reason: `${hcp} HCP with a ${major.length}-card major — open 1${suit}.`,
    };
  }

  // 12–21, no 5-card major → longest minor; tie: 4-4 → 1D, 3-3 → 1C.
  const d = hand.lengths.D;
  const c = hand.lengths.C;
  let openMinor: SuitLetter;
  if (d > c) openMinor = "D";
  else if (c > d) openMinor = "C";
  else openMinor = d >= 4 ? "D" : "C"; // equal length: 4-4 → D, 3-3 → C
  return {
    best: `1${openMinor}`,
    acceptable: [],
    conceptIds: baseConcepts,
    skillIds: baseSkills,
    reason: `${hcp} HCP, no 5-card major — open 1${openMinor} (longest minor).`,
  };
}

/** Choose the response to partner's 1-of-a-suit opening. */
function recommendResponse(
  hand: ParsedHand,
  openerBid: string,
): Recommendation {
  const opener = parseBid(openerBid);
  const openerStrain = opener.strain as SuitLetter;
  const { hcp } = hand;
  const support = hand.lengths[openerStrain] ?? 0;
  const isMajorOpen = openerStrain === "H" || openerStrain === "S";

  if (hcp < 6) {
    return {
      best: "P",
      acceptable: [],
      conceptIds: [C.CONCEPT_RESPONSE_1LEVEL, C.CONCEPT_HCP],
      skillIds: [C.SKILL_PASS_MINIMUM, C.SKILL_HCP_COUNTING],
      reason: `Only ${hcp} HCP — too weak to respond, so Pass.`,
    };
  }

  // Limit raise: 10–12 HCP, 4+ support.
  if (support >= 4 && hcp >= 10 && hcp <= 12) {
    return {
      best: `3${openerStrain}`,
      acceptable: [],
      conceptIds: [C.CONCEPT_RAISE, C.CONCEPT_RESPONSE_1LEVEL],
      skillIds: [C.SKILL_LIMIT_RAISE],
      reason: `${hcp} HCP with ${support}-card support — limit raise to 3${openerStrain}.`,
    };
  }

  // Simple raise: 6–9 HCP, 3+ support.
  if (support >= 3 && hcp >= 6 && hcp <= 9) {
    // With a biddable 4-card suit at the 1-level, bidding the new suit is a
    // defensible alternative for beginners.
    const acceptable: string[] = [];
    const ns = newSuitAtOneLevel(hand, openerStrain);
    if (ns) acceptable.push(ns);
    return {
      best: `2${openerStrain}`,
      acceptable,
      conceptIds: [C.CONCEPT_RAISE, C.CONCEPT_RESPONSE_1LEVEL],
      skillIds: [C.SKILL_SIMPLE_RAISE],
      reason: `${hcp} HCP with ${support}-card support — simple raise to 2${openerStrain}.`,
    };
  }

  // New suit at the 1-level: 6+ HCP, 4+ cards, higher-ranking than opener.
  const newSuit = newSuitAtOneLevel(hand, openerStrain);
  if (newSuit && hcp >= 6) {
    return {
      best: newSuit,
      acceptable: [],
      conceptIds: [C.CONCEPT_RESPONSE_1LEVEL],
      skillIds: [C.SKILL_NEW_SUIT_1LEVEL],
      reason: `${hcp} HCP with a biddable 4-card suit — respond ${newSuit} (new suit at the 1-level).`,
    };
  }

  // 1NT response: 6–10 HCP, no fit, no new suit biddable at the 1-level.
  if (hcp >= 6 && hcp <= 10) {
    const ntSkill = isMajorOpen ? C.SKILL_RESPONSE_1M_NT : C.SKILL_RESPONSE_NT;
    return {
      best: "1NT",
      acceptable: [],
      conceptIds: [C.CONCEPT_NT_RESPONSE, C.CONCEPT_RESPONSE_1LEVEL],
      skillIds: [ntSkill],
      reason: `${hcp} HCP, no fit and no new suit at the 1-level — respond 1NT.`,
    };
  }

  // 11–12 HCP, no fit, no new suit — beyond strict Beginner 1; 1NT is the
  // safe fallback and we treat it as acceptable rather than "correct".
  const ntSkill = isMajorOpen ? C.SKILL_RESPONSE_1M_NT : C.SKILL_RESPONSE_NT;
  return {
    best: "1NT",
    acceptable: [],
    conceptIds: [C.CONCEPT_NT_RESPONSE, C.CONCEPT_RESPONSE_1LEVEL],
    skillIds: [ntSkill],
    reason: `${hcp} HCP, no fit and no new suit at the 1-level — 1NT is the best available Beginner 1 response.`,
  };
}

/**
 * Return the best new suit biddable at the 1-level (4+ cards, higher-ranking
 * than opener's suit), or null. Prefers the longest; ties broken up-the-line
 * (lowest-ranking suit first, standard responder style).
 */
function newSuitAtOneLevel(
  hand: ParsedHand,
  openerStrain: string,
): string | null {
  const candidates: SuitLetter[] = ["S", "H", "D", "C"].filter(
    (s) =>
      hand.lengths[s as SuitLetter] >= 4 &&
      biddableAtOneLevel(s, openerStrain),
  ) as SuitLetter[];
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const lenDiff = hand.lengths[b] - hand.lengths[a];
    if (lenDiff !== 0) return lenDiff;
    // equal length → up the line (lower rank first)
    return strainRank(a) - strainRank(b);
  });
  return `1${candidates[0]}`;
}

/** Grade the learner's bid against the recommendation. */
function grade(
  learnerBid: string,
  rec: Recommendation,
): { correctness: Correctness; severity: Severity } {
  const bid = normalizeBid(learnerBid);
  if (bid === rec.best) return { correctness: "correct", severity: "minor" };
  if (rec.acceptable.includes(bid))
    return { correctness: "acceptable", severity: "minor" };

  const learner = parseBid(bid);
  const best = parseBid(rec.best);

  // Passing when action is required (or acting when Pass was right) is serious.
  if (learner.isPass && !best.isPass)
    return { correctness: "incorrect", severity: "major" };
  if (!learner.isPass && best.isPass)
    return { correctness: "incorrect", severity: "major" };

  // Right strain, wrong level (e.g. simple raise vs limit raise) — defensible.
  if (learner.strain === best.strain && learner.level !== best.level)
    return { correctness: "suboptimal", severity: "moderate" };

  // Wrong minor when a minor was called for (1C vs 1D) — minor error.
  const bothMinors =
    ["C", "D"].includes(learner.strain) && ["C", "D"].includes(best.strain);
  if (bothMinors && learner.level === best.level)
    return { correctness: "suboptimal", severity: "minor" };

  // Everything else: wrong strain / wrong denomination — clearly incorrect.
  // Grade severity by how far the level is off.
  const levelGap = Math.abs(learner.level - best.level);
  const severity: Severity = levelGap >= 2 ? "critical" : "major";
  return { correctness: "incorrect", severity };
}

/** Does the auction have any non-pass call yet? */
function firstOpeningBid(auction: string[]): string | null {
  for (const call of auction) {
    if (!parseBid(call).isPass) return normalizeBid(call);
  }
  return null;
}

export class BridgeEvaluator
  implements EvaluatorContract<BridgeGameState, BridgeBidAction>
{
  async evaluate(
    _state: BridgeGameState,
    action: BridgeBidAction,
  ): Promise<EvaluationResult> {
    const hand = parseHand(action.hand);
    const auction = action.auctionSoFar ?? [];
    const opening = firstOpeningBid(auction);

    const rec =
      opening === null
        ? recommendOpening(hand)
        : recommendResponse(hand, opening);

    const { correctness, severity } = grade(action.bid, rec);

    const explanation =
      correctness === "correct"
        ? rec.reason
        : `${rec.reason} Learner bid ${normalizeBid(action.bid)}.`;

    return {
      correctness,
      confidence: 0.95,
      bestAction: rec.best,
      alternativeActions: rec.acceptable,
      conceptIds: rec.conceptIds,
      skillIds: rec.skillIds,
      explanation,
      severity,
    };
  }
}
