import { describe, it, expect } from "vitest";
import { BridgePromptBuilder } from "./BridgePromptBuilder.js";
import type { CommonCoachPackage, EvaluationResult } from "../../../platform/types/index.js";
import type { InterventionDecision } from "../../../platform/coach-runtime/index.js";

function pkg(): CommonCoachPackage {
  return {
    learner: {
      learnerId: "L1",
      skillLevel: "beginner",
      preferences: { feedbackStyle: "gentle", explanationDepth: "short", interruptionTolerance: "medium" },
    },
    learningState: {
      currentDomainId: "bridge_gameplay",
      currentExperienceId: "",
      currentActivityId: "",
      currentLearningGoal: "Opening bids",
      masteredSkills: [],
      weakSkills: ["SKILL_OPENING_1SUIT"],
      recentMistakes: ["CONCEPT_OPENING_BID"],
      recentFeedbackSummary: "",
    },
    coachingPolicy: {
      maxHintLevel: 4,
      allowDirectAnswer: false,
      allowRealTimeInterruption: true,
      saveForPostmortemWhenPossible: false,
    },
  };
}

const evalResult = (): EvaluationResult => ({
  correctness: "incorrect",
  confidence: 0.9,
  bestAction: "1S",
  conceptIds: ["CONCEPT_OPENING_BID"],
  skillIds: ["SKILL_OPENING_1SUIT"],
  explanation: "Hand has a 5-card major, should open 1S not 1NT.",
  severity: "major",
});

const decision = (): InterventionDecision => ({
  shouldRespond: true,
  responseType: "hint",
  hintLevel: 2,
  reason: "test",
});

describe("BridgePromptBuilder", () => {
  it("speaks as a bridge coach and includes the bidding context", () => {
    const prompt = new BridgePromptBuilder().build({
      commonCoachPackage: pkg(),
      evaluationResult: evalResult(),
      retrievedChunks: [],
      interventionDecision: decision(),
      activityContext: { hand: "S:KQ874 H:A3 D:K92 C:J54", auctionSoFar: [], bid: "1NT", position: "S" },
    });
    expect(prompt.system).toContain("adaptive bridge coach");
    expect(prompt.system).toContain("the bidding");
    expect(prompt.user).toContain("Learner's bid: 1NT");
    expect(prompt.user).toContain("recommended bid is 1S");
  });

  it("switches to card-play framing when a card was played", () => {
    const prompt = new BridgePromptBuilder().build({
      commonCoachPackage: pkg(),
      evaluationResult: { ...evalResult(), bestAction: "SA" },
      retrievedChunks: [],
      interventionDecision: decision(),
      activityContext: { card: "SK", position: "S", contract: "4S", trump: "S", learnerSeat: "S", role: "declarer" },
    });
    expect(prompt.system).toContain("the play of the hand");
    expect(prompt.user).toContain("Learner played: SK");
  });
});
