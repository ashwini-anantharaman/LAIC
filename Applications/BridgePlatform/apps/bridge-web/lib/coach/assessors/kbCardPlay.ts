// Authority: your knowledge base, on a card.
//
// THIS IS THE ASSESSOR THAT WAS MISSING. Judging a card used to ask the solver,
// then a hardcoded guideline, then give up — your card-play agreements never got
// a vote. So the coach could mark a card wrong on a general maxim while the hint
// button, on the identical position, quoted your own system. They could disagree,
// and the one that spoke was not yours.
//
// It also means card verdicts can finally CITE something. A hardcoded guideline
// has no source; a knowledge item has an author, a document and an anchor.
//
// `decidePlay` is the exact counterpart of the `decideBid` that has judged every
// bid all along: it matches the KB's card-play rules by position in the trick
// (lead / second / third / fourth) and by side, and the opening lead by the
// defence against the KB's lead agreements. It works at every trick and needs no
// search, which is why it — not a bigger solver — is what closes the mid-hand gap.

import { createKbDecider } from "@bridge/engine";
import type { Correctness, Severity } from "@laic/coach/core";

import { cardCode } from "../tableEvents";
import { whyNotCard } from "../whyNot";
import type { AssessContext, BridgeFinding, MoveUnderReview } from "./context";

/** Coarse, from the position — compiled rules carry no skill ids. See kbAuction. */
function skillFor(move: MoveUnderReview): string {
  const trick = move.before.tricks[move.before.tricks.length - 1];
  const onLead = !trick || trick.plays.length === 0 || trick.plays.length === 4;
  const declarer = move.before.contract?.declarer;
  if (declarer && (move.learnerSeat === declarer || move.actor === declarer)) {
    return "sk_declarer_planning";
  }
  return onLead ? "sk_opening_leads" : "sk_following_suit";
}

export const kbCardPlayAssessor = {
  id: "kb.cardplay",
  authority: "system" as const,

  applies(move: MoveUnderReview): boolean {
    return move.action.kind === "card" && Boolean(move.before.contract);
  },

  async assess(move: MoveUnderReview, ctx: AssessContext): Promise<BridgeFinding | null> {
    const decision = await createKbDecider(ctx.system).decidePlay(move.before, move.actor);

    // `fallback: true` covers two situations the decider distinguishes only by
    // whether it set `matchedRuleId`:
    //
    //   · a KB FALLBACK ITEM applied — an authored, documented default ("no
    //     technique applies here, play the lowest legal card"). That IS part of
    //     the learner's system.
    //   · the ENGINE FLOOR — nothing in the knowledge base covered the position
    //     at all, and a card had to come from somewhere.
    //
    // The distinction matters because JUDGING and ADVISING want opposite things
    // from it. Marking someone wrong for departing from a catch-all default is
    // unfair, so judging stays silent on both. But when a learner ASKS what to
    // play, "no special agreement here — your system's default is the lowest
    // card" is a real answer, and withholding it is the coach refusing a question
    // it can answer. That refusal is what produced "no rule or guideline covers
    // this trick" on a position the rulebook had a documented default for.
    const isAuthoredDefault = decision.fallback && Boolean(decision.matchedRuleId);
    if (decision.fallback && !(move.asking && isAuthoredDefault)) return null;

    const would = cardCode(decision.action);
    // `candidates` is every matched rule's realized card, from rules that may
    // describe quite different plans — three of them once produced "10♦, 2♠, 10♠"
    // under the heading "your system plays", three suits at one trick. The
    // decider already CHOSE between them by policy; the chosen card is the
    // answer, and the rest are context.
    const alsoOk = decision.candidates.map(cardCode);

    // Asked rather than judged: there is no card to grade, only advice to give.
    if (move.asking) {
      const taughtAsked = await ctx.teaching?.forRule(decision.matchedRuleId);
      return {
        assessor: "kb.cardplay",
        authority: "system",
        correctness: "acceptable",
        severity: "minor",
        // A documented default is weaker advice than a specific agreement, and
        // says so, so the wording downstream can hedge accordingly.
        confidence: isAuthoredDefault ? 0.45 : 0.7,
        usedHiddenCards: false,
        because: isAuthoredDefault
          ? "No special technique applies here, so your system falls back to the lowest card that does the job."
          : (taughtAsked?.text ?? decision.reason),
        ...(taughtAsked?.citations?.length ? { cites: taughtAsked.citations } : {}),
        recommends: [would],
        bridge: { ruleLabel: decision.reason, would },
      };
    }

    const played = move.action.card ?? "";
    let correctness: Correctness;
    let severity: Severity;
    let confidence: number;
    if (would === played) {
      correctness = "correct";
      severity = "minor";
      confidence = 0.85;
    } else if (alsoOk.includes(played)) {
      // Another rule that matched this position produces the card.
      correctness = "acceptable";
      severity = "minor";
      confidence = 0.7;
    } else {
      // The rulebook says otherwise — but a rulebook cannot measure what a card
      // COST, so this never claims more than "your system plays something else".
      // Only the solver may say "that lost a trick", and it says so separately.
      correctness = "suboptimal";
      severity = "moderate";
      confidence = 0.7;
    }

    const taught = await ctx.teaching?.forRule(decision.matchedRuleId);

    return {
      assessor: "kb.cardplay",
      authority: "system",
      correctness,
      severity,
      confidence,
      usedHiddenCards: false,
      because: taught?.text ?? decision.reason,
      cites: [
        ...(decision.matchedRuleId
          ? [{ label: decision.reason, ...(taught?.itemId ? { sourceId: taught.itemId } : {}) }]
          : []),
        ...(taught?.citations ?? []),
      ],
      recommends: [would],
      skillIds: [skillFor(move)],
      bridge: {
        ruleLabel: decision.reason,
        would,
        // Card play had "Why?" and no "Why not?", which is the more useful half
        // and covers two thirds of a board. `decidePlay` records the same trace
        // `decideBid` does, so the answer was already there.
        ...(correctness === "suboptimal"
          ? {
              whyNot: whyNotCard({
                compiled: ctx.system.compiled,
                player: ctx.system.player,
                state: move.before,
                seat: move.actor,
                card: played,
                trace: decision.trace,
              }),
            }
          : {}),
      },
    };
  },
};
