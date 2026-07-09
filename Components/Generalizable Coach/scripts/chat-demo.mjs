/**
 * C5 demo — the "chat with me" conversational assistant (against a mock host).
 *
 *   npm run chat:demo
 *
 * Shows a compound message ("explain X and quiz me") routed into an explanation
 * plus a gated tool call executed by a mock host and woven into one reply,
 * bounded and in scope; then an out-of-scope decline; then a meta recall.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ChatOrchestrator } from "../platform/chat/index.ts";
import { BundledKnowledgeSource } from "../platform/knowledge-source/index.ts";
import { InProcessToolExecutor, toolRegistry } from "../platform/tools/index.ts";
import { InMemoryTraceStore } from "../platform/trace/index.ts";
import { InMemoryInteractionMemory } from "../platform/memory/index.ts";
import { defaultCapabilityScope } from "../platform/policy/index.ts";
import { resolvePolicy } from "../platform/config/index.ts";
import { memoryLessonScope } from "../domains/course_learning/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(here, "..", "fixtures", "knowledge", "course-learning-sample.package.json"), "utf8"));
const line = (t) => console.log(`\n\x1b[36m${t}\x1b[0m`);

// A mock host that "generates" a quiz.
const registry = toolRegistry([{
  name: "request_quiz", description: "Generate a quiz", inputSchema: { type: "object" },
  policyHints: { category: "assessment" },
  handler: async (input) => ({ ok: true, data: { quizId: "qz-1", topic: input.topic } }),
}]);

const policy = resolvePolicy({
  schemaVersion: "1.0.0", profileId: "cpp.chat", displayName: "Chat",
  questioningStyle: "mixed", interventionPolicy: { maxHintLevel: 4 }, enabledTools: ["request_quiz"],
});

const chat = new ChatOrchestrator({
  learnerId: "L1", domainId: "course_learning", scope: memoryLessonScope(),
  knowledgeSource: new BundledKnowledgeSource(pkg), policy, capabilityScope: defaultCapabilityScope(),
  toolRegistry: registry, toolExecutor: new InProcessToolExecutor(registry),
  memory: new InMemoryInteractionMemory(), traceStore: new InMemoryTraceStore(),
  instanceId: "inst-1", mode: "practice",
});

async function turn(msg) {
  const r = await chat.chat(msg);
  console.log(`\n👤 ${msg}`);
  console.log(`   intents: ${r.intents.map((i) => i.kind).join(" + ")} | steps: ${r.steps}` +
    (r.toolCalls.length ? ` | tool: ${r.toolCalls[0].call.tool} → ${JSON.stringify(r.toolCalls[0].result.data)}` : ""));
  console.log(`🤖 ${r.reply}`);
}

line("A compound ask + command (explain AND quiz me):");
await turn("explain spaced repetition and quiz me");

line("An out-of-scope question (declined, not hallucinated):");
await turn("How do I bid a slam in bridge?");

line("A meta recall (what did we cover?):");
await turn("what did we cover?");

console.log("\n\x1b[32m✓ C5: conversational, tool-using, source-bound, bounded, and traced — the Spark.E-style loop on the coach side.\x1b[0m");
