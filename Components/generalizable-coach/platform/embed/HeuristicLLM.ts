/**
 * Zone 1 — Platform core: a browser-safe, offline LLM stand-in.
 *
 * The real LLMClient talks to OpenAI/Anthropic and reads process.env — neither
 * is available (or desirable) in a client bundle. This implementation produces
 * genuinely useful, hint-level-appropriate coaching text WITHOUT a network call
 * by reading the structured fields the PromptBuilder embeds in the prompt
 * (evaluation reason, recommended action, concepts, requested level). The hint
 * *level* and *decision* are still the real pipeline output — only the natural
 * language phrasing is produced here rather than by a model.
 *
 * A host that wants real model text injects its own LLMLike (e.g. a proxy) via
 * CoachSession's `llm` option; this is the zero-config default.
 */
import type { LLMLike } from "../llm/index";
import type { BuiltPrompt } from "../llm/index";

function firstMatch(text: string, re: RegExp): string | null {
  return text.match(re)?.[1]?.trim() ?? null;
}

export class HeuristicLLM implements LLMLike {
  async generateCoachResponse(prompt: BuiltPrompt) {
    const u = prompt.user;
    const level = Number(firstMatch(u, /hint level (\d)/) ?? "1");
    const responseType = firstMatch(u, /Generate a (\w+)/) ?? "hint";
    const reason = firstMatch(u, /Reason:\s*(.+)/) ?? "";
    const bestRaw = firstMatch(u, /recommended (?:bid|play|action|move) is\s*(.+?)\./) ?? "";
    const best = bestRaw === "?" ? "" : bestRaw;
    const concept = (firstMatch(u, /Related concepts:\s*(.+)/) ?? "")
      .split(",")[0]
      ?.trim();

    // Progressive disclosure — mirror the PromptBuilder's hint ladder.
    if (responseType === "nudge" || level <= 1) {
      return {
        text: "Have another look at this one — are you sure it's the strongest choice here?",
        fromModel: false,
      };
    }
    if (level === 2) {
      const topic = humanizeConcept(concept);
      return {
        text: topic
          ? `Think about ${topic} before you commit to this.`
          : "There's a relevant principle here worth reconsidering.",
        fromModel: false,
      };
    }
    if (level === 3) {
      return {
        text: reason
          ? `Consider this: ${reason}`
          : "You're close — reconsider which choice best fits the situation.",
        fromModel: false,
      };
    }
    // level 4 / explanation — reveal the recommendation and why.
    const rec = best ? ` The recommended choice is ${best}.` : "";
    return {
      text: reason ? `${reason}${rec}` : `Reconsider your choice.${rec}`,
      fromModel: false,
    };
  }
}

/** Turn a CONCEPT_* id into a readable phrase for level-2 hints. */
function humanizeConcept(id: string | undefined): string {
  if (!id) return "";
  return id
    .replace(/^CONCEPT_/, "")
    .toLowerCase()
    .replace(/_/g, " ");
}

/**
 * Wrap a real model client so that when it cannot produce model text (no key,
 * network error, empty reply → fromModel: false), the coaching turn falls back
 * to the HeuristicLLM's structured phrasing instead of a generic canned line.
 */
export function withOfflineFallback(primary: LLMLike): LLMLike {
  const heuristic = new HeuristicLLM();
  return {
    async generateCoachResponse(prompt: BuiltPrompt) {
      let error: string | undefined;
      try {
        const result = await primary.generateCoachResponse(prompt);
        if (result.fromModel) return result;
        error = result.error;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      // Heuristic phrasing, but keep the primary's failure reason so callers
      // (e.g. chat) can tell "offline by design" from "model call failed".
      const fallback = await heuristic.generateCoachResponse(prompt);
      return { ...fallback, error };
    },
  };
}
