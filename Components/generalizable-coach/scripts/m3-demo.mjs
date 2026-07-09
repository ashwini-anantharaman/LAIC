/**
 * M3 demo harness — see the coach become useful.
 *
 *   npm run m3:demo
 *
 * Shows scope-bound Q&A (cited answer + out-of-scope decline), quiz feedback
 * with a recommendation, tool gating (assessment hides the answer key),
 * interaction recall, and the full traceability record.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { BundledKnowledgeSource } from "../platform/knowledge-source/index.ts";
import { StudyTutor } from "../platform/tutor/index.ts";
import { InMemoryInteractionMemory } from "../platform/memory/index.ts";
import { InMemoryTraceStore } from "../platform/trace/index.ts";
import { RecommendationEngine } from "../platform/recommendation/index.ts";
import { gateTools, toolRegistry } from "../platform/tools/index.ts";
import { resolvePolicy } from "../platform/config/index.ts";
import { CourseQuizEvaluator, memoryLessonScope } from "../domains/course_learning/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(here, "..", "fixtures", "knowledge", "course-learning-sample.package.json"), "utf8"));
const line = (t) => console.log(`\n\x1b[36m${t}\x1b[0m`);

const memory = new InMemoryInteractionMemory();
const traces = new InMemoryTraceStore();
const policy = resolvePolicy({
  schemaVersion: "1.0.0", profileId: "cpp.tutor", displayName: "Tutor",
  questioningStyle: "mixed", interventionPolicy: { maxHintLevel: 4 },
});
const tutor = new StudyTutor({
  learnerId: "L1", domainId: "course_learning", scope: memoryLessonScope(),
  knowledgeSource: new BundledKnowledgeSource(pkg),
  evaluator: new CourseQuizEvaluator(), recommender: new RecommendationEngine(),
  memory, traceStore: traces, policy, instanceId: "inst-1",
});

line("1) In-scope question → source-cited answer");
const inScope = await tutor.ask("How does memory consolidation work?");
console.log(`  [${inScope.type}] ${inScope.message}`);

line("2) Out-of-scope question → declined, not hallucinated");
const out = await tutor.ask("How do I bid a slam in bridge?");
console.log(`  [${out.type}] ${out.message}`);

line("3) Wrong quiz answer → feedback + recommendation referencing a learning object");
const quiz = await tutor.onQuizAttempt({
  schemaVersion: "1.0.0", eventId: "evt-1", domainId: "course_learning", eventType: "quiz_attempted",
  timestamp: "2026-07-08T00:00:00.000Z", sessionId: "s1", actorId: "L1",
  action: { questionId: "q1", answer: "dreaming", correctAnswer: "REM sleep", conceptIds: ["concept.memory_consolidation"] },
  contextRefs: { learningObjectId: "lo-neuro-1" },
});
console.log(`  verdict: ${quiz.evaluation.correctness}`);
console.log(`  feedback: [${quiz.feedback.type}] ${quiz.feedback.message ?? ""}`);
console.log(`  recommendation: ${quiz.recommendations[0].recommendationType} → ${quiz.recommendations[0].targetObjectId}`);

line("4) Tool gating — assessment mode hides the answer key");
const registry = toolRegistry([
  { name: "reveal_answer", description: "reveal", inputSchema: {}, policyHints: { revealsAnswer: true }, handler: async () => ({ ok: true }) },
  { name: "request_flashcards", description: "flashcards", inputSchema: {}, policyHints: { category: "practice" }, handler: async () => ({ ok: true }) },
]);
const enabled = { ...policy, enabledTools: ["reveal_answer", "request_flashcards"] };
const practice = gateTools(registry, { policy: enabled, mode: "practice" }).map((t) => t.name);
const assessment = gateTools(registry, { policy: enabled, mode: "assessment" }).map((t) => t.name);
console.log(`  practice mode  → ${JSON.stringify(practice)}`);
console.log(`  assessment mode → ${JSON.stringify(assessment)}   (reveal_answer structurally absent)`);

line("5) Interaction memory — recall past turns");
for (const r of memory.recall({ learnerId: "L1" })) console.log(`  (${r.role}) ${r.text}`);

line("6) Traceability — every intervention is explainable");
const t = traces.list({ learnerId: "L1" })[0];
console.log(`  ${t.traceId}: scope=${t.knowledgeScopeId}, policy=${JSON.stringify(t.policyProvenance)}, sources=${JSON.stringify(t.sources)}`);

console.log("\n\x1b[32m✓ M3: the coach answers in scope, acts via gated tools, remembers, recommends, and is fully traceable.\x1b[0m");
