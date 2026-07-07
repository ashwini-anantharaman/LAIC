import { describe, it, expect } from "vitest";
import "./register.js"; // side-effect: registers the bridge domain
import { listDomains, openCoachSession } from "../../../platform/embed/registry.js";
import { BRIDGE_DOMAIN_ID } from "../plugin/constants.js";
import { MockLLM } from "./MockLLM.js";

describe("bridge domain registration", () => {
  it("appears in the registry", () => {
    expect(listDomains()).toContain(BRIDGE_DOMAIN_ID);
  });

  it("opens a working coach session via the registry front desk", () => {
    const coach = openCoachSession(BRIDGE_DOMAIN_ID, {
      learnerId: "S",
      llm: new MockLLM(),
    });
    expect(coach.domainId).toBe(BRIDGE_DOMAIN_ID);
    expect(coach.hasModel).toBe(true);
  });

  it("throws a helpful error for an unknown domain", () => {
    expect(() => openCoachSession("nope", { learnerId: "S" })).toThrow(/Unknown domain/);
  });
});
