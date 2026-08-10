/**
 * Slice 5b — remaining legacy paths on Postgres (org setup, dashboard, theme,
 * join codes). Proves the frontend's load/onboarding/settings endpoints now run
 * coherently on Postgres. Skips offline.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nexus_dev npm test
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const tempDir = mkdtempSync(join(tmpdir(), "owlwise-5b-"));
process.env.LOCAL_DATA_DIR = tempDir;
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const RUN = Boolean(process.env.DATABASE_URL);

const { createApp } = await import("../src/app");
const { getDb, closeDb } = await import("../src/db/client");
const { organizations, profiles } = await import("../src/db/schema");

const app = createApp();
const emails: string[] = [];
let orgId = "";

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

afterAll(async () => {
  if (RUN) {
    const db = getDb();
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
    for (const e of emails) {
      const p = await db.select().from(profiles).where(eq(profiles.email, e));
      if (p.length) await db.delete(profiles).where(eq(profiles.id, p[0].id));
    }
    await closeDb();
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe.skipIf(!RUN)("Slice 5b — setup / dashboard / theme / join codes (Postgres)", () => {
  const owner = `owner5b_${Date.now()}@x.test`;
  const teacher = `teacher5b_${Date.now()}@x.test`;
  let token = "", programId = "", code = "";

  it("signs up an org", async () => {
    emails.push(owner);
    const r = await req("POST", "/api/platform/auth/signup", { signup_type: "org", org_name: "Setup Org", email: owner, password: "password123" });
    token = r.body.access_token;
    const me = await req("GET", "/api/platform/auth/me", undefined, token);
    orgId = me.body.memberships[0].org_id;
  });

  it("runs org setup (creates a program + stage tree)", async () => {
    const r = await req("PUT", `/api/platform/orgs/${orgId}/setup`, {
      has_challenge: true, challenge_name: "BB Challenge", stage_types: ["national"],
      permission_defaults: { administrator: { default_access: "edit" }, teacher: { default_access: "view" } },
      initial_stages: [],
      programs: [{ name: "Brain Bee", category: "edu", stage_type: "national", class_names: [] }],
    }, token);
    expect(r.status).toBe(200);
    const progs = await req("GET", `/api/platform/orgs/${orgId}/programs`, undefined, token);
    expect(progs.body.some((p: { name: string }) => p.name === "Brain Bee")).toBe(true);
    programId = progs.body.find((p: { name: string }) => p.name === "Brain Bee").id;
  });

  it("dashboard aggregates the org (with stages)", async () => {
    const r = await req("GET", `/api/platform/dashboard?org_id=${orgId}`, undefined, token);
    expect(r.status).toBe(200);
    expect(r.body.org_name).toBe("Setup Org");
    expect(r.body.stages.length).toBeGreaterThan(0);
  });

  it("theme update persists and shows on the dashboard", async () => {
    const t = await req("PATCH", `/api/platform/orgs/${orgId}/theme`, { accent_color: "#123456" }, token);
    expect(t.status).toBe(200);
    const d = await req("GET", `/api/platform/dashboard?org_id=${orgId}`, undefined, token);
    expect(d.body.theme_accent_color).toBe("#123456");
  });

  it("issues a program teacher join code, and a teacher signs up with it", async () => {
    const jc = await req("POST", `/api/platform/programs/${programId}/join-codes`, { kind: "teacher" }, token);
    expect(jc.status).toBe(200);
    code = jc.body.code;
    expect(code).toBeTruthy();

    emails.push(teacher);
    const su = await req("POST", "/api/platform/auth/signup", { signup_type: "teacher", email: teacher, password: "password123", join_code: code });
    expect(su.status).toBe(200);
    const me = await req("GET", "/api/platform/auth/me", undefined, su.body.access_token);
    expect(me.body.memberships[0].role).toBe("instructor");
    expect(me.body.memberships[0].program_id).toBe(programId);
  });
});
