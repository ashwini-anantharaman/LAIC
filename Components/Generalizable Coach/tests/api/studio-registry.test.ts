/**
 * M2 gate — Configuration Studio registry via the API (B5).
 *
 * The DoD flow, all via HTTP with zero code changes: clone the "Bridge Beginner
 * Coach" preset, cap maxHintLevel at 3, disable slam bidding, publish a version,
 * deploy an instance — and preview that the cap actually took effect.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createCoachService } from "../../api/coachService.js";

let server: Server;
let base: string;

beforeAll(async () => {
  const svc = createCoachService();
  await new Promise<void>((resolve) => {
    server = svc.app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = async (path: string, body?: unknown) => {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: (await res.json()) as any };
};
const get = async (path: string) => {
  const res = await fetch(base + path);
  return { status: res.status, body: (await res.json()) as any };
};

describe("Configuration Studio (API)", () => {
  it("lists the seeded Bridge Beginner preset", async () => {
    const { status, body } = await get("/api/coaching/profiles?presets=true");
    expect(status).toBe(200);
    expect(body.profiles.map((p: any) => p.id)).toContain("preset.bridge_beginner");
  });

  it("clone → publish → deploy → preview, with a capped hint level and forbidden concept", async () => {
    // 1. Clone the preset, cap maxHintLevel at 3, disable slam bidding.
    const cloned = await post("/api/coaching/profiles", {
      basePresetId: "preset.bridge_beginner",
      name: "Club Beginner (capped)",
      policyOverrides: { maxHintLevel: 3 },
      forbiddenConceptIds: ["concept.slam_bidding"],
    });
    expect(cloned.status).toBe(201);
    const profileId = cloned.body.profile.id;
    expect(cloned.body.profile.basePresetId).toBe("preset.bridge_beginner"); // lineage
    expect(cloned.body.profile.status).toBe("draft");

    // 2. The clone carried the overrides into its policy profile + knowledge scope.
    const bundle = await get(`/api/coaching/profiles/${profileId}`);
    expect(bundle.body.policyProfile.interventionPolicy.maxHintLevel).toBe(3);
    expect(bundle.body.knowledgeScope.forbiddenConceptIds).toContain("concept.slam_bidding");

    // 3. Deploying a draft is rejected.
    const early = await post("/api/coaching/instances", { profileId, mode: "live_coach" });
    expect(early.status).toBe(400);

    // 4. Publish a version.
    const published = await post(`/api/coaching/profiles/${profileId}/versions`);
    expect(published.status).toBe(201);
    expect(published.body.profile.status).toBe("published");
    expect(published.body.versions.length).toBe(1);

    // 5. Deploy an instance.
    const deployed = await post("/api/coaching/instances", { profileId, mode: "live_coach" });
    expect(deployed.status).toBe(201);
    const instanceId = deployed.body.instance.id;
    expect(deployed.body.instance.coachProfileId).toBe(profileId);
    expect(deployed.body.instance.domainId).toBe("bridge_gameplay");

    const fetched = await get(`/api/coaching/instances/${instanceId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.instance.id).toBe(instanceId);

    // 6. Preview: the maxHintLevel cap is really in effect (direct-ish major → clamped to 3).
    const preview = await post(`/api/coaching/profiles/${profileId}/preview`, {
      evaluation: { correctness: "incorrect", confidence: 1, conceptIds: ["c"], skillIds: ["s"], severity: "critical" },
      hintRequested: true,
      currentHintLevel: 4,
    });
    expect(preview.status).toBe(200);
    expect(preview.body.resolvedPolicy.maxHintLevel).toBe(3);
    expect(preview.body.decision.hintLevel).toBeLessThanOrEqual(3);
  });
});
