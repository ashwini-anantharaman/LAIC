import { describe, expect, it } from "vitest";
import type { NexusBridgeContext, NexusClient } from "./index.js";
import { PACKAGE_NAME } from "./index.js";

// Phase 0 acceptance: the shared contracts package is importable from a bridge
// package and its shapes typecheck. Runtime assertions are minimal by design —
// the value here is that this file compiles against @laic/learner-contracts.
describe("@bridge/nexus-client contracts wiring", () => {
  it("typechecks a NexusBridgeContext from @laic/learner-contracts", async () => {
    const context: NexusBridgeContext = {
      nexusUserId: "user_dev_1",
      laicOrgId: "org_laic",
      programId: "bridge_program",
      programOrganizationId: "bridge_org_sample_club",
      appId: "bridge_ai_coach",
      roles: ["bridge_learner"],
      permissions: [],
      accessLevel: "learner",
    };

    const client: NexusClient = {
      getBridgeContext: async () => context,
    };

    const resolved = await client.getBridgeContext();
    expect(resolved.programId).toBe("bridge_program");
    expect(resolved.roles).toContain("bridge_learner");
    expect(PACKAGE_NAME).toBe("@bridge/nexus-client");
  });
});
