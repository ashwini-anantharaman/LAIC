// Identity layer behaviors: org-profile permissions, affiliation trust
// (pending unless self-administered), and the §3.5 active-org switch guard.

import type { NexusBridgeContext } from "@laic/learner-contracts";
import { describe, expect, it } from "vitest";
import { InMemoryProfileStore, ProfileService } from "./index";

const ctx = (over: Partial<NexusBridgeContext> = {}): NexusBridgeContext => ({
  laicOrgId: "org_laic",
  programId: "bridge_program",
  appId: "bridge_ai_coach",
  nexusUserId: "user_coach_carlos",
  programOrganizationId: "bporg_sunrise",
  roles: ["bridge_coach"],
  permissions: [],
  accessLevel: "coach",
  ...over,
});

const service = () =>
  new ProfileService(new InMemoryProfileStore(), { now: () => "2026-07-14T00:00:00.000Z" });

describe("org profile", () => {
  it("requires bridge.org.manage to save", async () => {
    const s = service();
    await expect(s.saveOrgProfile(ctx(), { bridgeOrgType: "bridge_club" })).rejects.toThrow(
      /bridge.org.manage/,
    );
    const saved = await s.saveOrgProfile(ctx({ permissions: ["bridge.org.manage"] }), {
      allowedBiddingSystems: ["kb_sayc"],
    });
    expect(saved.allowedBiddingSystems).toEqual(["kb_sayc"]);
  });
});

describe("affiliations", () => {
  it("lands pending unless self-administered or independent", async () => {
    const s = service();
    const pending = await s.addAffiliation(ctx(), {
      programOrganizationId: "bporg_other",
      affiliationType: "club_coach",
    });
    expect(pending.status).toBe("pending");

    const independent = await s.addAffiliation(ctx(), { affiliationType: "independent" });
    expect(independent.status).toBe("active");

    const self = await s.addAffiliation(
      ctx({ permissions: ["bridge.org.manage"] }),
      { programOrganizationId: "bporg_sunrise", affiliationType: "organization_coach" },
    );
    expect(self.status).toBe("active");
  });

  it("switchActiveOrg requires an ACTIVE affiliation", async () => {
    const s = service();
    await expect(s.switchActiveOrg(ctx(), "bporg_other")).rejects.toThrow(/active affiliation/i);

    await s.addAffiliation(ctx(), { affiliationType: "independent" });
    await s.addAffiliation(
      ctx({ permissions: ["bridge.org.manage"] }),
      { programOrganizationId: "bporg_sunrise", affiliationType: "organization_coach" },
    );
    await s.switchActiveOrg(ctx(), "bporg_sunrise");
    expect((await s.getUserProfile(ctx()))?.activeProgramOrganizationId).toBe("bporg_sunrise");

    await s.switchActiveOrg(ctx(), null);
    expect((await s.getUserProfile(ctx()))?.activeProgramOrganizationId).toBeUndefined();
  });
});
