import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "owlwise-game-"));
process.env.LOCAL_DATA_DIR = tempDir;
delete process.env.SUPABASE_URL;
// Set to "" (not delete) so `import "dotenv/config"` (loads backend-ts/.env)
// can't repopulate DATABASE_URL and flip this flow into Postgres mode.
process.env.DATABASE_URL = "";
process.env.SUPABASE_DB_URL = "";
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

// Mock the Claude call so the test doesn't hit the network / need a key.
vi.mock("../src/claude", () => ({
  callClaudeJson: vi.fn(async () => ({
    title: "Squeeze Play",
    setup: "You hold the last three trumps at love all.",
    steps: [
      { narration: "Declarer leads the winning spade.", dialogue: "Watch the discards." },
      { narration: "West is squeezed and lets go a heart.", dialogue: null },
    ],
    outcome: "The contract makes because the squeeze forced a fatal discard.",
  })),
}));

const { createApp } = await import("../src/app");

const app = createApp();

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

async function call(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe("game scenario flow (local mode, mocked Claude)", () => {
  let ownerToken = "";
  let orgId = "";
  let programId = "";

  it("bootstraps an org + game program", async () => {
    const signup = await call("POST", "/api/platform/auth/signup", {
      signup_type: "org",
      org_name: "Game Org",
      email: "gameowner@test.dev",
      password: "password123",
    });
    ownerToken = signup.body.access_token;
    orgId = (await call("GET", "/api/platform/auth/me", undefined, ownerToken)).body.memberships[0]
      .org_id;
    const program = await call(
      "POST",
      `/api/platform/orgs/${orgId}/programs`,
      { name: "Bridge Coaching", category: "game", class_names: ["Tuesday"] },
      ownerToken,
    );
    programId = program.body.id;
  });

  it("generates, fetches, and lists a scenario", async () => {
    const gen = await call(
      "POST",
      "/api/game/scenarios",
      { program_id: programId, game_type: "bridge", prompt: "Teach a simple squeeze." },
      ownerToken,
    );
    expect(gen.status).toBe(200);
    expect(gen.body.title).toBe("Squeeze Play");
    expect(gen.body.steps).toHaveLength(2);
    const scenarioId = gen.body.id;

    const fetched = await call("GET", `/api/game/scenarios/${scenarioId}`, undefined, ownerToken);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(scenarioId);

    const listed = await call(
      "GET",
      `/api/game/scenarios?program_id=${programId}`,
      undefined,
      ownerToken,
    );
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
  });

  it("blocks a non-member from generating scenarios", async () => {
    const outsider = await call("POST", "/api/platform/auth/signup", {
      signup_type: "student",
      email: "gameoutsider@test.dev",
      password: "password123",
    });
    const gen = await call(
      "POST",
      "/api/game/scenarios",
      { program_id: programId, game_type: "bridge", prompt: "x" },
      outsider.body.access_token,
    );
    expect(gen.status).toBe(403);
  });

  it("404s an unknown scenario", async () => {
    const r = await call("GET", "/api/game/scenarios/nope", undefined, ownerToken);
    expect(r.status).toBe(404);
  });
});
