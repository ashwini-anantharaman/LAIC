/**
 * M3 gate — quiz feedback + recommendation (C4).
 *
 * An incorrect quiz attempt yields a Recommendation that references a real
 * learning-object id and validates against the contract; a correct one yields
 * none.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { BundledKnowledgeSource } from "../../platform/knowledge-source/index";
import { StudyTutor } from "../../platform/tutor/index";
import { RecommendationEngine } from "../../platform/recommendation/index";
import { CourseQuizEvaluator, memoryLessonScope, COURSE_LEARNING_DOMAIN_ID } from "../../domains/course_learning/index";
import { validate, CONTRACTS_SCHEMA_VERSION } from "../../contracts/index";
import type { ActivityEvent } from "../../contracts/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(here, "..", "..", "fixtures", "knowledge", "course-learning-sample.package.json"), "utf8"),
);

function tutor() {
  return new StudyTutor({
    learnerId: "L1",
    domainId: COURSE_LEARNING_DOMAIN_ID,
    scope: memoryLessonScope(),
    knowledgeSource: new BundledKnowledgeSource(pkg),
    evaluator: new CourseQuizEvaluator(),
    recommender: new RecommendationEngine(),
  });
}

function quizEvent(answer: string): ActivityEvent {
  return {
    schemaVersion: CONTRACTS_SCHEMA_VERSION,
    eventId: "evt-quiz-1",
    domainId: COURSE_LEARNING_DOMAIN_ID,
    eventType: "quiz_attempted",
    timestamp: "2026-07-08T00:00:00.000Z",
    sessionId: "s1",
    actorId: "L1",
    action: {
      questionId: "q1",
      answer,
      correctAnswer: "REM sleep",
      conceptIds: ["concept.memory_consolidation"],
      skillIds: ["skill.recall"],
    },
    contextRefs: { learningObjectId: "lo-neuro-1" },
  };
}

describe("quiz feedback + recommendations", () => {
  it("wrong answer → recommendation referencing the learning object, + cited feedback", async () => {
    const { evaluation, feedback, recommendations } = await tutor().onQuizAttempt(quizEvent("dreaming"));
    expect(evaluation.correctness).toBe("incorrect");
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].targetObjectId).toBe("lo-neuro-1");
    expect(validate("Recommendation", recommendations[0]).errors).toEqual([]);
    expect(feedback.type).toBe("explanation"); // source-bound feedback
  });

  it("correct answer → no recommendation, silent feedback", async () => {
    const { evaluation, feedback, recommendations } = await tutor().onQuizAttempt(quizEvent("REM sleep"));
    expect(evaluation.correctness).toBe("correct");
    expect(recommendations).toHaveLength(0);
    expect(feedback.type).toBe("silent");
  });
});
