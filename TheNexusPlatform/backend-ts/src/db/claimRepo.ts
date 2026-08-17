/**
 * Password ownership — who may set a person's password (migration 0046).
 *
 * A credential is shared across every club its owner belongs to, so "an admin can
 * reset a member's password" stops being safe the moment two clubs share a
 * member: club A's admin would hold a working key to club B's member. The fix is
 * to give the password an owner.
 *
 *   UNCLAIMED (claimed_at null) — nobody owns it yet. An admin may set a starting
 *     password so a new member can get in, and the app forces a change at first
 *     sign-in.
 *   CLAIMED — the person owns it. Recovery has two shapes, and they differ in who
 *     ever learns the password:
 *       · a single-use CLAIM CODE an admin issues and reads out — the person
 *         redeems it and sets a password nobody else ever sees. Preferred.
 *       · an admin setting one directly, for someone who cannot work a code. This
 *         RELEASES the claim (see releaseClaim), so the password is temporary by
 *         construction: the app forces the person to choose their own at the next
 *         sign in, and ownership returns to them.
 *
 * Codes are hashed (SHA-256) and never stored in the clear, single-use, and
 * expire. SHA-256 rather than a KDF is deliberate and safe here: the code is 50
 * bits of fresh randomness with a short life and one use, so there is no
 * low-entropy secret for a KDF to protect.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import { HttpError } from "../httpError";
import { asPrivileged } from "./context";
import { profiles } from "./schema";

/** How long an issued code stays good. Long enough to pass on, short enough that
 *  a forgotten one stops working. */
const CODE_TTL_HOURS = 24;

/**
 * Crockford-style base32 minus every character that misreads when a code is read
 * ALOUD, which is how these travel: I, L, O, 0 and 1 are all mutually confusable.
 * 31 characters over 10 gives ~50 bits, which with one use and a 24-hour life is
 * far more than guessing can reach.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;

const hashCode = (code: string): string =>
  createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

/** A fresh code, grouped for reading out: "K7QP2-9MRTX". */
function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

/** Normalise what someone typed: case, spaces and the grouping dash are noise. */
const normalise = (code: string): string => code.replace(/[\s-]/g, "").toUpperCase();

export interface ClaimState {
  profileId: string;
  email: string | null;
  claimed: boolean;
}

export async function getClaimState(profileId: string): Promise<ClaimState | null> {
  return asPrivileged(async (tx) => {
    const r = await tx
      .select({ id: profiles.id, email: profiles.email, claimedAt: profiles.claimedAt })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);
    if (!r.length) return null;
    return { profileId: r[0].id, email: r[0].email, claimed: r[0].claimedAt != null };
  });
}

/** Has this person set their own password? Keyed by email, for the login path. */
export async function isClaimedByEmail(email: string): Promise<boolean> {
  return asPrivileged(async (tx) => {
    const r = await tx
      .select({ claimedAt: profiles.claimedAt })
      .from(profiles)
      .where(sql`lower(${profiles.email}) = lower(${email})`)
      .limit(1);
    return r.length ? r[0].claimedAt != null : false;
  });
}

/**
 * Mark the password as owned. Called when the person sets it themselves — at
 * first sign-in, on a change, or by redeeming a code — and it also clears any
 * pending code, since setting a password ends the recovery.
 */
export async function markClaimed(profileId: string): Promise<void> {
  await asPrivileged(async (tx) => {
    await tx
      .update(profiles)
      .set({
        claimedAt: new Date(),
        claimCodeHash: null,
        claimCodeExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profileId));
  });
}


/**
 * Hand ownership BACK, because an admin has just set a password again.
 *
 * The password an admin types is a temporary one by definition — they know it,
 * and a credential is shared across every club its owner belongs to. Clearing
 * `claimed_at` is what makes that temporariness enforceable rather than a promise:
 * `must_set_password` goes true again, the app's gate takes over at the next sign
 * in, and nothing else opens until the person has chosen one only they know.
 *
 * Any outstanding claim code goes too. The admin has just provided a way in, so a
 * second one left live is a spare key nobody is tracking.
 */
export async function releaseClaim(profileId: string): Promise<void> {
  await asPrivileged(async (tx) => {
    await tx
      .update(profiles)
      .set({
        claimedAt: null,
        claimCodeHash: null,
        claimCodeExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profileId));
  });
}

/**
 * Issue a single-use claim code, returning it ONCE — it is stored hashed, so a
 * lost code cannot be looked up, only reissued. Issuing replaces any code still
 * outstanding.
 */
export async function issueClaimCode(
  profileId: string,
): Promise<{ code: string; expiresAt: string }> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_HOURS * 3600_000);
  const updated = await asPrivileged(async (tx) =>
    tx
      .update(profiles)
      .set({
        claimCodeHash: hashCode(normalise(code)),
        claimCodeExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profileId))
      .returning({ id: profiles.id }),
  );
  if (!updated.length) throw new HttpError(404, "Profile not found");
  return { code, expiresAt: expiresAt.toISOString() };
}

/**
 * Redeem a code for one identifier, returning the profile it belongs to.
 *
 * The failure is deliberately the same for a wrong code, an expired code, an
 * unknown email and a mismatch between them: any difference would say whether an
 * account exists or whether a code is outstanding.
 */
export async function redeemClaimCode(
  identifier: string,
  code: string,
): Promise<{ profileId: string; email: string } | null> {
  const wanted = hashCode(normalise(code));
  return asPrivileged(async (tx) => {
    const r = await tx
      .select({
        id: profiles.id,
        email: profiles.email,
        hash: profiles.claimCodeHash,
        expires: profiles.claimCodeExpiresAt,
      })
      .from(profiles)
      .where(
        and(
          isNotNull(profiles.claimCodeHash),
          sql`(lower(${profiles.email}) = lower(${identifier}) or lower(${profiles.username}) = lower(${identifier}))`,
        ),
      )
      .limit(1);
    if (!r.length) return null;
    const row = r[0];
    if (row.hash !== wanted) return null;
    if (!row.expires || row.expires.getTime() < Date.now()) return null;
    if (!row.email) return null;
    // Single use: consumed here, whatever the caller does next.
    await tx
      .update(profiles)
      .set({ claimCodeHash: null, claimCodeExpiresAt: null, updatedAt: new Date() })
      .where(eq(profiles.id, row.id));
    return { profileId: row.id, email: row.email };
  });
}
