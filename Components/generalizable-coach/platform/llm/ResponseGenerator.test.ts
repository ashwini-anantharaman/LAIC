import { describe, it, expect, vi } from "vitest";
import { ResponseGenerator, type LLMLike } from "./ResponseGenerator";
import { PromptBuilder } from "./PromptBuilder";
import type { BuiltPrompt } from "./PromptBuilder";
import type {
  CommonCoachPackage,
  EvaluationResult,
} from "../types/index";
import type { InterventionDecision } from "../coach-runtime/InterventionPolicyEngine";

function pkg(): CommonCoachPackage {
  return {
    learner: {
      learnerId: "L1",
      skillLevel: "beginner",
      preferences: {
        feedbackStyle: "gentle",
        explanationDepth: "short",
        interruptionTolerance: "medium",
      },
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

function evalResult(): EvaluationResult {
  return {
    correctness: "incorrect",
    confidence: 0.9,
    bestAction: "1S",
    conceptIds: ["CONCEPT_OPENING_BID"],
    skillIds: ["SKILL_OPENING_1SUIT"],
    explanation: "Hand has a 5-card major, should open 1S not 1NT.",
    severity: "major",
  };
}

function decision(over: Partial<InterventionDecision> = {}): InterventionDecision {
  return {
    shouldRespond: true,
    responseType: "hint",
    hintLevel: 2,
    reason: "test",
    ...over,
  };
}

function ctx() {
  return { hand: "S:KQ874 H:A3 D:K92 C:J54", auctionSoFar: [], learnerBid: "1NT" };
}

describe("ResponseGenerator", () => {
  it("does not call the LLM for a silent decision", async () => {
    const llm: LLMLike = {
      generateCoachResponse: vi.fn(async () => ({ text: "x", fromModel: true })),
    };
    const gen = new ResponseGenerator(llm);
    const res = await gen.generate({
      commonCoachPackage: pkg(),
      evaluationResult: evalResult(),
      retrievedChunks: [],
      interventionDecision: decision({ shouldRespond: false, responseType: "silent" }),
      activityContext: ctx(),
    });
    expect(res.type).toBe("silent");
    expect(llm.generateCoachResponse).not.toHaveBeenCalled();
  });

  it("marks postmortem notes without calling the LLM", async () => {
    const llm: LLMLike = {
      generateCoachResponse: vi.fn(async () => ({ text: "x", fromModel: true })),
    };
    const gen = new ResponseGenerator(llm);
    const res = await gen.generate({
      commonCoachPackage: pkg(),
      evaluationResult: evalResult(),
      retrievedChunks: [],
      interventionDecision: decision({
        shouldRespond: false,
        responseType: "postmortem_note",
      }),
      activityContext: ctx(),
    });
    expect(res.type).toBe("postmortem_note");
    expect(res.metadata?.savedForPostmortem).toBe(true);
    expect(llm.generateCoachResponse).not.toHaveBeenCalled();
  });

  it("wraps the LLM output in an AdaptiveCoachResponse", async () => {
    const llm: LLMLike = {
      generateCoachResponse: vi.fn(async () => ({
        text: "How many cards are in your longest suit?",
        fromModel: true,
      })),
    };
    const gen = new ResponseGenerator(llm);
    const res = await gen.generate({
      commonCoachPackage: pkg(),
      evaluationResult: evalResult(),
      retrievedChunks: [],
      interventionDecision: decision({ hintLevel: 2 }),
      activityContext: ctx(),
    });
    expect(res.type).toBe("hint");
    expect(res.level).toBe(2);
    expect(res.message).toContain("longest suit");
    expect(res.metadata?.relatedConceptIds).toContain("CONCEPT_OPENING_BID");
  });

  it("passes the requested hint level into the prompt", async () => {
    const captured: BuiltPrompt[] = [];
    const llm: LLMLike = {
      generateCoachResponse: vi.fn(async (p: BuiltPrompt) => {
        captured.push(p);
        return { text: "ok", fromModel: true };
      }),
    };
    const gen = new ResponseGenerator(llm);
    await gen.generate({
      commonCoachPackage: pkg(),
      evaluationResult: evalResult(),
      retrievedChunks: [],
      interventionDecision: decision({ hintLevel: 3 }),
      activityContext: ctx(),
    });
    expect(captured[0].user).toContain("hint level 3");
    // includes evaluation + concept context
    expect(captured[0].user).toContain("CONCEPT_OPENING_BID");
    // The platform default builder is domain-neutral ("adaptive coach").
    expect(captured[0].system).toContain("adaptive coach");
  });
});

describe("PromptBuilder", () => {
  it("includes learner style and knowledge chunks", () => {
    const builder = new PromptBuilder();
    const prompt = builder.build({
      commonCoachPackage: pkg(),
      evaluationResult: evalResult(),
      retrievedChunks: [
        {
          chunkId: "ob_rule_1major",
          conceptIds: ["CONCEPT_OPENING_BID"],
          skillIds: ["SKILL_OPENING_1SUIT"],
          difficulty: "beginner",
          chunkType: "rule",
          content: "Open 1 of a major with 12-21 HCP and 5+ cards.",
        },
      ],
      interventionDecision: decision(),
      activityContext: ctx(),
    });
    expect(prompt.system).toContain("gentle");
    expect(prompt.user).toContain("Open 1 of a major");
    expect(prompt.user).toContain("1NT"); // learner bid
  });
});
