import { claudeJSON, claudeText } from "../lib/anthropic.js";

export async function detectIntent(message: string) {
  return claudeJSON<{ intent: "quiz" | "concept" | "reflection" | "general"; suggestedMode?: string }>(
    `You are the LAIC Orchestrator Agent. Classify student message intent.
Return JSON: { "intent": "quiz"|"concept"|"reflection"|"general", "suggestedMode": "real-world"|"conversational"|"textbook"|null }`,
    message,
    256
  );
}

export async function selectExplanationMode(
  learnerContext: string,
  conceptId: string
) {
  return claudeJSON<{ mode: string }>(
    `You are the LAIC Orchestrator. Choose the best explanation mode for this student and concept.
Return JSON: { "mode": "real-world"|"conversational"|"textbook" }`,
    `Learner: ${learnerContext}\nConcept: ${conceptId}`,
    256
  );
}
