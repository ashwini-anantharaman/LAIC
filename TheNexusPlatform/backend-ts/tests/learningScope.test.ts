/**
 * Slice 6 — Learning seam (Nexus v0.4 §7).
 *
 * (a) Courses + enrollments are org-scoped under the same RLS: a member of Org A
 *     can't see Org B's courses/progress, even with the WHERE clause removed.
 * (b) Launch context is server-derived from the App Shell record — a request
 *     never dictates its own program/org.
 * Skips offline.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nexus_dev npm test
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

const tempDir = mkdtempSync(join(tmpdir(), "owlwise-learnscope-"));
process.env.LOCAL_DATA_DIR = tempDir;
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const RUN = Boolean(process.env.DATABASE_URL);

const { createApp } = await import("../src/app");
const { getDb, closeDb } = await import("../src/db/client");
const { withUserContext, asPrivileged } = await import("../src/db/context");
const { provisionOrganization } = await import("../src/db/provisioning");
const { organizations, profiles, courses, enrollments } = await import("../src/db/schema");

const app = createApp();
const orgIds: string[] = [];
const emails: string[] = [];

async function req(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const ids: Record<string, string> = {};

afterAll(async () => {
  if (RUN) {
    const db = getDb();
    for (const id of orgIds) await db.delete(organizations).where(eq(organizations.id, id));
    for (const e of emails) {
      const p = await db.select().from(profiles).where(eq(profiles.email, e));
      if (p.length) await db.delete(profiles).where(eq(profiles.id, p[0].id));
    }
    await closeDb();
  }
  rmSync(tempDir, { recursive: true, force: true });
});

describe.skipIf(!RUN)("learning seam — course/enrollment isolation", () => {
  it("seeds two orgs each with a course + enrollment", async () => {
    const s = Date.now();
    emails.push(`la_${s}@x.io`, `lb_${s}@x.io`);
    const a = await provisionOrganization({ name: `Learn A ${s}`, owner: { email: emails[0] } });
    const b = await provisionOrganization({ name: `Learn B ${s}`, owner: { email: emails[1] } });
    orgIds.push(a.organizationId, b.organizationId);
    Object.assign(ids, { a: a.organizationId, b: b.organizationId, ua: a.ownerProfileId, ub: b.ownerProfileId });

    await asPrivileged(async (tx) => {
      const [ca] = await tx.insert(courses).values({ subject: "Neuro A", unitTitle: "U1", orgId: ids.a }).returning();
      const [cb] = await tx.insert(courses).values({ subject: "Neuro B", unitTitle: "U1", orgId: ids.b }).returning();
      await tx.insert(enrollments).values({ courseId: ca.id, orgId: ids.a, displayName: "SA" });
      await tx.insert(enrollments).values({ courseId: cb.id, orgId: ids.b, displayName: "SB" });
      Object.assign(ids, { ca: ca.id, cb: cb.id });
    });
  });

  it("member of A sees only A's courses (no WHERE)", async () => {
    const rows = await withUserContext(ids.ua, (tx) => tx.select().from(courses));
    const seen = rows.map((r) => r.id);
    expect(seen).toContain(ids.ca);
    expect(seen).not.toContain(ids.cb);
  });

  it("member of A sees only A's enrollments", async () => {
    const rows = await withUserContext(ids.ua, (tx) => tx.select().from(enrollments));
    const seen = rows.map((r) => r.courseId);
    expect(seen).toContain(ids.ca);
    expect(seen).not.toContain(ids.cb);
  });

  it("no context = zero courses", async () => {
    const rows = await withUserContext(null, (tx) => tx.select().from(courses));
    expect(rows.map((r) => r.id)).not.toContain(ids.ca);
  });
});

describe.skipIf(!RUN)("learning seam — launch context is server-derived", () => {
  it("launch context reflects the App Shell's org/program/offering, not the request", async () => {
    const s = Date.now();
    const email = `launch_${s}@x.io`;
    emails.push(email);
    const su = await req("POST", "/api/platform/auth/signup", { signup_type: "org", org_name: `Launch Org ${s}`, email, password: "password123" });
    const token = su.body.access_token;
    const me = await req("GET", "/api/platform/auth/me", undefined, token);
    const orgId = me.body.memberships[0].org_id;
    orgIds.push(orgId);

    const prog = await req("POST", `/api/platform/orgs/${orgId}/programs`, { name: "Course Prog", category: "edu", stage_type: "national" }, token);
    const programId = prog.body.id;
    const off = await req("POST", `/api/programs/${programId}/offerings`, { name: "Coach App", offering_type: "app", approval_mode: "auto_approve", platform_module: "learning" }, token);
    const offeringId = off.body.id;
    const appRes = await req("POST", `/api/programs/${programId}/apps`, { app_name: "Launch App", offering_id: offeringId, launch_url: "https://x.app" }, token);
    const appId = appRes.body.id;

    const ctx = await req("GET", `/api/apps/${appId}/launch-context`, undefined, token);
    expect(ctx.status).toBe(200);
    expect(ctx.body.context.organization_id).toBe(orgId);
    expect(ctx.body.context.program_id).toBe(programId);
    expect(ctx.body.context.offering_id).toBe(offeringId);
    expect(ctx.body.launch_token).toBeTruthy();
  });
});
