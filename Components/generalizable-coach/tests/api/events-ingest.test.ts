/**
 * M0 gate — event ingestion.
 *
 * A valid ActivityEvent POSTed to /api/coaching/events is validated and
 * persisted to the raw event log; a malformed one is rejected with 400 and is
 * NOT persisted. This is the DoD3 endpoint for Milestone 0.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createCoachService } from "../../api/coachService";
import { CONTRACTS_SCHEMA_VERSION } from "../../contracts/index";

let server: Server;
let base: string;
let eventLog: ReturnType<typeof createCoachService>["eventLog"];

beforeAll(async () => {
  const svc = createCoachService();
  eventLog = svc.eventLog;
  await new Promise<void>((resolve) => {
    server = svc.app.listen(0, resolve);
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

const goodEvent = {
  schemaVersion: CONTRACTS_SCHEMA_VERSION,
  eventId: "evt-1",
  domainId: "bridge_gameplay",
  eventType: "bid_made",
  timestamp: "2026-07-08T12:00:00.000Z",
  sessionId: "sess-1",
  actorId: "learner-1",
  action: { bid: "1NT" },
};

describe("POST /api/coaching/events", () => {
  it("accepts and persists a valid ActivityEvent", async () => {
    const before = eventLog.count();
    const res = await post("/api/coaching/events", goodEvent);
    expect(res.status).toBe(201);
    expect(res.body.stored).toBe(true);
    expect(res.body.eventId).toBe("evt-1");
    expect(eventLog.count()).toBe(before + 1);

    const listed = await get("/api/coaching/events?sessionId=sess-1");
    expect(listed.status).toBe(200);
    expect(listed.body.events).toHaveLength(1);
    expect(listed.body.events[0].eventId).toBe("evt-1");
  });

  it("rejects a malformed ActivityEvent with 400 and does not persist it", async () => {
    const before = eventLog.count();
    const res = await post("/api/coaching/events", {
      schemaVersion: CONTRACTS_SCHEMA_VERSION,
      eventId: "bad",
      // missing domainId / eventType / timestamp / sessionId / actorId
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid ActivityEvent/);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(eventLog.count()).toBe(before);
  });

  it("reports a healthy service with the contracts version", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.contractsVersion).toBe(CONTRACTS_SCHEMA_VERSION);
  });
});
