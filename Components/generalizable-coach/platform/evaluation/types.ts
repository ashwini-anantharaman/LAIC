/**
 * Zone 1 — Platform core: evidence about one learner action.
 *
 * This replaces a single opaque verdict with a PANEL. The reason is not
 * tidiness; it is that different sources of judgement answer different
 * questions, and collapsing them loses the answer worth teaching.
 *
 * In bridge: a knowledge base says "your system plays low here" — reproducible
 * by the learner, because it reasons only from what they can see. A double-dummy
 * search says "that cost a trick" — true, but reasoned from three hands they
 * cannot see. Take whichever answers first, as an earlier design did, and the
 * most instructive case in the game becomes unreachable: *you followed your
 * agreement and it still cost you*. Both facts exist; only a panel keeps both.
 *
 * Nothing here is domain-specific. A quiz would have an answer-key assessor and
 * a rubric assessor with the same problem: two authorities, different strengths,
 * and a response that must not overstate either.
 */
import type { Correctness, Severity } from "../types/index";

/**
 * WHO is speaking. Ordered by what they are entitled to claim, which is not the
 * same as how much they know:
 *
 *   · `system`     — the learner's own rulebook. Reasons only from what the
 *                    learner can see, so its advice is reproducible at the table.
 *                    This is the teaching voice.
 *   · `solution`   — a solved position. Measures outcomes exactly, and may reason
 *                    from information the learner does not have. An auditor, not
 *                    a teacher: right about this instance, silent about method.
 *   · `convention` — a general guideline. Cheap, broad, and hedged. Right often
 *                    rather than always.
 */
export type Authority = "system" | "solution" | "convention";

export interface FindingCitation {
  label: string;
  /** The cited artifact's own id — a knowledge item, a rule, a document. */
  sourceId?: string;
  href?: string;
}

/** One authority's opinion about one action. */
export interface Finding {
  /** Which assessor produced this, for traces. */
  assessor: string;
  authority: Authority;
  correctness: Correctness;
  severity: Severity;
  /** 0–1. */
  confidence: number;

  /**
   * Did this reasoning consult state the learner cannot see?
   *
   * The load-bearing field. A finding derived from hidden information may set
   * the verdict and the severity — the learner is entitled to know a card cost
   * them a trick — but it may never be the note's EXPLANATION, because the
   * explanation would then be something they could not have reproduced. That
   * rule is enforced by `reconcile`, not by whoever writes the phrasing.
   */
  usedHiddenCards: boolean;

  /** Learner-facing reason. Safe to quote only when `usedHiddenCards` is false. */
  because?: string;
  /** Provenance, so a note can cite rather than assert. */
  cites?: FindingCitation[];
  /** What this authority would do instead. */
  recommends?: string[];
  /** What the action cost, when the authority is able to measure it. */
  cost?: { tricks: number };

  skillIds?: string[];
  conceptIds?: string[];
}

/** The panel's collected view of one action. */
export interface Assessment {
  /** Every finding, kept. Ranked by authority strength for display. */
  findings: Finding[];

  /** Reconciled verdict, for the intervention policy to act on. */
  correctness: Correctness;
  severity: Severity;
  confidence: number;

  /**
   * The finding whose reason may be shown to the learner: the strongest
   * authority that reasoned only from what they can see. Absent when every
   * finding used hidden information — in which case the note may report the
   * verdict but must not explain it.
   */
  teachable?: Finding;

  /**
   * The authorities disagree in the way worth teaching: the learner's own system
   * endorsed the action and a solved position says it cost something. Not an
   * error — the most useful thing a coach can point at, and unreachable in any
   * design that stops at the first answer.
   */
  disagreement?: { endorsed: Finding; costly: Finding };

  /** Why the panel had nothing to say, when it had nothing. Never left blank. */
  silentBecause?: string;
}

/** How long the panel may spend. Replaces per-assessor hardcoded depth caps. */
export interface EvaluationBudget {
  /** Wall-clock the caller is willing to wait, total. */
  ms: number;
}

/**
 * One source of judgement.
 *
 * `applies` must be cheap and side-effect free — it is asked of every assessor
 * for every action, and exists so an assessor that cannot speak here costs
 * nothing rather than returning null after doing work.
 */
export interface Assessor<TAction = unknown, TContext = unknown> {
  id: string;
  authority: Authority;
  applies(action: TAction, ctx: TContext): boolean;
  assess(
    action: TAction,
    ctx: TContext,
    budget: EvaluationBudget,
  ): Promise<Finding | null>;
}
