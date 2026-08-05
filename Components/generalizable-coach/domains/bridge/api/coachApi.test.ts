import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer } from "./createServer";
import { buildBridgeCoach, MockLLM } from "../coaching/index";

let server: Server;
let base: string;

beforeAll(async () => {
  const coach = buildBridgeCoach({ llm: new MockLLM() });
  const app = createServer({ coach });
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = async (path: string, body: unknown) => {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
};
const get = async (path: string) => {
  const res = await fetch(base + path);
  return { status: res.status, body: (await res.json()) as any };
};

describe("Phase 2b API (Common Coach + postmortem + registry)", () => {
  it("lists registered domains", async () => {
    const res = await get("/api/domains");
    expect(res.status).toBe(200);
    expect(res.body.domains).toContain("bridge_gameplay");
  });

  it("recommends the weak skill and produces a postmortem after a wrong bid", async () => {
    const learner = await post("/api/learners", {
      name: "Dana",
      preferences: { feedbackStyle: "gentle", explanationDepth: "short" },
    });
    const learnerId = learner.body.learnerId;
    const sess = await post("/api/sessions", { learnerId, domainId: "bridge_gameplay" });
    const sessionId = sess.body.sessionId;

    // Wrong bid: 5-card major but opens 1NT → incorrect → coach hints.
    const bid = await post(`/api/sessions/${sessionId}/events`, {
      eventType: "bid_made",
      action: { bid: "1NT", position: "S", hand: "S:KQ874 H:A3 D:K92 C:J54", auctionSoFar: [] },
    });
    expect(bid.body.response.type).toBe("hint");

    // Recommendation: reinforce the now-weak opening skill.
    const rec = await get(`/api/learners/${learnerId}/recommendation?domainId=bridge_gameplay`);
    expect(rec.status).toBe(200);
    expect(rec.body.recommendation.kind).toBe("reinforce_weak");
    expect(rec.body.recommendation.skillId).toBe("SKILL_OPENING_1SUIT");
    expect(rec.body.weakSkills.length).toBeGreaterThan(0);

    // Postmortem reflects the coached mistake.
    await post(`/api/sessions/${sessionId}/end`, {});
    const pm = await get(`/api/sessions/${sessionId}/postmortem`);
    expect(pm.status).toBe(200);
    expect(pm.body.postmortem.interventionsCount).toBeGreaterThanOrEqual(1);
    expect(pm.body.postmortem.coachedConcepts).toContain("CONCEPT_OPENING_BID");
    expect(pm.body.postmortem.suggestions.length).toBeGreaterThan(0);
  });

  it("404s a postmortem for an unknown session", async () => {
    const res = await get("/api/sessions/nope/postmortem");
    expect(res.status).toBe(404);
  });
});
