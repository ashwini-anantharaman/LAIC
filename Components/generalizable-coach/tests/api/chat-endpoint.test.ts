/**
 * A / M3-finish gate — the conversational HTTP surface.
 *
 * A host opens a session, sends a chat message, and gets a grounded reply (plus
 * a gated tool call for a compound ask); the session thread is retrievable.
 * Runs offline: with no LLM key the phraser returns null → deterministic text.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createCoachService } from "../../api/coachService.js";

let server: Server;
let base: string;

beforeAll(async () => {
  const svc = createCoachService();
  await new Promise<void>((r) => {
    server = svc.app.listen(0, r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
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

describe("conversational HTTP surface", () => {
  it("opens a session, answers a compound message, and records the thread", async () => {
    const opened = await post("/api/coaching/sessions", { learnerId: "L1", domainId: "course_learning" });
    expect(opened.status).toBe(201);
    const sessionId = opened.body.sessionId;
    expect(sessionId).toBeTruthy();

    const asked = await post("/api/coaching/ask", {
      sessionId,
      message: "explain spaced repetition and quiz me",
    });
    expect(asked.status).toBe(200);
    expect(asked.body.intents.map((i: any) => i.kind)).toEqual(["ask", "command"]);
    expect(asked.body.reply).toMatch(/Neuroscience Primer/); // grounded + cited (deterministic offline)
    expect(asked.body.toolCalls).toHaveLength(1);
    expect(asked.body.toolCalls[0].call.tool).toBe("request_quiz");

    const thread = await get(`/api/coaching/sessions/${sessionId}`);
    expect(thread.status).toBe(200);
    expect(thread.body.history.length).toBe(2); // learner + coach
    expect(thread.body.history[0].role).toBe("learner");
  });

  it("declines an out-of-scope question over HTTP", async () => {
    const { body: opened } = await post("/api/coaching/sessions", { learnerId: "L2" });
    const asked = await post("/api/coaching/ask", {
      sessionId: opened.sessionId,
      message: "How do I bid a slam in bridge?",
    });
    expect(asked.body.declined).toBe(true);
    expect(asked.body.reply).toMatch(/outside what this lesson covers/);
  });

  it("400s a message with no session and 404s an unknown session", async () => {
    expect((await post("/api/coaching/sessions", {})).status).toBe(400); // no learnerId
    expect((await post("/api/coaching/ask", { sessionId: "nope", message: "hi" })).status).toBe(404);
  });
});
