import { claudeJSON } from "../lib/anthropic.js";
import { embedTexts } from "../lib/voyage.js";

export async function evaluateReflection(
  conceptId: string,
  answers: string[],
  isSession = false
) {
  const combined = answers.join("\n\n");
  return claudeJSON<{ accepted: boolean; followUp?: string; message: string }>(
    `You are the LAIC Reflection Agent. Assess metacognitive depth. Reject shallow answers (<2 sentences of substance) with a probing follow-up. Accept thoughtful reflections.
Return JSON: { "accepted": boolean, "followUp": string|null, "message": string }`,
    `Concept: ${conceptId}\nSession reflection: ${isSession}\n\nStudent wrote:\n${combined}`,
    512
  );
}

export async function embedReflection(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
