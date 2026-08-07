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

    const mships = await tx.select().from(orgMemberships).where(inArray(orgMemberships.profileId, profileIds));
    const stageIds = mships.map((m) => m.stageNodeId).filter((x): x is string => Boolean(x));
    const stages = stageIds.length
      ? await tx.select().from(stageNodes).where(inArray(stageNodes.id, stageIds))
      : [];
    const stageMap = new Map(stages.map((s) => [s.id, s]));

    const memberships: Membership[] = mships.map((m) => {
      const stage = m.stageNodeId ? stageMap.get(m.stageNodeId) : undefined;
      return {
        id: m.id,
        org_id: m.orgId,
        profile_id: m.profileId,
        role: normalizeRole(m.role),
        stage_node_id: m.stageNodeId ?? null,
        access: (m.access as "view" | "edit") ?? "view",
        stage_path: stage ? stage.path ?? null : null,
        stage_type: stage ? (stage.stageType as Membership["stage_type"]) ?? null : null,
        program_id: m.programId ?? null,
      };
    });
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
