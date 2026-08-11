/**
 * Postgres identity + org-lifecycle repo (Drizzle) — Nexus v0.4 Slice 4.
 *
 * These run when DATABASE_URL is set. Identity resolution and public signup
 * happen BEFORE a tenant context exists (that's how we learn who the caller is
 * and which orgs they belong to), so these are `asPrivileged` by design — the
 * legitimate bootstrap reads/writes. Tenant DATA reads/writes go through
 * withUserContext (RLS) as endpoints are converted.
 *
 * Returns snake_case Row shapes so they are drop-in for the existing platformDb
 * callers and routes.
 */
import { eq, inArray, or, sql } from "drizzle-orm";

import { HttpError } from "../httpError";
import type { Membership } from "../permissions";
import type { AuditEventOptions } from "../platformLocalStore";
import { asPrivileged } from "./context";
import { resolveProfileId, ensureOrgProfile as ensureOrgProfileTx } from "./resolveProfile";
import { profiles, organizations, orgMemberships, joinCodes, stageNodes, auditEvents } from "./schema";

type Row = Record<string, unknown>;

const NROLE: Record<string, string> = { teacher: "instructor" };
const normalizeRole = (r: string): string => NROLE[r] ?? r;

function profileRow(p: typeof profiles.$inferSelect): Row {
  return {
    id: p.id,
    email: p.email,
    username: p.username,
    role: p.role,
    display_name: p.displayName,
    name: p.name,
    // The auth CREDENTIAL id — may differ from this row's own id, since one
    // auth credential can back several org-scoped profiles (0010). Callers
    // that need a valid session token must use this, not `id`.
    auth_user_id: p.authUserId ?? p.id,
  };
}
function orgRow(o: typeof organizations.$inferSelect): Row {
  return { id: o.id, name: o.name, slug: o.slug, owner_id: o.ownerId, settings: o.settings, created_at: o.createdAt };
}
function joinCodeRow(j: typeof joinCodes.$inferSelect): Row {
  return {
    id: j.id, org_id: j.orgId, stage_node_id: j.stageNodeId, program_id: j.programId,
    code: j.code, kind: j.kind, active: j.active, delivery_method: j.deliveryMethod,
    email: j.email, max_uses: j.maxUses, uses_remaining: j.usesRemaining,
    expires_at: j.expiresAt, created_by_user_id: j.createdByUserId, created_at: j.createdAt,
  };
}

export async function createProfile(userId: string, email: string, role: string, displayName: string | null): Promise<Row> {
  return asPrivileged(async (tx) => {
    const name = displayName || email.split("@")[0];
    // Org-less profile (e.g. a student before joining): id == auth id, auth_user_id == id.
    const [row] = await tx
      .insert(profiles)
      .values({ id: userId, authUserId: userId, email, role, displayName: displayName ?? name, name })
      .onConflictDoUpdate({ target: profiles.id, set: { email, role, displayName: displayName ?? name } })
      .returning();
    return profileRow(row);
  });
}

export async function getProfileByEmail(email: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(profiles).where(eq(profiles.email, email)).limit(1);
    return r.length ? profileRow(r[0]) : null;
  });
}

/**
 * Resolve a username to its account. Case-insensitive, and unique platform-wide
 * (see 0038) because sign-in has no org context to disambiguate with.
 *
 * A person may hold SEVERAL profile rows (one per org), so several rows can
 * share an email; the username is set on whichever row the admin edited, and the
 * email it carries is what the caller signs in with.
 */
export async function getProfileByUsername(username: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx
      .select()
      .from(profiles)
      .where(sql`lower(${profiles.username}) = lower(${username})`)
      .limit(1);
    return r.length ? profileRow(r[0]) : null;
  });
}

/**
 * The profile id a session's id maps to inside an org.
 *
 * A session carries the shared AUTH id; person-FK columns and memberships
 * reference the org-scoped profile id, so the two have to be reconciled before
 * anything can be written against "the caller". Null when they have no profile
 * in that org.
 */
export async function resolveOrgProfileId(
  orgId: string | null,
  authOrProfileId: string,
): Promise<string | null> {
  return asPrivileged((tx) => resolveProfileId(tx, authOrProfileId, orgId));
}

/**
 * A profile's picture, as a base64 data URL, or null.
 *
 * Deliberately NOT part of profileRow: that shape is embedded in member lists,
 * audit payloads and /auth/me, and an avatar is tens of kilobytes. Callers ask
 * for pictures only where they draw them.
 */
export async function getProfileAvatar(profileId: string): Promise<string | null> {
  return asPrivileged(async (tx) => {
    const r = await tx
      .select({ avatar: profiles.avatar })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);
    return r.length ? (r[0].avatar ?? null) : null;
  });
}

/** Pictures for several profiles at once — one query for a whole roster. */
export async function getProfileAvatars(
  profileIds: string[],
): Promise<Record<string, string>> {
  if (profileIds.length === 0) return {};
  return asPrivileged(async (tx) => {
    const rows = await tx
      .select({ id: profiles.id, authUserId: profiles.authUserId, avatar: profiles.avatar })
      .from(profiles)
      .where(or(inArray(profiles.id, profileIds), inArray(profiles.authUserId, profileIds)));
    const out: Record<string, string> = {};
    for (const r of rows) {
      if (!r.avatar) continue;
      // Keyed by BOTH ids: memberships reference either the profile's own id or
      // its auth-credential id, and the caller holds whichever it was given.
      out[r.id] = r.avatar;
      if (r.authUserId) out[r.authUserId] = r.avatar;
    }
    return out;
  });
}

/** Set or clear a profile's picture. Pass null to remove it. */
export async function setProfileAvatar(
  profileId: string,
  avatar: string | null,
): Promise<void> {
  await asPrivileged(async (tx) => {
    const r = await tx
      .update(profiles)
      .set({ avatar, updatedAt: new Date() })
      .where(eq(profiles.id, profileId))
      .returning({ id: profiles.id });
    if (!r.length) throw new HttpError(404, "Profile not found");
  });
}

/**
 * Release a profile's username once the person holds no memberships anywhere.
 *
 * Removing a member deletes the MEMBERSHIP; the profile row stays, because one
 * login can belong to several orgs and because audit history points at it. But the
 * username lives on the profile and is unique platform-wide, so a removed person
 * kept their username reserved forever — and once the membership was gone the
 * console could not reach them to clear it (that endpoint is addressed by
 * membership id). The name was simply lost, and re-adding the person with it failed
 * with "already taken".
 *
 * So: only when NOTHING is left. A profile that still has a membership in any org
 * keeps its username, since the person is still somebody here.
 *
 * Returns the freed username, or null if there was nothing to free — so a caller
 * can record it in the audit trail rather than the release being invisible.
 */
export async function releaseUsernameIfOrphaned(profileId: string): Promise<string | null> {
  return asPrivileged(async (tx) => {
    const rows = await tx
      .select({ id: profiles.id, username: profiles.username })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);
    const username = rows[0]?.username ?? null;
    if (!username) return null;

    const remaining = await tx
      .select({ id: orgMemberships.id })
      .from(orgMemberships)
      .where(eq(orgMemberships.profileId, profileId))
      .limit(1);
    if (remaining.length) return null; // still a member somewhere

    await tx
      .update(profiles)
      .set({ username: null, updatedAt: new Date() })
      .where(eq(profiles.id, profileId));
    return username;
  });
}

/**
 * The same release, addressed by EMAIL.
 *
 * An invited person can already hold a profile — that is how an admin sets their
 * username and starting password before they ever sign in — but an invitation is
 * not a membership. Revoking it therefore left a profile with a username, no
 * membership, and no membership id for anything to address it by. This is the door
 * for that case.
 *
 * Every profile on that email is considered, and each is released only if IT has no
 * memberships, so a person who is invited to one org while active in another keeps
 * their name.
 */
export async function releaseUsernameIfOrphanedByEmail(email: string): Promise<string | null> {
  const ids = await asPrivileged(async (tx) => {
    const rows = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(sql`lower(${profiles.email}) = lower(${email}) and ${profiles.username} is not null`);
    return rows.map((r) => r.id);
  });
  for (const id of ids) {
    const freed = await releaseUsernameIfOrphaned(id);
    if (freed) return freed;
  }
  return null;
}

/**
 * Set a person's own display name across EVERY profile they hold.
 *
 * A profile row is per (person, organization), so someone in more than one org has
 * more than one row and a single-row update would rename them in one place and not
 * the others. The name is the person's, not a club's, so this is deliberately
 * global: one edit, every club.
 *
 * The match must be a SUPERSET of what loadUser reads, or the rename appears not
 * to work at all: loadUser (behind /auth/me) selects on
 * `auth_user_id = X or profiles.id = X` and returns persons[0], so a row keyed by
 * `profiles.id = X` — the legacy shape where a profile's own id IS the auth id —
 * would be read but never written. The PATCH then succeeded on other rows while
 * /auth/me kept serving the old name, and the field snapped back.
 *
 * So all three arms:
 *   • auth_user_id — the normal link,
 *   • profiles.id  — the legacy shape loadUser also accepts,
 *   • email        — an invited profile carries the email before it is ever linked
 *                    to an auth user; without this those rows keep the old name
 *                    forever. Email identifies the person (one credential, one
 *                    person), the same assumption the login path makes.
 *
 * `name` is written alongside `display_name` because several readers fall back to
 * it (`display_name || name || email`); leaving it stale would let the old name
 * resurface wherever that fallback runs.
 *
 * Returns how many rows changed, so a caller can tell a real rename from a no-op.
 */
export async function setOwnDisplayName(
  authUserId: string,
  email: string | null,
  displayName: string,
): Promise<number> {
  return asPrivileged(async (tx) => {
    const rows = await tx
      .update(profiles)
      .set({ displayName, name: displayName, updatedAt: new Date() })
      .where(
        email
          ? sql`(${profiles.authUserId} = ${authUserId} or ${profiles.id} = ${authUserId}
                 or lower(${profiles.email}) = lower(${email}))`
          : sql`(${profiles.authUserId} = ${authUserId} or ${profiles.id} = ${authUserId})`,
      )
      .returning({ id: profiles.id });
    return rows.length;
  });
}

/**
 * Set or clear a profile's username. Pass null to clear.
 *
 * Uniqueness is enforced by the partial unique index, so a race between two
 * admins surfaces as a 23505 rather than two identical usernames.
 */
export async function setProfileUsername(
  profileId: string,
  username: string | null,
): Promise<Row> {
  return asPrivileged(async (tx) => {
    try {
      const r = await tx
        .update(profiles)
        .set({ username, updatedAt: new Date() })
        .where(eq(profiles.id, profileId))
        .returning();
      if (!r.length) throw new HttpError(404, "Profile not found");
      return profileRow(r[0]);
    } catch (exc) {
      if (exc instanceof HttpError) throw exc;
      const msg = String((exc as Error)?.message ?? exc);
      if (msg.includes("23505") || msg.toLowerCase().includes("duplicate")) {
        throw new HttpError(409, "That username is already taken");
      }
      throw exc;
    }
  });
}

export async function getProfile(profileId: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
    return r.length ? profileRow(r[0]) : null;
  });
}

export async function createOrganization(name: string, ownerAuthId: string): Promise<Row> {
  // Kept for the POST /orgs path; org SIGNUP goes through provisionOrganization.
  // Owner is an org-scoped profile (one login → many org profiles).
  return asPrivileged(async (tx) => {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "org";
    let slug = base;
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const hit = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
      if (hit.length === 0) break;
      n += 1;
      slug = `${base}-${n}`;
    }
    const [org] = await tx.insert(organizations).values({ name, slug }).returning();
    const ownerProfileId = await ensureOrgProfileTx(tx, ownerAuthId, org.id, { role: "org_admin" });
    await tx.update(organizations).set({ ownerId: ownerProfileId, createdByUserId: ownerProfileId }).where(eq(organizations.id, org.id));
    await tx.insert(orgMemberships).values({ orgId: org.id, profileId: ownerProfileId, role: "owner", access: "edit" });
    return orgRow(org);
  });
}

export async function getOrganization(orgId: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    return r.length ? orgRow(r[0]) : null;
  });
}

export async function getOrganizationBySlug(slug: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    return r.length ? orgRow(r[0]) : null;
  });
}

export async function getJoinCode(code: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(joinCodes).where(eq(joinCodes.code, code.trim().toUpperCase())).limit(1);
    return r.length ? joinCodeRow(r[0]) : null;
  });
}

export async function consumeJoinCode(code: string): Promise<void> {
  await asPrivileged(async (tx) => {
    const r = await tx.select().from(joinCodes).where(eq(joinCodes.code, code.trim().toUpperCase())).limit(1);
    if (!r.length || r[0].usesRemaining == null) return;
    const remaining = Math.max(0, (r[0].usesRemaining as number) - 1);
    await tx.update(joinCodes).set({ usesRemaining: remaining, active: remaining > 0 }).where(eq(joinCodes.id, r[0].id));
  });
}

export async function addMembership(
  orgId: string, profileId: string, role: string, stageNodeId: string | null, access: string, programId: string | null,
): Promise<Row> {
  return asPrivileged(async (tx) => {
    const [row] = await tx
      .insert(orgMemberships)
      .values({ orgId, profileId, role: normalizeRole(role), stageNodeId, access, programId })
      .returning();
    return { id: row.id, org_id: row.orgId, profile_id: row.profileId, role: row.role, stage_node_id: row.stageNodeId, access: row.access, program_id: row.programId };
  });
}

export async function recordAuditEvent(action: string, opts: AuditEventOptions = {}): Promise<void> {
  try {
    await asPrivileged(async (tx) => {
      // actorUserId may arrive as an auth id — resolve to the org-scoped profile.
      const actor = await resolveProfileId(tx, opts.actorUserId ?? null, opts.orgId ?? null);
      await tx.insert(auditEvents).values({
        organizationId: opts.orgId ?? null,
        actorUserId: actor,
        action,
        scopeType: opts.scopeType ?? null,
        scopeId: opts.scopeId ?? null,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        metadata: opts.metadata ?? {},
      });
    });
  } catch {
    // best-effort by design
  }
}

/** Identity bootstrap: resolve the caller's org-scoped profiles + memberships (privileged). */
export async function loadUser(authUserId: string): Promise<{ profile: Row | null; memberships: Membership[] }> {
  return asPrivileged(async (tx) => {
    // A person = one auth credential → many org-scoped profiles.
    const persons = await tx
      .select()
      .from(profiles)
      .where(or(eq(profiles.authUserId, authUserId), eq(profiles.id, authUserId)));
    if (!persons.length) return { profile: null, memberships: [] };
    const profileIds = persons.map((p) => p.id);

    // Memberships and their stage rows in ONE query. This runs on every
    // authenticated request (getCurrentUser), so a third sequential round trip
    // here was a per-request tax — and under serverless instance scattering
    // there is no warm cache to hide behind.
    const joined = await tx
      .select({ m: orgMemberships, s: stageNodes })
      .from(orgMemberships)
      .leftJoin(stageNodes, eq(orgMemberships.stageNodeId, stageNodes.id))
      .where(inArray(orgMemberships.profileId, profileIds));

    const memberships: Membership[] = joined.map(({ m, s }) => ({
      id: m.id,
      org_id: m.orgId,
      profile_id: m.profileId,
      role: normalizeRole(m.role),
      stage_node_id: m.stageNodeId ?? null,
      access: (m.access as "view" | "edit") ?? "view",
      stage_path: s ? s.path ?? null : null,
      stage_type: s ? ((s.stageType as Membership["stage_type"]) ?? null) : null,
      program_id: m.programId ?? null,
    }));
    return { profile: profileRow(persons[0]), memberships };
  });
}

/** Find-or-create the org-scoped profile for a person (by auth id) in an org. */
export async function ensureOrgProfile(
  authUserId: string,
  orgId: string,
  opts: { email?: string | null; role?: string; displayName?: string | null; allowSecondOrg?: boolean } = {},
): Promise<string> {
  return asPrivileged((tx) => ensureOrgProfileTx(tx, authUserId, orgId, opts));
}
