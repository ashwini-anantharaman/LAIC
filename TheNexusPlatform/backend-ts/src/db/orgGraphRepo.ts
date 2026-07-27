/**
 * Org-graph services — Nexus v0.4 Slice 11.
 *
 * CRUD + enrollment paths for the objects added in Slice 9: organization
 * relationships, program↔org affiliations, program affiliations, groups (+
 * members + coach-add), invitations (secure-token invite link + accept), and
 * bulk registration import. Postgres-only (RLS-scoped via `scoped()`); returns
 * snake_case rows for the routes.
 */
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { HttpError } from "../httpError";
import * as localKeys from "../platformLocalStore";
import { asPrivileged } from "./context";
import { resolveProfileId, ensureOrgProfile } from "./resolveProfile";
import { scoped } from "./tenantRepo";
import {
  organizations, offerings, organizationRelationships, programOrganizationAffiliations,
  programAffiliations, groups, groupMemberships, invitations, registrations, participants, profiles, programs,
  programRoles, programRoleAssignments, platformRoleAssignments, entitlements, orgMemberships, registeredApps, appConfigVersions,
  appLaunchTokens, gates, gateMemberRequests, appUserData,
  learningRoles, learningRoleAssignments,
} from "./schema";

type Row = Record<string, unknown>;

// ── Per-program custom roles (§3.5 Team & Roles) ────────────────────────────
const programRoleRow = (r: typeof programRoles.$inferSelect): Row => ({
  id: r.id, organization_id: r.organizationId, program_id: r.programId,
  name: r.name, perms: r.perms, display_as_group: r.displayAsGroup ?? false,
  parent_group_id: r.parentGroupId ?? null, created_at: r.createdAt,
});

export async function listProgramRoles(programId: string): Promise<Row[]> {
  return scoped(async (tx) =>
    (await tx.select().from(programRoles).where(eq(programRoles.programId, programId))).map(programRoleRow),
  );
}

export async function getProgramRole(id: string): Promise<Row | null> {
  // Privileged lookup: routes verify the caller's altitude; platform-scope
  // rows (org null) are invisible to org-scoped RLS by construction.
  return asPrivileged(async (tx) => {
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
  displayAsGroup?: boolean,
  parentGroupId?: string | null,
): Promise<Row> {
  return scoped(async (tx) => {
    const [r] = await tx
      .insert(programRoles)
      .values({
        organizationId: orgId, programId, name, perms,
        displayAsGroup: displayAsGroup ?? false,
        parentGroupId: parentGroupId ?? null,
        createdByUserId: createdByUserId ?? null,
      })
      .returning();
    return programRoleRow(r);
  });
}

export async function updateProgramRole(
  id: string,
  patch: { name?: string; perms?: Row; displayAsGroup?: boolean; parentGroupId?: string | null },
): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const set: Row = {};
    if (patch.name != null) set.name = patch.name;
    if (patch.perms != null) set.perms = patch.perms;
    if (patch.displayAsGroup != null) set.displayAsGroup = patch.displayAsGroup;
    if (patch.parentGroupId !== undefined) set.parentGroupId = patch.parentGroupId;
    if (Object.keys(set).length === 0) return getProgramRole(id);
    const [r] = await tx.update(programRoles).set(set).where(eq(programRoles.id, id)).returning();
    return r ? programRoleRow(r) : null;
  });
}

export async function deleteProgramRole(id: string): Promise<void> {
  await asPrivileged(async (tx) => {
    await tx.delete(programRoles).where(eq(programRoles.id, id));
  });
}

// ── Scoped roles: ORGANIZATION and NEXUS altitudes (§Team & Roles everywhere)
// Same tables as program roles; program_id null = org scope, org_id also null
// = platform scope. Same builder, same email-keyed assignment flow.

export async function listOrgRoles(orgId: string): Promise<Row[]> {
  return scoped(async (tx) =>
    (await tx.select().from(programRoles)
      .where(and(eq(programRoles.organizationId, orgId), isNull(programRoles.programId))))
      .map(programRoleRow),
  );
}

export async function createOrgRole(
  orgId: string,
  name: string,
  perms: Row,
  displayAsGroup?: boolean,
  parentGroupId?: string | null,
): Promise<Row> {
  return scoped(async (tx) => {
    const [r] = await tx.insert(programRoles)
      .values({
        organizationId: orgId, programId: null, name, perms,
        displayAsGroup: displayAsGroup ?? false, parentGroupId: parentGroupId ?? null,
      }).returning();
    return programRoleRow(r);
  });
}

export async function listNexusRoles(): Promise<Row[]> {
  return asPrivileged(async (tx) =>
    (await tx.select().from(programRoles).where(isNull(programRoles.organizationId))).map(programRoleRow),
  );
}

export async function createNexusRole(
  name: string,
  perms: Row,
  displayAsGroup?: boolean,
  parentGroupId?: string | null,
): Promise<Row> {
  return asPrivileged(async (tx) => {
    const [r] = await tx.insert(programRoles)
      .values({
        organizationId: null, programId: null, name, perms,
        displayAsGroup: displayAsGroup ?? false, parentGroupId: parentGroupId ?? null,
      }).returning();
    return programRoleRow(r);
  });
}

export async function setOrgRoleAssignment(orgId: string, email: string, roleId: string | null, privileged = false): Promise<void> {
  // `privileged` bypasses RLS — used by PUBLIC org gate sign-up (the caller may
  // carry an unrelated token; the gate authorizes, not the caller's identity).
  const run = privileged ? asPrivileged : scoped;
  return run(async (tx) => {
    const key = email.trim().toLowerCase();
    await tx.delete(programRoleAssignments)
      .where(and(eq(programRoleAssignments.organizationId, orgId), isNull(programRoleAssignments.programId), eq(programRoleAssignments.email, key)));
    if (roleId) {
      await tx.insert(programRoleAssignments)
        .values({ organizationId: orgId, programId: null, roleId, email: key });
    }
  });
}

export async function getOrgRoleForEmail(orgId: string, email: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx
      .select({ a: programRoleAssignments, roleName: programRoles.name, rolePerms: programRoles.perms })
      .from(programRoleAssignments)
      .leftJoin(programRoles, eq(programRoles.id, programRoleAssignments.roleId))
      .where(and(eq(programRoleAssignments.organizationId, orgId), isNull(programRoleAssignments.programId), eq(programRoleAssignments.email, email.trim().toLowerCase())))
      .limit(1);
    if (!r.length) return null;
    return { role_id: r[0].a.roleId, role_name: r[0].roleName ?? null, perms: r[0].rolePerms ?? {} };
  });
}

export async function setNexusRoleAssignment(email: string, roleId: string | null): Promise<void> {
  return asPrivileged(async (tx) => {
    const key = email.trim().toLowerCase();
    await tx.delete(programRoleAssignments)
      .where(and(isNull(programRoleAssignments.organizationId), isNull(programRoleAssignments.programId), eq(programRoleAssignments.email, key)));
    if (roleId) {
      await tx.insert(programRoleAssignments)
        .values({ organizationId: null, programId: null, roleId, email: key });
    }
  });
}

export async function getNexusRoleForEmail(email: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx
      .select({ a: programRoleAssignments, roleName: programRoles.name, rolePerms: programRoles.perms })
      .from(programRoleAssignments)
      .leftJoin(programRoles, eq(programRoles.id, programRoleAssignments.roleId))
      .where(and(isNull(programRoleAssignments.organizationId), isNull(programRoleAssignments.programId), eq(programRoleAssignments.email, email.trim().toLowerCase())))
      .limit(1);
    if (!r.length) return null;
    return { role_id: r[0].a.roleId, role_name: r[0].roleName ?? null, perms: r[0].rolePerms ?? {} };
  });
}

/** Org-LEVEL people only (Q3): memberships and invites with program_id null.
 * Programs own their own rosters. Privileged read (route walls the operator). */
export async function listOrgTeam(orgId: string): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const mships = (await tx.select().from(orgMemberships).where(eq(orgMemberships.orgId, orgId)))
      .filter((m) => !m.programId);
    const pids = [...new Set(mships.map((m) => m.profileId))];
    const profs = pids.length
      ? await tx.select().from(profiles).where(or(inArray(profiles.id, pids), inArray(profiles.authUserId, pids)))
      : [];
    const profMap = new Map<string, (typeof profs)[number]>();
    for (const pr of profs) {
      profMap.set(pr.id, pr);
      if (pr.authUserId) profMap.set(pr.authUserId, pr);
    }
    const assignments = await tx
      .select({ a: programRoleAssignments, roleName: programRoles.name })
      .from(programRoleAssignments)
      .leftJoin(programRoles, eq(programRoles.id, programRoleAssignments.roleId))
      .where(and(eq(programRoleAssignments.organizationId, orgId), isNull(programRoleAssignments.programId)));
    const byEmail = new Map(assignments.map((r) => [(r.a.email ?? "").toLowerCase(), { role_id: r.a.roleId, role_name: r.roleName ?? null }]));
    const members = mships.map((m) => {
      const pr = profMap.get(m.profileId);
      const email = ((pr?.email as string | null) ?? "").toLowerCase();
      const asg = byEmail.get(email);
      return {
        membership_id: m.id, invitation_id: null as string | null,
        email: pr?.email ?? null, display_name: pr?.displayName ?? pr?.name ?? null,
        membership_role: m.role, status: "active",
        role_id: asg?.role_id ?? null, role_name: asg?.role_name ?? null,
      };
    });
    const invites = (
      await tx.select().from(invitations)
        .where(and(eq(invitations.organizationId, orgId), isNull(invitations.programId), eq(invitations.status, "pending")))
    ).map((i) => {
      const asg = byEmail.get((i.email ?? "").toLowerCase());
      return {
        membership_id: null as string | null, invitation_id: i.id,
        email: i.email, display_name: i.displayName ?? null,
        membership_role: i.role, status: "invited",
        role_id: asg?.role_id ?? null, role_name: asg?.role_name ?? null,
      };
    });
    const seen = new Set(members.map((m) => (m.email as string | null)?.toLowerCase()).filter(Boolean));
    return [...members, ...invites.filter((i) => !seen.has((i.email ?? "").toLowerCase()))];
  });
}

/** Nexus operators: full platform_admin profiles + confined nexus-role holders
 * + pending platform invitations. Privileged (platform_admin-only route). */
export async function listNexusTeam(): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const admins = await tx.select().from(profiles)
      .where(and(eq(profiles.role, "platform_admin"), isNull(profiles.organizationId)));
    const assignments = await tx
      .select({ a: programRoleAssignments, roleName: programRoles.name })
      .from(programRoleAssignments)
      .leftJoin(programRoles, eq(programRoles.id, programRoleAssignments.roleId))
      .where(and(isNull(programRoleAssignments.organizationId), isNull(programRoleAssignments.programId)));
    const invites = await tx.select().from(invitations)
      .where(and(isNull(invitations.organizationId), eq(invitations.status, "pending")));
    const rows: Row[] = admins.map((p) => ({
      profile_id: p.id, invitation_id: null as string | null,
      email: p.email, display_name: p.displayName ?? p.name ?? null,
      kind: "admin", role_name: null as string | null, role_id: null as string | null, status: "active",
    }));
    const adminEmails = new Set(admins.map((p) => (p.email ?? "").toLowerCase()));
    const inviteEmails = new Set(invites.map((i) => (i.email ?? "").toLowerCase()));
    for (const a of assignments) {
      const email = (a.a.email ?? "").toLowerCase();
      if (adminEmails.has(email)) continue;
      rows.push({
        profile_id: null, invitation_id: null,
        email: a.a.email, display_name: null,
        kind: "confined", role_name: a.roleName ?? null, role_id: a.a.roleId,
        status: inviteEmails.has(email) ? "invited" : "active",
      });
    }
    for (const i of invites) {
      const email = (i.email ?? "").toLowerCase();
      if (adminEmails.has(email) || rows.some((r) => (r.email as string | null)?.toLowerCase() === email)) continue;
      rows.push({
        profile_id: null, invitation_id: i.id,
        email: i.email, display_name: i.displayName ?? null,
        kind: i.role === "administrator" ? "admin" : "confined",
        role_name: null, role_id: null, status: "invited",
      });
    }
    // attach invitation ids to confined invitees
    for (const r of rows) {
      if (r.status === "invited" && !r.invitation_id) {
        const i = invites.find((x) => (x.email ?? "").toLowerCase() === (r.email as string | null)?.toLowerCase());
        if (i) r.invitation_id = i.id;
      }
    }
    return rows;
  });
}

/** Platform-operator invitation (organization_id null). Privileged. */
export async function createNexusInvitation(
  opts: { email: string; displayName?: string | null; full: boolean },
): Promise<{ invitation: Row; token: string }> {
  return asPrivileged(async (tx) => {
    const [rawToken, tokenHash] = localKeys.generateApiKey();
    const [i] = await tx.insert(invitations).values({
      organizationId: null, programId: null, offeringId: null, groupId: null,
      tokenHash, email: opts.email, displayName: opts.displayName ?? null,
      role: opts.full ? "administrator" : "member", invitedByUserId: null, expiresAt: null,
    }).returning();
    return { invitation: inviteRow(i), token: rawToken };
  });
}

/** Remove a Nexus operator: demote a platform_admin profile, clear any nexus
 * role assignment, revoke pending platform invites for the email. */
export async function removeNexusOperator(email: string): Promise<void> {
  return asPrivileged(async (tx) => {
    const key = email.trim().toLowerCase();
    await tx.update(profiles).set({ role: "student" })
      .where(and(eq(profiles.role, "platform_admin"), sql`lower(${profiles.email}) = ${key}`));
    await tx.delete(programRoleAssignments)
      .where(and(isNull(programRoleAssignments.organizationId), isNull(programRoleAssignments.programId), eq(programRoleAssignments.email, key)));
    await tx.update(invitations).set({ status: "revoked" })
      .where(and(isNull(invitations.organizationId), eq(invitations.status, "pending"), sql`lower(${invitations.email}) = ${key}`));
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

// ── Program People at scale: team core + paged platform-role groups ─────────
// The People tab must not render a thousand learners flat. "Team" = admins,
// custom-role holders, and anyone with NO platform role (inherently small);
// everyone else lives in collapsible per-platform-role groups, paged from the
// database.

export async function listProgramTeamSummary(orgId: string, programId: string): Promise<Row> {
  // Fetch the team roster FIRST, in its own transaction. `listProgramMembers`
  // opens its own privileged transaction, so it must never run nested inside
  // another one: with a single-connection pool (DB_POOL_MAX=1 in prod) the
  // inner transaction would wait forever for the connection the outer one
  // holds — a self-deadlock that hangs the request and starves the pool.
  const team = await listProgramMembers(orgId, programId);
  return asPrivileged(async (tx) => {
    // Group counts straight from the assignment table.
    const counts = await tx.execute(sql`
      select platform, role, count(*)::int as count
      from platform_role_assignments where program_id = ${programId}
      group by platform, role order by platform, role`);
    const groups = (counts as unknown as Row[]).map((g) => ({
      platform: g.platform, role: g.role, count: Number(g.count),
    }));
    // Team core: anti-join out the platform-role holders (unless they're
    // admins or hold a custom program role).
    const platformEmails = new Set<string>();
    const assigned = await tx
      .select({ email: platformRoleAssignments.email })
      .from(platformRoleAssignments)
      .where(eq(platformRoleAssignments.programId, programId));
    for (const a of assigned) platformEmails.add(a.email.toLowerCase());
    const core = team.filter((m: Row) => {
      const email = ((m.email as string | null) ?? "").toLowerCase();
      const isAdmin = m.membership_role === "administrator" || m.membership_role === "owner";
      return isAdmin || m.role_id || !platformEmails.has(email);
    });
    return { team: core, groups };
  });
}

export async function listPlatformGroupMembers(
  orgId: string,
  programId: string,
  platform: string,
  role: string,
  offset: number,
  limit: number,
): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const page = await tx
      .select({ email: platformRoleAssignments.email })
      .from(platformRoleAssignments)
      .where(and(
        eq(platformRoleAssignments.programId, programId),
        eq(platformRoleAssignments.platform, platform),
        eq(platformRoleAssignments.role, role),
      ))
      .orderBy(platformRoleAssignments.email)
      .offset(offset)
      .limit(limit);
    const emails = page.map((r) => r.email.toLowerCase());
    if (!emails.length) return [];
    // Enrich the page (≤ limit rows) with profile + membership/invite status.
    const profs = await tx.select().from(profiles)
      .where(and(eq(profiles.organizationId, orgId), inArray(sql`lower(${profiles.email})`, emails)));
    const profByEmail = new Map(profs.map((pr) => [(pr.email ?? "").toLowerCase(), pr]));
    const profIds = profs.flatMap((pr) => [pr.id, pr.authUserId].filter(Boolean)) as string[];
    const mships = profIds.length
      ? await tx.select().from(orgMemberships)
          .where(and(eq(orgMemberships.programId, programId), inArray(orgMemberships.profileId, profIds)))
      : [];
    const mshipByProfile = new Map(mships.map((m) => [m.profileId, m]));
    const invites = await tx.select().from(invitations)
      .where(and(
        eq(invitations.organizationId, orgId), eq(invitations.programId, programId),
        eq(invitations.status, "pending"), inArray(sql`lower(${invitations.email})`, emails),
      ));
    const invByEmail = new Map(invites.map((i) => [(i.email ?? "").toLowerCase(), i]));
    return emails.map((email) => {
      const pr = profByEmail.get(email);
      const m = pr ? mshipByProfile.get(pr.id) ?? (pr.authUserId ? mshipByProfile.get(pr.authUserId) : undefined) : undefined;
      const inv = invByEmail.get(email);
      return {
        membership_id: m?.id ?? null,
        invitation_id: m ? null : inv?.id ?? null,
        email: pr?.email ?? inv?.email ?? email,
        display_name: pr?.displayName ?? pr?.name ?? inv?.displayName ?? null,
        status: m ? "active" : "invited",
        platform, role,
      };
    });
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

// ── Boundary administrators (Nexus Edit tab) ────────────────────────────────
// Deliberate, narrow bypass of the 0021 people wall: WHO RUNS an org is
// boundary-governance data — the operator provisioned these people in the
// first place. Exposes/touches ONLY org-level owner/administrator rows and
// admin invitations; the org's members, learners, and program people stay
// invisible to the operator.
export async function listOrgLevelAdmins(orgId: string): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const mships = (
      await tx.select().from(orgMemberships).where(eq(orgMemberships.orgId, orgId))
    ).filter((m) => !m.programId && (m.role === "owner" || m.role === "administrator"));
    const pids = [...new Set(mships.map((m) => m.profileId))];
    const profs = pids.length
      ? await tx.select().from(profiles).where(or(inArray(profiles.id, pids), inArray(profiles.authUserId, pids)))
      : [];
    const profMap = new Map<string, (typeof profs)[number]>();
    for (const p of profs) {
      profMap.set(p.id, p);
      if (p.authUserId) profMap.set(p.authUserId, p);
    }
    const members = mships.map((m) => {
      const p = profMap.get(m.profileId);
      return {
        membership_id: m.id,
        invitation_id: null as string | null,
        email: p?.email ?? null,
        display_name: p?.displayName ?? p?.name ?? null,
        role: m.role,
        status: "active",
      };
    });
    const invited = (
      await tx.select().from(invitations)
        .where(and(eq(invitations.organizationId, orgId), eq(invitations.status, "pending")))
    )
      .filter((i) => !i.programId && (i.role === "administrator" || i.role === "owner"))
      .map((i) => ({
        membership_id: null as string | null,
        invitation_id: i.id,
        email: i.email,
        display_name: i.displayName ?? null,
        role: i.role,
        status: "invited",
      }));
    return [...members, ...invited];
  });
}

/** Create an org-level ADMIN invitation as the operator (privileged: the 0021
 * wall blocks scoped inserts, and the operator has no profile inside the org —
 * invited_by stays null, exactly like provisioning). */
export async function createOrgAdminInvitation(
  orgId: string,
  opts: { email: string; displayName?: string | null },
): Promise<{ invitation: Row; token: string }> {
  return asPrivileged(async (tx) => {
    const [rawToken, tokenHash] = localKeys.generateApiKey();
    const [i] = await tx.insert(invitations).values({
      organizationId: orgId, programId: null, offeringId: null, groupId: null,
      tokenHash, email: opts.email, displayName: opts.displayName ?? null,
      role: "administrator", invitedByUserId: null, expiresAt: null,
    }).returning();
    return { invitation: inviteRow(i), token: rawToken };
  });
}

/** Remove an org-level administrator (never the owner) or revoke an admin invite. */
export async function removeOrgLevelAdmin(
  orgId: string,
  ref: { membershipId?: string | null; invitationId?: string | null },
): Promise<void> {
  return asPrivileged(async (tx) => {
    if (ref.membershipId) {
      const r = await tx.select().from(orgMemberships)
        .where(and(eq(orgMemberships.id, ref.membershipId), eq(orgMemberships.orgId, orgId))).limit(1);
      if (!r.length || r[0].programId) throw new HttpError(404, "No such org-level administrator");
      if (r[0].role === "owner") throw new HttpError(409, "The owner can't be removed — transfer ownership first");
      if (r[0].role !== "administrator") throw new HttpError(404, "No such org-level administrator");
      await tx.delete(orgMemberships).where(eq(orgMemberships.id, ref.membershipId));
    } else if (ref.invitationId) {
      const r = await tx.select().from(invitations)
        .where(and(eq(invitations.id, ref.invitationId), eq(invitations.organizationId, orgId))).limit(1);
      if (!r.length || r[0].programId) throw new HttpError(404, "No such invitation");
      await tx.update(invitations).set({ status: "revoked" }).where(eq(invitations.id, ref.invitationId));
    } else {
      throw new HttpError(400, "membership_id or invitation_id required");
    }
  });
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

/** Delete a group: reparent its children onto its own parent (so descendants
 * aren't orphaned), drop its memberships, then remove it. */
export async function deleteGroup(id: string): Promise<void> {
  await scoped(async (tx) => {
    const cur = await tx.select({ parent: groups.parentGroupId }).from(groups).where(eq(groups.id, id)).limit(1);
    const parent = cur[0]?.parent ?? null;
    await tx.update(groups).set({ parentGroupId: parent }).where(eq(groups.parentGroupId, id));
    await tx.delete(groupMemberships).where(eq(groupMemberships.groupId, id));
    await tx.delete(groups).where(eq(groups.id, id));
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

// ── Email-keyed group placement (Groups vs Roles) ───────────────────────────
// A person's *explicit* group placement is email-keyed so it survives from
// invite → activation, exactly like role assignments. Scoped to one program's
// own groups so setting placements never touches another program.

/** Replace a person's explicit group placements within one ALTITUDE's groups —
 *  program (orgId+programId), org (orgId, null) or nexus (null, null). Privileged
 *  (routes gate people-admin access); nexus rows are RLS-invisible otherwise. */
export async function setPersonGroupsScoped(
  orgId: string | null,
  programId: string | null,
  email: string,
  groupIds: string[],
): Promise<void> {
  const key = email.trim().toLowerCase();
  await asPrivileged(async (tx) => {
    const scopeGroups = await tx.select({ id: groups.id }).from(groups)
      .where(and(_scopeEq(groups.organizationId, orgId), _scopeEq(groups.programId, programId)));
    const allowed = new Set(scopeGroups.map((g) => g.id));
    const wanted = [...new Set(groupIds)].filter((g) => allowed.has(g));
    // Clear this person's placements across this altitude's groups, then re-add.
    if (allowed.size) {
      await tx.delete(groupMemberships).where(and(
        inArray(groupMemberships.groupId, [...allowed]),
        sql`lower(${groupMemberships.email}) = ${key}`,
      ));
    }
    for (const gid of wanted) {
      await tx.insert(groupMemberships)
        .values({ organizationId: orgId, groupId: gid, email: key })
        .onConflictDoNothing();
    }
  });
}

/** Program-altitude convenience wrapper (unchanged callers). */
export async function setPersonGroups(
  orgId: string,
  programId: string,
  email: string,
  groupIds: string[],
): Promise<void> {
  return setPersonGroupsScoped(orgId, programId, email, groupIds);
}

/**
 * The People-tab groups model for a program: the real (placement) groups, the
 * roles flagged display_as_group (which act as groups), and — keyed by email —
 * who is placed where. Role-groups' membership is implicit (whoever holds the
 * role), so the frontend unions role assignments in; this returns only the
 * explicit placements plus the role→group flags.
 */
/** Scope predicate: null means "this altitude is unset" (org- or nexus-level). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _scopeEq(col: any, val: string | null) {
  return val === null ? isNull(col) : eq(col, val);
}

/**
 * The People-tab groups model at ANY altitude — program (orgId+programId),
 * org (orgId, null) or nexus (null, null): the real (placement) groups, the
 * roles (with display_as_group + parent_group_id so roles can sit in the tree),
 * and — keyed by email — who is placed where. Role-group membership is implicit
 * (whoever holds the role); the frontend unions role assignments in.
 */
export async function listGroupsModel(orgId: string | null, programId: string | null): Promise<Row> {
  return asPrivileged(async (tx) => {
    const realGroups = (await tx.select().from(groups)
      .where(and(_scopeEq(groups.organizationId, orgId), _scopeEq(groups.programId, programId))))
      .map((g) => ({ id: g.id, name: g.name, label: g.label ?? null, parent_id: g.parentGroupId ?? null }));
    const groupIds = realGroups.map((g) => g.id);
    const placementRows = groupIds.length
      ? await tx.select({ groupId: groupMemberships.groupId, email: groupMemberships.email })
          .from(groupMemberships)
          .where(and(inArray(groupMemberships.groupId, groupIds), sql`${groupMemberships.email} is not null`))
      : [];
    const placements: Record<string, string[]> = {};
    for (const p of placementRows) {
      const e = (p.email ?? "").toLowerCase();
      if (!e) continue;
      (placements[e] ??= []).push(p.groupId);
    }
    const roles = (await tx.select().from(programRoles)
      .where(and(_scopeEq(programRoles.organizationId, orgId), _scopeEq(programRoles.programId, programId))))
      .map((r) => ({
        id: r.id, name: r.name, display_as_group: r.displayAsGroup ?? false,
        parent_group_id: r.parentGroupId ?? null,
      }));
    return { groups: realGroups, roles, placements };
  });
}

/** Program-altitude convenience wrapper (unchanged callers). */
export async function listProgramGroupsModel(orgId: string, programId: string): Promise<Row> {
  return listGroupsModel(orgId, programId);
}

// ── Nexus (platform) groups: same table, org_id null. Operator-only, so these
// run privileged (nexus rows are invisible to org-scoped RLS by construction).
export async function listNexusGroups(): Promise<Row[]> {
  return asPrivileged(async (tx) =>
    (await tx.select().from(groups).where(and(isNull(groups.organizationId), isNull(groups.programId)))).map(groupRow),
  );
}

export async function createNexusGroup(opts: { name: string; label?: string | null; parentGroupId?: string | null }): Promise<Row> {
  return asPrivileged(async (tx) => {
    const [g] = await tx.insert(groups).values({
      organizationId: null, programId: null, name: opts.name,
      label: opts.label ?? null, parentGroupId: opts.parentGroupId ?? null,
    }).returning();
    return groupRow(g);
  });
}

/** Update/delete a group privileged — used for nexus groups (org-scoped RLS
 *  hides them). Routes gate the caller's altitude. */
export async function updateGroupPriv(id: string, patch: { name?: string; label?: string | null; parentGroupId?: string | null }): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const set: Row = {};
    if (patch.name != null) set.name = patch.name;
    if (patch.label !== undefined) set.label = patch.label;
    if (patch.parentGroupId !== undefined) set.parentGroupId = patch.parentGroupId;
    const [g] = await tx.update(groups).set(set).where(eq(groups.id, id)).returning();
    return g ? groupRow(g) : null;
  });
}

export async function deleteGroupPriv(id: string): Promise<void> {
  await asPrivileged(async (tx) => {
    const cur = await tx.select({ parent: groups.parentGroupId }).from(groups).where(eq(groups.id, id)).limit(1);
    const parent = cur[0]?.parent ?? null;
    await tx.update(groups).set({ parentGroupId: parent }).where(eq(groups.parentGroupId, id));
    await tx.delete(groupMemberships).where(eq(groupMemberships.groupId, id));
    await tx.delete(groups).where(eq(groups.id, id));
  });
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
    const orgId = grp.organizationId;
    if (!orgId) throw new Error("Coach-add applies to org/program groups only");
    const offeringId = opts.offeringId ?? grp.offeringId;
    if (!offeringId) throw new Error("An offering is required (group has none; pass offering_id)");
    const addedBy = await resolveProfileId(tx, actorAuthId, orgId);
    const [reg] = await tx.insert(registrations).values({
      organizationId: orgId, programId: grp.programId, offeringId,
      registrationSource: "coach_add", email: opts.email ?? null, name: opts.name ?? null,
      status: "directly_added", createdByUserId: addedBy,
    }).returning();
    const [p] = await tx.insert(participants).values({
      organizationId: orgId, programId: grp.programId, offeringId,
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
    const org = i.organizationId
      ? await tx.select({ name: organizations.name, slug: organizations.slug }).from(organizations).where(eq(organizations.id, i.organizationId)).limit(1)
      : [];
    return {
      ...inviteRow(i),
      organization_name: org.length ? org[0].name : "Nexus",
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

    const resolvedDisplayName = displayName ?? inv.displayName ?? null;

    // ── Platform-operator invitation (no organization) ──────────────────────
    if (!inv.organizationId) {
      if (inv.role === "administrator") {
        // Full Nexus operator; confined operators instead carry a nexus-role
        // assignment (email-keyed, created at invite time) and keep their role.
        await tx.update(profiles).set({ role: "platform_admin" }).where(eq(profiles.id, authUserId));
        await tx.update(profiles).set({ role: "platform_admin" }).where(eq(profiles.authUserId, authUserId));
      }
      const [updated] = await tx.update(invitations)
        .set({ status: "accepted", acceptedByUserId: authUserId, acceptedAt: new Date() })
        .where(eq(invitations.id, inv.id)).returning();
      return inviteRow(updated);
    }

    const orgId = inv.organizationId;
    const adminish = ["administrator", "owner"].includes(inv.role);
    const staff = ["instructor", "teacher", "coach"].includes(inv.role);
    // profiles.role vocabulary is student/teacher/org_admin; membership role is separate.
    const profileRole = adminish ? "org_admin" : staff ? "teacher" : "student";
    const profileId = await ensureOrgProfile(tx, authUserId, orgId, { email: inv.email, role: profileRole, displayName: resolvedDisplayName, allowSecondOrg: true });
    if (adminish || staff) {
      const mrole = adminish ? (inv.role === "owner" ? "owner" : "administrator") : "instructor";
      await tx.execute(
        sql`insert into org_memberships (org_id, profile_id, role, program_id) values (${orgId}, ${profileId}, ${mrole}, ${inv.programId}) on conflict do nothing`,
      );
    } else if (!inv.programId && inv.role === "member") {
      // Org-level plain member: an org-space account confined by their custom
      // org role (Team & Roles at the organization altitude).
      await tx.execute(
        sql`insert into org_memberships (org_id, profile_id, role, program_id) values (${orgId}, ${profileId}, 'member', null) on conflict do nothing`,
      );
    } else if (inv.offeringId) {
      await tx.insert(participants).values({
        organizationId: orgId, programId: inv.programId, offeringId: inv.offeringId,
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
// ── Gates (program entrance pages) ──────────────────────────────────────────
// All privileged: the public gate page renders PRE-AUTH (no user context), so
// reads can't run under RLS; admin CRUD is authorized at the route layer.
// The roles a gate offers at sign-up: the explicit list, or the legacy single
// role as a one-element fallback. One helper so every reader agrees.
const gateRoleIds = (g: typeof gates.$inferSelect): string[] => {
  const list = Array.isArray(g.roleIds) ? (g.roleIds as string[]).filter(Boolean) : [];
  if (list.length) return list;
  return g.roleId ? [g.roleId] : [];
};

const gateRow = (g: typeof gates.$inferSelect): Row => ({
  id: g.id, organization_id: g.organizationId, program_id: g.programId, level: g.level, slug: g.slug,
  title: g.title, subtitle: g.subtitle, audience: g.audience,
  role_id: g.roleId, role_ids: gateRoleIds(g),
  allow_signin: g.allowSignin, allow_signup: g.allowSignup,
  approval_required: g.approvalRequired, landing: g.landing, config: g.config, created_at: g.createdAt,
});

export async function listGates(programId: string): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.select().from(gates).where(eq(gates.programId, programId)).orderBy(desc(gates.createdAt));
    if (!rows.length) return [];
    const orgId = rows[0].organizationId;
    const org = orgId
      ? await tx.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, orgId)).limit(1)
      : [];
    const orgSlug = org.length ? org[0].slug : null;
    return rows.map((g) => ({ ...gateRow(g), org_slug: orgSlug }));
  });
}

/** Org-LEVEL gates for an org (program-less staff-onboarding gates). */
export async function listGatesForOrg(orgId: string): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const org = await tx.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    const orgSlug = org.length ? org[0].slug : null;
    const rows = await tx
      .select()
      .from(gates)
      .where(and(eq(gates.organizationId, orgId), eq(gates.level, "organization")))
      .orderBy(desc(gates.createdAt));
    return rows.map((g) => ({ ...gateRow(g), org_slug: orgSlug }));
  });
}

export async function getGate(id: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(gates).where(eq(gates.id, id)).limit(1);
    return r.length ? gateRow(r[0]) : null;
  });
}

export async function createGate(
  orgId: string | null,
  programId: string | null,
  opts: { level?: string; slug: string; title?: string | null; subtitle?: string | null; audience?: string; roleId?: string | null; roleIds?: string[]; allowSignin?: boolean; allowSignup?: boolean; approvalRequired?: boolean; landing?: string | null; config?: Row },
): Promise<Row> {
  const roleIds = (opts.roleIds ?? (opts.roleId ? [opts.roleId] : [])).filter(Boolean);
  const level = opts.level === "organization" ? "organization" : opts.level === "nexus" ? "nexus" : "program";
  return asPrivileged(async (tx) => {
    const [g] = await tx.insert(gates).values({
      organizationId: orgId ?? null, programId: programId ?? null, level, slug: opts.slug,
      title: opts.title ?? null, subtitle: opts.subtitle ?? null,
      audience: opts.audience === "member" ? "member" : "participant",
      // Keep the legacy single column populated (first role) for any reader that
      // still looks at role_id.
      roleId: roleIds[0] ?? null, roleIds,
      allowSignin: opts.allowSignin ?? true, allowSignup: opts.allowSignup ?? false,
      approvalRequired: opts.approvalRequired ?? false, landing: opts.landing ?? null,
      config: opts.config ?? {},
    }).returning();
    return gateRow(g);
  });
}

export async function updateGate(id: string, patch: Row): Promise<Row | null> {
  const set: Row = { updatedAt: new Date() };
  if (patch.slug !== undefined) set.slug = patch.slug;
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.subtitle !== undefined) set.subtitle = patch.subtitle;
  if (patch.audience !== undefined) set.audience = patch.audience === "member" ? "member" : "participant";
  if (patch.role_ids !== undefined) {
    const roleIds = (Array.isArray(patch.role_ids) ? patch.role_ids : []).filter(Boolean);
    set.roleIds = roleIds;
    set.roleId = roleIds[0] ?? null; // keep legacy column in sync
  } else if (patch.role_id !== undefined) {
    set.roleId = patch.role_id;
    set.roleIds = patch.role_id ? [patch.role_id] : [];
  }
  if (patch.allow_signin !== undefined) set.allowSignin = patch.allow_signin;
  if (patch.allow_signup !== undefined) set.allowSignup = patch.allow_signup;
  if (patch.approval_required !== undefined) set.approvalRequired = patch.approval_required;
  if (patch.landing !== undefined) set.landing = patch.landing;
  if (patch.config !== undefined) set.config = patch.config;
  return asPrivileged(async (tx) => {
    const [g] = await tx.update(gates).set(set).where(eq(gates.id, id)).returning();
    return g ? gateRow(g) : null;
  });
}

export async function deleteGate(id: string): Promise<void> {
  return asPrivileged(async (tx) => {
    await tx.delete(gates).where(eq(gates.id, id));
  });
}

/**
 * Resolve a gate by its public path (org slug + gate slug) for the PRE-AUTH
 * render. Returns the gate plus the org's public branding and the program name
 * — everything the page needs, and nothing private.
 */
export async function getPublicGate(orgSlug: string, gateSlug: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const orgs = await tx.select().from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);
    if (!orgs.length) return null;
    const org = orgs[0];
    const r = await tx.select().from(gates)
      .where(and(eq(gates.organizationId, org.id), eq(gates.slug, gateSlug))).limit(1);
    if (!r.length) return null;
    const g = r[0];
    // Org-level gates have no program.
    const prog = g.programId
      ? await tx.select().from(programs).where(eq(programs.id, g.programId)).limit(1)
      : [];
    const theme = (((org.settings ?? {}) as Row).theme ?? {}) as Row;
    // Resolve the offered roles' names so the page can render a picker. Ordered
    // to match the gate's role list, not the query's arbitrary order.
    const roleIds = gateRoleIds(g);
    let roles: Array<{ id: string; name: string }> = [];
    if (roleIds.length) {
      const rows = await tx
        .select({ id: programRoles.id, name: programRoles.name })
        .from(programRoles)
        .where(inArray(programRoles.id, roleIds));
      const byId = new Map(rows.map((x) => [x.id, x.name ?? ""]));
      roles = roleIds.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id) ?? "" }));
    }
    return {
      ...gateRow(g),
      roles,
      org: {
        id: org.id, slug: org.slug, name: org.name,
        theme_accent_color: (theme.accent_color as string) ?? null,
        theme_logo_url: (theme.logo_url as string) ?? null,
      },
      program_name: prog.length ? prog[0].name : null,
    };
  });
}

/** Nexus (operator) gates — platform-altitude, no org/program. Privileged. */
export async function listNexusGates(): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.select().from(gates).where(eq(gates.level, "nexus")).orderBy(desc(gates.createdAt));
    return rows.map((g) => gateRow(g));
  });
}

/**
 * Resolve a nexus gate by its public slug for the PRE-AUTH operator sign-up
 * page (/op/<slug>). Shaped like getPublicGate — same PublicGate contract — but
 * branded with the platform, since operator gates have no organization.
 */
export async function getPublicNexusGate(gateSlug: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(gates)
      .where(and(eq(gates.level, "nexus"), eq(gates.slug, gateSlug))).limit(1);
    if (!r.length) return null;
    const g = r[0];
    const roleIds = gateRoleIds(g);
    let roles: Array<{ id: string; name: string }> = [];
    if (roleIds.length) {
      const rows = await tx
        .select({ id: programRoles.id, name: programRoles.name })
        .from(programRoles)
        .where(inArray(programRoles.id, roleIds));
      const byId = new Map(rows.map((x) => [x.id, x.name ?? ""]));
      roles = roleIds.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id) ?? "" }));
    }
    // No organization → the page renders platform branding (the frontend fills
    // the platform name); we still return an `org`-shaped block so the shared
    // GatePage renderer needs no special-casing.
    return {
      ...gateRow(g),
      roles,
      org: { id: null, slug: null, name: null, theme_accent_color: null, theme_logo_url: null },
      program_name: null,
    };
  });
}

// ── Gate member requests (approval queue) ───────────────────────────────────
const gateRequestRow = (r: typeof gateMemberRequests.$inferSelect): Row => ({
  id: r.id, gate_id: r.gateId, level: r.level, email: r.email, display_name: r.displayName,
  role_id: r.roleId, status: r.status, created_at: r.createdAt, decided_at: r.decidedAt, decided_by: r.decidedBy,
});

/** Raise a pending request. Idempotent per (gate, email): a re-submit refreshes
 * the existing pending row rather than piling up duplicates. Privileged (the
 * caller is the public gate, not an authorized operator). */
export async function createGateMemberRequest(
  opts: { gateId: string; level?: string; email: string; displayName?: string | null; roleId?: string | null },
): Promise<Row> {
  return asPrivileged(async (tx) => {
    const key = opts.email.trim().toLowerCase();
    const existing = await tx.select().from(gateMemberRequests)
      .where(and(eq(gateMemberRequests.gateId, opts.gateId), eq(gateMemberRequests.email, key), eq(gateMemberRequests.status, "pending")))
      .limit(1);
    if (existing.length) {
      const [u] = await tx.update(gateMemberRequests)
        .set({ displayName: opts.displayName ?? existing[0].displayName, roleId: opts.roleId ?? existing[0].roleId })
        .where(eq(gateMemberRequests.id, existing[0].id)).returning();
      return gateRequestRow(u);
    }
    const [r] = await tx.insert(gateMemberRequests).values({
      gateId: opts.gateId, level: opts.level ?? "nexus", email: key,
      displayName: opts.displayName ?? null, roleId: opts.roleId ?? null,
    }).returning();
    return gateRequestRow(r);
  });
}

/** The approval queue for gates matching a filter, each row carrying its gate
 * title and resolved role name. Privileged (the route walls it per altitude). */
async function _listGateRequests(where: ReturnType<typeof and>): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx
      .select({ r: gateMemberRequests, gateTitle: gates.title, gateSlug: gates.slug, roleName: programRoles.name })
      .from(gateMemberRequests)
      .leftJoin(gates, eq(gates.id, gateMemberRequests.gateId))
      .leftJoin(programRoles, eq(programRoles.id, gateMemberRequests.roleId))
      .where(where)
      .orderBy(desc(gateMemberRequests.createdAt));
    return rows.map((x) => ({
      ...gateRequestRow(x.r), gate_title: x.gateTitle ?? null, gate_slug: x.gateSlug ?? null, role_name: x.roleName ?? null,
    }));
  });
}

export async function listNexusGateRequests(status = "pending"): Promise<Row[]> {
  return _listGateRequests(and(eq(gateMemberRequests.level, "nexus"), eq(gateMemberRequests.status, status)));
}

/** Pending requests raised by an org's member gates (joined via the gate). */
export async function listGateRequestsForOrg(orgId: string, status = "pending"): Promise<Row[]> {
  return _listGateRequests(
    and(eq(gateMemberRequests.level, "organization"), eq(gateMemberRequests.status, status), eq(gates.organizationId, orgId)),
  );
}

/** Pending requests raised by a program's member gates (joined via the gate). */
export async function listGateRequestsForProgram(programId: string, status = "pending"): Promise<Row[]> {
  return _listGateRequests(
    and(eq(gateMemberRequests.level, "program"), eq(gateMemberRequests.status, status), eq(gates.programId, programId)),
  );
}

export async function getGateMemberRequest(id: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(gateMemberRequests).where(eq(gateMemberRequests.id, id)).limit(1);
    return r.length ? gateRequestRow(r[0]) : null;
  });
}

/** Record a decision. The caller applies the role grant on approval — this only
 * marks the row so an approved request can't be actioned twice. Privileged. */
export async function decideGateMemberRequest(id: string, status: "approved" | "rejected", decidedBy: string | null): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const [r] = await tx.update(gateMemberRequests)
      .set({ status, decidedAt: new Date(), decidedBy })
      .where(and(eq(gateMemberRequests.id, id), eq(gateMemberRequests.status, "pending")))
      .returning();
    return r ? gateRequestRow(r) : null;
  });
}

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

// ── App Shell per-user data (Phase 2) ───────────────────────────────────────
// A published app's per-student state (onboarding answers + completion), keyed
// by the auth credential. Privileged: students have no membership, so access is
// gated at the route by verified program participation, not RLS.
export async function getAppUserData(registeredAppId: string, userId: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx
      .select()
      .from(appUserData)
      .where(and(eq(appUserData.registeredAppId, registeredAppId), eq(appUserData.userId, userId)))
      .limit(1);
    if (!r.length) return null;
    const d = r[0];
    return { onboarding_completed: d.onboardingCompleted, answers: d.answers ?? {} };
  });
}

export async function upsertAppUserData(opts: {
  registeredAppId: string;
  userId: string;
  orgId: string;
  programId: string | null;
  answers: Row;
  onboardingCompleted: boolean;
}): Promise<Row> {
  return asPrivileged(async (tx) => {
    const [d] = await tx
      .insert(appUserData)
      .values({
        registeredAppId: opts.registeredAppId,
        userId: opts.userId,
        organizationId: opts.orgId,
        programId: opts.programId,
        answers: opts.answers,
        onboardingCompleted: opts.onboardingCompleted,
      })
      .onConflictDoUpdate({
        target: [appUserData.registeredAppId, appUserData.userId],
        set: { answers: opts.answers, onboardingCompleted: opts.onboardingCompleted, updatedAt: new Date() },
      })
      .returning();
    return { onboarding_completed: d.onboardingCompleted, answers: d.answers ?? {} };
  });
}

// ── Learning Platform objects (backend proxy; Option B) ─────────────────────
// The Learning app persisted learning_objects directly to its own Supabase via
// the anon key. To keep org isolation (no public anon reads of shared prod), the
// app now goes through Nexus: these run privileged (bypassing RLS) and scope
// every read/write to the caller's org, resolved server-side from the session.

/**
 * Content Studio objects are scoped to a PROGRAM (each program is its own
 * instance). When a programId is given, only that program's objects are
 * returned; passing null keeps the legacy org-wide behavior (e.g. an org-level
 * admin with no program pinned).
 */
export async function listLearningObjects(orgId: string, programId?: string | null): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(
      programId
        ? sql`
      select id, type, title, owner_id, owner_name, status, scope, reuse_count,
             description, estimated_time, blocks, tags, source_ids, pipeline_draft,
             created_at::text as created_at, updated_at::text as updated_at
      from learning_objects
      where organization_id = ${orgId} and program_id = ${programId}
      order by updated_at desc nulls last`
        : sql`
      select id, type, title, owner_id, owner_name, status, scope, reuse_count,
             description, estimated_time, blocks, tags, source_ids, pipeline_draft,
             created_at::text as created_at, updated_at::text as updated_at
      from learning_objects
      where organization_id = ${orgId}
      order by updated_at desc nulls last`,
    );
    return rows as unknown as Row[];
  });
}

/** Insert-or-update one learning object, always stamped to the caller's org. */
export async function upsertLearningObject(orgId: string, r: Row, programId?: string | null): Promise<void> {
  await asPrivileged(async (tx) => {
    await tx.execute(sql`
      insert into learning_objects
        (id, organization_id, program_id, type, title, owner_id, owner_name, status, scope,
         reuse_count, description, estimated_time, blocks, tags, source_ids, pipeline_draft,
         created_at, updated_at)
      values (
        ${r.id}, ${orgId}, ${programId ?? (r.program_id as string) ?? null}, ${r.type}, ${r.title ?? ""}, ${r.owner_id ?? null},
        ${r.owner_name ?? null}, ${r.status ?? "draft"}, ${r.scope ?? "bridge"},
        ${r.reuse_count ?? 0}, ${r.description ?? ""}, ${r.estimated_time ?? ""},
        ${JSON.stringify(r.blocks ?? [])}::jsonb, ${JSON.stringify(r.tags ?? [])}::jsonb,
        ${JSON.stringify(r.source_ids ?? [])}::jsonb,
        ${r.pipeline_draft != null ? JSON.stringify(r.pipeline_draft) : null}::jsonb,
        coalesce(${r.created_at ?? null}::timestamptz, now()), now())
      on conflict (id) do update set
        program_id = coalesce(excluded.program_id, learning_objects.program_id),
        title = excluded.title, type = excluded.type, owner_id = excluded.owner_id,
        owner_name = excluded.owner_name, status = excluded.status, scope = excluded.scope,
        reuse_count = excluded.reuse_count, description = excluded.description,
        estimated_time = excluded.estimated_time, blocks = excluded.blocks,
        tags = excluded.tags, source_ids = excluded.source_ids,
        pipeline_draft = excluded.pipeline_draft, updated_at = now()
      where learning_objects.organization_id = ${orgId}`);
  });
}

// ── Learning Platform custom roles (its own People tab) ─────────────────────
// Name + per-area view/edit perms; email-keyed assignments. Same shape/flow as
// program roles, but a separate table so the learning app owns its own areas.
const learningRoleRow = (r: typeof learningRoles.$inferSelect): Row => ({
  id: r.id, organization_id: r.organizationId, program_id: r.programId,
  name: r.name, perms: r.perms, created_at: r.createdAt,
});

export async function listLearningRoles(orgId: string, programId: string): Promise<Row[]> {
  return asPrivileged(async (tx) =>
    (await tx.select().from(learningRoles)
      .where(and(eq(learningRoles.organizationId, orgId), eq(learningRoles.programId, programId))))
      .map(learningRoleRow),
  );
}

export async function createLearningRole(orgId: string, programId: string, name: string, perms: Row): Promise<Row> {
  return asPrivileged(async (tx) => {
    const [r] = await tx.insert(learningRoles)
      .values({ organizationId: orgId, programId, name, perms }).returning();
    return learningRoleRow(r);
  });
}

export async function getLearningRole(id: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx.select().from(learningRoles).where(eq(learningRoles.id, id)).limit(1);
    return r.length ? learningRoleRow(r[0]) : null;
  });
}

export async function updateLearningRole(id: string, patch: { name?: string; perms?: Row }): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const set: Row = {};
    if (patch.name != null) set.name = patch.name;
    if (patch.perms != null) set.perms = patch.perms;
    if (Object.keys(set).length === 0) {
      const r = await tx.select().from(learningRoles).where(eq(learningRoles.id, id)).limit(1);
      return r.length ? learningRoleRow(r[0]) : null;
    }
    const [r] = await tx.update(learningRoles).set(set).where(eq(learningRoles.id, id)).returning();
    return r ? learningRoleRow(r) : null;
  });
}

export async function deleteLearningRole(id: string): Promise<void> {
  await asPrivileged(async (tx) => {
    await tx.delete(learningRoleAssignments).where(eq(learningRoleAssignments.roleId, id));
    await tx.delete(learningRoles).where(eq(learningRoles.id, id));
  });
}

/** Assign (or clear, roleId null) a person's learning role, email-keyed. */
export async function setLearningRoleAssignment(
  orgId: string, programId: string, email: string, roleId: string | null,
): Promise<void> {
  const key = email.trim().toLowerCase();
  await asPrivileged(async (tx) => {
    await tx.delete(learningRoleAssignments)
      .where(and(eq(learningRoleAssignments.programId, programId), sql`lower(${learningRoleAssignments.email}) = ${key}`));
    if (roleId) {
      await tx.insert(learningRoleAssignments)
        .values({ organizationId: orgId, programId, email: key, roleId });
    }
  });
}

/** The person's learning role (id, name, perms) for this program, or null. */
export async function getLearningRoleForEmail(programId: string, email: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const r = await tx
      .select({ roleId: learningRoleAssignments.roleId, name: learningRoles.name, perms: learningRoles.perms })
      .from(learningRoleAssignments)
      .leftJoin(learningRoles, eq(learningRoles.id, learningRoleAssignments.roleId))
      .where(and(eq(learningRoleAssignments.programId, programId), sql`lower(${learningRoleAssignments.email}) = ${email.trim().toLowerCase()}`))
      .limit(1);
    if (!r.length) return null;
    return { role_id: r[0].roleId, role_name: r[0].name ?? null, perms: r[0].perms ?? {} };
  });
}

/** Program people with their assigned LEARNING role (for the People tab). */
export async function listLearningPeople(orgId: string, programId: string): Promise<Row[]> {
  const team = await listProgramMembers(orgId, programId);
  return asPrivileged(async (tx) => {
    const assigns = await tx
      .select({ email: learningRoleAssignments.email, roleId: learningRoleAssignments.roleId, name: learningRoles.name })
      .from(learningRoleAssignments)
      .leftJoin(learningRoles, eq(learningRoles.id, learningRoleAssignments.roleId))
      .where(eq(learningRoleAssignments.programId, programId));
    const byEmail = new Map(assigns.map((a) => [(a.email ?? "").toLowerCase(), a]));
    return team.map((m: Row) => {
      const email = ((m.email as string | null) ?? "").toLowerCase();
      const isAdmin = m.membership_role === "administrator" || m.membership_role === "owner";
      const a = byEmail.get(email);
      return {
        email: m.email, display_name: m.display_name, status: m.status,
        role_id: isAdmin ? null : a?.roleId ?? null,
        role_name: isAdmin ? null : a?.name ?? null,
        is_admin: isAdmin,
        membership_id: m.membership_id ?? null, invitation_id: m.invitation_id ?? null,
      };
    });
  });
}
