/**
 * Zone 1 — Platform core: the grounded LLM phraser (A / M3 finish).
 *
 * Turns the retrieved chunks into a conversational reply, grounded in and cited
 * from those chunks. Optional by design: the tutor/chat pass a phraser only
 * when they want LLM wording. It returns `null` to mean "no model reply — use
 * the deterministic composition", which happens with no API key, an empty
 * source set, or any model failure. So enabling the LLM never removes the
 * offline safety net or the source-grounding guarantee.
 */
import type { KnowledgeChunk } from "../../contracts/generated/index";
import type { LLMLike } from "./ResponseGenerator";
import type { BuiltPrompt } from "./PromptBuilder";
import { LLMClient } from "./LLMClient";

export type GroundedPhraser = (ctx: {
  message?: string;
  question?: string;
  chunks: KnowledgeChunk[];
}) => Promise<string | null>;

const SYSTEM =
  "You are a study coach. Answer the learner using ONLY the provided sources, " +
  "and cite them inline like (source). Be concise and encouraging. If the sources " +
  "do not cover the question, say it's outside this lesson rather than guessing.";

/** Build a phraser over any LLMLike. Returns null (→ deterministic) when unusable. */
export function makeGroundedPhraser(model: LLMLike): GroundedPhraser {
  return async ({ message, question, chunks }) => {
    const q = (message ?? question ?? "").trim();
    if (!q || chunks.length === 0) return null; // nothing to ground → let caller fall back
    const sources = chunks
      .map((c, i) => `[${i + 1}] ${c.content}${c.citation ? ` (${c.citation})` : ""}`)
      .join("\n");
    const prompt: BuiltPrompt = { system: SYSTEM, user: `Question: ${q}\n\nSources:\n${sources}` };
    const result = await model.generateCoachResponse(prompt);
    return result.fromModel ? result.text : null; // fromModel=false → deterministic fallback
  };
}

/**
 * A phraser backed by the env-configured LLM (OpenAI/Anthropic). With no API key
 * the underlying client returns `fromModel: false`, so this yields deterministic
 * (null) phrasing automatically — safe to use as the default everywhere.
 */
export function envGroundedPhraser(): GroundedPhraser {
  return makeGroundedPhraser(new LLMClient());
}
