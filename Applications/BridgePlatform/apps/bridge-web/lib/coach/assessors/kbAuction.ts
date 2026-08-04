// Authority: your knowledge base, on a call.
//
// The KB decider run in ASK mode — decide without committing — at the exact
// position the learner faced, then compared with what they actually called.
// This is the only authority for bidding: a bid is right or wrong relative to
// your partnership's agreements, and nothing else can judge that.

import { analyzeSeat, createKbDecider } from "@bridge/engine";
import type { Correctness, Severity } from "@laic/coach/core";

import { whyNotCall } from "../whyNot";
import type { AssessContext, BridgeFinding, MoveUnderReview } from "./context";

/**
 * The skill a call exercises, from the auction ROLE the engine already computes.
 *
 * Compiled rules carry no skill id — `@bridge/taxonomy` defines them but nothing
 * links the two — so this maps the position instead. Coarse, and right often
 * enough to be useful; attaching skill ids to knowledge items is the better
 * answer and touches every item.
 */
const SKILL_BY_ROLE: Record<string, string> = {
  opening: "sk_opening_bid_selection",
  opener: "sk_opener_rebid",
  responder: "sk_response_selection",
  overcaller: "sk_competitive_bidding",
  advancer: "sk_competitive_bidding",
};

export const kbAuctionAssessor = {
  id: "kb.auction",
  authority: "system" as const,

  applies(move: MoveUnderReview): boolean {
    // Only a completed call. There is no "what should I bid" hint — the bid box
    // already shows every call's meaning beside it, from this same rulebook.
    return move.action.kind === "call" && !move.asking;
  },

  async assess(move: MoveUnderReview, ctx: AssessContext): Promise<BridgeFinding | null> {
    const call = move.action.call;
    if (!call) return null;

    const decision = await createKbDecider(ctx.system).decideBid(move.before, move.actor);
    // No rule matched: the engine's safe default acted, not the rulebook. A
    // rulebook with no agreement for a position has not been contradicted.
    if (decision.fallback) return null;

    const alternatives = (decision.matches ?? []).filter((m) => m.ruleId !== decision.matchedRuleId);
    const alsoMatched = alternatives.find((m) => m.action === call);

    let correctness: Correctness;
    let severity: Severity;
    let confidence: number;
    if (decision.action === call) {
      correctness = "correct";
      severity = "minor";
      confidence = 0.9;
    } else if (alsoMatched) {
      // Another rule that matched THIS position produces the call, so the system
      // has two answers and the learner picked the other one. Not a mistake.
      correctness = "acceptable";
      severity = "minor";
      confidence = 0.7;
    } else {
      correctness = "incorrect";
      // A call the system considered and ranked below its choice is a different
      // mistake from one no matched rule produces at all.
      severity = decision.candidates.includes(call) ? "moderate" : "major";
      confidence = 0.75;
    }

    const ruleId = alsoMatched?.ruleId ?? decision.matchedRuleId;
    const ruleLabel = alsoMatched?.title ?? decision.reason;
    const taught = await ctx.teaching?.forRule(ruleId);
    const role = analyzeSeat(move.before.auction, move.actor, move.before.vul).role;
    const skillId = SKILL_BY_ROLE[role];

    return {
      assessor: "kb.auction",
      authority: "system",
      correctness,
      severity,
      confidence,
      // Reasons only from the actor's own hand and the visible auction.
      usedHiddenCards: false,
      // The knowledge item's own words when it has them; the rule's title
      // otherwise. Whoever authored the agreement explained it better than
      // anything derivable from a label.
      because: taught?.text ?? ruleLabel,
      cites: [
        ...(ruleId ? [{ label: ruleLabel, ...(taught?.itemId ? { sourceId: taught.itemId } : {}) }] : []),
        ...(taught?.citations ?? []),
      ],
      recommends: [decision.action],
      ...(skillId ? { skillIds: [skillId] } : {}),
      // The note needs the area to name when withholding, what else matched, and
      // — when the system disagreed — why the learner's own call was not it. That
      // last one comes out of `decision.trace`, which was being discarded.
      bridge: {
        role,
        ruleLabel,
        would: decision.action,
        alternatives,
        ...(correctness === "incorrect"
          ? {
              whyNot: whyNotCall({
                compiled: ctx.system.compiled,
                player: ctx.system.player,
                state: move.before,
                seat: move.actor,
                call,
                trace: decision.trace,
              }),
            }
          : {}),
      },
    };
  },
};
