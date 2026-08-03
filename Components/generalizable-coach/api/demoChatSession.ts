/**
 * Chat-session factories for the Coach service (A / M3 finish, M4/D2 wiring).
 *
 * Two producers behind one `KnowledgeSource` port (architecture §4):
 *  - `demoChatSessionFactory` — the offline, bundled `course_learning` demo, so
 *    `POST /api/coaching/sessions` + `/ask` work out of the box (used by tests).
 *  - `platformChatSessionFactory` — the M4 "Platform mode": retrieves from the
 *    Learning Platform's `/retrieve` via `PlatformKnowledgeSource`, bound to the
 *    course scope passed at session open.
 *
 * `defaultChatSessionFactory` picks platform mode when `LEARNING_PLATFORM_URL`
 * is set (and a scope is supplied), else the bundled demo — so behavior is
 * unchanged with no env, and real course grounding turns on by configuration.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { KnowledgeScope } from "../contracts/index";
import { CONTRACTS_SCHEMA_VERSION } from "../contracts/index";
import { ChatOrchestrator } from "../platform/chat/index";
import {
  BundledKnowledgeSource,
  PlatformKnowledgeSource,
  type KnowledgeSource,
} from "../platform/knowledge-source/index";
import { InProcessToolExecutor, toolRegistry } from "../platform/tools/index";
import { InMemoryInteractionMemory } from "../platform/memory/index";
import { InMemoryTraceStore } from "../platform/trace/index";
import { resolvePolicy } from "../platform/config/index";
import { defaultCapabilityScope } from "../platform/policy/index";
import { envGroundedPhraser } from "../platform/llm/index";
import { memoryLessonScope, COURSE_LEARNING_DOMAIN_ID } from "../domains/course_learning/index";

export interface ChatSessionParams {
  learnerId: string;
  domainId: string;
  sessionId: string;
  /** Knowledge scope to bind — an Owlwise course id in platform mode. */
  scopeId?: string;
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

/** Shared orchestrator wiring — same policy/tools/memory/trace; swap knowledge + scope. */
function buildOrchestrator(params: ChatSessionParams, scope: KnowledgeScope, knowledgeSource: KnowledgeSource): ChatOrchestrator {
  return new ChatOrchestrator({
    learnerId: params.learnerId,
    domainId: params.domainId || COURSE_LEARNING_DOMAIN_ID,
    scope,
    knowledgeSource,
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
}

/** An allow-all-within-the-course scope; course scoping is enforced server-side. */
function courseScope(scopeId: string): KnowledgeScope {
  return {
    schemaVersion: CONTRACTS_SCHEMA_VERSION,
    id: scopeId,
    domainId: COURSE_LEARNING_DOMAIN_ID,
    allowedKnowledgePackageIds: [scopeId],
    allowedConceptIds: [], // empty = allow all this course returns (server-side scoped)
    allowedSkillIds: [],
    forbiddenConceptIds: [],
    instructionalLevel: "beginner",
    sourcePolicy: { sourceBoundOnly: true, allowGeneralBackground: false, requireCitations: true },
  };
}

export const demoChatSessionFactory: ChatSessionFactory = (params) =>
  buildOrchestrator(params, memoryLessonScope(), new BundledKnowledgeSource(pkg));

/**
 * Platform mode: retrieve from the Learning Platform `/retrieve`. Falls back to
 * the bundled demo if the endpoint or scope is missing, so it degrades safely.
 */
export const platformChatSessionFactory: ChatSessionFactory = (params) => {
  const endpoint = process.env.LEARNING_PLATFORM_URL ?? "";
  const scopeId = params.scopeId;
  if (!endpoint || !scopeId) return demoChatSessionFactory(params);
  const source = new PlatformKnowledgeSource({
    endpoint,
    scopeId,
    domainId: params.domainId || COURSE_LEARNING_DOMAIN_ID,
    authToken: process.env.COACH_SERVICE_TOKEN,
  });
  return buildOrchestrator(params, courseScope(scopeId), source);
};

/** Pick platform mode when a Learning Platform URL is configured, else the demo. */
export const defaultChatSessionFactory: ChatSessionFactory = (params) =>
  process.env.LEARNING_PLATFORM_URL ? platformChatSessionFactory(params) : demoChatSessionFactory(params);
