// What every assessor is given, and what it is allowed to look at.
//
// The whole position is here, all four hands included, because one assessor
// (the solver) genuinely needs it. The others must not touch `hands` beyond the
// actor's own — and rather than trust that, each declares `usedHiddenCards` on
// its finding, and `reconcile` refuses to let a hidden-card finding become the
// explanation a learner reads.

import type { GameState, KbPlayerConfig } from "@bridge/engine";
import type { Call, Seat } from "@bridge/events";
import type { CompiledKb } from "@bridge/kb";
import type { Authority, Finding } from "@laic/coach/core";

import type { WhyNot } from "../whyNot";

import type { BridgeTableAction } from "../tableEvents";

/**
 * A finding plus the bridge-shaped detail a note needs but the generic contract
 * has no business carrying: the auction role (so a withheld hint can name the
 * AREA without naming the call), the rule's own title, and what else the system
 * had on the table here.
 *
 * A typed extension rather than fields cast onto `Finding` — the same discipline
 * as the event envelope. When the coach eventually stores findings, the generic
 * half is what crosses the boundary and this half stays here.
 */
export interface BridgeFinding extends Finding {
  bridge?: {
    /** opening / responder / opener rebid / overcaller / advancer. */
    role?: string;
    /** The agreement's own name, for the citation chip. */
    ruleLabel?: string;
    /** What the system would have done. */
    would?: string;
    /** Other rules that matched this position. */
    alternatives?: { ruleId: string; title: string; action: Call }[];
    /**
     * Why the learner's own call was not the system's — the rules that would
     * have produced it and what stopped each. Answers the best question in
     * bridge coaching from evidence the decider already produced.
     */
    whyNot?: WhyNot;
  };
}

/** The action under assessment, plus the position it was taken from. */
export interface MoveUnderReview {
  action: BridgeTableAction;
  /** The position as it was BEFORE the action — what the actor faced. */
  before: GameState;
  /** The seat whose decision this was: the learner, or dummy when they declare. */
  actor: Seat;
  /** The learner's own seat, which is not always the actor. */
  learnerSeat: Seat;
  /**
   * Prospective rather than retrospective: the learner is ASKING what to play,
   * not being judged on what they played. Same panel, and assessors that can
   * only judge after the fact sit this one out.
   */
  asking?: boolean;
}

export interface AssessContext {
  /** The rulebook this table plays, at the partnership's own pack surface. */
  system: { compiled: CompiledKb; player: KbPlayerConfig };
  /**
   * Which authorities may speak. Defaults to `LIVE_AUTHORITIES` — see there.
   *
   * A LIST RATHER THAN A DELETION, deliberately: the knowledge base is out of the
   * coaching path for now, not gone. Restoring it is adding one string back.
   */
  authorities?: readonly Authority[];
  /** Resolves a rule to its knowledge item's prose and sources. */
  teaching?: { forRule(ruleId: string | undefined): Promise<{ text?: string; citations: { label: string; sourceId?: string }[]; itemId?: string }> };
}

/**
 * Cards per hand the double-dummy search can afford for a given time budget.
 *
 * Measured on this solver, notrump, mixed hands: 4 → 11ms, 5 → 53ms, 6 → 400ms,
 * 7 → 2,956ms, 8 → 22,971ms. Roughly sevenfold per card, which is why this is a
 * lookup rather than a formula and why nothing above 7 is offered.
 *
 * Deriving depth from the budget is what removed two hardcoded caps: judging a
 * whole board used to pin 5 and the on-demand hint used to pin 7, with the
 * reason living in a comment. Now the caller states what it can wait for.
 */
export function searchDepthFor(budgetMs: number): number {
  if (budgetMs >= 2500) return 7;
  if (budgetMs >= 350) return 6;
  if (budgetMs >= 45) return 5;
  return 4;
}
