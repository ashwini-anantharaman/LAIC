/**
 * Phase 4 — platform schemas folded into the shared, org-scoped cluster.
 * Proves the two walls on live Postgres:
 *   1. nexus_app (the console) is DENIED on bridge/learning tables outright —
 *      Nexus cannot read an org's platform content.
 *   2. The platform service roles are org-filtered: with `app.platform_org_scope`
 *      set, rows of other orgs disappear (reads AND writes); unset = service
 *      trust (pre-wiring behavior). Skips offline.
 */
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { closeDb, dbEnabled } from "../src/db/client";
import { asPrivileged } from "../src/db/context";
import type { Tx } from "../src/db/tenantDoor";

const RUN = dbEnabled();
const ORG_A = randomUUID();
const ORG_B = randomUUID();
const run = Date.now();

/** Run fn inside a transaction as a platform service role, optionally org-scoped. */
async function asService<T>(
  role: "bridge_service" | "learning_service" | "nexus_app",
  orgScope: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return asPrivileged(async (tx) => {
    await tx.execute(sql`select set_config('app.platform_org_scope', ${orgScope ?? ""}, true)`);
    await tx.execute(sql`select set_config('role', ${role}, true)`);
    return fn(tx);
  });
}

afterAll(async () => {
  if (!RUN) return;
  await asPrivileged(async (tx) => {
    await tx.execute(sql`delete from bridge_audit_log where audit_id like ${"p4test_" + run + "%"}`);
    await tx.execute(sql`delete from learning_objects where id like ${"p4test_" + run + "%"}`);
  });
  await closeDb();
});

describe.skipIf(!RUN)("platform schemas in the org-scoped cluster (Phase 4)", () => {
  it("the folded tables exist and the taxonomy seed landed", async () => {
    await asPrivileged(async (tx) => {
      const tables = await tx.execute(sql`
        select tablename from pg_tables where schemaname = 'public'
          and tablename in ('bridge_kbs','bridge_kb_sessions','bridge_kb_versions','bridge_user_profiles','learning_objects')
      `);
      expect(tables.length).toBe(5);
      const seeded = await tx.execute(sql`select count(*)::int as n from bridge_skill_taxonomy`);
      expect((seeded[0] as { n: number }).n).toBeGreaterThan(20);
    });
  });

  it("nexus_app is DENIED on platform tables (wall 1)", async () => {
    await expect(
      asService("nexus_app", null, (tx) => tx.execute(sql`select * from bridge_kbs limit 1`)),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asService("nexus_app", null, (tx) => tx.execute(sql`select * from learning_objects limit 1`)),
    ).rejects.toThrow(/permission denied/i);
  });

  it("bridge_service sees only its org's rows when scoped (wall 2)", async () => {
    // Fixtures: one row per org + one program-wide (null org) row.
    await asPrivileged(async (tx) => {
      for (const [suffix, org] of [
        ["a", ORG_A],
        ["b", ORG_B],
        ["w", null],
      ] as const) {
        await tx.execute(sql`
          insert into bridge_audit_log (audit_id, ts, actor_user_id, actor_access_level, program_organization_id, action, resource_type, resource_id)
          values (${"p4test_" + run + "_" + suffix}, now(), 'tester', 'admin', ${org}, 'test', 'test', 'r1')
          on conflict (audit_id) do nothing
        `);
      }
    });

    // Scoped to org A: sees A + program-wide, never B.
    const scoped = await asService("bridge_service", ORG_A, (tx) =>
      tx.execute(sql`select audit_id from bridge_audit_log where audit_id like ${"p4test_" + run + "%"} order by audit_id`),
    );
    expect(scoped.map((r) => (r as { audit_id: string }).audit_id)).toEqual([
      `p4test_${run}_a`,
      `p4test_${run}_w`,
    ]);

    // Unset scope: service trust — all three visible (pre-wiring behavior).
    const unscoped = await asService("bridge_service", null, (tx) =>
      tx.execute(sql`select count(*)::int as n from bridge_audit_log where audit_id like ${"p4test_" + run + "%"}`),
    );
    expect((unscoped[0] as { n: number }).n).toBe(3);

    // Write-side: while scoped to A, inserting a row claiming org B is refused.
    await expect(
      asService("bridge_service", ORG_A, (tx) =>
        tx.execute(sql`
          insert into bridge_audit_log (audit_id, ts, actor_user_id, actor_access_level, program_organization_id, action, resource_type, resource_id)
          values (${"p4test_" + run + "_x"}, now(), 'tester', 'admin', ${ORG_B}, 'test', 'test', 'r1')
        `),
      ),
    ).rejects.toThrow(/row-level security|policy/i);
  });

  it("the audit log is append-only for the bridge service", async () => {
    await expect(
      asService("bridge_service", null, (tx) =>
        tx.execute(sql`delete from bridge_audit_log where audit_id like ${"p4test_" + run + "%"}`),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("learning_service is org-filtered the same way", async () => {
    await asPrivileged(async (tx) => {
      await tx.execute(sql`
        insert into learning_objects (id, organization_id, type, title) values
          (${"p4test_" + run + "_la"}, ${ORG_A}, 'lesson', 'A lesson'),
          (${"p4test_" + run + "_lb"}, ${ORG_B}, 'lesson', 'B lesson')
        on conflict (id) do nothing
      `);
    });

    const scoped = await asService("learning_service", ORG_A, (tx) =>
      tx.execute(sql`select id from learning_objects where id like ${"p4test_" + run + "%"}`),
    );
    expect(scoped.map((r) => (r as { id: string }).id)).toEqual([`p4test_${run}_la`]);

    const unscoped = await asService("learning_service", null, (tx) =>
      tx.execute(sql`select count(*)::int as n from learning_objects where id like ${"p4test_" + run + "%"}`),
    );
    expect((unscoped[0] as { n: number }).n).toBe(2);
  });

  it("bridge_service cannot touch learning tables (and vice versa)", async () => {
    await expect(
      asService("bridge_service", null, (tx) => tx.execute(sql`select * from learning_objects limit 1`)),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asService("learning_service", null, (tx) => tx.execute(sql`select * from bridge_kbs limit 1`)),
    ).rejects.toThrow(/permission denied/i);
  });
});
