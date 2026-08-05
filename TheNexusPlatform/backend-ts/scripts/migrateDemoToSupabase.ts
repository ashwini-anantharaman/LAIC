/**
 * Migrate existing demo-mode accounts into Supabase Auth (one-time cutover).
 *
 * Demo-mode logins live in `demo_auth_users` (sha256, token = uuid). Supabase
 * Auth is the real identity provider. This script, for every email that has a
 * profile:
 *   1. ensures a Supabase Auth user exists (created email-confirmed, so no
 *      email is sent), with a known dev password so every account keeps
 *      working after the switch;
 *   2. points each local `profiles.auth_user_id` at that Supabase user id —
 *      the linchpin, since loadUser() matches a token to a profile by
 *      auth_user_id (identityRepo.ts).
 *
 * Idempotent: re-running updates the password + re-syncs ids. Real passwords
 * come later via the reset/claim flow; this dev password just keeps the local
 * test accounts usable immediately.
 *
 * Run:  npx tsx scripts/migrateDemoToSupabase.ts
 */
import { createClient } from "@supabase/supabase-js";
import { sql } from "drizzle-orm";

import { getSettings } from "../src/config";
import { privilegedTransaction } from "../src/db/tenantDoor";
import { profiles } from "../src/db/schema";

const DEV_PASSWORD = "NexusDev2026!";

async function main() {
  const { supabaseUrl, supabaseServiceRoleKey, supabaseEnabled } = getSettings();
  if (!supabaseEnabled) {
    console.error("Supabase not configured — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env first.");
    process.exit(1);
  }
  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });

  // Distinct emails that have a profile (the accounts that must keep working).
  const emails = await privilegedTransaction("auth migration: list profile emails", async (tx) => {
    const rows = await tx.execute(sql`select distinct lower(email) as email from profiles where email is not null`);
    return (rows as unknown as { email: string }[]).map((r) => r.email);
  });

  // One page is plenty for a dev project; bump perPage if this grows.
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const byEmail = new Map((list?.users ?? []).map((u) => [u.email?.toLowerCase() ?? "", u]));

  for (const email of emails) {
    let userId: string;
    const existing = byEmail.get(email);
    if (existing) {
      await admin.auth.admin.updateUserById(existing.id, { password: DEV_PASSWORD });
      userId = existing.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: DEV_PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user) {
        console.error(`  ${email}: FAILED — ${error?.message ?? "no user"}`);
        continue;
      }
      userId = data.user.id;
    }

    const updated = await privilegedTransaction("auth migration: sync profile auth_user_id", async (tx) => {
      const res = await tx
        .update(profiles)
        .set({ authUserId: userId })
        .where(sql`lower(email) = ${email}`);
      return (res as unknown as { rowCount?: number }).rowCount ?? "?";
    });
    console.log(`  ${email} -> ${userId}  (profiles synced: ${updated})`);
  }

  console.log(`\nDone. Every migrated account's password is: ${DEV_PASSWORD}`);
  process.exit(0);
}

void main();
