// Decision shape, ported from the bridgebot prototype (src/player/decision.ts).
// Pure data — the Game controller turns it into a logic-event + action-event.

import type {
  CitedSetting,
  Facts,
  RejectedAction,
  RuleEval,
} from "@bridge/events";

/** A rule that matched during deliberation (the selection pool). */
export interface MatchedRule<A> {
  ruleId: string;
  title: string;
  action: A;
}

/** The output of a player deliberation. `A` is Call (bidding) or Card (play). */
export interface Decision<A> {
  action: A;
  candidates: A[];
  /** Every rule considered in the ordered chain, matched or skipped. */
  trace: RuleEval[];
  /** Flattened settings the decision relied on (from the acted rule). */
  citedSettings: CitedSetting[];
  facts: Facts;
  reason: string;
  rejected: RejectedAction[];
  /** True when no rule matched and the fixed safe default was used. */
  fallback: boolean;
  /** All concurrently matched rules (coach mode offers these). */
  matches?: MatchedRule<A>[];
  /** The rule the selection policy chose (== the acted rule). */
  matchedRuleId?: string;
}
