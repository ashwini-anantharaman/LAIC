import { describe, it, expect } from "vitest";
import { createCoachSession } from "./createBridgeCoachSession.js";
import { scoreChunks } from "../../../platform/embed/index.js";
import { loadBridgeKnowledge } from "../knowledge/loadPackage.js";
import type { LLMLike } from "../../../platform/llm/index.js";

const echoLLM: LLMLike = {
  async generateCoachResponse(prompt) {
    return { text: `[model saw: ${prompt.user.slice(0, 40)}…]`, fromModel: true };
  },
};

describe("free-form chat", () => {
  it("keyword retrieval surfaces relevant chunks", () => {
    const chunks = [...loadBridgeKnowledge().chunks];
    const hits = scoreChunks("what is a finesse and when should I take one?", chunks);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((c) => c.conceptIds.includes("CONCEPT_FINESSE"))).toBe(true);
  });

  it("chat() uses the injected model and reports fromModel", async () => {
    const coach = createCoachSession({ learnerId: "S", llm: echoLLM });
    expect(coach.hasModel).toBe(true);
    const r = await coach.chat("why did we play in hearts?", { contract: "4H" });
    expect(r.fromModel).toBe(true);
    expect(r.message).toContain("[model saw:");
  });

  it("chat() without a model returns a capability note, not an error", async () => {
    const coach = createCoachSession({ learnerId: "S" });
    expect(coach.hasModel).toBe(false);
    const r = await coach.chat("explain the hold-up play");
    expect(r.fromModel).toBe(false);
    expect(r.message).toMatch(/API key/i);
  });
});
