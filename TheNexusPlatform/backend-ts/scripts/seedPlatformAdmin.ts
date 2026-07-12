#!/usr/bin/env tsx
/**
 * Seed (or promote) a platform-admin account — a person who manages every
 * organization. Modeled as a profile with role = 'platform_admin'.
 *
 * Runs against whatever backend the env selects (local store by default;
 * Postgres if DATABASE_URL is set; Supabase Auth if configured). Idempotent:
 * re-running promotes the existing account.
 *
 *   npx tsx scripts/seedPlatformAdmin.ts
 *   # or with a Postgres target:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/nexus_dev npx tsx scripts/seedPlatformAdmin.ts
 */
import "dotenv/config";

import { createAuthUser, signInUser } from "../src/auth";
import * as db from "../src/platformDb";

const EMAIL = process.env.SEED_ADMIN_EMAIL || "devteam@mindbrainai.nexus";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || "L1FE1n@I123";
const NAME = "Dev Team";

async function main(): Promise<number> {
  let authId: string;
  try {
    const u = await createAuthUser(EMAIL, PASSWORD);
    authId = u.id;
    console.log(`Created auth user ${EMAIL} (${authId}).`);
  } catch {
    // Already registered — sign in to resolve the id, then promote.
    const s = await signInUser(EMAIL, PASSWORD);
    authId = s.id;
    console.log(`Auth user ${EMAIL} already exists (${authId}); promoting.`);
  }

  await db.createProfile(authId, EMAIL, "platform_admin", NAME);
  console.log(`\n✅ Platform admin ready: ${EMAIL}`);
  console.log("   role = platform_admin (can manage all organizations).");
  return 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error("Seed failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
