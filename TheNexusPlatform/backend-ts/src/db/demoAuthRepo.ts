/**
 * Demo-mode auth users backed by Postgres — the DB-mode counterpart of the
 * localAuth* functions in platformLocalStore.ts (same sha256 hashing, same
 * token == user-id contract). auth.ts picks this path when DATABASE_URL is
 * set, so demo logins survive serverless deploys where the JSON-file store
 * is read-only and ephemeral.
 */
import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { HttpError } from "../httpError";
import { asPrivileged } from "./context";
import { demoAuthUsers } from "./schema";

type Row = Record<string, any>;

function hashPw(password: string): string {
  return createHash("sha256").update(password, "utf-8").digest("hex");
}

export async function createDemoAuthUser(email: string, password: string): Promise<Row> {
  return asPrivileged(async (tx) => {
    const existing = await tx
      .select({ id: demoAuthUsers.id })
      .from(demoAuthUsers)
      .where(sql`lower(${demoAuthUsers.email}) = lower(${email})`);
    if (existing.length > 0) throw new HttpError(409, "Email already registered");
    const [user] = await tx
      .insert(demoAuthUsers)
      .values({ email, passwordHash: hashPw(password) })
      .returning();
    return { id: user.id, email: user.email };
  });
}

export async function signInDemoAuthUser(email: string, password: string): Promise<Row> {
  return asPrivileged(async (tx) => {
    const rows = await tx
      .select()
      .from(demoAuthUsers)
      .where(sql`lower(${demoAuthUsers.email}) = lower(${email})`);
    const user = rows[0];
    if (!user || user.passwordHash !== hashPw(password)) {
      throw new HttpError(401, "Invalid credentials");
    }
    return { id: user.id, email: user.email, access_token: user.id };
  });
}

export async function getDemoAuthUser(token: string): Promise<Row | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return null;
  return asPrivileged(async (tx) => {
    const rows = await tx.select().from(demoAuthUsers).where(eq(demoAuthUsers.id, token));
    return rows[0] ? { id: rows[0].id, email: rows[0].email } : null;
  });
}
