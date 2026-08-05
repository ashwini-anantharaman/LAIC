/**
 * Reference "mobile client" flow against the secured server: health → auth →
 * create learner → session → event → hint → streaming chat → end → postmortem →
 * recommendation, plus auth (401) and ownership (403) enforcement.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer } from "./createServer";
import { buildBridgeCoach, MockLLM } from "../coaching/index";

const KEY = "test-key";
const OTHER = "other-key";
let server: Server;
let base: string;

beforeAll(async () => {
  const coach = buildBridgeCoach({ llm: new MockLLM() });
  const app = createServer({ coach, apiKeys: [KEY, OTHER], llm: new MockLLM() });
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const auth = (token?: string) => ({
  "content-type": "application/json",
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});
const post = async (path: string, body: unknown, token?: string) => {
  const res = await fetch(base + path, { method: "POST", headers: auth(token), body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as any };
};
const get = async (path: string, token?: string) => {
  const res = await fetch(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: (await res.json()) as any };
};

describe("secured mobile flow", () => {
  it("serves /health without auth", async () => {
    const res = await fetch(base + "/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
    expect(body.domains).toContain("bridge_gameplay");
  });

  it("rejects unauthenticated API calls", async () => {
    const res = await get("/api/domains");
    expect(res.status).toBe(401);
  });

  it("runs the full authed loop and enforces ownership", async () => {
    // create learner (owned by KEY)
    const created = await post(
      "/api/learners",
      { name: "Mo", preferences: { feedbackStyle: "gentle", explanationDepth: "short" } },
      KEY,
    );
    expect(created.status).toBe(201);
    const learnerId = created.body.learnerId;

    // another identity cannot read it
    const cross = await get(`/api/learners/${learnerId}`, OTHER);
    expect(cross.status).toBe(403);

    // owner can
    const mine = await get(`/api/learners/${learnerId}`, KEY);
    expect(mine.status).toBe(200);

    // session + a wrong bid → hint
    const sess = await post("/api/sessions", { learnerId, domainId: "bridge_gameplay" }, KEY);
    const sessionId = sess.body.sessionId;
    const bid = await post(
      `/api/sessions/${sessionId}/events`,
      { eventType: "bid_made", action: { bid: "1NT", position: "S", hand: "S:KQ874 H:A3 D:K92 C:J54", auctionSoFar: [] } },
      KEY,
    );
    expect(bid.body.response.type).toBe("hint");

    // cross-identity cannot touch the session
    const crossSess = await get(`/api/sessions/${sessionId}`, OTHER);
    expect(crossSess.status).toBe(403);

    // end + postmortem + recommendation
    await post(`/api/sessions/${sessionId}/end`, {}, KEY);
    const pm = await get(`/api/sessions/${sessionId}/postmortem`, KEY);
    expect(pm.status).toBe(200);
    expect(pm.body.postmortem.interventionsCount).toBeGreaterThanOrEqual(1);

    const rec = await get(`/api/learners/${learnerId}/recommendation`, KEY);
    expect(rec.status).toBe(200);
    expect(rec.body.recommendation.kind).toBe("reinforce_weak");
  });

  it("streams a chat reply over SSE", async () => {
    const res = await fetch(base + "/api/llm/chat/stream", {
      method: "POST",
      headers: auth(KEY),
      body: JSON.stringify({ system: "You are a coach.", user: "Say hello." }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const raw = await res.text();
    const events = raw
      .split("\n\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => JSON.parse(l.slice(5).trim()));
    const done = events.find((e) => e.done);
    expect(done).toBeTruthy();
    expect(done.fromModel).toBe(true);
    const assembled = events.filter((e) => e.delta).map((e) => e.delta).join("");
    expect(typeof assembled).toBe("string");
    expect(assembled.length).toBeGreaterThan(0);
  });
});
