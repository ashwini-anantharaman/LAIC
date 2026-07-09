/**
 * M3 gate — intervention traceability (C3, cross-cutting, mandatory).
 *
 * After any intervention, the stored trace contains the input event, instance,
 * policy version, scope version, cited sources, evaluator output, and the
 * learner-facing output — so every coach output can be explained.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { BundledKnowledgeSource } from "../../platform/knowledge-source/index.js";
import { StudyTutor } from "../../platform/tutor/index.js";
import { InMemoryTraceStore } from "../../platform/trace/index.js";
import { RecommendationEngine } from "../../platform/recommendation/index.js";
import { resolvePolicy } from "../../platform/config/index.js";
import { CourseQuizEvaluator, memoryLessonScope, COURSE_LEARNING_DOMAIN_ID } from "../../domains/course_learning/index.js";
import { CONTRACTS_SCHEMA_VERSION } from "../../contracts/index.js";
import type { ActivityEvent, CoachingPolicyProfile } from "../../contracts/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(here, "..", "..", "fixtures", "knowledge", "course-learning-sample.package.json"), "utf8"),
);

const profile: CoachingPolicyProfile = {
  schemaVersion: CONTRACTS_SCHEMA_VERSION,
  profileId: "cpp.tutor",
  displayName: "Tutor",
  questioningStyle: "mixed",
  interventionPolicy: { maxHintLevel: 4 },
};

function tutor(traceStore: InMemoryTraceStore) {
  return new StudyTutor({
    learnerId: "L1",
    domainId: COURSE_LEARNING_DOMAIN_ID,
    scope: memoryLessonScope(),
    knowledgeSource: new BundledKnowledgeSource(pkg),
    evaluator: new CourseQuizEvaluator(),
    recommender: new RecommendationEngine(),
    traceStore,
    policy: resolvePolicy(profile),
    instanceId: "inst-1",
  });
}

describe("intervention traceability", () => {
  it("records a full trace after a Q&A intervention", async () => {
    const traces = new InMemoryTraceStore();
    await tutor(traces).ask("How does memory consolidation work?");

    const [t] = traces.list({ learnerId: "L1" });
    expect(t).toBeTruthy();
    expect(t.instanceId).toBe("inst-1");
    expect(t.knowledgeScopeId).toBe("ks.course.memory_lesson");
    expect(t.policyProvenance).toEqual({ profileId: "cpp.tutor", schemaVersion: CONTRACTS_SCHEMA_VERSION });
    expect(t.sources.length).toBeGreaterThan(0); // cited chunks
    expect(t.output).toBeTruthy();
    expect(t.traceId).toMatch(/^trace-/);
    expect(t.timestamp).toBeTruthy();
  });

  it("records the evaluator output on a quiz intervention", async () => {
    const traces = new InMemoryTraceStore();
    const event: ActivityEvent = {
      schemaVersion: CONTRACTS_SCHEMA_VERSION,
      eventId: "evt-quiz-1",
      domainId: COURSE_LEARNING_DOMAIN_ID,
      eventType: "quiz_attempted",
      timestamp: "2026-07-08T00:00:00.000Z",
      sessionId: "s1",
      actorId: "L1",
      action: { questionId: "q1", answer: "wrong", correctAnswer: "REM sleep", conceptIds: ["concept.memory_consolidation"] },
      contextRefs: { learningObjectId: "lo-neuro-1" },
    };
    await tutor(traces).onQuizAttempt(event);

    const [t] = traces.list({ learnerId: "L1" });
    expect(t.eventId).toBe("evt-quiz-1");
    expect(t.evaluatorOutput).toBeTruthy();
    expect((t.evaluatorOutput as { correctness: string }).correctness).toBe("incorrect");
    expect(t.output).toBeTruthy();
  });
});
