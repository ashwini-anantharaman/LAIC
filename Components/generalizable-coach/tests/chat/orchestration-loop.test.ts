/**
 * M3/C5 gate — bounded conversational orchestration.
 *
 * A compound "explain X and quiz me" message routes into an explanation PLUS a
 * gated tool call (executed against a mock host) woven into one reply — bounded
 * by maxOrchestrationSteps, staying in scope, and fully traced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ChatOrchestrator } from "../../platform/chat/index";
import { BundledKnowledgeSource } from "../../platform/knowledge-source/index";
import { InProcessToolExecutor, toolRegistry, type CoachTool } from "../../platform/tools/index";
import { InMemoryTraceStore } from "../../platform/trace/index";
import { InMemoryInteractionMemory } from "../../platform/memory/index";
import { defaultCapabilityScope } from "../../platform/policy/index";
import { resolvePolicy } from "../../platform/config/index";
import { memoryLessonScope, COURSE_LEARNING_DOMAIN_ID } from "../../domains/course_learning/index";
import { CONTRACTS_SCHEMA_VERSION } from "../../contracts/index";
import type { CoachingPolicyProfile } from "../../contracts/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(here, "..", "..", "fixtures", "knowledge", "course-learning-sample.package.json"), "utf8"),
);

// A mock host tool: request_quiz returns a canned quiz id.
const quizTool: CoachTool = {
  name: "request_quiz",
  description: "Generate a quiz",
  inputSchema: { type: "object" },
  policyHints: { category: "assessment" },
  handler: async () => ({ ok: true, data: { quizId: "qz-1" } }),
};
const registry = toolRegistry([quizTool]);

const profile: CoachingPolicyProfile = {
  schemaVersion: CONTRACTS_SCHEMA_VERSION,
  profileId: "cpp.chat",
  displayName: "Chat",
  questioningStyle: "mixed",
  interventionPolicy: { maxHintLevel: 4 },
  enabledTools: ["request_quiz"],
};

function orchestrator(overrides: Partial<Parameters<typeof makeOpts>[0]> = {}) {
  return new ChatOrchestrator(makeOpts(overrides));
}
function makeOpts(o: { maxSteps?: number } = {}) {
  const policy = { ...resolvePolicy(profile), ...(o.maxSteps ? { maxOrchestrationSteps: o.maxSteps } : {}) };
  return {
    learnerId: "L1",
    domainId: COURSE_LEARNING_DOMAIN_ID,
    scope: memoryLessonScope(),
    knowledgeSource: new BundledKnowledgeSource(pkg),
    policy,
    capabilityScope: defaultCapabilityScope(),
    toolRegistry: registry,
    toolExecutor: new InProcessToolExecutor(registry),
    memory: new InMemoryInteractionMemory(),
    traceStore: new InMemoryTraceStore(),
    instanceId: "inst-1",
    mode: "practice" as const,
  };
}

describe("bounded conversational orchestration", () => {
  it("handles a compound 'explain X and quiz me' in one turn", async () => {
    const traces = new InMemoryTraceStore();
    const chat = new ChatOrchestrator({ ...makeOpts(), traceStore: traces });

    const res = await chat.chat("explain spaced repetition and quiz me");

    expect(res.intents.map((i) => i.kind)).toEqual(["ask", "command"]);
    expect(res.sources.length).toBeGreaterThan(0);
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0].call.tool).toBe("request_quiz");
    expect(res.toolCalls[0].result.ok).toBe(true);
    expect(res.reply).toMatch(/Neuroscience Primer/); // grounded + cited
    expect(res.reply).toMatch(/request_quiz/); // action woven in
    expect(res.steps).toBe(2);

    // Traced end-to-end.
    const [t] = traces.list({ learnerId: "L1" });
    expect(t.knowledgeScopeId).toBe("ks.course.memory_lesson");
    expect(t.sources.length).toBeGreaterThan(0);
  });

  it("declines the out-of-scope part instead of hallucinating", async () => {
    const res = await orchestrator().chat("How do I bid a slam in bridge?");
    expect(res.declined).toBe(true);
    expect(res.toolCalls).toHaveLength(0);
    expect(res.reply).toMatch(/outside what this lesson covers/);
  });

  it("respects maxOrchestrationSteps (compound message, cap = 1 → only the first intent)", async () => {
    const res = await orchestrator({ maxSteps: 1 }).chat("explain spaced repetition and quiz me");
    expect(res.steps).toBe(1);
    expect(res.toolCalls).toHaveLength(0); // the command step never ran
    expect(res.sources.length).toBeGreaterThan(0); // the ask step did
  });

  it("recalls prior turns for a meta question", async () => {
    const chat = orchestrator();
    await chat.chat("What is memory consolidation?");
    const res = await chat.chat("what did we cover?");
    expect(res.intents.map((i) => i.kind)).toEqual(["meta"]);
    expect(res.reply).toMatch(/Recently we covered/);
  });
});
