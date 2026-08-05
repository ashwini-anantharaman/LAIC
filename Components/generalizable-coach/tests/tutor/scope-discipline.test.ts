/**
 * M3 gate — scope discipline (C4, the tutor safety rule).
 *
 * An in-scope question gets a source-cited answer; an out-of-scope question is
 * declined, never hallucinated; a forbidden concept is filtered out.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { BundledKnowledgeSource } from "../../platform/knowledge-source/index";
import { StudyTutor } from "../../platform/tutor/index";
import { memoryLessonScope, COURSE_LEARNING_DOMAIN_ID } from "../../domains/course_learning/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(here, "..", "..", "fixtures", "knowledge", "course-learning-sample.package.json"), "utf8"),
);

function tutor(scope = memoryLessonScope()) {
  return new StudyTutor({
    learnerId: "L1",
    domainId: COURSE_LEARNING_DOMAIN_ID,
    scope,
    knowledgeSource: new BundledKnowledgeSource(pkg),
  });
}

describe("tutor scope discipline", () => {
  it("answers an in-scope question with a source-cited explanation", async () => {
    const res = await tutor().ask("How does memory consolidation work?");
    expect(res.type).toBe("explanation");
    if (res.type !== "explanation") return;
    expect(res.sources?.length ?? 0).toBeGreaterThan(0);
    expect(res.message).toMatch(/Neuroscience Primer/); // citation surfaced
  });

  it("declines an out-of-scope question instead of hallucinating", async () => {
    const res = await tutor().ask("How do I bid a slam in bridge?");
    expect(res.type).toBe("declined");
    expect((res as { sources?: unknown }).sources).toBeUndefined();
  });

  it("filters out a forbidden concept even if the wording matches", async () => {
    const scope = { ...memoryLessonScope(), forbiddenConceptIds: ["concept.spaced_repetition"] };
    // The only chunks mentioning "spaced repetition" carry the forbidden concept.
    const res = await tutor(scope).ask("Tell me about spaced repetition");
    expect(res.type).toBe("declined");
  });
});
