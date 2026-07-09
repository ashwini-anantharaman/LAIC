/**
 * Default chat-session factory for the Coach service (A / M3 finish).
 *
 * Wires a ChatOrchestrator for the built-in `course_learning` demo domain so
 * `POST /api/coaching/sessions` + `/ask` work out of the box. A real host
 * injects its own factory (its knowledge source, scope, tools, executor); this
 * is the offline, mock-host default used for demos and tests. The phraser is
 * env-backed: with an LLM key it talks; without one it stays deterministic.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ChatOrchestrator } from "../platform/chat/index.js";
import { BundledKnowledgeSource } from "../platform/knowledge-source/index.js";
import { InProcessToolExecutor, toolRegistry } from "../platform/tools/index.js";
import { InMemoryInteractionMemory } from "../platform/memory/index.js";
import { InMemoryTraceStore } from "../platform/trace/index.js";
import { resolvePolicy } from "../platform/config/index.js";
import { defaultCapabilityScope } from "../platform/policy/index.js";
import { envGroundedPhraser } from "../platform/llm/index.js";
import { memoryLessonScope, COURSE_LEARNING_DOMAIN_ID } from "../domains/course_learning/index.js";

export interface ChatSessionParams {
  learnerId: string;
  domainId: string;
  sessionId: string;
}

export type ChatSessionFactory = (params: ChatSessionParams) => ChatOrchestrator;

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(here, "..", "fixtures", "knowledge", "course-learning-sample.package.json"), "utf8"),
);

const registry = toolRegistry([
  {
    name: "request_quiz",
    description: "Generate a short quiz on the current topic",
    inputSchema: { type: "object" },
    policyHints: { category: "assessment" },
    handler: async (input) => ({
      ok: true,
      data: { quizId: "qz-demo", topic: (input as { topic?: string })?.topic },
    }),
  },
]);

const demoPolicy = resolvePolicy({
  schemaVersion: "1.0.0",
  profileId: "cpp.demo.chat",
  displayName: "Demo Chat",
  questioningStyle: "mixed",
  interventionPolicy: { maxHintLevel: 4 },
  enabledTools: ["request_quiz"],
});

export const demoChatSessionFactory: ChatSessionFactory = (params) =>
  new ChatOrchestrator({
    learnerId: params.learnerId,
    domainId: params.domainId || COURSE_LEARNING_DOMAIN_ID,
    scope: memoryLessonScope(),
    knowledgeSource: new BundledKnowledgeSource(pkg),
    policy: demoPolicy,
    capabilityScope: defaultCapabilityScope(),
    toolRegistry: registry,
    toolExecutor: new InProcessToolExecutor(registry),
    memory: new InMemoryInteractionMemory(),
    traceStore: new InMemoryTraceStore(),
    phraser: envGroundedPhraser(),
    instanceId: "demo-inst",
    mode: "practice",
  });
