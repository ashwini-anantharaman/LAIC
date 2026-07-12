/**
 * Cross-org isolation suite — Nexus v0.4 §4/§11.2 (Wall 1).
 *
 * Requires a real Postgres (RLS is a DB feature). Skips cleanly when DATABASE_URL
 * is unset so `npm test` stays green offline; run it against Postgres with:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nexus_dev npm test
 *
 * Seeds two isolated orgs as the privileged role, then asserts that a member of
 * Org A — querying through the RLS-enforced per-request context — can never read
 * or write Org B's rows, EVEN WITH THE WHERE CLAUSE REMOVED.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { closeDb, dbEnabled } from "../src/db/client";
import { withUserContext, asPrivileged } from "../src/db/context";
import { profiles, organizations, programs, offerings, registrations } from "../src/db/schema";

const RUN = dbEnabled();

// Tables that carry an org id and MUST have RLS + a policy.
const TENANT_TABLES = [
  "organizations", "programs", "stage_nodes", "join_codes", "org_memberships",
  "org_permission_defaults", "student_registrations", "challenges", "integrations",
  "offerings", "registrations", "participants", "registered_apps", "audit_events", "entitlements",
  "courses", "enrollments",
];

describe.skipIf(!RUN)("cross-org isolation (RLS)", () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const s = Date.now();
    await asPrivileged(async (tx) => {
      const [pa] = await tx.insert(profiles).values({ email: `a_${s}@t.io`, role: "org_admin" }).returning();
      const [pb] = await tx.insert(profiles).values({ email: `b_${s}@t.io`, role: "org_admin" }).returning();
      const [oa] = await tx.insert(organizations).values({ name: "Org A", slug: `a-${s}`, ownerId: pa.id }).returning();
      const [ob] = await tx.insert(organizations).values({ name: "Org B", slug: `b-${s}`, ownerId: pb.id }).returning();
      // Memberships are what RLS keys on.
      await tx.execute(sql`insert into org_memberships (org_id, profile_id, role) values (${oa.id}, ${pa.id}, 'owner')`);
      await tx.execute(sql`insert into org_memberships (org_id, profile_id, role) values (${ob.id}, ${pb.id}, 'owner')`);
      const [ga] = await tx.insert(programs).values({ orgId: oa.id, name: "Prog A", category: "edu" }).returning();
      const [gb] = await tx.insert(programs).values({ orgId: ob.id, name: "Prog B", category: "edu" }).returning();
      const [fa] = await tx.insert(offerings).values({ organizationId: oa.id, programId: ga.id, name: "Off A", slug: `oa-${s}`, offeringType: "course", signupFields: [] }).returning();
      const [fb] = await tx.insert(offerings).values({ organizationId: ob.id, programId: gb.id, name: "Off B", slug: `ob-${s}`, offeringType: "course", signupFields: [] }).returning();
      await tx.insert(registrations).values({ organizationId: oa.id, offeringId: fa.id, name: "Reg A" });
      await tx.insert(registrations).values({ organizationId: ob.id, offeringId: fb.id, name: "Reg B" });
      Object.assign(ids, { pa: pa.id, pb: pb.id, oa: oa.id, ob: ob.id, ga: ga.id, gb: gb.id, fa: fa.id, fb: fb.id });
    });
  });

  afterAll(async () => {
    if (!RUN) return;
    await asPrivileged(async (tx) => {
      await tx.delete(organizations).where(eq(organizations.id, ids.oa));
      await tx.delete(organizations).where(eq(organizations.id, ids.ob));
      await tx.delete(profiles).where(eq(profiles.id, ids.pa));
      await tx.delete(profiles).where(eq(profiles.id, ids.pb));
    });
    await closeDb();
  });

  it("member of A sees A's org, never B's (no WHERE clause)", async () => {
    const rows = await withUserContext(ids.pa, (tx) => tx.select().from(organizations));
    const seen = rows.map((r) => r.id);
    expect(seen).toContain(ids.oa);
    expect(seen).not.toContain(ids.ob);
  });

  it("member of A sees only A's programs / offerings / registrations", async () => {
    await withUserContext(ids.pa, async (tx) => {
      const progs = (await tx.select().from(programs)).map((r) => r.id);
      const offs = (await tx.select().from(offerings)).map((r) => r.id);
      const regs = (await tx.select().from(registrations)).map((r) => r.id);
      expect(progs).toContain(ids.ga);
      expect(progs).not.toContain(ids.gb);
      expect(offs).toContain(ids.fa);
      expect(offs).not.toContain(ids.fb);
      expect(regs).not.toContain(ids.gb); // B's registration id never leaks
    });
  });

  it("member of A cannot write into B's org (WITH CHECK blocks it)", async () => {
    await expect(
      withUserContext(ids.pa, (tx) =>
        tx.insert(programs).values({ orgId: ids.ob, name: "hijack", category: "edu" }),
      ),
    ).rejects.toThrow();
  });

  it("no context = zero tenant rows", async () => {
    const rows = await withUserContext(null, (tx) => tx.select().from(organizations));
    const seen = rows.map((r) => r.id);
    expect(seen).not.toContain(ids.oa);
    expect(seen).not.toContain(ids.ob);
  });

  it("every org-scoped table has RLS enabled + a policy (auto-detected)", async () => {
    // Dynamically find any public table with an org_id/organization_id column —
    // so a NEW tenant table added without a policy fails this check (v0.4 §4).
    const rows = (await asPrivileged((tx) =>
      tx.execute(sql`
        select c.relname as table, c.relrowsecurity as rls_on,
               (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and exists (
            select 1 from information_schema.columns col
            where col.table_schema = 'public' and col.table_name = c.relname
              and col.column_name in ('org_id', 'organization_id')
          )
      `),
    )) as Record<string, unknown>[];

    // As of Slice 6 every org-scoped table — including the Learning tables
    // (courses, enrollments) — must be locked down.
    const detected = rows.map((r) => String(r.table));
    // Sanity floor: we must actually be detecting the known tenant tables.
    for (const t of TENANT_TABLES) {
      if (t === "organizations") continue; // keyed by id, not org_id — checked below
      expect(detected, `expected ${t} to be detected as org-scoped`).toContain(t);
    }
    // Every detected org-scoped table must be locked down.
    for (const r of rows) {
      expect(r.rls_on, `RLS disabled on ${String(r.table)}`).toBe(true);
      expect(Number(r.policies), `no policy on ${String(r.table)}`).toBeGreaterThan(0);
    }
    // organizations is keyed by its own id — verify it explicitly.
    const org = (await asPrivileged((tx) =>
      tx.execute(sql`
        select c.relrowsecurity as rls_on,
               (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'organizations'
      `),
    )) as Record<string, unknown>[];
    expect(org[0].rls_on).toBe(true);
    expect(Number(org[0].policies)).toBeGreaterThan(0);
  });
});
