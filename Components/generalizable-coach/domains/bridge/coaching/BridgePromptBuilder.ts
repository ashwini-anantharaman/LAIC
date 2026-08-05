/**
 * Zone 3 — Bridge implementation: bridge-tailored LLM prompt phrasing.
 *
 * Implements the platform's PromptStrategy. Adapts to two bridge modes — a
 * bidding decision or a card play — based on what the activity context carries,
 * and speaks as a bridge coach. Injected into the ResponseGenerator by
 * buildBridgeCoach; the platform's generic PromptBuilder is the fallback for
 * domains that don't ship one.
 */
import {
  HINT_LADDER,
  chunkText,
  type BuiltPrompt,
  type PromptInput,
  type PromptStrategy,
} from "../../../platform/llm/index";
import type { CommonCoachPackage } from "../../../platform/types/index";

export class BridgePromptBuilder implements PromptStrategy {
  build(input: PromptInput): BuiltPrompt {
    // The context is the merged {state, action}; a card action carries `card`.
    const isCardPlay = input.activityContext?.card != null;
    return isCardPlay ? this.buildCardPlay(input) : this.buildBidding(input);
  }

  private systemHeader(pkg: CommonCoachPackage, subject: string): string {
    const { skillLevel, preferences } = pkg.learner;
    const { currentLearningGoal } = pkg.learningState;
    return [
      `You are an adaptive bridge coach for a mobile learning app, coaching ${subject}.`,
      `The learner is at ${skillLevel} level. Their current goal is: ${currentLearningGoal || "general practice"}.`,
      `Coaching style: ${preferences.feedbackStyle}. Explanation depth: ${preferences.explanationDepth}.`,
      "",
      "IMPORTANT: Keep responses concise for mobile display.",
      HINT_LADDER,
    ].join("\n");
  }

  private buildBidding(input: PromptInput): BuiltPrompt {
    const { evaluationResult: e, interventionDecision: d, activityContext: ctx } = input;
    const recent = input.commonCoachPackage.learningState.recentMistakes;

    const position = ctx?.position ?? ctx?.playFromSeat;
    const hand = ctx?.hands?.[position] ?? ctx?.hand ?? "(unknown)";
    const user = [
      "The learner made this bidding decision:",
      `Hand: ${hand}`,
      `Auction so far: ${JSON.stringify(ctx?.auctionSoFar ?? [])}`,
      `Learner's bid: ${ctx?.bid ?? "(unknown)"}`,
      "",
      `Evaluation: ${e.correctness}, the recommended bid is ${String(e.bestAction ?? "?")}.`,
      `Reason: ${e.explanation ?? ""}`,
      `Related concepts: ${e.conceptIds.join(", ")}`,
      "",
      "Relevant teaching material:",
      chunkText(input.retrievedChunks),
      "",
      `Learner's recent mistakes: ${recent.length ? recent.join(", ") : "none"}`,
      "",
      `Generate a ${d.responseType} at hint level ${d.hintLevel}.`,
    ].join("\n");

    return { system: this.systemHeader(input.commonCoachPackage, "the bidding"), user };
  }

  private buildCardPlay(input: PromptInput): BuiltPrompt {
    const { evaluationResult: e, interventionDecision: d, activityContext: ctx } = input;
    const recent = input.commonCoachPackage.learningState.recentMistakes;

    const position = ctx?.position ?? ctx?.playFromSeat ?? ctx?.learnerSeat;
    const hand = ctx?.hands?.[position] ?? "(unknown)";
    const dummy = ctx?.hands?.[ctx?.dummySeat] ?? "(hidden)";
    const trick = (ctx?.trickSoFar ?? [])
      .map((t: any) => `${t.seat}:${t.card}`)
      .join(" ");

    const user = [
      "The learner is playing a card during a bridge hand.",
      `Contract: ${ctx?.contract ?? "?"} (trump: ${ctx?.trump ?? "?"}). Learner seat: ${ctx?.learnerSeat}, role: ${ctx?.role}.`,
      `Situation: ${ctx?.situation ?? ""}`,
      `Dummy: ${dummy}`,
      `Learner's cards: ${hand}`,
      `Trick so far: ${trick || "(learner is on lead)"}`,
      `Learner played: ${ctx?.card}`,
      "",
      `Evaluation: ${e.correctness}, the recommended play is ${String(e.bestAction ?? "?")}.`,
      `Reason: ${e.explanation ?? ""}`,
      `Related concepts: ${e.conceptIds.join(", ")}`,
      "",
      "Relevant teaching material:",
      chunkText(input.retrievedChunks),
      "",
      `Learner's recent mistakes: ${recent.length ? recent.join(", ") : "none"}`,
      "",
      `Generate a ${d.responseType} at hint level ${d.hintLevel}.`,
    ].join("\n");

    return { system: this.systemHeader(input.commonCoachPackage, "the play of the hand"), user };
  }
}
