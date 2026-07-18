/**
 * Slice 7/8 — signup-hook rate limiting (v0.4 §31). Local mode; always runs.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "owlwise-ratelimit-"));
process.env.LOCAL_DATA_DIR = tempDir;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.DATABASE_URL = ""; // force local mode ("" not delete — dotenv would repopulate)
process.env.SUPABASE_DB_URL = "";
process.env.HOOK_RATE_LIMIT_PER_MIN = "3";

const { createApp } = await import("../src/app");
const app = createApp();

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

describe("signup-hook rate limiting", () => {
  it("throttles a single app after its per-minute limit", async () => {
    // Setup: org → program → offering → app (gives an API key).
    const su = await req("POST", "/api/platform/auth/signup", { signup_type: "org", org_name: "RL Org", email: `rl_${Date.now()}@x.test`, password: "password123" });
    const token = su.body.access_token;
    const me = await req("GET", "/api/platform/auth/me", undefined, token);
    const orgId = me.body.memberships[0].org_id;
    const prog = await req("POST", `/api/platform/orgs/${orgId}/programs`, { name: "P", category: "edu", stage_type: "national" }, token);
    const off = await req("POST", `/api/programs/${prog.body.id}/offerings`, { name: "App", offering_type: "app", approval_mode: "auto_approve" }, token);
    const appRes = await req("POST", `/api/programs/${prog.body.id}/apps`, { app_name: "Hook App", offering_id: off.body.id }, token);
    const apiKey = appRes.body.api_key as string;
    const slug = appRes.body.app_slug as string;

    const call = () =>
      app.request(`/api/hook/signup-fields?appSlug=${slug}&offeringId=${off.body.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

    // Limit is 3/min → first 3 succeed, 4th is throttled.
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const fourth = await call();
    expect(fourth.status).toBe(429);
  });
});
