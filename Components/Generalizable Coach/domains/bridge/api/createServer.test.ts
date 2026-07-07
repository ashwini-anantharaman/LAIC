import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer } from "./createServer.js";
import { buildBridgeCoach, MockLLM } from "../coaching/index.js";

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

async function post(path: string, body: unknown) {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function get(path: string) {
  const res = await fetch(base + path);
  return { status: res.status, body: (await res.json()) as any };
}

describe("Coaching API (mobile client flow)", () => {
  it("runs a full sequence: create → session → event → hint → end", async () => {
    // 1. Create learner
    const created = await post("/api/learners", {
      name: "Alice",
      preferences: { feedbackStyle: "gentle", explanationDepth: "short" },
    });
    expect(created.status).toBe(201);
    const learnerId = created.body.learnerId;
    expect(learnerId).toBeTruthy();

    // 2. Start session
    const sess = await post("/api/sessions", {
      learnerId,
      domainId: "bridge_gameplay",
    });
    expect(sess.status).toBe(201);
    const sessionId = sess.body.sessionId;

    // 3. Send an incorrect bid_made event → coach hints
    const bid = await post(`/api/sessions/${sessionId}/events`, {
      eventType: "bid_made",
      action: {
        bid: "1NT",
        position: "S",
        hand: "S:KQ874 H:A3 D:K92 C:J54",
        auctionSoFar: [],
      },
    });
    expect(bid.status).toBe(200);
    expect(bid.body.response.type).toBe("hint");
    expect(bid.body.response.level).toBe(2);

    // 4. Request a hint → escalated response
    const hint = await post(`/api/sessions/${sessionId}/hint`, {});
    expect(hint.status).toBe(200);
    expect(hint.body.response.level).toBe(3);

    // 5. End session → summary with logs
    const ended = await post(`/api/sessions/${sessionId}/end`, {});
    expect(ended.status).toBe(200);
    expect(ended.body.session.status).toBe("completed");
    expect(ended.body.session.events.length).toBeGreaterThanOrEqual(2);
    expect(ended.body.session.coachInteractions.length).toBeGreaterThanOrEqual(2);

    // learner profile reflects the mistake
    const profile = await get(`/api/learners/${learnerId}`);
    expect(profile.status).toBe(200);
    const skills = profile.body.domains["bridge_gameplay"].skillStates;
    expect(skills.some((s: any) => s.mistakeCount > 0)).toBe(true);
  });

  it("coaches a card play through the API", async () => {
    const created = await post("/api/learners", {
      name: "Cara",
      preferences: { feedbackStyle: "direct", explanationDepth: "short" },
    });
    const learnerId = created.body.learnerId;
    const sess = await post("/api/sessions", { learnerId });
    const sessionId = sess.body.sessionId;

    // list + fetch a scenario (answer must be stripped)
    const list = await get("/api/cardplay/scenarios");
    expect(list.body.length).toBeGreaterThan(0);
    const scenarioId = "cp_finesse_hearts";
    const scen = await get(`/api/cardplay/scenario/${scenarioId}`);
    expect(scen.status).toBe(200);
    expect(scen.body.bestCards).toBeUndefined(); // not leaked to client
    expect(scen.body.legalCards).toContain("HQ");

    // wrong play → hint
    const wrong = await post(`/api/sessions/${sessionId}/events`, {
      eventType: "card_played",
      action: { card: "HA", position: "N", scenarioId },
    });
    expect(wrong.status).toBe(200);
    expect(wrong.body.response.type).toBe("hint");
    expect(wrong.body.response.metadata.relatedSkillIds).toContain("SKILL_TAKE_FINESSE");

    // unknown scenario id → 400
    const bad = await post(`/api/sessions/${sessionId}/events`, {
      eventType: "card_played",
      action: { card: "HQ", position: "N", scenarioId: "nope" },
    });
    expect(bad.status).toBe(400);
  });

  it("generates a practice deal", async () => {
    const deal = await post("/api/deals/generate", { mode: "opening" });
    expect(deal.status).toBe(200);
    expect(deal.body.hands.S).toMatch(/^S:/);
    expect(deal.body.expectedBid).toBeTruthy();
  });

  it("404s for an unknown session", async () => {
    const res = await get("/api/sessions/does-not-exist");
    expect(res.status).toBe(404);
  });
});
