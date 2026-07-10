/**
 * Bridge context endpoint mapping tests (no Supabase needed — auth is
 * overridden with synthetic PlatformUsers, mirroring the Python test).
 */

import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { getSettings } from "../src/config";
import { setCurrentUserOverride, type PlatformUser } from "../src/auth";
import type { Membership } from "../src/permissions";

function _user(
  role: string | null,
  email = "u@example.com",
  stage: string | null = "stage-1",
): PlatformUser {
  let memberships: Membership[] = [];
  if (role !== null) {
    memberships = [
      {
        id: "m1",
        org_id: "org-abc",
        profile_id: "u1",
        role,
        stage_node_id: stage,
        access: "view",
      },
    ];
  }
  return { id: "u1", email, display_name: "U", role: "student", memberships };
}

async function _ctx(user: PlatformUser): Promise<any> {
  setCurrentUserOverride(() => user);
  try {
    const app = createApp();
    const resp = await app.request("/api/platform/bridge/context");
    const text = await resp.text();
    expect(resp.status, text).toBe(200);
    return JSON.parse(text);
  } finally {
    setCurrentUserOverride(null);
  }
}

afterEach(() => setCurrentUserOverride(null));

describe("bridge context", () => {
  it("student maps to learner with org and group scope", async () => {
    const ctx = await _ctx(_user("student"));
    expect(ctx.roles).toEqual(["bridge_learner"]);
    expect(ctx.accessLevel).toBe("learner");
    expect(ctx.programId).toBe("bridge_program");
    expect(ctx.programOrganizationId).toBe("org-abc");
    expect(ctx.groupId).toBe("stage-1");
    expect(ctx.permissions).toContain("bridge.progress.read_own");
  });

  it("teacher maps to coach and owner to org admin", async () => {
    expect((await _ctx(_user("teacher"))).roles).toEqual(["bridge_coach"]);
    const admin = await _ctx(_user("owner"));
    expect(admin.roles).toEqual(["bridge_org_admin"]);
    expect(admin.accessLevel).toBe("admin");
  });

  it("config-seeded program roles", async () => {
    const settings = getSettings();
    settings.bridgeProgramAdminEmails = "paul@example.com";
    settings.bridgeReviewerEmails = "rhea@example.com";
    try {
      const paul = await _ctx(_user(null, "paul@example.com"));
      expect(paul.roles).toEqual(["bridge_program_admin"]);
      expect(paul.accessLevel).toBe("admin");
      expect(paul.programOrganizationId).toBeNull(); // program-wide scope

      const rhea = await _ctx(_user(null, "rhea@example.com"));
      expect(new Set(rhea.roles)).toEqual(new Set(["bridge_reviewer", "bridge_fellow"]));
      expect(rhea.accessLevel).toBe("reviewer");

      // Org-scoped user who is ALSO program admin keeps program-wide power.
      const both = await _ctx(_user("student", "paul@example.com"));
      expect(both.roles).toContain("bridge_program_admin");
      expect(both.roles).toContain("bridge_learner");
      expect(both.accessLevel).toBe("admin");
    } finally {
      settings.bridgeProgramAdminEmails = "";
      settings.bridgeReviewerEmails = "";
    }
  });

  it("no memberships is guest", async () => {
    const ctx = await _ctx(_user(null));
    expect(ctx.roles).toEqual(["bridge_guest"]);
    expect(ctx.accessLevel).toBe("guest");
  });
});
