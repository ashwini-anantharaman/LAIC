// The rule-package schema: rules are DATA in versioned, published packages —
// never hand-edited code (execution plan §1, locked decision 1). Every entry
// carries provenance back to human-readable knowledge items and cited sources
// (Bridge plan §12.10 step 9, §12.11). The engine's interpreter evaluates
// these entries against a position; the predicate library supplies the named
// building blocks.

import type { Setting, SettingValue } from "@bridge/config";
import type { Call } from "@bridge/events";

export type PackageStatus = "draft" | "review" | "published" | "deprecated";

/**
 * Provenance gate (locked decision 3): `published` packages require every
 * entry to be `approved`; prototype-derived unreviewed entries may appear in
 * draft/review packages only, always visibly flagged.
 */
export type ReviewStatus =
  | "approved"
  | "unreviewed_prototype_derived"
  | "needs_review";

export interface RuleProvenance {
  knowledgeItemIds: string[];
  sourceIds: string[];
  reviewStatus: ReviewStatus;
}

/** A config setting that must hold for the rule to be active. */
export interface SettingGate {
  key: string;
  /** Gate passes when the resolved value equals this; omitted = must be truthy. */
  equals?: SettingValue;
}

// ---------------------------------------------------------------------------
// Hand conditions: boolean expressions over named predicates
// ---------------------------------------------------------------------------

export interface HandPredicateRef {
  predicate: string;
  params?: Record<string, unknown>;
}

export type HandConstraintExpr =
  | { all: HandConstraintExpr[] }
  | { any: HandConstraintExpr[] }
  | { not: HandConstraintExpr }
  | HandPredicateRef;

// ---------------------------------------------------------------------------
// Auction context
// ---------------------------------------------------------------------------

export interface AuctionPattern {
  /**
   * Coarse seat role at decision time:
   *  - "opening": no contract bid yet by anyone
   *  - "response": partner made the auction's first contract bid and this
   *    seat has not yet made a contract bid
   */
  role?: "opening" | "response" | "any";
  /** Regex over the space-joined calls from dealer, e.g. "^P?( P)*$". */
  auctionRegex?: string;
  /** Regex over partner's last contract bid, e.g. "^1[HS]$". */
  partnerLastBidRegex?: string;
}

// ---------------------------------------------------------------------------
// Actions (declarative templates the interpreter resolves to a concrete call/card)
// ---------------------------------------------------------------------------

export type BidRuleAction =
  | { kind: "call"; call: Call }
  | { kind: "pass" }
  | {
      kind: "openLongest";
      among: "majors" | "minors" | "all";
      level: number;
      /** Tie handling for equal-length suits (default "higher"). */
      tieBreak?: "higher" | "lower";
    }
  | { kind: "raisePartner"; toLevel: number }
  | {
      kind: "newSuitAtLevel";
      level: number;
      minLength: number;
      /** Longest first; equal lengths bid the cheaper suit. Skips suits partner bid. */
    };

export interface BidRuleEntry {
  ruleId: string;
  /** Matches the readable knowledge item title. */
  title: string;
  /** Evaluation order: lower = evaluated first. */
  priority: number;
  settingGates: SettingGate[];
  auctionContext: AuctionPattern;
  handConditions: HandConstraintExpr;
  action: BidRuleAction;
  /**
   * Escape hatch for logic pure data can't express (e.g. range-inference
   * game decisions). Names an engine primitive from src/primitives; that
   * primitive's behavior must itself be specified by cited knowledge items.
   */
  complexPrimitive?: string;
  primitiveParams?: Record<string, unknown>;
  provenance: RuleProvenance;
  /** Readable knowledge item for trace resolution ("why did AI do that?"). */
  explanationItemId: string;
}

export type PlayRuleAction =
  | { kind: "lowestFollowing" }
  | { kind: "highestFollowing" }
  | { kind: "lowestLegal" }
  | { kind: "topOfLongestSuit" };

export interface PlayRuleEntry {
  ruleId: string;
  title: string;
  priority: number;
  settingGates: SettingGate[];
  /** "lead" = first card of a trick; "follow" = any later position. */
  when: { role: "lead" | "follow" | "any" };
  action: PlayRuleAction;
  provenance: RuleProvenance;
  explanationItemId: string;
}

// ---------------------------------------------------------------------------
// The package
// ---------------------------------------------------------------------------

export interface BridgeRulePackage {
  packageId: string;
  systemFamily: "natural" | "SAYC" | "2_over_1" | "custom";
  version: string;
  status: PackageStatus;
  /** Setting definitions this package contributes (registry entries). */
  settings: Setting[];
  bidRules: BidRuleEntry[];
  playRules: PlayRuleEntry[];
}

// ---------------------------------------------------------------------------
// Validation (Phase 3's publication pipeline runs this; tests use it too)
// ---------------------------------------------------------------------------

export function validatePackage(
  pkg: BridgeRulePackage,
  knownPredicates: ReadonlySet<string>,
  knownPrimitives: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const settingKeys = new Set(pkg.settings.map((s) => s.key));

  const checkExpr = (ruleId: string, expr: HandConstraintExpr): void => {
    if ("all" in expr) return expr.all.forEach((e) => checkExpr(ruleId, e));
    if ("any" in expr) return expr.any.forEach((e) => checkExpr(ruleId, e));
    if ("not" in expr) return checkExpr(ruleId, expr.not);
    if (!knownPredicates.has(expr.predicate))
      errors.push(`${ruleId}: unknown predicate "${expr.predicate}"`);
  };

  for (const rule of [...pkg.bidRules, ...pkg.playRules]) {
    if (ids.has(rule.ruleId)) errors.push(`duplicate ruleId "${rule.ruleId}"`);
    ids.add(rule.ruleId);
    if (pkg.status === "published" && rule.provenance.reviewStatus !== "approved")
      errors.push(
        `${rule.ruleId}: status "${rule.provenance.reviewStatus}" not allowed in a published package`,
      );
    if (!rule.provenance.knowledgeItemIds.length || !rule.provenance.sourceIds.length)
      errors.push(`${rule.ruleId}: provenance must cite knowledge items and sources`);
    for (const gate of rule.settingGates)
      if (!settingKeys.has(gate.key))
        errors.push(`${rule.ruleId}: settingGate references unknown setting "${gate.key}"`);
  }

  for (const rule of pkg.bidRules) {
    checkExpr(rule.ruleId, rule.handConditions);
    if (rule.complexPrimitive && !knownPrimitives.has(rule.complexPrimitive))
      errors.push(`${rule.ruleId}: unknown complexPrimitive "${rule.complexPrimitive}"`);
    for (const re of [rule.auctionContext.auctionRegex, rule.auctionContext.partnerLastBidRegex])
      if (re !== undefined) {
        try {
          new RegExp(re);
        } catch {
          errors.push(`${rule.ruleId}: invalid regex "${re}"`);
        }
      }
  }

  return errors;
}
