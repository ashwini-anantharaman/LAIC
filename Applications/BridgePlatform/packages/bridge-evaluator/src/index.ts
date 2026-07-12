/**
 * @bridge/evaluator
 *
 * Judges committed HUMAN actions against the configured system (Bridge plan
 * §14): structured judgment only, never coaching language (§14.3). Reuses the
 * interpreter to learn what the system WOULD have done and which rules the
 * learner's action matched or missed.
 *
 * Anti-overclaiming (§13.7): when the system itself has no opinion (fallback)
 * the judgment is "insufficient_context"; v0 card-play judgments are capped
 * at "questionable" with low confidence because the play rules are
 * deliberately crude (gap_bn_play_technique). Never an LLM.
 */

import type { SettingValue } from "@bridge/config";
import {
  interpretBid,
  interpretPlay,
  legalCalls,
  legalPlays,
  type BridgeRulePackage,
  type GameState,
} from "@bridge/engine";
import { cardId, type Call, type Seat } from "@bridge/events";

export type EvaluationJudgment =
  | "aligned"
  | "reasonable_alternative"
  | "questionable"
  | "not_system_aligned"
  | "illegal"
  | "insufficient_context"
  | "needs_expert_review";

export interface BridgeActionEvaluation {
  evaluationId: string;
  bridgeSessionId: string;
  /** seq of the evaluated action event within the session. */
  actionEventSeq: number;
  seat: Seat;
  kind: "bid" | "play";
  evaluatedAction: string;
  evaluationMode: "system_alignment";
  judgment: EvaluationJudgment;
  /** What the system would have done in the same position. */
  systemAction: string;
  /** Rules whose resolved action equals the learner's action. */
  matchedRuleIds: string[];
  /** Rules the system would have acted on instead. */
  missedRuleIds: string[];
  confidence: number;
}

export interface EvaluatorContext {
  pkg: BridgeRulePackage;
  values: Record<string, SettingValue>;
}

export function evaluateBidAction(
  stateBefore: GameState,
  seat: Seat,
  chosen: Call,
  ctx: EvaluatorContext,
  ids: { bridgeSessionId: string; actionEventSeq: number },
): BridgeActionEvaluation {
  const base = {
    evaluationId: `ev_${ids.bridgeSessionId}_${ids.actionEventSeq}`,
    bridgeSessionId: ids.bridgeSessionId,
    actionEventSeq: ids.actionEventSeq,
    seat,
    kind: "bid" as const,
    evaluatedAction: chosen,
    evaluationMode: "system_alignment" as const,
  };
  if (!legalCalls(stateBefore.auction, seat).has(chosen))
    return { ...base, judgment: "illegal", systemAction: "", matchedRuleIds: [], missedRuleIds: [], confidence: 1 };

  const d = interpretBid(stateBefore, seat, { pkg: ctx.pkg, values: ctx.values });
  const ruleById = new Map(ctx.pkg.bidRules.map((r) => [r.ruleId, r]));
  const alternatives = (d.matches ?? []).filter(
    (m) => m.action === chosen && !ruleById.get(m.ruleId)?.noAgreement,
  );
  const winnerNoAgreement = d.matchedRuleId
    ? Boolean(ruleById.get(d.matchedRuleId)?.noAgreement)
    : false;

  if (d.fallback || winnerNoAgreement)
    // The system has no (real) opinion here — do not judge the learner.
    return { ...base, judgment: "insufficient_context", systemAction: d.action, matchedRuleIds: [], missedRuleIds: [], confidence: 0.3 };
  if (chosen === d.action)
    return {
      ...base,
      judgment: "aligned",
      systemAction: d.action,
      matchedRuleIds: d.matchedRuleId ? [d.matchedRuleId] : [],
      missedRuleIds: [],
      confidence: 0.9,
    };
  if (alternatives.length)
    // A concurrently matched rule supports the learner's action.
    return {
      ...base,
      judgment: "reasonable_alternative",
      systemAction: d.action,
      matchedRuleIds: alternatives.map((m) => m.ruleId),
      missedRuleIds: d.matchedRuleId ? [d.matchedRuleId] : [],
      confidence: 0.7,
    };
  return {
    ...base,
    judgment: "not_system_aligned",
    systemAction: d.action,
    matchedRuleIds: [],
    missedRuleIds: d.matchedRuleId ? [d.matchedRuleId] : [],
    confidence: 0.7,
  };
}

export function evaluatePlayAction(
  stateBefore: GameState,
  seat: Seat,
  chosenCardId: string,
  ctx: EvaluatorContext,
  ids: { bridgeSessionId: string; actionEventSeq: number },
): BridgeActionEvaluation {
  const base = {
    evaluationId: `ev_${ids.bridgeSessionId}_${ids.actionEventSeq}`,
    bridgeSessionId: ids.bridgeSessionId,
    actionEventSeq: ids.actionEventSeq,
    seat,
    kind: "play" as const,
    evaluatedAction: chosenCardId,
    evaluationMode: "system_alignment" as const,
  };
  const legal = legalPlays(stateBefore, seat);
  if (!legal.some((c) => cardId(c) === chosenCardId))
    return { ...base, judgment: "illegal", systemAction: "", matchedRuleIds: [], missedRuleIds: [], confidence: 1 };

  const d = interpretPlay(stateBefore, seat, { pkg: ctx.pkg, values: ctx.values });
  const systemCard = cardId(d.action);
  if (d.fallback)
    return { ...base, judgment: "insufficient_context", systemAction: systemCard, matchedRuleIds: [], missedRuleIds: [], confidence: 0.2 };
  if (chosenCardId === systemCard)
    return {
      ...base,
      judgment: "aligned",
      systemAction: systemCard,
      matchedRuleIds: d.matchedRuleId ? [d.matchedRuleId] : [],
      missedRuleIds: [],
      confidence: 0.6, // v0 play rules are crude — even alignment is weak evidence
    };
  // Anti-overclaim: v0 play technique is a declared gap; a differing card is
  // at most "questionable", never a confident mismatch.
  return {
    ...base,
    judgment: "questionable",
    systemAction: systemCard,
    matchedRuleIds: [],
    missedRuleIds: d.matchedRuleId ? [d.matchedRuleId] : [],
    confidence: 0.3,
  };
}
