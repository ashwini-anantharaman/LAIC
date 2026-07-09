/**
 * Zone 1 — Platform core: tool selection for the chat surface (LAIC §10.3, M3/C5).
 *
 * After gating decides WHICH tools are allowed, the selector picks one and
 * fills its input. It can only ever pick from `allowedTools`, so a gated-out or
 * out-of-scope action is unselectable by construction. Rule-based for now;
 * LLM function-calling layers on later.
 */
import type { CoachTool } from "../tools/index.js";
import type { Intent, ToolHint } from "./IntentRouter.js";

export interface SelectionContext {
  /** concepts in scope for this lesson — used to fill the tool input */
  conceptIds: string[];
}

export interface ToolSelection {
  tool: CoachTool;
  input: unknown;
}

const HINT_MATCHERS: Record<ToolHint, RegExp> = {
  quiz: /quiz|test/i,
  flashcards: /flash\s?card/i,
  study_plan: /study.?plan|plan/i,
  generic: /.^/, // never matches; falls through to category default
};

export class ToolSelector {
  select(intent: Intent, allowedTools: CoachTool[], ctx: SelectionContext): ToolSelection | null {
    if (allowedTools.length === 0) return null;

    let tool: CoachTool | undefined;
    if (intent.toolHint) {
      const re = HINT_MATCHERS[intent.toolHint];
      tool = allowedTools.find((t) => re.test(t.name) || re.test(t.description));
    }
    // Fallbacks: a practice-category tool, else the first allowed tool.
    tool ??= allowedTools.find((t) => t.policyHints?.category === "practice") ?? allowedTools[0];
    if (!tool) return null;

    const input = {
      topic: ctx.conceptIds[0],
      conceptIds: ctx.conceptIds,
      count: 3,
    };
    return { tool, input };
  }
}
