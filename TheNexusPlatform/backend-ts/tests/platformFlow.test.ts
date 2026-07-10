import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

// Isolated local store BEFORE importing app modules (forces demo mode since
// SUPABASE_URL is unset in tests).
const tempDir = mkdtempSync(join(tmpdir(), "owlwise-flow-"));
process.env.LOCAL_DATA_DIR = tempDir;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { createApp } = await import("../src/app");

const app = createApp();

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

async function req(method: string, path: string, body?: unknown, token?: string) {
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

describe("platform flow (local mode, end-to-end via app.request)", () => {
  let ownerToken = "";
  let orgId = "";
  let programId = "";
  let stageId = "";
  let studentCode = "";

  it("signs up an org owner", async () => {
    const r = await req("POST", "/api/platform/auth/signup", {
      signup_type: "org",
      org_name: "Flow Test Org",
      email: "owner@flow.test",
      password: "password123",
      display_name: "Owner",
    });
    expect(r.status).toBe(200);
    expect(r.body.role).toBe("org_admin");
    expect(r.body.access_token).toBeTruthy();
    ownerToken = r.body.access_token;
  });

  it("rejects org signup without org_name", async () => {
    const r = await req("POST", "/api/platform/auth/signup", {
      signup_type: "org",
      email: "other@flow.test",
      password: "password123",
    });
    expect(r.status).toBe(400);
    expect(r.body.detail).toBe("org_name is required for org signup");
  });

  it("logs in and fetches /auth/me with a membership", async () => {
    const login = await req("POST", "/api/platform/auth/login", {
      email: "owner@flow.test",
      password: "password123",
    });
    expect(login.status).toBe(200);
    const me = await req("GET", "/api/platform/auth/me", undefined, login.body.access_token);
    expect(me.status).toBe(200);
    expect(me.body.memberships).toHaveLength(1);
    expect(me.body.memberships[0].role).toBe("owner");
    orgId = me.body.memberships[0].org_id;
  });

  it("me without token is 401 with detail envelope", async () => {
    const r = await req("GET", "/api/platform/auth/me");
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ detail: "Authentication required" });
  });

  it("runs org setup with a challenge, stages, and programs", async () => {
    const r = await req(
      "PUT",
      `/api/platform/orgs/${orgId}/setup`,
      {
        has_challenge: true,
        challenge_name: "Flow Challenge",
        stage_types: ["national", "chapter"],
        permission_defaults: {
          administrator: { default_access: "edit" },
          teacher: { default_access: "per_level", per_level_overrides: { chapter: "edit" } },
        },
        initial_stages: [
          {
            stage_type: "national",
            name: "National Round",
            children: [{ stage_type: "chapter", name: "Chapter A" }],
          },
        ],
        programs: [{ name: "Flow Edu Program", category: "edu", stage_type: "chapter" }],
      },
      ownerToken,
    );
    expect(r.status).toBe(200);
    expect(r.body.org_id).toBe(orgId);
  });

  it("lists programs with counts", async () => {
    const r = await req("GET", `/api/platform/orgs/${orgId}/programs`, undefined, ownerToken);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].category).toBe("edu");
    expect(r.body[0].course_count).toBe(0);
    programId = r.body[0].id;
  });

  it("returns the visible stage tree", async () => {
    const r = await req("GET", `/api/platform/orgs/${orgId}/stages`, undefined, ownerToken);
    expect(r.status).toBe(200);
    const names = r.body.map((n: { name: string }) => n.name);
    expect(names).toContain("National Round");
    const national = r.body.find((n: { name: string }) => n.name === "National Round");
    expect(national.children).toHaveLength(1);
    expect(national.children[0].path.startsWith(national.path)).toBe(true);
    stageId = national.children[0].id;
  });

  it("creates a student join code on a stage", async () => {
    const r = await req(
      "POST",
      `/api/platform/stages/${stageId}/join-codes`,
      { kind: "student" },
      ownerToken,
    );
    expect(r.status).toBe(200);
    expect(r.body.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(r.body.redeem_url).toContain(`join_code=${r.body.code}`);
    studentCode = r.body.code;
  });

  it("validates and consumes the join code for a student signup", async () => {
    const validate = await req("GET", `/api/platform/join-codes/${studentCode}`);
    expect(validate.status).toBe(200);
    expect(validate.body.kind).toBe("student");

    const signup = await req("POST", "/api/platform/auth/signup", {
      signup_type: "student",
      email: "student@flow.test",
      password: "password123",
      display_name: "Student",
    });
    expect(signup.status).toBe(200);

    const register = await req(
      "POST",
      `/api/platform/join-codes/${studentCode}/register`,
      { display_name: "Student One" },
      signup.body.access_token,
    );
    expect(register.status).toBe(200);
    expect(register.body.ok).toBe(true);
    expect(register.body.org_id).toBe(orgId);
  });

  it("register without auth is 401", async () => {
    const r = await req("POST", `/api/platform/join-codes/${studentCode}/register`, {});
    expect(r.status).toBe(401);
  });

  it("shows the student on the dashboard", async () => {
    const r = await req("GET", `/api/platform/dashboard?org_id=${orgId}`, undefined, ownerToken);
    expect(r.status).toBe(200);
    expect(r.body.role_label).toBe("Owner");
    expect(r.body.total_signups).toBe(1);
    const activeStage = r.body.stages.find((s: { id: string }) => s.id === stageId);
    expect(activeStage.signup_count).toBe(1);
  });

  it("lists members and audit trail", async () => {
    const members = await req("GET", `/api/platform/orgs/${orgId}/members`, undefined, ownerToken);
    expect(members.status).toBe(200);
    expect(members.body.some((m: { role: string }) => m.role === "owner")).toBe(true);

    const audit = await req("GET", `/api/platform/orgs/${orgId}/audit`, undefined, ownerToken);
    expect(audit.status).toBe(200);
    const actions = audit.body.map((e: { action: string }) => e.action);
    expect(actions).toContain("organization.created");
    expect(actions).toContain("registration.student_joined");
  });

  it("rejects audit limit above 200 with a 422", async () => {
    const r = await req("GET", `/api/platform/orgs/${orgId}/audit?limit=500`, undefined, ownerToken);
    expect(r.status).toBe(422);
    expect(r.body.detail[0].loc).toEqual(["query", "limit"]);
  });

  it("seeds default entitlements and blocks disabling nexus", async () => {
    const list = await req("GET", `/api/platform/orgs/${orgId}/entitlements`, undefined, ownerToken);
    expect(list.status).toBe(200);
    const modules = list.body.map((e: { module: string }) => e.module).sort();
    expect(modules).toEqual(["analytics", "coaching", "learning", "nexus"]);

    const nexusOff = await req(
      "PUT",
      `/api/platform/orgs/${orgId}/entitlements/nexus`,
      { status: "disabled" },
      ownerToken,
    );
    expect(nexusOff.status).toBe(400);
    expect(nexusOff.body.detail).toBe("The nexus module cannot be disabled");

    const learningOff = await req(
      "PUT",
      `/api/platform/orgs/${orgId}/entitlements/learning`,
      { status: "disabled" },
      ownerToken,
    );
    expect(learningOff.status).toBe(200);
    expect(learningOff.body.status).toBe("disabled");
  });

  it("updates the org theme", async () => {
    const r = await req(
      "PATCH",
      `/api/platform/orgs/${orgId}/theme`,
      { accent_color: "#7C3AED" },
      ownerToken,
    );
    expect(r.status).toBe(200);
    expect(r.body.theme_accent_color).toBe("#7C3AED");
  });

  it("non-member cannot access the org", async () => {
    const outsider = await req("POST", "/api/platform/auth/signup", {
      signup_type: "student",
      email: "outsider@flow.test",
      password: "password123",
    });
    const r = await req(
      "GET",
      `/api/platform/orgs/${orgId}/members`,
      undefined,
      outsider.body.access_token,
    );
    expect(r.status).toBe(403);
    expect(r.body.detail).toBe("Not a member of this organization");
  });

  it("teacher join-code signup lands as canonical instructor", async () => {
    const codeRes = await req(
      "POST",
      `/api/platform/programs/${programId}/join-codes`,
      { kind: "teacher" },
      ownerToken,
    );
    expect(codeRes.status).toBe(200);

    const teacher = await req("POST", "/api/platform/auth/signup", {
      signup_type: "teacher",
      email: "teacher@flow.test",
      password: "password123",
      join_code: codeRes.body.code,
    });
    expect(teacher.status).toBe(200);

    const me = await req("GET", "/api/platform/auth/me", undefined, teacher.body.access_token);
    expect(me.body.memberships[0].role).toBe("instructor");
    expect(me.body.memberships[0].program_id).toBe(programId);
  });
});
