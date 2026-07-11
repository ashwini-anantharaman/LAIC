#!/usr/bin/env tsx
/**
 * Slice 1 verification — proves the Drizzle schema round-trips against the real
 * migrated Postgres schema. Inserts a profile → organization → program via
 * Drizzle, reads them back, then cleans up.
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nexus_dev \
 *     npx tsx scripts/verifyDrizzle.ts
 */
import { eq } from "drizzle-orm";

import { getDb, closeDb, dbEnabled } from "../src/db/client";
import { profiles, organizations, programs } from "../src/db/schema";

async function main(): Promise<number> {
  if (!dbEnabled()) {
    console.error("Set DATABASE_URL first.");
    return 1;
  }
  const db = getDb();
  const stamp = Date.now();

  const [profile] = await db.insert(profiles).values({
    email: `verify_${stamp}@example.com`, role: "org_admin", displayName: "Verify Owner",
  }).returning();
  console.log("inserted profile:", profile.id);

  const [org] = await db.insert(organizations).values({
    name: "Verify Org", slug: `verify-org-${stamp}`, ownerId: profile.id,
  }).returning();
  console.log("inserted organization:", org.id, org.name);

  const [program] = await db.insert(programs).values({
    orgId: org.id, name: "Verify Program", category: "edu", description: "slice-1 check",
  }).returning();
  console.log("inserted program:", program.id, program.name);

  // Read back through Drizzle to confirm column mapping.
  const readOrg = await db.select().from(organizations).where(eq(organizations.id, org.id));
  const readProgs = await db.select().from(programs).where(eq(programs.orgId, org.id));
  console.log("read org.settings default:", JSON.stringify(readOrg[0].settings));
  console.log("read program count for org:", readProgs.length);

  // Cleanup (cascade removes the program via FK).
  await db.delete(organizations).where(eq(organizations.id, org.id));
  await db.delete(profiles).where(eq(profiles.id, profile.id));
  console.log("cleaned up");

  const ok =
    readOrg.length === 1 &&
    readProgs.length === 1 &&
    JSON.stringify(readOrg[0].settings) === "{}";
  console.log(ok ? "\nSLICE 1 VERIFY: PASS ✅" : "\nSLICE 1 VERIFY: FAIL ❌");
  await closeDb();
  return ok ? 0 : 1;
}

main().then((code) => process.exit(code)).catch(async (e) => {
  console.error("VERIFY ERROR:", e);
  await closeDb();
  process.exit(1);
});
