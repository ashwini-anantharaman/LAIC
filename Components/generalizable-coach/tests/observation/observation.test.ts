/**
 * M3 gate — observation store (C3).
 *
 * An ingested event lands in BOTH the raw event log and, separately, the
 * observation store (the interpreted view) — the raw/model split enforced.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createCoachService } from "../../api/coachService.js";
import { buildObservation, InMemoryObservationStore } from "../../platform/observation/index.js";
import { CONTRACTS_SCHEMA_VERSION } from "../../contracts/index.js";

describe("buildObservation", () => {
  it("interprets a raw event without an evaluation", () => {
    const store = new InMemoryObservationStore();
    const o = buildObservation({
      schemaVersion: CONTRACTS_SCHEMA_VERSION,
      eventId: "e1",
      domainId: "course_learning",
      eventType: "quiz_attempted",
      timestamp: "2026-07-08T00:00:00.000Z",
      sessionId: "s1",
      actorId: "L1",
    });
    store.append(o);
    expect(o.learnerId).toBe("L1");
    expect(o.eventType).toBe("quiz_attempted");
    expect(store.list({ learnerId: "L1" })).toHaveLength(1);
  });
});

describe("event ingest → raw log + observation (API)", () => {
  let server: Server;
  let base: string;
  let svc: ReturnType<typeof createCoachService>;

  beforeAll(async () => {
    svc = createCoachService();
    await new Promise<void>((r) => {
      server = svc.app.listen(0, r);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("stores the raw event AND a separate observation", async () => {
    const event = {
      schemaVersion: CONTRACTS_SCHEMA_VERSION,
      eventId: "evt-obs-1",
      domainId: "course_learning",
      eventType: "quiz_attempted",
      timestamp: "2026-07-08T12:00:00.000Z",
      sessionId: "sess-1",
      actorId: "L1",
    };
    const res = await fetch(base + "/api/coaching/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
    expect(res.status).toBe(201);

    expect(svc.eventLog.count()).toBe(1); // raw log
    const obs = (await (await fetch(base + "/api/coaching/observations?learnerId=L1")).json()) as {
      observations: { eventId: string }[];
    };
    expect(obs.observations).toHaveLength(1); // separate interpreted view
    expect(obs.observations[0].eventId).toBe("evt-obs-1");
  });
});
