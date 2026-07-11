/**
 * Provisioning suite — Nexus v0.4 §2.2 / §11.1.
 *
 * Requires Postgres (skips offline). Proves the provisioning sequence produces a
 * fully isolated, self-governable space: org + owner + default entitlements +
 * theme + storage scope + audit, and — crucially — the owner can operate inside
 * their space immediately while a second org stays invisible to them.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nexus_dev npm test
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, dbEnabled } from "../src/db/client";
import { withUserContext, asPrivileged } from "../src/db/context";
import { provisionOrganization } from "../src/db/provisioning";
import { organizations, orgMemberships, entitlements, auditEvents } from "../src/db/schema";

const RUN = dbEnabled();
const created: string[] = [];

describe.skipIf(!RUN)("organization provisioning", () => {
  afterEach(async () => {
    await asPrivileged(async (tx) => {
      for (const id of created) await tx.delete(organizations).where(eq(organizations.id, id));
    });
    created.length = 0;
  });

  afterAll(async () => {
    await closeDb();
  });

  it("provisions a complete, self-governable space in one step", async () => {
    const s = Date.now();
    const res = await provisionOrganization({
      name: "Acme Labs",
      owner: { email: `owner_${s}@acme.io`, displayName: "Ada" },
      theme: { primaryColor: "#7C3AED" },
      defaultModules: ["nexus", "learning"],
    });
    created.push(res.organizationId);

    await asPrivileged(async (tx) => {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, res.organizationId));
      expect(org.name).toBe("Acme Labs");
      expect(org.ownerId).toBe(res.ownerProfileId);
      const settings = org.settings as Record<string, unknown>;
      expect(settings.dataResidency).toBe("shared");
      expect(settings.storagePrefix).toBe(`orgs/${res.organizationId}/`);
      expect((settings.theme as Record<string, unknown>).primaryColor).toBe("#7C3AED");

      const mships = await tx.select().from(orgMemberships).where(eq(orgMemberships.orgId, res.organizationId));
      expect(mships).toHaveLength(1);
      expect(mships[0].role).toBe("owner");

      const ents = await tx.select().from(entitlements).where(eq(entitlements.organizationId, res.organizationId));
      expect(ents.map((e) => e.module).sort()).toEqual(["learning", "nexus"]);
      expect(ents.every((e) => e.status === "active")).toBe(true);

      const audits = await tx.select().from(auditEvents).where(eq(auditEvents.organizationId, res.organizationId));
      expect(audits.some((a) => a.action === "organization.provisioned")).toBe(true);
    });
  });

  it("the owner can operate inside the space immediately; other orgs stay invisible", async () => {
    const s = Date.now();
    const a = await provisionOrganization({ name: `Alpha ${s}`, owner: { email: `a_${s}@x.io` } });
    const b = await provisionOrganization({ name: `Beta ${s}`, owner: { email: `b_${s}@x.io` } });
    created.push(a.organizationId, b.organizationId);

    // Owner A, through the RLS-enforced context, sees A and not B.
    const seen = await withUserContext(a.ownerProfileId, (tx) =>
      tx.select({ id: organizations.id }).from(organizations),
    );
    const ids = seen.map((r) => r.id);
    expect(ids).toContain(a.organizationId);
    expect(ids).not.toContain(b.organizationId);
  });

  it("derives a unique slug when names collide", async () => {
    const s = Date.now();
    const first = await provisionOrganization({ name: `Dup ${s}`, owner: { email: `d1_${s}@x.io` } });
    const second = await provisionOrganization({ name: `Dup ${s}`, owner: { email: `d2_${s}@x.io` } });
    created.push(first.organizationId, second.organizationId);
    expect(second.slug).toBe(`${first.slug}-2`);
  });
});
