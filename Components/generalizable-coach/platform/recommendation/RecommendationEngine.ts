/**
 * Zone 1 — Platform core: deterministic recommendation rules (LAIC §13, M3/C4).
 *
 * Rules first, ML later. Outputs the M0 `Recommendation` contract, referencing
 * an owning-platform object id so the host renders it. M3 ships the starter
 * rules; the graded/LLM-assisted variants come later.
 */
import type { Recommendation } from "../../contracts/generated/index";
import { CONTRACTS_SCHEMA_VERSION } from "../../contracts/version";
import type { EvaluationResult } from "../types/index";

export interface RecommendationContext {
  learnerId: string;
  domainId: string;
  eventId: string;
  eventType: string; // e.g. "quiz_attempted"
  evaluation: EvaluationResult;
  /** the owning-platform learning object this activity belongs to */
  learningObjectId?: string;
  /** whether this concept has been missed before (drives escalation) */
  repeatedConcept?: boolean;
}

export class RecommendationEngine {
  private seq = 0;
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  private make(
    ctx: RecommendationContext,
    recommendationType: string,
    reason: string,
    priority: Recommendation["priority"],
  ): Recommendation {
    this.seq += 1;
    return {
      schemaVersion: CONTRACTS_SCHEMA_VERSION,
      id: `rec-${this.seq}`,
      learnerId: ctx.learnerId,
      domainId: ctx.domainId,
      reason,
      recommendationType,
      targetObjectId: ctx.learningObjectId,
      priority,
      evidenceRefs: [ctx.eventId],
      status: "active",
      generatedBy: "rule",
      createdAt: this.now(),
    };
  }

  /** Starter rules: a missed quiz → review/tutorial referencing the object. */
  generate(ctx: RecommendationContext): Recommendation[] {
    const wrong =
      ctx.evaluation.correctness === "incorrect" ||
      ctx.evaluation.correctness === "suboptimal";
    if (!wrong) return [];

    if (ctx.eventType === "quiz_attempted") {
      if (ctx.repeatedConcept) {
        return [
          this.make(ctx, "tutorial", "Same concept missed again — review the tutorial.", "high"),
        ];
      }
      return [
        this.make(ctx, "review_block", "Missed a quiz question — review the related material.", "medium"),
      ];
    }

    return [this.make(ctx, "drill", "Repeated mistake — try a targeted drill.", "medium")];
  }
}
