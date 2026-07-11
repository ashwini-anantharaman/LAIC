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
import { eq, inArray } from "drizzle-orm";

import type { Membership } from "../permissions";
import type { AuditEventOptions } from "../platformLocalStore";
import { asPrivileged } from "./context";
import { profiles, organizations, orgMemberships, joinCodes, stageNodes, auditEvents } from "./schema";

type Row = Record<string, unknown>;

const NROLE: Record<string, string> = { teacher: "instructor" };
const normalizeRole = (r: string): string => NROLE[r] ?? r;

function profileRow(p: typeof profiles.$inferSelect): Row {
  return { id: p.id, email: p.email, role: p.role, display_name: p.displayName, name: p.name };
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
    const [row] = await tx
      .insert(profiles)
      .values({ id: userId, email, role, displayName: displayName ?? name, name })
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

export async function getProfile(profileId: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
    return r.length ? profileRow(r[0]) : null;
  });
}

export async function createOrganization(name: string, ownerId: string): Promise<Row> {
  // Kept for the POST /orgs path; org SIGNUP goes through provisionOrganization.
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
    const [org] = await tx.insert(organizations).values({ name, slug, ownerId }).returning();
    await tx.insert(orgMemberships).values({ orgId: org.id, profileId: ownerId, role: "owner", access: "edit" });
    await tx.update(profiles).set({ role: "org_admin" }).where(eq(profiles.id, ownerId));
    return orgRow(org);
  });
}

export async function getOrganization(orgId: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
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
      await tx.insert(auditEvents).values({
        organizationId: opts.orgId ?? null,
        actorUserId: opts.actorUserId ?? null,
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

/** Identity bootstrap: resolve the caller's profile + memberships (privileged). */
export async function loadUser(userId: string): Promise<{ profile: Row | null; memberships: Membership[] }> {
  return asPrivileged(async (tx) => {
    const prof = await tx.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (!prof.length) return { profile: null, memberships: [] };

    const mships = await tx.select().from(orgMemberships).where(eq(orgMemberships.profileId, userId));
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
    return { profile: profileRow(prof[0]), memberships };
  });
}
