/**
 * Org-graph services — Nexus v0.4 Slice 11.
 *
 * CRUD + enrollment paths for the objects added in Slice 9: organization
 * relationships, program↔org affiliations, program affiliations, groups (+
 * members + coach-add), invitations (secure-token invite link + accept), and
 * bulk registration import. Postgres-only (RLS-scoped via `scoped()`); returns
 * snake_case rows for the routes.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import { HttpError } from "../httpError";
import * as localKeys from "../platformLocalStore";
import { asPrivileged } from "./context";
import { resolveProfileId, ensureOrgProfile } from "./resolveProfile";
import { scoped } from "./tenantRepo";
import {
  organizations, offerings, organizationRelationships, programOrganizationAffiliations,
  programAffiliations, groups, groupMemberships, invitations, registrations, participants, profiles, programs,
  programRoles, programRoleAssignments, platformRoleAssignments, entitlements, orgMemberships, registeredApps, appConfigVersions,
  appLaunchTokens,
} from "./schema";

type Row = Record<string, unknown>;

// ── Per-program custom roles (§3.5 Team & Roles) ────────────────────────────
const programRoleRow = (r: typeof programRoles.$inferSelect): Row => ({
  id: r.id, organization_id: r.organizationId, program_id: r.programId,
  name: r.name, perms: r.perms, created_at: r.createdAt,
});

export async function listProgramRoles(programId: string): Promise<Row[]> {
  return scoped(async (tx) =>
    (await tx.select().from(programRoles).where(eq(programRoles.programId, programId))).map(programRoleRow),
  );
}

export async function getProgramRole(id: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx.select().from(programRoles).where(eq(programRoles.id, id)).limit(1);
    return r.length ? programRoleRow(r[0]) : null;
  });
}

export async function createProgramRole(
  orgId: string,
  programId: string,
  name: string,
  perms: Row,
  createdByUserId?: string | null,
): Promise<Row> {
  return scoped(async (tx) => {
    const [r] = await tx
      .insert(programRoles)
      .values({ organizationId: orgId, programId, name, perms, createdByUserId: createdByUserId ?? null })
      .returning();
    return programRoleRow(r);
  });
}

export async function updateProgramRole(id: string, patch: { name?: string; perms?: Row }): Promise<Row | null> {
  return scoped(async (tx) => {
    const set: Row = {};
    if (patch.name != null) set.name = patch.name;
    if (patch.perms != null) set.perms = patch.perms;
    if (Object.keys(set).length === 0) return getProgramRole(id);
    const [r] = await tx.update(programRoles).set(set).where(eq(programRoles.id, id)).returning();
    return r ? programRoleRow(r) : null;
  });
}

export async function deleteProgramRole(id: string): Promise<void> {
  await scoped(async (tx) => {
    await tx.delete(programRoles).where(eq(programRoles.id, id));
  });
}

// ── Program members + role assignments (§3.5: assign people to roles) ───────
// A program's people are its program-scoped memberships plus its pending
// invitations; each may carry one custom-role assignment (matched by email so
// it works before AND after the person activates).

/** Everyone in a program: active members and pending invitees, with their assigned role. */
// Privileged read: the route verifies the caller belongs to this org, and some
// profiles (e.g. dev-activated ones) carry no organization_id, so org-scoped
// RLS would hide exactly the names/emails this listing exists to show.
export async function listProgramMembers(orgId: string, programId: string): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const mships = await tx
      .select()
      .from(orgMemberships)
      .where(and(eq(orgMemberships.orgId, orgId), eq(orgMemberships.programId, programId)));
    const pids = [...new Set(mships.map((m) => m.profileId))];
    // Memberships may reference either a profile's own id OR its auth-credential
    // id (dev auto-activation does the latter) — resolve both.
    const profs = pids.length
      ? await tx.select().from(profiles).where(or(inArray(profiles.id, pids), inArray(profiles.authUserId, pids)))
      : [];
    const profMap = new Map<string, (typeof profs)[number]>();
    for (const p of profs) {
      profMap.set(p.id, p);
      if (p.authUserId) profMap.set(p.authUserId, p);
    }

    const assignments = await tx
      .select({ a: programRoleAssignments, roleName: programRoles.name, rolePerms: programRoles.perms })
      .from(programRoleAssignments)
      .leftJoin(programRoles, eq(programRoles.id, programRoleAssignments.roleId))
      .where(eq(programRoleAssignments.programId, programId));
    const byEmail = new Map(
      assignments.map((r) => [
        (r.a.email ?? "").toLowerCase(),
        { role_id: r.a.roleId, role_name: r.roleName ?? null, role_perms: r.rolePerms ?? {} },
      ]),
    );

    const members = mships.map((m) => {
      const p = profMap.get(m.profileId);
      const email = ((p?.email as string | null) ?? "").toLowerCase();
      const asg = byEmail.get(email);
      return {
        membership_id: m.id,
        invitation_id: null as string | null,
        email: p?.email ?? null,
        display_name: p?.displayName ?? p?.name ?? null,
        membership_role: m.role,
        status: "active",
        role_id: asg?.role_id ?? null,
        role_name: asg?.role_name ?? null,
        role_perms: asg?.role_perms ?? {},
      };
    });

    const invites = (
      await tx
        .select()
        .from(invitations)
        .where(and(eq(invitations.organizationId, orgId), eq(invitations.programId, programId), eq(invitations.status, "pending")))
    ).map((i) => {
      const asg = byEmail.get((i.email ?? "").toLowerCase());
      return {
        membership_id: null as string | null,
        invitation_id: i.id,
        email: i.email,
        display_name: i.displayName ?? null,
        membership_role: i.role,
        status: "invited",
        role_id: asg?.role_id ?? null,
        role_name: asg?.role_name ?? null,
        role_perms: asg?.role_perms ?? {},
      };
    });

    // Members win over their own leftover pending invite (dev auto-activation
    // doesn't consume the invitation row).
    const seen = new Set(members.map((m) => (m.email as string | null)?.toLowerCase()).filter(Boolean));
    const rows = [...members, ...invites.filter((i) => !seen.has((i.email ?? "").toLowerCase()))];

    // Attach platform-role assignments (made inside the platforms' own UIs)
    // so the console can show them — read-only there by design. Keyed by
    // email → { platform: role } across every platform.
    const allAssignments = await tx
      .select({ email: platformRoleAssignments.email, platform: platformRoleAssignments.platform, role: platformRoleAssignments.role })
      .from(platformRoleAssignments)
      .where(eq(platformRoleAssignments.programId, programId));
    const platformRolesByEmail = new Map<string, Record<string, string>>();
    for (const a of allAssignments) {
      const key = a.email.toLowerCase();
      const m = platformRolesByEmail.get(key) ?? {};
      m[a.platform] = a.role;
      platformRolesByEmail.set(key, m);
    }
    return rows.map((r) => {
      const pr = platformRolesByEmail.get(((r.email as string | null) ?? "").toLowerCase()) ?? {};
      return {
        ...r,
        platform_roles: pr,
        // Back-compat: the console + bridge alias still read bridge_role.
        bridge_role: pr.bridge ?? null,
      };
    });
  });
}

/** Assign (or clear, with roleId=null) a person's custom role in a program. */
export async function setProgramRoleAssignment(
  orgId: string,
  programId: string,
  email: string,
  roleId: string | null,
): Promise<Row | null> {
  return scoped(async (tx) => {
    const key = email.trim().toLowerCase();
    await tx
      .delete(programRoleAssignments)
      .where(and(eq(programRoleAssignments.programId, programId), eq(programRoleAssignments.email, key)));
    if (!roleId) return null;
    const [a] = await tx
      .insert(programRoleAssignments)
      .values({ organizationId: orgId, programId, roleId, email: key })
      .returning();
    return { id: a.id, program_id: a.programId, role_id: a.roleId, email: a.email };
  });
}

/** The current user's assigned role (+perms) in a program, or null. */
export async function getProgramRoleForEmail(programId: string, email: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx
      .select({ a: programRoleAssignments, roleName: programRoles.name, rolePerms: programRoles.perms })
      .from(programRoleAssignments)
      .leftJoin(programRoles, eq(programRoles.id, programRoleAssignments.roleId))
      .where(and(eq(programRoleAssignments.programId, programId), eq(programRoleAssignments.email, email.trim().toLowerCase())))
      .limit(1);
    if (!r.length) return null;
    return { role_id: r[0].a.roleId, role_name: r[0].roleName ?? null, perms: r[0].rolePerms ?? {} };
  });
}

// ── Platform role assignments (Bridge People & Roles etc.) ──────────────────
// The platform's own UI assigns people to its PRE-BUILT roles; storage stays
// central so login/test-as at the org portal resolves the same answer.
export async function setPlatformRoleAssignment(
  orgId: string,
  programId: string,
  platform: string,
  email: string,
  role: string | null,
  assignedByUserId: string | null = null,
): Promise<Row | null> {
  return scoped(async (tx) => {
    const key = email.trim().toLowerCase();
    await tx
      .delete(platformRoleAssignments)
      .where(and(
        eq(platformRoleAssignments.programId, programId),
        eq(platformRoleAssignments.platform, platform),
        eq(platformRoleAssignments.email, key),
      ));
    if (!role) return null;
    const [a] = await tx
      .insert(platformRoleAssignments)
      .values({ organizationId: orgId, programId, platform, email: key, role, assignedByUserId })
      .returning();
    return { id: a.id, program_id: a.programId, platform: a.platform, email: a.email, role: a.role };
  });
}

export async function getPlatformRoleForEmail(
  programId: string,
  platform: string,
  email: string,
): Promise<string | null> {
  return scoped(async (tx) => {
    const r = await tx
      .select({ role: platformRoleAssignments.role })
      .from(platformRoleAssignments)
      .where(and(
        eq(platformRoleAssignments.programId, programId),
        eq(platformRoleAssignments.platform, platform),
        eq(platformRoleAssignments.email, email.trim().toLowerCase()),
      ))
      .limit(1);
    return r.length ? r[0].role : null;
  });
}

export async function listPlatformRoleAssignments(programId: string, platform: string): Promise<Row[]> {
  return scoped(async (tx) =>
    (await tx
      .select()
      .from(platformRoleAssignments)
      .where(and(eq(platformRoleAssignments.programId, programId), eq(platformRoleAssignments.platform, platform))))
      .map((a) => ({ email: a.email, role: a.role, created_at: a.createdAt })),
  );
}

// ── Organization relationships ──────────────────────────────────────────────
const relRow = (r: typeof organizationRelationships.$inferSelect): Row => ({
  id: r.id, source_organization_id: r.sourceOrganizationId, target_organization_id: r.targetOrganizationId,
  relationship_type: r.relationshipType, status: r.status, metadata_json: r.metadataJson, created_at: r.createdAt,
});

export async function listOrgRelationships(orgId: string): Promise<Row[]> {
  return scoped(async (tx) =>
    (await tx.select().from(organizationRelationships)
      .where(or(eq(organizationRelationships.sourceOrganizationId, orgId), eq(organizationRelationships.targetOrganizationId, orgId)))
    ).map(relRow),
  );
}

export async function createOrgRelationship(orgId: string, opts: { targetOrganizationId: string; relationshipType: string; metadataJson?: Row }): Promise<Row> {
  return scoped(async (tx) => {
    const [r] = await tx.insert(organizationRelationships).values({
      sourceOrganizationId: orgId, targetOrganizationId: opts.targetOrganizationId,
      relationshipType: opts.relationshipType, metadataJson: opts.metadataJson ?? {},
    }).returning();
    return relRow(r);
  });
}

export async function updateOrgRelationship(id: string, status: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const [r] = await tx.update(organizationRelationships).set({ status }).where(eq(organizationRelationships.id, id)).returning();
    return r ? relRow(r) : null;
  });
}

// Privileged fetch — used to resolve both org ids for authorization/audit.
export async function getOrgRelationship(id: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(organizationRelationships).where(eq(organizationRelationships.id, id)).limit(1);
    return r.length ? relRow(r[0]) : null;
  });
}

// Remove the relationship (one row → removed for both orgs). RLS lets either side.
export async function deleteOrgRelationship(id: string): Promise<boolean> {
  return scoped(async (tx) => {
    const r = await tx.delete(organizationRelationships).where(eq(organizationRelationships.id, id)).returning();
    return r.length > 0;
  });
}

// ── Program ↔ organization affiliations ─────────────────────────────────────
const poaRow = (r: typeof programOrganizationAffiliations.$inferSelect): Row => ({
  id: r.id, program_id: r.programId, organization_id: r.organizationId, affiliation_type: r.affiliationType,
  tenant_access_mode: r.tenantAccessMode, visibility: r.visibility, status: r.status, metadata_json: r.metadataJson, created_at: r.createdAt,
});

export async function listProgramOrgAffiliations(programId: string): Promise<Row[]> {
  return scoped(async (tx) => (await tx.select().from(programOrganizationAffiliations).where(eq(programOrganizationAffiliations.programId, programId))).map(poaRow));
}

// Incoming affiliation requests addressed to an org (Org B's inbox). Privileged
// read enriched with the program name + inviting org id — the route verifies the
// caller belongs to `orgId` first, and RLS would otherwise hide the program row
// (it lives under the inviting org, which the invitee isn't a member of).
export async function listIncomingProgramOrgAffiliations(orgId: string): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.select({
      poa: programOrganizationAffiliations,
      programName: programs.name,
      fromOrgId: programs.orgId,
    }).from(programOrganizationAffiliations)
      .leftJoin(programs, eq(programs.id, programOrganizationAffiliations.programId))
      .where(eq(programOrganizationAffiliations.organizationId, orgId));
    return rows.map((r) => ({ ...poaRow(r.poa), program_name: r.programName ?? null, from_organization_id: r.fromOrgId ?? null }));
  });
}

// Fetch one affiliation (privileged) — used to resolve org ids for audit/authz.
export async function getProgramOrgAffiliation(id: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const rows = await tx.select({ poa: programOrganizationAffiliations, fromOrgId: programs.orgId })
      .from(programOrganizationAffiliations)
      .leftJoin(programs, eq(programs.id, programOrganizationAffiliations.programId))
      .where(eq(programOrganizationAffiliations.id, id)).limit(1);
    if (!rows.length) return null;
    return { ...poaRow(rows[0].poa), from_organization_id: rows[0].fromOrgId ?? null };
  });
}

// ── Cross-org program sharing: Org B's read view of an affiliated program ────
// Accepting an affiliation shares the program (same name) + its courses and
// students with the invited org. These are privileged reads authorized by an
// ACTIVE affiliation — the route verifies the caller belongs to the invited org.
export async function listAffiliatedPrograms(orgId: string): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.select({
      programId: programOrganizationAffiliations.programId,
      affiliationType: programOrganizationAffiliations.affiliationType,
      name: programs.name, category: programs.category, description: programs.description, ownerOrgId: programs.orgId,
    }).from(programOrganizationAffiliations)
      .leftJoin(programs, eq(programs.id, programOrganizationAffiliations.programId))
      .where(and(eq(programOrganizationAffiliations.organizationId, orgId), eq(programOrganizationAffiliations.status, "active")));
    return rows.map((r) => ({
      program_id: r.programId, name: r.name, category: r.category, description: r.description,
      owner_organization_id: r.ownerOrgId, affiliation_type: r.affiliationType,
    }));
  });
}

export async function hasActiveAffiliation(orgId: string, programId: string): Promise<boolean> {
  return asPrivileged(async (tx) => {
    const r = await tx.select({ id: programOrganizationAffiliations.id }).from(programOrganizationAffiliations)
      .where(and(
        eq(programOrganizationAffiliations.programId, programId),
        eq(programOrganizationAffiliations.organizationId, orgId),
        eq(programOrganizationAffiliations.status, "active"),
      )).limit(1);
    return r.length > 0;
  });
}

export async function getAffiliatedProgramDetail(programId: string): Promise<Row> {
  return asPrivileged(async (tx) => {
    const [p] = await tx.select().from(programs).where(eq(programs.id, programId)).limit(1);
    const offs = await tx.select().from(offerings).where(eq(offerings.programId, programId));
    const offIds = offs.map((o) => o.id);
    const parts = offIds.length
      ? await tx.select({
          id: participants.id, offeringId: participants.offeringId, participantType: participants.participantType,
          status: participants.status, profDisplay: profiles.displayName, profEmail: profiles.email, profName: profiles.name,
          regName: registrations.name, regEmail: registrations.email,
        }).from(participants)
          .leftJoin(profiles, eq(profiles.id, participants.userId))
          .leftJoin(registrations, eq(registrations.id, participants.registrationId))
          .where(inArray(participants.offeringId, offIds))
      : [];
    return {
      program: p ? { id: p.id, name: p.name, category: p.category, description: p.description } : null,
      offerings: offs.map((o) => ({ id: o.id, name: o.name, offering_type: o.offeringType, status: o.status })),
      participants: parts.map((x) => ({
        id: x.id, offering_id: x.offeringId, participant_type: x.participantType, status: x.status,
        display_name: x.profDisplay ?? x.profName ?? x.regName ?? null,
        email: x.profEmail ?? x.regEmail ?? null,
      })),
    };
  });
}

export async function createProgramOrgAffiliation(programId: string, opts: { organizationId: string; affiliationType: string; tenantAccessMode?: string; visibility?: string; metadataJson?: Row }): Promise<Row> {
  return scoped(async (tx) => {
    const [r] = await tx.insert(programOrganizationAffiliations).values({
      programId, organizationId: opts.organizationId, affiliationType: opts.affiliationType,
      tenantAccessMode: opts.tenantAccessMode ?? "none", visibility: opts.visibility ?? "program", metadataJson: opts.metadataJson ?? {},
    }).returning();
    return poaRow(r);
  });
}

export async function updateProgramOrgAffiliation(id: string, status: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const [r] = await tx.update(programOrganizationAffiliations).set({ status }).where(eq(programOrganizationAffiliations.id, id)).returning();
    return r ? poaRow(r) : null;
  });
}

// ── Program affiliations (actor → program) ──────────────────────────────────
const paRow = (r: typeof programAffiliations.$inferSelect): Row => ({
  id: r.id, program_id: r.programId, subject_type: r.subjectType, subject_id: r.subjectId, affiliation_type: r.affiliationType,
  represented_organization_id: r.representedOrganizationId, status: r.status, visibility: r.visibility, metadata_json: r.metadataJson, created_at: r.createdAt,
});

export async function listProgramAffiliations(programId: string): Promise<Row[]> {
  return scoped(async (tx) => (await tx.select().from(programAffiliations).where(eq(programAffiliations.programId, programId))).map(paRow));
}

export async function createProgramAffiliation(programId: string, opts: { subjectType: string; subjectId: string; affiliationType: string; representedOrganizationId?: string | null; visibility?: string; metadataJson?: Row }): Promise<Row> {
  return scoped(async (tx) => {
    const [r] = await tx.insert(programAffiliations).values({
      programId, subjectType: opts.subjectType, subjectId: opts.subjectId, affiliationType: opts.affiliationType,
      representedOrganizationId: opts.representedOrganizationId ?? null, visibility: opts.visibility ?? "program", metadataJson: opts.metadataJson ?? {},
    }).returning();
    return paRow(r);
  });
}

export async function updateProgramAffiliation(id: string, status: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const [r] = await tx.update(programAffiliations).set({ status }).where(eq(programAffiliations.id, id)).returning();
    return r ? paRow(r) : null;
  });
}

// ── Groups (+ members) ──────────────────────────────────────────────────────
const groupRow = (g: typeof groups.$inferSelect): Row => ({
  id: g.id, organization_id: g.organizationId, program_id: g.programId, offering_id: g.offeringId,
  name: g.name, label: g.label, visibility: g.visibility, parent_group_id: g.parentGroupId,
  owner_user_id: g.ownerUserId, owner_organization_id: g.ownerOrganizationId, metadata_json: g.metadataJson, created_at: g.createdAt,
});

export async function listGroups(orgId: string, programId?: string | null): Promise<Row[]> {
  return scoped(async (tx) => {
    const where = programId ? and(eq(groups.organizationId, orgId), eq(groups.programId, programId)) : eq(groups.organizationId, orgId);
    return (await tx.select().from(groups).where(where)).map(groupRow);
  });
}

export async function createGroup(orgId: string, opts: { programId?: string | null; offeringId?: string | null; name: string; label?: string | null; parentGroupId?: string | null; ownerUserId?: string | null; ownerOrganizationId?: string | null; metadataJson?: Row }): Promise<Row> {
  return scoped(async (tx) => {
    const ownerUser = await resolveProfileId(tx, opts.ownerUserId ?? null, orgId);
    const [g] = await tx.insert(groups).values({
      organizationId: orgId, programId: opts.programId ?? null, offeringId: opts.offeringId ?? null,
      name: opts.name, label: opts.label ?? null, parentGroupId: opts.parentGroupId ?? null,
      ownerUserId: ownerUser, ownerOrganizationId: opts.ownerOrganizationId ?? null, metadataJson: opts.metadataJson ?? {},
    }).returning();
    return groupRow(g);
  });
}

export async function getGroup(id: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx.select().from(groups).where(eq(groups.id, id)).limit(1);
    return r.length ? groupRow(r[0]) : null;
  });
}

export async function updateGroup(id: string, patch: { name?: string; label?: string | null; visibility?: string; parentGroupId?: string | null }): Promise<Row | null> {
  return scoped(async (tx) => {
    const set: Row = {};
    if (patch.name != null) set.name = patch.name;
    if (patch.label !== undefined) set.label = patch.label;
    if (patch.visibility != null) set.visibility = patch.visibility;
    if (patch.parentGroupId !== undefined) set.parentGroupId = patch.parentGroupId;
    const [g] = await tx.update(groups).set(set).where(eq(groups.id, id)).returning();
    return g ? groupRow(g) : null;
  });
}

export async function listGroupMembers(groupId: string): Promise<Row[]> {
  return scoped(async (tx) => {
    const rows = await tx.select().from(groupMemberships).where(eq(groupMemberships.groupId, groupId));
    const pids = rows.map((r) => r.userId).filter((x): x is string => Boolean(x));
    const profs = pids.length ? await tx.select().from(profiles).where(inArray(profiles.id, pids)) : [];
    const pmap = new Map(profs.map((p) => [p.id, p]));
    return rows.map((m) => {
      const p = m.userId ? pmap.get(m.userId) : undefined;
      return { id: m.id, group_id: m.groupId, user_id: m.userId, role: m.role, display_name: p?.displayName ?? null, email: p?.email ?? null, created_at: m.createdAt };
    });
  });
}

export async function addGroupMember(groupId: string, orgId: string, opts: { userId?: string | null; role?: string | null }): Promise<Row> {
  return scoped(async (tx) => {
    const userId = await resolveProfileId(tx, opts.userId ?? null, orgId);
    const [m] = await tx.insert(groupMemberships).values({ organizationId: orgId, groupId, userId, role: opts.role ?? null })
      .onConflictDoNothing().returning();
    return m ? { id: m.id, group_id: m.groupId, user_id: m.userId, role: m.role } : { group_id: groupId, user_id: userId };
  });
}

export async function removeGroupMember(memberId: string): Promise<void> {
  await scoped(async (tx) => { await tx.delete(groupMemberships).where(eq(groupMemberships.id, memberId)); });
}

/** {groupId} ∪ all descendant group ids (recursive, within the org). */
export async function resolveGroupScope(orgId: string, groupId: string): Promise<string[]> {
  return scoped(async (tx) => {
    const all = await tx.select({ id: groups.id, parent: groups.parentGroupId }).from(groups).where(eq(groups.organizationId, orgId));
    const children = new Map<string, string[]>();
    for (const g of all) {
      if (g.parent) children.set(g.parent, [...(children.get(g.parent) ?? []), g.id]);
    }
    const out: string[] = [];
    const stack = [groupId];
    while (stack.length) {
      const id = stack.pop()!;
      out.push(id);
      for (const c of children.get(id) ?? []) stack.push(c);
    }
    return out;
  });
}

/** Instructor adds a known learner to their group (§16 coach-add). */
export async function coachAddParticipant(groupId: string, actorAuthId: string, opts: { email?: string | null; name?: string | null; offeringId?: string | null; participantType?: string }): Promise<Row> {
  return scoped(async (tx) => {
    const g = await tx.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (!g.length) throw new Error("Group not found");
    const grp = g[0];
    const offeringId = opts.offeringId ?? grp.offeringId;
    if (!offeringId) throw new Error("An offering is required (group has none; pass offering_id)");
    const addedBy = await resolveProfileId(tx, actorAuthId, grp.organizationId);
    const [reg] = await tx.insert(registrations).values({
      organizationId: grp.organizationId, programId: grp.programId, offeringId,
      registrationSource: "coach_add", email: opts.email ?? null, name: opts.name ?? null,
      status: "directly_added", createdByUserId: addedBy,
    }).returning();
    const [p] = await tx.insert(participants).values({
      organizationId: grp.organizationId, programId: grp.programId, offeringId,
      groupId, participantType: opts.participantType ?? "learner", addedByUserId: addedBy, registrationId: reg.id,
    }).returning();
    return { id: p.id, group_id: groupId, offering_id: offeringId, registration_id: reg.id, participant_type: p.participantType };
  });
}

// ── Invitations (secure-token invite link) ──────────────────────────────────
const inviteRow = (i: typeof invitations.$inferSelect): Row => ({
  id: i.id, organization_id: i.organizationId, program_id: i.programId, offering_id: i.offeringId, group_id: i.groupId,
  email: i.email, display_name: i.displayName, role: i.role, status: i.status, expires_at: i.expiresAt, created_at: i.createdAt,
});

export async function createInvitation(orgId: string, invitedByAuthId: string, opts: { email?: string | null; displayName?: string | null; role?: string; programId?: string | null; offeringId?: string | null; groupId?: string | null; expiresAt?: string | null }): Promise<{ invitation: Row; token: string }> {
  return scoped(async (tx) => {
    const [rawToken, tokenHash] = localKeys.generateApiKey();
    const invitedBy = await resolveProfileId(tx, invitedByAuthId, orgId);
    const [i] = await tx.insert(invitations).values({
      organizationId: orgId, programId: opts.programId ?? null, offeringId: opts.offeringId ?? null, groupId: opts.groupId ?? null,
      tokenHash, email: opts.email ?? null, displayName: opts.displayName ?? null, role: opts.role ?? "learner", invitedByUserId: invitedBy,
      expiresAt: (opts.expiresAt as unknown as Date) ?? null,
    }).returning();
    return { invitation: inviteRow(i), token: rawToken };
  });
}

/** Peek an invitation by its raw token (privileged: the invitee isn't a member yet). */
export async function getInvitationByToken(rawToken: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(invitations).where(eq(invitations.tokenHash, localKeys.hashApiKey(rawToken))).limit(1);
    if (!r.length) return null;
    const i = r[0];
    const org = await tx.select({ name: organizations.name, slug: organizations.slug }).from(organizations).where(eq(organizations.id, i.organizationId)).limit(1);
    return {
      ...inviteRow(i),
      organization_name: org.length ? org[0].name : null,
      organization_slug: org.length ? org[0].slug : null,
    };
  });
}

/** List invitations for an org (no token — that's hashed). Dev tooling + admin views. */
export async function listInvitations(orgId: string): Promise<Row[]> {
  return scoped(async (tx) =>
    (await tx.select().from(invitations).where(eq(invitations.organizationId, orgId))).map(inviteRow),
  );
}

/** Fetch one invitation by id (for authorization before revoking). */
export async function getInvitation(id: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx.select().from(invitations).where(eq(invitations.id, id)).limit(1);
    return r.length ? inviteRow(r[0]) : null;
  });
}

/** Withdraw a pending invitation — its activation link stops working. */
export async function revokeInvitation(id: string): Promise<boolean> {
  return scoped(async (tx) => {
    const r = await tx
      .update(invitations)
      .set({ status: "revoked" })
      .where(and(eq(invitations.id, id), eq(invitations.status, "pending")))
      .returning({ id: invitations.id });
    return r.length > 0;
  });
}

/** Accept an invitation → ensure the invitee's org profile + membership/participant. */
export async function acceptInvitation(
  rawToken: string,
  authUserId: string,
  displayName?: string | null,
  accepterEmail?: string | null,
): Promise<Row> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(invitations).where(eq(invitations.tokenHash, localKeys.hashApiKey(rawToken))).limit(1);
    if (!r.length) throw new HttpError(404, "Invalid invitation");
    const inv = r[0];
    if (inv.status !== "pending") throw new HttpError(410, "This invitation has already been used or withdrawn");
    if (inv.expiresAt && new Date(inv.expiresAt) < new Date()) throw new HttpError(410, "This invitation has expired");
    // An email-addressed invitation may only be accepted by that email's owner.
    // Without this, an admin who opens the activation link while still signed in
    // absorbs the invitation into THEIR account — the invited person is never
    // created, and the admin silently accumulates stacked memberships.
    if (inv.email && accepterEmail && inv.email.toLowerCase() !== accepterEmail.toLowerCase()) {
      throw new HttpError(
        409,
        `This invitation was issued to ${inv.email}. You're signed in as ${accepterEmail} — sign out first, then open the link to create ${inv.email}'s account.`,
      );
    }

    const adminish = ["administrator", "owner"].includes(inv.role);
    const staff = ["instructor", "teacher", "coach"].includes(inv.role);
    // profiles.role vocabulary is student/teacher/org_admin; membership role is separate.
    const profileRole = adminish ? "org_admin" : staff ? "teacher" : "student";
    // Prefer the name the invitee confirms at accept time; fall back to what the
    // inviter typed when creating the invitation, so a name is never dropped.
    const resolvedDisplayName = displayName ?? inv.displayName ?? null;
    const profileId = await ensureOrgProfile(tx, authUserId, inv.organizationId, { email: inv.email, role: profileRole, displayName: resolvedDisplayName, allowSecondOrg: true });
    // instructor/admin roles → membership; learner/participant → offering participant.
    if (adminish || staff) {
      const mrole = adminish ? (inv.role === "owner" ? "owner" : "administrator") : "instructor";
      await tx.execute(
        sql`insert into org_memberships (org_id, profile_id, role, program_id) values (${inv.organizationId}, ${profileId}, ${mrole}, ${inv.programId}) on conflict do nothing`,
      );
    } else if (inv.offeringId) {
      await tx.insert(participants).values({
        organizationId: inv.organizationId, programId: inv.programId, offeringId: inv.offeringId,
        groupId: inv.groupId, userId: profileId, participantType: "learner", registrationId: null,
      }).onConflictDoNothing();
    }
    const [updated] = await tx.update(invitations).set({ status: "accepted", acceptedByUserId: profileId, acceptedAt: new Date() }).where(eq(invitations.id, inv.id)).returning();
    return inviteRow(updated);
  });
}

// ── Bulk registration import ────────────────────────────────────────────────
export async function bulkImportRegistrations(orgId: string, offeringId: string, rows: Array<{ email?: string; name?: string; age?: number; field_data?: Row }>, createdByAuthId: string): Promise<{ created: number }> {
  return scoped(async (tx) => {
    const offRows = await tx.select().from(offerings).where(eq(offerings.id, offeringId)).limit(1);
    const off = offRows[0];
    const createdBy = await resolveProfileId(tx, createdByAuthId, orgId);
    let created = 0;
    for (const row of rows) {
      const [reg] = await tx.insert(registrations).values({
        organizationId: orgId, programId: off?.programId ?? null, offeringId,
        registrationSource: "bulk_import", email: row.email ?? null, name: row.name ?? null, age: row.age ?? null,
        status: off?.approvalMode === "auto_approve" ? "approved" : "pending_review",
        fieldData: row.field_data ?? {}, createdByUserId: createdBy,
      }).returning();
      if (off?.approvalMode === "auto_approve") {
        await tx.insert(participants).values({
          organizationId: orgId, programId: off?.programId ?? null, offeringId,
          participantType: "learner", registrationId: reg.id,
        }).onConflictDoNothing();
      }
      created += 1;
    }
    return { created };
  });
}

// ── Operator provisioning (§3.5 Nexus → Org boundary event) ─────────────────
// The Nexus operator's one repeatable event: create the org record + isolation
// boundary + default entitlements, then invite every named administrator (the
// first becomes owner). No one signs a password on the operator's behalf —
// each administrator activates via their own invitation link, exactly like any
// other invite. This is the honest version of "provision an org": the operator
// never creates a login for someone else.
export interface ProvisionAdminInput {
  email: string;
  displayName?: string | null;
}

export interface ProvisionedInvite {
  email: string;
  role: string;
  token: string;
  invitation_id: string;
}

export async function provisionOrganizationWithAdmins(
  name: string,
  admins: ProvisionAdminInput[],
): Promise<{ organization: Row; invitations: ProvisionedInvite[] }> {
  return asPrivileged(async (tx) => {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "org";
    let slug = base;
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const hit = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
      if (!hit.length) break;
      n += 1;
      slug = `${base}-${n}`;
    }

    // 1. Organization record — the isolation boundary is its id, enforced by
    //    RLS on every org-scoped table from this point on.
    const [org] = await tx
      .insert(organizations)
      .values({ name, slug, tenantMode: "full_tenant", status: "active", dataResidency: "shared" })
      .returning();

    // 2. Default entitlements — nexus (mandatory) + learning, so the org can
    //    begin the moment its first administrator activates.
    await tx.insert(entitlements).values([
      { organizationId: org.id, subjectType: "organization", subjectId: org.id, module: "nexus", status: "active" },
      { organizationId: org.id, subjectType: "organization", subjectId: org.id, module: "learning", status: "active" },
    ]);

    // 3. Activation invitations — first admin = owner, the rest = administrator.
    const invited: ProvisionedInvite[] = [];
    for (let i = 0; i < admins.length; i++) {
      const admin = admins[i];
      const [rawToken, tokenHash] = localKeys.generateApiKey();
      const [inv] = await tx
        .insert(invitations)
        .values({
          organizationId: org.id,
          tokenHash,
          email: admin.email,
          role: i === 0 ? "owner" : "administrator",
        })
        .returning();
      invited.push({ email: admin.email, role: inv.role, token: rawToken, invitation_id: inv.id });
    }

    return {
      organization: { id: org.id, name: org.name, slug: org.slug, status: org.status },
      invitations: invited,
    };
  });
}

// ── App Shell config + immutable version snapshots (Phase 4) ────────────────
export async function getShellConfig(appId: string): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx
      .select({ id: registeredApps.id, orgId: registeredApps.organizationId, config: registeredApps.shellConfig })
      .from(registeredApps)
      .where(eq(registeredApps.id, appId))
      .limit(1);
    return r.length ? { app_id: r[0].id, organization_id: r[0].orgId, config: r[0].config ?? {} } : null;
  });
}

export async function setShellConfig(appId: string, config: Row): Promise<Row> {
  return scoped(async (tx) => {
    const [r] = await tx
      .update(registeredApps)
      .set({ shellConfig: config, updatedAt: new Date() })
      .where(eq(registeredApps.id, appId))
      .returning({ id: registeredApps.id, config: registeredApps.shellConfig });
    return { app_id: r.id, config: r.config ?? {} };
  });
}

const versionRow = (v: typeof appConfigVersions.$inferSelect): Row => ({
  id: v.id, registered_app_id: v.registeredAppId, version: v.version,
  config: v.config, created_at: v.createdAt,
});

export async function listConfigVersions(appId: string): Promise<Row[]> {
  return scoped(async (tx) =>
    (
      await tx
        .select()
        .from(appConfigVersions)
        .where(eq(appConfigVersions.registeredAppId, appId))
        .orderBy(desc(appConfigVersions.version))
    ).map(versionRow),
  );
}

/** Snapshot the current working config as the next immutable version. */
export async function publishConfigVersion(orgId: string, appId: string): Promise<Row> {
  return scoped(async (tx) => {
    const app = await tx
      .select({ config: registeredApps.shellConfig })
      .from(registeredApps)
      .where(eq(registeredApps.id, appId))
      .limit(1);
    if (!app.length) throw new HttpError(404, "App not found");
    const latest = await tx
      .select({ version: appConfigVersions.version })
      .from(appConfigVersions)
      .where(eq(appConfigVersions.registeredAppId, appId))
      .orderBy(desc(appConfigVersions.version))
      .limit(1);
    const next = (latest[0]?.version ?? 0) + 1;
    const [v] = await tx
      .insert(appConfigVersions)
      .values({ organizationId: orgId, registeredAppId: appId, version: next, config: app[0].config ?? {} })
      .returning();
    return versionRow(v);
  });
}

/** The latest PUBLISHED config (what a runtime should serve), or null if never published. */
/**
 * A program row for ACCESS RESOLUTION (privileged). Students hold no
 * membership, so under RLS they can't read the program row their standing is
 * checked against — this fetches just the fields the resolver needs.
 */
export async function getProgramForAccess(programId: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx
      .select({ id: programs.id, orgId: programs.orgId, name: programs.name, metadataJson: programs.metadataJson })
      .from(programs)
      .where(eq(programs.id, programId))
      .limit(1);
    if (!r.length) return null;
    return {
      id: r[0].id,
      org_id: r[0].orgId,
      name: r[0].name,
      features: ((r[0].metadataJson as Row | null)?.features as Row) ?? {},
    };
  });
}

/**
 * Platform launch, end to end (privileged). The launch routes authorize the
 * caller first (org member OR learner participant); the mechanics — find or
 * lazily provision the program's platform app, backfill its launch URL, mint
 * the single-use token — run privileged because students can't read app rows
 * under RLS. Returns `created` so the route can audit first-time provisioning.
 */
export async function mintPlatformLaunch(opts: {
  orgId: string;
  programId: string;
  appName: string;
  slugPrefix: string;
  launchUrl: string | null;
  launcherAuthId: string;
}): Promise<{ app: Row; rawToken: string; expiresAt: Date; created: boolean }> {
  return asPrivileged(async (tx) => {
    let created = false;
    let appRow =
      (
        await tx
          .select()
          .from(registeredApps)
          .where(
            and(
              eq(registeredApps.programId, opts.programId),
              sql`${registeredApps.appSlug} like ${opts.slugPrefix + "%"}`,
            ),
          )
          .limit(1)
      )[0] ?? null;
    if (!appRow) {
      [appRow] = await tx
        .insert(registeredApps)
        .values({
          organizationId: opts.orgId,
          programId: opts.programId,
          appName: opts.appName,
          appSlug: `${opts.slugPrefix}-${opts.programId.slice(0, 8)}`,
          launchUrl: opts.launchUrl,
        })
        .returning();
      created = true;
    } else if (!appRow.launchUrl && opts.launchUrl) {
      // Backfill records provisioned before the env was configured.
      [appRow] = await tx
        .update(registeredApps)
        .set({ launchUrl: opts.launchUrl })
        .where(eq(registeredApps.id, appRow.id))
        .returning();
    }
    const [rawToken, tokenHash] = localKeys.generateApiKey();
    // The launcher may be identified by auth id — store their org profile id.
    const profileId = await resolveProfileId(tx, opts.launcherAuthId, opts.orgId);
    const expiresAt = new Date(Date.now() + 60_000);
    await tx.insert(appLaunchTokens).values({
      tokenHash,
      registeredAppId: appRow.id,
      userId: profileId ?? opts.launcherAuthId,
      expiresAt,
    });
    return {
      app: { id: appRow.id, app_slug: appRow.appSlug, app_name: appRow.appName, launch_url: appRow.launchUrl ?? null },
      rawToken,
      expiresAt,
      created,
    };
  });
}

/**
 * A student's standing, straight from the enrollment records (privileged:
 * powers access resolution + app login). Students are NEVER org members —
 * they exist only as registrations/participants, invisible to the console's
 * people surfaces — so the platform door and the app's sign-in look here.
 * Matched by the registration's email; learner-type, active only.
 */
export async function findLearnerParticipations(
  email: string,
  programId?: string | null,
): Promise<Row[]> {
  const key = email.trim().toLowerCase();
  if (!key) return [];
  return asPrivileged(async (tx) => {
    const rows = await tx
      .select({
        orgId: participants.organizationId,
        programId: participants.programId,
        userId: participants.userId,
      })
      .from(participants)
      .innerJoin(registrations, eq(participants.registrationId, registrations.id))
      .where(
        and(
          sql`lower(${registrations.email}) = ${key}`,
          eq(participants.participantType, "learner"),
          eq(participants.status, "active"),
          ...(programId ? [eq(participants.programId, programId)] : []),
        ),
      );
    return rows.map((r) => ({ organization_id: r.orgId, program_id: r.programId, user_id: r.userId }));
  });
}

/**
 * Delete a registered app (App Shell) and everything that exists only for it:
 * published config versions and launch tokens go with it; offerings and
 * registrations that POINT at it are detached, never deleted — they are the
 * org's records, not the app's.
 */
export async function deleteRegisteredApp(appId: string): Promise<void> {
  return scoped(async (tx) => {
    await tx.delete(appConfigVersions).where(eq(appConfigVersions.registeredAppId, appId));
    await tx.delete(appLaunchTokens).where(eq(appLaunchTokens.registeredAppId, appId));
    await tx.update(offerings).set({ registeredAppId: null }).where(eq(offerings.registeredAppId, appId));
    await tx.update(registrations).set({ registeredAppId: null }).where(eq(registrations.registeredAppId, appId));
    await tx.delete(registeredApps).where(eq(registeredApps.id, appId));
  });
}

/**
 * An org's public identity (privileged: powers the pre-auth boot endpoint).
 * Slug + name only — the pieces a student's phone needs to render the org's
 * sign-in door before anyone is authenticated. Never settings or people.
 */
export async function getOrgPublicIdentity(orgId: string): Promise<{ slug: string; name: string } | null> {
  return asPrivileged(async (tx) => {
    const r = await tx
      .select({ slug: organizations.slug, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    return r.length ? { slug: r[0].slug, name: r[0].name } : null;
  });
}

export async function getPublishedConfig(appId: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx
      .select()
      .from(appConfigVersions)
      .where(eq(appConfigVersions.registeredAppId, appId))
      .orderBy(desc(appConfigVersions.version))
      .limit(1);
    return r.length ? versionRow(r[0]) : null;
  });
}

/** Registered app by slug (privileged: powers the public pre-auth boot endpoint). */
export async function getRegisteredAppBySlug(slug: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(registeredApps).where(eq(registeredApps.appSlug, slug)).limit(1);
    if (!r.length) return null;
    const a = r[0];
    return {
      id: a.id, organization_id: a.organizationId, program_id: a.programId, offering_id: a.offeringId,
      app_name: a.appName, app_slug: a.appSlug, status: a.status, launch_url: a.launchUrl,
    };
  });
}
