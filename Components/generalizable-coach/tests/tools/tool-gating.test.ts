/**
 * M3 gate — tool gating (C1).
 *
 * In assessment mode an answer-revealing tool is structurally absent; in
 * practice mode a permitted tool is present and fireable. The profile's
 * allowlist and per-tool minHintLevel are respected.
 */
import { describe, it, expect } from "vitest";
import { gateTools, toolRegistry, type CoachTool } from "../../platform/tools/index.js";
import type { CoachingPolicy } from "../../contracts/index.js";

const mk = (name: string, hints: CoachTool["policyHints"]): CoachTool => ({
  name,
  description: name,
  inputSchema: { type: "object" },
  policyHints: hints,
  handler: async () => ({ ok: true, data: { tool: name } }),
});

const revealAnswer = mk("reveal_answer", { revealsAnswer: true, category: "assessment" });
const flashcards = mk("request_flashcards", { category: "practice" });
const quiz = mk("request_quiz", { category: "assessment" });
const advanced = mk("advanced_hint", { minHintLevel: 2 });
const registry = toolRegistry([revealAnswer, flashcards, quiz, advanced]);

const policy = (enabledTools: string[]): CoachingPolicy => ({
  schemaVersion: "1.0.0",
  interventionMode: "guided_tutor",
  maxHintLevel: 4,
  enabledTools,
});

const names = (tools: CoachTool[]) => tools.map((t) => t.name);
const ALL = ["reveal_answer", "request_flashcards", "request_quiz", "advanced_hint"];

describe("tool gating", () => {
  it("hides a revealsAnswer tool in assessment mode", () => {
    const allowed = gateTools(registry, { policy: policy(ALL), mode: "assessment", currentHintLevel: 2 });
    expect(names(allowed)).not.toContain("reveal_answer");
    expect(names(allowed)).toContain("request_quiz"); // assessment tool that doesn't reveal the answer
  });

  it("exposes a practice tool in practice mode, and it is fireable", async () => {
    const allowed = gateTools(registry, { policy: policy(ALL), mode: "practice", currentHintLevel: 2 });
    const fc = allowed.find((t) => t.name === "request_flashcards");
    expect(fc).toBeTruthy();
    const result = await fc!.handler({ skillIds: ["s"] }, { learnerId: "L1", domainId: "d" });
    expect(result.ok).toBe(true);
  });

  it("respects the profile allowlist", () => {
    const allowed = gateTools(registry, { policy: policy(["request_flashcards"]), mode: "practice", currentHintLevel: 2 });
    expect(names(allowed)).toEqual(["request_flashcards"]);
  });

  it("withholds a tool until its minHintLevel is reached", () => {
    expect(names(gateTools(registry, { policy: policy(ALL), mode: "practice", currentHintLevel: 0 }))).not.toContain("advanced_hint");
    expect(names(gateTools(registry, { policy: policy(ALL), mode: "practice", currentHintLevel: 2 }))).toContain("advanced_hint");
  });
});
