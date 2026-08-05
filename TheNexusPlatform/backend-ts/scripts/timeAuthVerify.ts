/**
 * Read-only latency probe: what does one Supabase auth.getUser() HTTP
 * verification cost vs. the DB reads on the same path? This is the per-request
 * overhead of getCurrentUser (auth.ts).
 * Usage: npx tsx scripts/timeAuthVerify.ts
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || service;
if (!url || !service || !anon) {
  console.error("Missing SUPABASE_URL / service / anon key in env.");
  process.exit(1);
}

async function timed(label: string, fn: () => Promise<unknown>) {
  const t0 = performance.now();
  await fn();
  console.log(`${label}: ${(performance.now() - t0).toFixed(0)}ms`);
}

async function main() {
  const admin = createClient(url!, service!, { auth: { persistSession: false } });
  const eph = createClient(url!, anon!, { auth: { persistSession: false } });

  // Mint a genuine session the same way auth.ts mintSupabaseSession does.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: "ashvin@laic.org",
  });
  if (linkError || !link?.properties?.hashed_token) {
    console.error("generateLink failed:", linkError?.message);
    process.exit(1);
  }
  const { data: verified, error: verifyError } = await eph.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError || !verified?.session) {
    console.error("verifyOtp failed:", verifyError?.message);
    process.exit(1);
  }
  const token = verified.session.access_token;

  await timed("auth.getUser #1", () => admin.auth.getUser(token));
  await timed("auth.getUser #2", () => admin.auth.getUser(token));
  await timed("auth.getUser #3", () => admin.auth.getUser(token));
  await timed("generateLink (magiclink, used per launch-exchange)", () =>
    admin.auth.admin.generateLink({ type: "magiclink", email: "ashvin@laic.org" }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
