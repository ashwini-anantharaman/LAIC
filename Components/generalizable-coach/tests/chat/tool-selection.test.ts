/**
 * M3/C5 gate — tool selection.
 *
 * The selector picks a tool ONLY from the gated `allowedTools` and fills a
 * plausible input; a gated-out tool is never selectable.
 */
import { describe, it, expect } from "vitest";
import { ToolSelector } from "../../platform/chat/index.js";
import { gateTools, toolRegistry, type CoachTool } from "../../platform/tools/index.js";
import type { CoachingPolicy } from "../../contracts/index.js";

const mk = (name: string, hints: CoachTool["policyHints"]): CoachTool => ({
  name,
  description: name,
  inputSchema: { type: "object" },
  policyHints: hints,
  handler: async () => ({ ok: true }),
});

const registry = toolRegistry([
  mk("reveal_answer", { revealsAnswer: true }),
  mk("request_quiz", { category: "assessment" }),
  mk("request_flashcards", { category: "practice" }),
]);

const policy: CoachingPolicy = {
  schemaVersion: "1.0.0",
  interventionMode: "guided_tutor",
  maxHintLevel: 4,
  enabledTools: ["reveal_answer", "request_quiz", "request_flashcards"],
};

const selector = new ToolSelector();
const ctx = { conceptIds: ["concept.memory_consolidation"] };

describe("tool selection", () => {
  it("picks the hinted tool and fills a schema-shaped input", () => {
    const allowed = gateTools(registry, { policy, mode: "practice" });
    const sel = selector.select({ kind: "command", text: "quiz me", toolHint: "quiz" }, allowed, ctx);
    expect(sel?.tool.name).toBe("request_quiz");
    expect(sel?.input).toMatchObject({ conceptIds: ["concept.memory_consolidation"], count: 3 });
  });

  it("cannot select a gated-out tool (assessment mode removed reveal_answer)", () => {
    const allowed = gateTools(registry, { policy, mode: "assessment" });
    expect(allowed.map((t) => t.name)).not.toContain("reveal_answer");
    // Even asking for it, the selector only sees allowed tools.
    const sel = selector.select({ kind: "command", text: "reveal", toolHint: "generic" }, allowed, ctx);
    expect(sel?.tool.name).not.toBe("reveal_answer");
  });

  it("returns null when nothing is allowed", () => {
    const allowed = gateTools(registry, { policy: { ...policy, enabledTools: [] }, mode: "practice" });
    expect(selector.select({ kind: "command", text: "quiz me", toolHint: "quiz" }, allowed, ctx)).toBeNull();
  });
});
