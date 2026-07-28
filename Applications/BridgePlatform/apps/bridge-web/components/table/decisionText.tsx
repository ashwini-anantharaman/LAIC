// The decisions rail in English (2026-07-22 rework, R24): resolve compiled
// ruleIds back to their labels/provenance and phrase WHY a rule applied (or
// was skipped) the way the item editor narrates rules. Pure functions over
// the pinned compile — server-only by import site, no directive needed.

import type { SettingValue } from "@bridge/config";
import type { RuleEval } from "@bridge/events";
import type {
  CompiledAuctionRule,
  CompiledFallback,
  CompiledForcingRule,
  CompiledKb,
  CompiledLeadRule,
  CompiledPlayRule,
  HandCondition,
} from "@bridge/kb";
import type { ReactNode } from "react";
import {
  conditionPhrases,
  contextPhrases,
  joinNodes,
  leadSentence,
  playRuleSentence,
} from "@/components/kb/ruleEnglish";

/** A compiled rule found by id, tagged with which list it came from. */
export type RuleInfo =
  | { kind: "auction"; rule: CompiledAuctionRule }
  | { kind: "forcing"; rule: CompiledForcingRule }
  | { kind: "lead"; rule: CompiledLeadRule }
  | { kind: "play"; rule: CompiledPlayRule }
  | { kind: "fallback"; rule: CompiledFallback };

/** ruleId → rule, across all five compiled lists. */
export function buildRuleIndex(compiled: CompiledKb): Map<string, RuleInfo> {
  const index = new Map<string, RuleInfo>();
  for (const rule of compiled.auctionRules) index.set(rule.ruleId, { kind: "auction", rule });
  for (const rule of compiled.forcingRules) index.set(rule.ruleId, { kind: "forcing", rule });
  for (const rule of compiled.leadRules) index.set(rule.ruleId, { kind: "lead", rule });
  for (const rule of compiled.playRules) index.set(rule.ruleId, { kind: "play", rule });
  for (const rule of compiled.fallbacks) index.set(rule.ruleId, { kind: "fallback", rule });
  return index;
}

/** Short display name — fallbacks compile without a label, so describe them. */
export function ruleLabel(info: RuleInfo): string {
  if (info.kind === "fallback") {
    const b = info.rule.fallback;
    return b.phase === "auction"
      ? "fallback: pass"
      : b.phase === "opening_lead"
        ? `fallback lead: ${b.behavior.replace(/_/g, " ")}`
        : "fallback: lowest legal card";
  }
  return info.rule.label;
}

/** Partnership predicate keys (Pillar A) — rendered as a distinct clause. */
const PARTNERSHIP_KEYS = [
  "partnerShownHcp",
  "partnerShownLength",
  "combinedHcp",
  "combinedKeycards",
  "keycardsMissing",
  "fitEstablished",
  "unshownSupport",
] as const;

/**
 * Split a rule's conditions into own-hand phrases and partnership phrases so
 * the decisions rail reads "…holding 15+ HCP — partner has shown 6+ HCP and
 * 4+ ♠; 25–27 combined HCP; a fit in ♠". Flat `all` (what rules are) splits
 * cleanly; nested any/not fall into the own-hand bucket.
 */
function splitHand(
  cond: HandCondition | undefined,
  values: Record<string, SettingValue>,
): { hand: ReactNode[]; partnership: ReactNode[] } {
  const hand: ReactNode[] = [];
  const partnership: ReactNode[] = [];
  const visit = (c: HandCondition): void => {
    if ("all" in c) {
      c.all.forEach(visit);
      return;
    }
    const isPartner = PARTNERSHIP_KEYS.some((k) => k in c);
    (isPartner ? partnership : hand).push(...conditionPhrases(c, values));
  };
  if (cond) visit(cond);
  return { hand, partnership };
}

/**
 * Why this rule fired, in the item editor's English. Reads as the tail of
 * "…{label} (from “{item}”): {becauseClause}."
 */
export function becauseClause(
  info: RuleInfo,
  values: Record<string, SettingValue>,
): ReactNode {
  switch (info.kind) {
    case "auction": {
      const when = contextPhrases(info.rule.context);
      const { hand, partnership } = splitHand(info.rule.conditions, values);
      return (
        <>
          applies when {when.length ? joinNodes(when) : "it's this seat's turn"}
          {hand.length > 0 && <>, holding {joinNodes(hand)}</>}
          {partnership.length > 0 && <> — {joinNodes(partnership, "; ")}</>}
        </>
      );
    }
    case "forcing":
      return <>pass is not available here — {info.rule.label}</>;
    case "lead":
      return leadSentence(info.rule.lead);
    case "play":
      return playRuleSentence(info.rule.spec);
    case "fallback": {
      const b = info.rule.fallback;
      return b.phase === "auction"
        ? "no agreement matched, so it passes"
        : b.phase === "opening_lead"
          ? `no agreement matched — leads ${b.behavior.replace(/_/g, " ")}`
          : "no agreement matched — plays the lowest legal card";
    }
  }
}

/** A trace entry's raw reason as a human sentence fragment. */
export function humanReason(t: RuleEval): ReactNode {
  const failed = () =>
    t.failedChecks?.length ? t.failedChecks.join("; ") : "the hand didn't fit";
  if (t.reason === "hand conditions not met" || t.reason === "conditions not met")
    return failed();
  if (t.reason === "action not legal here") return "its call isn't legal in this auction";
  const suppressed = /^pass suppressed — (.*)$/.exec(t.reason);
  if (suppressed) return `would pass, but '${suppressed[1]}' forbids passing here`;
  if (t.reason === "behavior not applicable") return "the technique doesn't apply to this trick";
  return t.reason;
}
