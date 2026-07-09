import { describe, expect, it } from "vitest";
import {
  canAccessAdminArea,
  createNexusClient,
  hasAnyRole,
  NexusContextError,
  STUB_USERS,
} from "./index";

describe("StubNexusClient", () => {
  it("returns a context for every seeded stub user", async () => {
    for (const user of STUB_USERS) {
      const client = createNexusClient({
        mode: "stub",
        devUserId: user.devUserId,
      });
      const context = await client.getBridgeContext();
      expect(context.nexusUserId).toBe(user.context.nexusUserId);
      expect(context.programId).toBe("bridge_program");
      expect(context.appId).toBe("bridge_ai_coach");
      expect(context.roles.length).toBeGreaterThan(0);
    }
  });

  it("covers every role named in the Phase 1 plan", () => {
    const allRoles = new Set(STUB_USERS.flatMap((u) => u.context.roles));
    for (const role of [
      "bridge_learner",
      "bridge_coach",
      "bridge_org_admin",
      "bridge_program_admin",
      "bridge_reviewer",
    ]) {
      expect(allRoles.has(role as never), `missing stub for ${role}`).toBe(
        true,
      );
    }
  });

  it("rejects unknown stub users", async () => {
    const client = createNexusClient({ mode: "stub", devUserId: "nobody" });
    await expect(client.getBridgeContext()).rejects.toBeInstanceOf(
      NexusContextError,
    );
  });

  it("returns fresh copies so callers cannot mutate seed data", async () => {
    const client = createNexusClient({
      mode: "stub",
      devUserId: "user_learner_lena",
    });
    const first = await client.getBridgeContext();
    first.roles.push("bridge_program_admin");
    const second = await client.getBridgeContext();
    expect(second.roles).toEqual(["bridge_learner"]);
  });
});

describe("access helpers", () => {
  const byId = (id: string) =>
    STUB_USERS.find((u) => u.devUserId === id)!.context;

  it("gates the admin area by role", () => {
    expect(canAccessAdminArea(byId("user_learner_lena"))).toBe(false);
    expect(canAccessAdminArea(byId("user_coach_carlos"))).toBe(false);
    expect(canAccessAdminArea(byId("user_orgadmin_olivia"))).toBe(true);
    expect(canAccessAdminArea(byId("user_progadmin_paul"))).toBe(true);
    expect(canAccessAdminArea(byId("user_reviewer_rhea"))).toBe(true);
  });

  it("hasAnyRole matches any of the requested roles", () => {
    const coach = byId("user_coach_carlos");
    expect(hasAnyRole(coach, ["bridge_coach", "bridge_fellow"])).toBe(true);
    expect(hasAnyRole(coach, ["bridge_fellow"])).toBe(false);
  });
});

describe("HttpNexusClient", () => {
  it("targets the Phase 10 endpoint with a bearer token", async () => {
    let requestedUrl = "";
    let authHeader = "";
    const fakeFetch: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      authHeader = new Headers(init?.headers).get("Authorization") ?? "";
      return Response.json(STUB_USERS[0]!.context);
    };

    const client = createNexusClient({
      mode: "http",
      baseUrl: "https://nexus.example.com/",
      accessToken: "jwt-123",
      fetchImpl: fakeFetch,
    });
    const context = await client.getBridgeContext();

    expect(requestedUrl).toBe(
      "https://nexus.example.com/api/platform/bridge/context",
    );
    expect(authHeader).toBe("Bearer jwt-123");
    expect(context.nexusUserId).toBe("user_learner_lena");
  });

  it("rejects malformed context responses", async () => {
    const fakeFetch: typeof fetch = async () =>
      Response.json({ nexusUserId: "u1" });
    const client = createNexusClient({
      mode: "http",
      baseUrl: "https://nexus.example.com",
      accessToken: "jwt-123",
      fetchImpl: fakeFetch,
    });
    await expect(client.getBridgeContext()).rejects.toBeInstanceOf(
      NexusContextError,
    );
  });
});
