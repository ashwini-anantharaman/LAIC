/**
 * Org-graph services — Nexus v0.4 Slice 11.
 *
 * CRUD + enrollment paths for the objects added in Slice 9: organization
 * relationships, program↔org affiliations, program affiliations, groups (+
 * members + coach-add), invitations (secure-token invite link + accept), and
 * bulk registration import. Postgres-only (RLS-scoped via `scoped()`); returns
 * snake_case rows for the routes.
 */
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import { HttpError } from "../httpError";
import * as localKeys from "../platformLocalStore";
import { asPrivileged, type Tx } from "./context";
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
        /** The person's org-scoped profile id — the key their picture is under. */
        profile_id: p?.id ?? null,
        email: p?.email ?? null,
        /** Optional sign-in username, so the roster can show and edit it. */
        username: p?.username ?? null,
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
    const isCore = (m: Row) => {
      const email = ((m.email as string | null) ?? "").toLowerCase();
      const isAdmin = m.membership_role === "administrator" || m.membership_role === "owner";
      return isAdmin || m.role_id || !platformEmails.has(email);
    };
    const core = team.filter(isCore);
    // Platform-only members (anti-join of core). Returned separately so the
    // console can render them under any groups they're placed into — group
    // placement is email-keyed, so a platform member can belong to a group
    // without being a "core" program member.
    const platformMembers = team.filter((m: Row) => !isCore(m));
    return { team: core, groups, platformMembers };
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
  /** Public gate sign-ups run privileged: the GATE authorizes the grant, and
   *  the caller may be anonymous (RLS would reject the write otherwise). */
  privileged = false,
): Promise<Row | null> {
  const run = privileged ? asPrivileged : scoped;
  return run(async (tx) => {
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
  /** Access resolution reads the CALLER's own assignment before any tenant
   *  context exists (a learner can't read this table under RLS), so it asks
   *  privileged. Scoped to one program + one email — nothing enumerable. */
  privileged = false,
): Promise<string | null> {
  const run = privileged ? asPrivileged : scoped;
  return run(async (tx) => {
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

/** A partner org's granted access to a program: a role's shape (perms + fine
 *  capabilities), stored migration-free under the affiliation's metadata_json.
 *  This is the "provision a partner org like a person" grant. */
export interface PartnerAccessGrant { perms?: Record<string, unknown>; capabilities?: string[]; updatedAt?: string }

/** Set (or clear) a partner org affiliation's granted access. Scoped — the
 *  program's admin (an org member) performs this. */
export async function setProgramOrgAffiliationAccess(id: string, access: PartnerAccessGrant | null): Promise<Row | null> {
  return scoped(async (tx) => {
    const r = await tx.select().from(programOrganizationAffiliations).where(eq(programOrganizationAffiliations.id, id)).limit(1);
    if (!r.length) return null;
    const meta: Row = { ...((r[0].metadataJson as Row) ?? {}) };
    if (access === null) delete meta.access; else meta.access = access as unknown as Row;
    const [updated] = await tx.update(programOrganizationAffiliations).set({ metadataJson: meta }).where(eq(programOrganizationAffiliations.id, id)).returning();
    return updated ? poaRow(updated) : null;
  });
}

/** Resolve a program within an org by its slugified name — privileged, for the
 *  partner portal (the viewer is a partner-org member, not an org member). */
export async function getProgramByOrgAndSlug(orgId: string, programSlug: string): Promise<Row | null> {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return asPrivileged(async (tx) => {
    const rows = await tx.select().from(programs).where(eq(programs.orgId, orgId));
    const m = rows.find((p) => slug(p.name) === programSlug);
    if (!m) return null;
    return {
      id: m.id, org_id: m.orgId, name: m.name, description: m.description,
      branding: ((m.metadataJson as Row)?.branding as Row) ?? null,
    };
  });
}

/** Enforcement read: the ACTIVE partner grant a set of orgs holds on a program,
 *  if any. Privileged — the caller is a partner-org member, not an org member of
 *  the program's owner, so RLS would otherwise hide the affiliation row. Returns
 *  the first active affiliation carrying a non-empty capability grant. */
export async function getActivePartnerAccessForOrgs(
  programId: string,
  orgIds: string[],
): Promise<{ affiliationId: string; organizationId: string; access: PartnerAccessGrant } | null> {
  if (!orgIds.length) return null;
  return asPrivileged(async (tx) => {
    const rows = await tx.select().from(programOrganizationAffiliations)
      .where(and(
        eq(programOrganizationAffiliations.programId, programId),
        inArray(programOrganizationAffiliations.organizationId, orgIds),
        eq(programOrganizationAffiliations.status, "active"),
      ));
    for (const r of rows) {
      const access = (r.metadataJson as Row | undefined)?.access as PartnerAccessGrant | undefined;
      if (access && (Array.isArray(access.capabilities) ? access.capabilities.length : Object.keys(access.perms ?? {}).length)) {
        return { affiliationId: r.id, organizationId: r.organizationId, access };
      }
    }
    return null;
  });
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
    } else if (inv.programId && inv.role === "member") {
      // Program-scoped plain member (a program / Content Studio / Bridge invite):
      // add them to THIS program so they gain access; their pre-assigned
      // program/platform role (email-keyed at invite time) then governs what
      // they can do. Without this branch the invitation accepted but created no
      // membership — the person never appeared in the program.
      await tx.execute(
        sql`insert into org_memberships (org_id, profile_id, role, program_id) values (${orgId}, ${profileId}, 'member', ${inv.programId}) on conflict do nothing`,
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

/**
 * Resolve a gate by the PARTNER's own slug (/partner/<slug>/<gate>). A partner
 * is a program row; its gate lives on that program under the owning org. The
 * page brands as the PARTNER (its own name/theme) but the session still binds to
 * the owning org (partner members are program-scoped members there). Privileged.
 */
export async function getPublicPartnerGate(partnerSlug: string, gateSlug: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const progs = await tx.select().from(programs);
    const partner = progs.find((p) => {
      const m = p.metadataJson as Row | undefined;
      return m?.slug === partnerSlug && m?.is_partner;
    });
    if (!partner) return null;
    const orgs = await tx.select().from(organizations).where(eq(organizations.id, partner.orgId)).limit(1);
    if (!orgs.length) return null;
    const org = orgs[0];
    const r = await tx.select().from(gates)
      .where(and(eq(gates.organizationId, org.id), eq(gates.slug, gateSlug), eq(gates.programId, partner.id))).limit(1);
    if (!r.length) return null;
    const g = r[0];
    const roleIds = gateRoleIds(g);
    let roles: Array<{ id: string; name: string }> = [];
    if (roleIds.length) {
      const rows = await tx.select({ id: programRoles.id, name: programRoles.name }).from(programRoles).where(inArray(programRoles.id, roleIds));
      const byId = new Map(rows.map((x) => [x.id, x.name ?? ""]));
      roles = roleIds.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id) ?? "" }));
    }
    const branding = ((partner.metadataJson as Row | undefined)?.branding as Row | undefined) ?? {};
    return {
      ...gateRow(g),
      roles,
      // org.slug binds the sign-in session to the owning org; the name/theme are
      // the PARTNER's so the page reads as the partner, not the org.
      org: {
        id: org.id, slug: org.slug, name: partner.name,
        theme_accent_color: (branding.accent as string) ?? null,
        theme_logo_url: (branding.logo as string) ?? null,
      },
      program_name: partner.name,
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
 * The program's active learner roster (privileged: powers coach/admin
 * surfaces — the resolver gates WHO may call, this just reads). Names and
 * emails come from the registration records: students are never org members,
 * so registrations are their only people surface.
 */
export async function listProgramLearners(
  orgId: string,
  programId: string,
  // A coach's roster is the UNION of their legacy roster group and the
  // multi-coach relationship rows (0040) — either filter alone under-counts.
  opts: { groupId?: string; participantIds?: string[] } = {},
): Promise<Row[]> {
  const scoped = Boolean(opts.groupId) || Boolean(opts.participantIds?.length);
  return asPrivileged(async (tx) => {
    // LEFT join on registrations, profile fallback: a club member's hire
    // mints a participant with registration_id NULL (see
    // ensureClubLearnerParticipant), and the old INNER join silently dropped
    // exactly those rows — a coach whose roster count said 1 opened a roster
    // that showed nobody. Identity comes from the registration when there is
    // one, else from the profile the participant points at.
    const rows = await tx
      .select({
        userId: participants.userId,
        regEmail: registrations.email,
        regName: registrations.name,
        profEmail: profiles.email,
        profName: profiles.displayName,
        joinedAt: participants.createdAt,
      })
      .from(participants)
      .leftJoin(registrations, eq(participants.registrationId, registrations.id))
      .leftJoin(profiles, eq(profiles.id, participants.userId))
      .where(
        and(
          eq(participants.organizationId, orgId),
          eq(participants.programId, programId),
          eq(participants.participantType, "learner"),
          eq(participants.status, "active"),
          ...(scoped
            ? [
                or(
                  ...(opts.groupId ? [eq(participants.groupId, opts.groupId)] : []),
                  ...(opts.participantIds?.length
                    ? [inArray(participants.id, opts.participantIds)]
                    : []),
                ),
              ]
            : []),
        ),
      );
    // user_id IS the id space the platforms key artifacts on: a participant's
    // bridge/learning context resolves nexusUserId to this same id.
    return rows.map((r) => ({
      user_id: r.userId,
      email: r.regEmail ?? r.profEmail,
      name: r.regName ?? r.profName,
      joined_at: r.joinedAt,
    }));
  });
}

// ── Hire-a-coach (Bridge Program, Phase 1.5) ─────────────────────────────────
// The coach↔learner relationship is a Nexus GROUP: one roster group per coach
// (metadata_json.kind = 'coach_roster', .coach_profile_id = the coach's
// org-scoped profile id), and the learner's participant row points at it via
// participants.group_id — single-valued, so "one coach at a time" is enforced
// by the schema's own shape. Hiring is learner-initiated; switching replaces.

/** The program's coaches (holders of the bridge_coach platform role), with
 *  their roster group (if any) and live learner count. Learner-visible: names
 *  and profile ids only — no emails. */
export async function listProgramCoaches(orgId: string, programId: string): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select p.id as coach_id,
             coalesce(p.display_name, p.name, split_part(a.email, '@', 1)) as name,
             g.id as group_id,
             (select count(*) from participants pa
               where pa.group_id = g.id and pa.participant_type = 'learner' and pa.status = 'active')
               as learner_count
      from platform_role_assignments a
      join profiles p
        on lower(p.email) = lower(a.email) and p.organization_id = a.organization_id
      left join groups g
        on g.organization_id = a.organization_id and g.program_id = a.program_id
       and g.metadata_json->>'kind' = 'coach_roster'
       and g.metadata_json->>'coach_profile_id' = p.id::text
      where a.organization_id = ${orgId} and a.program_id = ${programId}
        and a.platform = 'bridge' and a.role = 'bridge_coach'
      order by name`);
    return rows as unknown as Row[];
  });
}

/**
 * The coaches a CLUB's member may hire: the club's own coaching tier, nobody
 * else. A club is a partner program whose people are org_memberships rows
 * scoped to it; who among them COACHES is the club role's call (owner
 * direction 2026-08-11: "the role that was given Coaching access should be
 * accessed in as coaches") — the same capability rule as /bridge/context's
 * clubCoach, expressed in SQL:
 *
 *   · their assigned club role grants the coaching menu (app.coaching.view
 *     in perms.capabilities), or grants the whole app area
 *     (perms.clubapp = 'administrator', which stores no per-capability ids), or
 *   · they hold the club structurally (membership owner/administrator).
 *
 * NOT the membership role `instructor` — Nexus writes that as the base
 * membership for everyone it enrolls, so filtering on it listed the entire
 * club as hireable coaches.
 *
 * The roster group and learner count are read from the PARENT program,
 * because that is the instance where sessions, submissions and rosters live.
 */
export async function listClubCoaches(
  orgId: string,
  clubProgramId: string,
  parentProgramId: string,
): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select p.id as coach_id,
             coalesce(p.display_name, p.name, split_part(p.email, '@', 1)) as name,
             g.id as group_id,
             (select count(*) from participants pa
               where pa.group_id = g.id and pa.participant_type = 'learner' and pa.status = 'active')
               as learner_count
      from org_memberships m
      join profiles p on p.id = m.profile_id
      left join program_role_assignments a
        on a.program_id = ${clubProgramId} and lower(a.email) = lower(p.email)
      left join program_roles r on r.id = a.role_id
      left join groups g
        on g.organization_id = ${orgId} and g.program_id = ${parentProgramId}
       and g.metadata_json->>'kind' = 'coach_roster'
       and g.metadata_json->>'coach_profile_id' = p.id::text
      where m.org_id = ${orgId} and m.program_id = ${clubProgramId}
        and (m.status is null or m.status = 'active')
        and (
          m.role in ('owner', 'administrator')
          or r.perms->>'clubapp' = 'administrator'
          or r.perms->'capabilities' @> '["app.coaching.view"]'::jsonb
        )
      order by name`);
    return rows as unknown as Row[];
  });
}

/**
 * A learner participant for someone who never REGISTERED: a club member.
 *
 * The hire flow (and everything downstream: my-coaches, the summary's coach
 * cards, the roster group) hangs off a participants row in the PARENT program,
 * which gate sign-ups create via a registration. A club member joined through
 * their club's console instead — org membership, no registration — so their
 * first hire mints the participant row directly (registration_id stays null;
 * the column is nullable and getLearnerParticipant's profile fallback finds
 * the row again by email).
 */
export async function ensureClubLearnerParticipant(
  orgId: string,
  parentProgramId: string,
  profileId: string,
): Promise<Row> {
  return asPrivileged(async (tx) => {
    const existing = await tx.execute(sql`
      select id, group_id, user_id from participants
      where organization_id = ${orgId} and program_id = ${parentProgramId}
        and user_id = ${profileId} and participant_type = 'learner' and status = 'active'
      limit 1`);
    const found = (existing as unknown as Row[])[0];
    if (found) return found;
    const inserted = await tx.execute(sql`
      insert into participants (organization_id, program_id, user_id, participant_type, status, metadata)
      values (${orgId}, ${parentProgramId}, ${profileId}, 'learner', 'active',
              jsonb_build_object('origin', 'club_member'))
      returning id, group_id, user_id`);
    return (inserted as unknown as Row[])[0] as Row;
  });
}

/** The coach's roster group, created on first use. */
export async function ensureCoachRosterGroup(
  orgId: string,
  programId: string,
  coachProfileId: string,
  coachName: string,
): Promise<Row> {
  return asPrivileged(async (tx) => {
    const existing = await tx.execute(sql`
      select * from groups
      where organization_id = ${orgId} and program_id = ${programId}
        and metadata_json->>'kind' = 'coach_roster'
        and metadata_json->>'coach_profile_id' = ${coachProfileId}
      limit 1`);
    const found = (existing as unknown as Row[])[0];
    if (found) return found;
    const created = await tx.execute(sql`
      insert into groups (organization_id, program_id, name, visibility, metadata_json)
      values (${orgId}, ${programId}, ${`${coachName} — coaching roster`}, 'private',
              ${JSON.stringify({ kind: "coach_roster", coach_profile_id: coachProfileId })}::jsonb)
      returning *`);
    return (created as unknown as Row[])[0] as Row;
  });
}

/** The learner's active participant row in a program (id + group), by email. */
export async function getLearnerParticipant(
  orgId: string,
  programId: string,
  email: string,
): Promise<Row | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select pa.id, pa.group_id, pa.user_id
      from participants pa
      join registrations r on pa.registration_id = r.id
      where pa.organization_id = ${orgId} and pa.program_id = ${programId}
        and pa.participant_type = 'learner' and pa.status = 'active'
        and lower(r.email) = ${key}
      limit 1`);
    const viaRegistration = (rows as unknown as Row[])[0] as Row | undefined;
    if (viaRegistration) return viaRegistration;
    // Registration-less participants: club members' rows are minted at first
    // hire (ensureClubLearnerParticipant) with registration_id null, so the
    // registrations join above can never see them — find those by profile.
    const viaProfile = await tx.execute(sql`
      select pa.id, pa.group_id, pa.user_id
      from participants pa
      join profiles p on p.id = pa.user_id
      where pa.organization_id = ${orgId} and pa.program_id = ${programId}
        and pa.participant_type = 'learner' and pa.status = 'active'
        and pa.registration_id is null
        and lower(p.email) = ${key}
      limit 1`);
    return ((viaProfile as unknown as Row[])[0] as Row | undefined) ?? null;
  });
}

/** Point the learner's participant row at a coach roster group (null = leave). */
export async function setParticipantGroup(participantId: string, groupId: string | null): Promise<void> {
  await asPrivileged(async (tx) => {
    await tx.execute(sql`update participants set group_id = ${groupId} where id = ${participantId}`);
  });
}

/**
 * Every coach this learner has hired: the roster-group coach (the learner's
 * PRIMARY — participants.group_id, which rosters and assignments key on)
 * plus the additive rows in bridge_learner_coaches (migration 0040). Deduped
 * — hiring writes both places for the first coach — and name-sorted.
 */
export async function listLearnerCoaches(
  orgId: string,
  programId: string,
  participant: Row,
  /**
   * The learner's PROFILE id (access.profileId) — the id space
   * bridge_play_submissions.learner_id keys on, so each coach can carry the
   * learner's own sent/reviewed/pending tallies with them. Null skips the
   * tallies (callers that only need ids and names).
   *
   * Must NOT default to participant.user_id: a learner who also holds an org
   * membership resolves to the membership's profile id, and that is the id
   * submissions were written under. The wrong one counts zero, silently.
   */
  learnerProfileId: string | null = null,
  /**
   * Where this learner's SUBMISSIONS are stamped, when it differs from the
   * relationship's program. A club's hires live in the PARENT program (that
   * is where participants and lc rows are minted), but bridge-web stamps a
   * club member's submissions with the pinned CLUB — so a club caller passes
   * the club id here or every tally reads zero. Defaults to `programId`.
   */
  submissionProgramId: string | null = null,
): Promise<Row[]> {
  const subScope = submissionProgramId ?? programId;
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      with hired as (
        select (g.metadata_json->>'coach_profile_id')::uuid as coach_profile_id
        from groups g
        where g.id = ${(participant.group_id as string) ?? null}
          and g.metadata_json->>'kind' = 'coach_roster'
        union
        select lc.coach_profile_id
        from bridge_learner_coaches lc
        where lc.participant_id = ${participant.id as string}
          and lc.organization_id = ${orgId} and lc.program_id = ${programId}
      ),
      -- This learner's plays, split per coach. Scoped exactly as bridge-web's
      -- own /m/plays read is (learner + org + program) so a coach's number can
      -- never disagree with the list that number opens.
      counts as (
        select s.coach_id,
               count(*) as sent,
               count(*) filter (where s.status = 'reviewed') as reviewed,
               -- <> 'reviewed', not = 'submitted': status has no CHECK
               -- constraint and 'submitted' is only the column default.
               count(*) filter (where s.status <> 'reviewed') as pending
        from bridge_play_submissions s
        where ${learnerProfileId}::text is not null
          and s.learner_id = ${learnerProfileId}
          and s.program_organization_id = ${orgId}
          and (${subScope}::text is null or s.nexus_program_id = ${subScope})
        group by s.coach_id
      )
      select p.id as coach_id,
             coalesce(p.display_name, p.name, split_part(p.email, '@', 1)) as name,
             coalesce(c.sent, 0)::int as sent,
             coalesce(c.reviewed, 0)::int as reviewed,
             coalesce(c.pending, 0)::int as pending
      from profiles p
      join hired h on h.coach_profile_id = p.id
      -- p.id is uuid, submissions.coach_id is text. Cast the uuid: casting the
      -- other way raises 22P02 on any non-uuid legacy value.
      left join counts c on c.coach_id = p.id::text`);
    return (rows as unknown as Row[]).sort((a, b) =>
      String(a.name ?? "").localeCompare(String(b.name ?? "")),
    );
  });
}

/** Record a hire (idempotent). The caller decides about the roster group. */
export async function addLearnerCoach(
  orgId: string,
  programId: string,
  participantId: string,
  coachProfileId: string,
): Promise<void> {
  await asPrivileged(async (tx) => {
    await tx.execute(sql`
      insert into bridge_learner_coaches
        (organization_id, program_id, participant_id, coach_profile_id)
      values (${orgId}, ${programId}, ${participantId}, ${coachProfileId})
      on conflict (participant_id, coach_profile_id) do nothing`);
  });
}

/** Dissolve one hire (the roster group is the caller's business). */
export async function removeLearnerCoach(
  participantId: string,
  coachProfileId: string,
): Promise<void> {
  await asPrivileged(async (tx) => {
    await tx.execute(sql`
      delete from bridge_learner_coaches
      where participant_id = ${participantId} and coach_profile_id = ${coachProfileId}`);
  });
}

/** Participant ids that hired this coach via the relationship table —
 *  unioned into the coach's roster beside their legacy roster group. */
export async function listParticipantIdsForCoach(
  orgId: string,
  programId: string,
  coachProfileId: string,
): Promise<string[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select participant_id from bridge_learner_coaches
      where organization_id = ${orgId} and program_id = ${programId}
        and coach_profile_id = ${coachProfileId}`);
    return (rows as unknown as Row[]).map((r) => String(r.participant_id));
  });
}

/** The coach behind a roster group, or null when the group isn't one. */
export async function getCoachForGroup(groupId: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select p.id as coach_id,
             coalesce(p.display_name, p.name, split_part(p.email, '@', 1)) as name
      from groups g
      join profiles p on p.id = (g.metadata_json->>'coach_profile_id')::uuid
      where g.id = ${groupId} and g.metadata_json->>'kind' = 'coach_roster'
      limit 1`);
    return ((rows as unknown as Row[])[0] as Row | undefined) ?? null;
  });
}

/**
 * The bridge platform's PROGRAM-instance library entries, for the Learning
 * Platform's authoring picker (library ↔ LP intersection, Phase B). Reads the
 * bridge platform pack's table directly (same shared cluster, privileged) —
 * the LP itself never touches bridge tables; Nexus stays the door. Embeds are
 * SNAPSHOTS: the LP copies what it needs and records provenance, so this is a
 * read-only browse surface. Deals/boards/plays only (tables are lineups,
 * drills are KB internals).
 */
/**
 * Role-aware activity counts for the coach app's live Home (privileged read
 * of the bridge platform's tables — same pattern as the learning library
 * bridge read). `userId` is the caller's bridge nexusUserId: a participant's
 * auth id (learner) or a member's profile id (coach) — the bridge artifact
 * tables key on exactly that id, so one parameter serves both roles.
 */
export async function getBridgeActivitySummary(
  orgId: string,
  programId: string | null,
  userId: string,
): Promise<Row> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select
        -- One assignment = one BRIEF (0028). A brief that later holds several
        -- boards is ONE thing the learner was asked to do, not three; a legacy
        -- row has no brief and counts as its own group, so this number is
        -- unchanged for pre-0028 data.
        (select count(distinct coalesce(a.brief_id, a.assignment_id))
           from bridge_assignments a
          where a.learner_id = ${userId}
            and (${programId}::text is null or a.nexus_program_id = ${programId})
            and a.status in ('assigned','started')) as assignments_open,
        -- DISTINCT SESSION, not count(*): a finished play now yields one
        -- submission per REVIEWER, and the app renders this as "N games
        -- reviewed". Two coaches reviewing one game is ONE game reviewed.
        (select count(distinct s.session_id) from bridge_play_submissions s
          where s.learner_id = ${userId}
            and (${programId}::text is null or s.nexus_program_id = ${programId})
            and s.status = 'reviewed') as plays_reviewed,
        -- count(*) is RIGHT here and must stay: the grain is the THREAD, one per
        -- (coach, session), and the app says "N plays awaiting review" — N things
        -- for THIS coach to do. Another reviewer's row has a different coach_id
        -- and is invisible to this count.
        (select count(*) from bridge_play_submissions s
          where s.coach_id = ${userId}
            and (${programId}::text is null or s.nexus_program_id = ${programId})
            and s.status = 'submitted') as reviews_pending,
        (select count(distinct pa.id) from participants pa
          left join groups g on g.id = pa.group_id
            and g.metadata_json->>'kind' = 'coach_roster'
            and g.metadata_json->>'coach_profile_id' = ${userId}
          left join bridge_learner_coaches lc on lc.participant_id = pa.id
            and lc.coach_profile_id = ${userId}::uuid
          where pa.organization_id = ${orgId}
            and pa.participant_type = 'learner' and pa.status = 'active'
            and (g.id is not null or lc.id is not null)) as roster_count
    `);
    return (rows as unknown as Row[])[0] ?? {};
  });
}

/**
 * Boards this person started and hasn't finished — the coach app's "Resume".
 * Status and board name live in the session's jsonb record.
 *
 * ZERO-EVENT sessions are excluded (2026-08-13): quick-play creates the
 * session BEFORE the table opens, so a board whose open bounced (the app's
 * boardGone retreat) strands a row nobody ever saw — each one a ghost
 * "resume" entry that crowds the real boards out of the capped list. No
 * events means nothing has happened at the table (the deal itself is not an
 * event; a board someone actually looked at has robot calls within a beat),
 * so there is nothing to resume. A later real sitting writes events and the
 * board appears here exactly as before.
 */
export async function listBridgeInProgressSessions(
  programId: string | null,
  userId: string,
  limit = 10,
): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select session_id,
             coalesce(record->'board'->>'name', 'Board') as board_name,
             updated_at::text as updated_at
      from bridge_kb_sessions
      where created_by = ${userId}
        and coalesce(record->>'status', 'in_progress') <> 'completed'
        and jsonb_array_length(coalesce(record->'events', '[]'::jsonb)) > 0
        and (${programId}::text is null or nexus_program_id = ${programId})
      order by updated_at desc
      limit ${limit}
    `);
    return rows as unknown as Row[];
  });
}

/**
 * Deal of the Day: ONE board a day, the same for everyone in the program.
 * Preference order — a collection literally named "Deal of the Day" (so an
 * admin curates the rotation), else the program's own boards. The pick is
 * deterministic from `dayIndex`, so it changes at midnight and never mid-day.
 */
export async function getBridgeDealOfTheDay(
  orgId: string,
  programId: string | null,
  dayIndex: number,
): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const curated = (await tx.execute(sql`
      select record->'itemIds' as item_ids
      from bridge_library_collections
      where lower(record->>'name') = 'deal of the day'
        and (${programId}::text is null or nexus_program_id = ${programId})
      limit 1
    `)) as unknown as Row[];

    let ids: string[] = [];
    const raw = curated[0]?.item_ids;
    if (Array.isArray(raw)) ids = raw.map(String);
    else if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) ids = parsed.map(String);
      } catch {
        ids = [];
      }
    }

    if (ids.length === 0) {
      const boards = (await tx.execute(sql`
        select entry_id
        from bridge_kb_library
        where kind in ('board', 'deal')
          and scope_level = 'program'
          and program_organization_id = ${orgId}
          and (${programId}::text is null or nexus_program_id = ${programId})
        order by entry_id
      `)) as unknown as Row[];
      ids = boards.map((b) => String(b.entry_id));
    }
    if (ids.length === 0) return null;

    const pick = ids[((dayIndex % ids.length) + ids.length) % ids.length]!;
    const rows = (await tx.execute(sql`
      select entry_id,
             entry->>'name' as name,
             entry->>'dealer' as dealer,
             entry->>'vul' as vul,
             entry->>'contractLabel' as contract_label
      from bridge_kb_library
      where entry_id = ${pick}
      limit 1
    `)) as unknown as Row[];
    return rows[0] ?? null;
  });
}

export async function listBridgeLibraryForLearning(
  orgId: string,
  programId: string | null,
): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select entry_id, kind, entry, created_at
      from bridge_kb_library
      where program_organization_id = ${orgId}
        and scope_level = 'program'
        and kind in ('deal', 'board', 'play')
        ${programId ? sql`and nexus_program_id = ${programId}` : sql``}
      order by created_at desc
      limit 100`);
    return (rows as unknown as Row[]).map((r) => {
      const e = (r.entry ?? {}) as Row;
      return {
        entry_id: r.entry_id,
        kind: r.kind,
        name: e.name ?? null,
        dealer: e.dealer ?? null,
        vul: e.vul ?? null,
        hands: e.hands ?? null,
        auction: e.auction ?? null,
        play: e.play ?? null,
        contract_label: e.contractLabel ?? null,
        result_label: e.resultLabel ?? null,
      };
    });
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
/**
 * Which programs' content a caller may read.
 *
 * A club sees its OWN content plus the parent program's curriculum; a parent sees
 * only its own. Both ids are needed, which is why this is not the
 * `partnerProgramId ?? programId` idiom the bridge routes use for club-scoped DATA —
 * there, one id answers; here, two do.
 *
 * NULL program_id stays INVISIBLE, deliberately. The challenge work made null
 * fail-open because there was no column and every row was null; content is the
 * opposite — these queries already filtered `program_id = X` strictly, so unstamped
 * rows are invisible today and an `is null` arm would newly EXPOSE them.
 */
function _programScope(
  programId?: string | null,
  clubProgramId?: string | null,
  withGrants = true,
  /** The viewer's profile id, for the by-name arm. Omit for a system read. */
  viewerProfileId?: string | null,
) {
  const ids = [...new Set([programId, clubProgramId].filter(Boolean) as string[])];
  if (!ids.length) return sql``; // no program pinned → org-wide, as before
  // UNPINNED ROWS COUNT AS EVERY PROGRAM'S. program_id is nullable (0001) and
  // nothing ever backfilled it, so content authored before pinning existed has
  // none — and `in (...)` never matches NULL, which quietly orphaned all of it
  // the moment a caller pinned a program. Every app call pins one, so that
  // content simply stopped reaching the Learn tab; the reader apps already
  // assume the opposite rule ("rows from a server that predates program_id
  // count as curriculum"), and this is the server keeping that promise.
  //
  // It cannot widen a club into a sibling's work: writes have been stamped with
  // the club (or the program) since _learningWriteScope shipped, so anything a
  // club authored carries an id and stays behind the predicate. These reads are
  // org-scoped above regardless, and org-wide is exactly what an unpinned row
  // was visible to before programs could own content at all.
  //
  // THE THIRD ARM: explicit grants to a CLUB (learning_object_grants, subject_type
  // 'club'). A content manager can hand one object to particular clubs, and this is
  // where that grant becomes visibility.
  //
  // Same table as the personal tier below, deliberately. Both questions are "who
  // else may see this object", and answering them from two tables would mean two
  // predicates that have to agree forever — the kind of pair that drifts. They stay
  // separate FUNCTIONS because they sit on different axes: this one decides which
  // PROGRAMS' content is in scope, _personalScope decides whose.
  //
  // It only ever ADDS — beside the two arms above rather than replacing them — so
  // writing the first grant for an object cannot take it away from anyone reading it
  // today. See 0008 for why the widening semantics beat the file-sharing ones.
  //
  // Matched against every id in scope, not just the club: a parent program can be
  // granted a club's object the same way, and the set is already deduped.
  //
  // AND BY NAME. Sharing one item with one person has to reach across programs
  // too, or the "share with these three people in that club" gesture silently
  // does nothing: their club is not granted, so the club arm misses, and the row
  // belongs to another program, so the first arm misses. _personalScope does not
  // rescue it either — that layer only consults grants for scope_level = 'user'
  // rows, and this is an ordinary program-scoped object.
  //
  // Absent viewer means no personal arm at all, never "everyone's": a system or
  // anonymous read must not inherit somebody's private grants.
  const subjects: { type: string; id: string }[] = [
    ...ids.map((id) => ({ type: "club", id })),
    ...(viewerProfileId ? [{ type: "profile", id: viewerProfileId }] : []),
  ];
  const granted = withGrants
    ? sql` or exists (select 1 from learning_object_grants g
                       where g.object_id = learning_objects.id
                         and (g.subject_type, g.subject_id) in (${sql.join(
                           subjects.map((s) => sql`(${s.type}, ${s.id})`),
                           sql`, `,
                         )}))`
    : sql``;
  return sql`and (program_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) or program_id is null${granted})`;
}

/** Who is asking, for the personal-visibility arm below. */
export interface LearningViewer {
  /** The org-scoped profile id — what owner_id holds. */
  profileId: string;
  /** Club role ids this person holds, for `subject_type='role'` grants. */
  roleIds?: readonly string[];
}

/**
 * The personal tier, layered on top of the program scope above.
 *
 * A row is visible when it is not personal, OR it is mine, OR someone shared it
 * with me — by name, or through a role I hold.
 *
 * `is distinct from 'user'` rather than `<> 'user'`: legacy rows predate the column
 * and carry NULL, and `NULL <> 'user'` is NULL, which is not true, which would hide
 * every object written before 0006. That is the whole content library.
 *
 * No viewer (an anonymous or system read) means no personal rows at all, never
 * "all of them" — the failure direction matters here more than anywhere else in
 * this file.
 */
function _personalScope(viewer?: LearningViewer | null) {
  if (!viewer?.profileId) return sql`and scope_level is distinct from 'user'`;
  const roles = viewer.roleIds?.length ? [...new Set(viewer.roleIds)] : [];
  const roleArm = roles.length
    ? sql`or (g.subject_type = 'role' and g.subject_id in (${sql.join(roles.map((r) => sql`${r}`), sql`, `)}))`
    : sql``;
  return sql`and (
    scope_level is distinct from 'user'
    or owner_id = ${viewer.profileId}
    or exists (
      select 1 from learning_object_grants g
      where g.object_id = learning_objects.id
        and ((g.subject_type = 'profile' and g.subject_id = ${viewer.profileId}) ${roleArm})
    )
  )`;
}

export async function listLearningObjects(orgId: string, programId?: string | null, clubProgramId?: string | null, viewer?: LearningViewer | null): Promise<Row[]> {
  // Same optional group and the same fallback as the meta listing below. This
  // query used to omit collection_ids/collection_names/version_number/published_at
  // entirely, so an object round-tripped through Nexus came back with NO folder
  // membership and no publication state — which is why the Content Studio still
  // hydrated its library from the service-role path instead. Reader apps group the
  // Learn tab by collection_names, so losing them is not cosmetic.
  try {
    return await _listLearningObjects(orgId, programId, clubProgramId, true, viewer);
  } catch (e) {
    if (!_missingPersonalTier(e)) throw e;
    console.warn("[nexus] learning_objects optional columns or grants table missing — run migrations");
    // Without the personal tier this is exactly the query that shipped before it:
    // every row in scope, which is what those rows already were.
    return _listLearningObjects(orgId, programId, clubProgramId, false, null);
  }
}

async function _listLearningObjects(
  orgId: string,
  programId: string | null | undefined,
  clubProgramId: string | null | undefined,
  withCollections: boolean,
  viewer: LearningViewer | null | undefined,
): Promise<Row[]> {
  const cols = withCollections
    ? sql`, coalesce(collection_ids, '[]'::jsonb) as collection_ids,
            coalesce(collection_names, '[]'::jsonb) as collection_names,
            version_number,
            published_at::text as published_at,
            coalesce(scope_level, 'program') as scope_level`
    : sql``;
  // One query, not two near-identical ones: the pinned/unpinned pair had to be kept
  // in step by hand, which is exactly where a program predicate drifts.
  // Both layers ride the same flag, and both read learning_object_grants: the
  // club arm of _programScope answers "which programs' content", _personalScope
  // answers "whose". One fallback covers both because one table backs both.
  const scope = _programScope(programId, clubProgramId, withCollections, viewer?.profileId ?? null);
  const personal = withCollections ? _personalScope(viewer) : sql``;
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select id, type, title, owner_id, owner_name, status, scope, reuse_count,
             description, estimated_time, blocks, tags, source_ids, pipeline_draft,
             program_id::text as program_id,
             created_at::text as created_at, updated_at::text as updated_at
             ${cols}
      from learning_objects
      where organization_id = ${orgId} ${scope} ${personal}
      order by updated_at desc nulls last`);
    return rows as unknown as Row[];
  });
}

/** Metadata-only listing: everything except the (potentially huge) content
 *  columns (blocks, pipeline_draft). For list screens; content comes from
 *  getLearningObject. */
export async function listLearningObjectsMeta(orgId: string, programId?: string | null, clubProgramId?: string | null, viewer?: LearningViewer | null): Promise<Row[]> {
  // collection_ids/collection_names arrive with 0003_object_collections.sql. A
  // deploy that lands before that migration must still serve the list, so the
  // richer query falls back to the original one on undefined_column rather than
  // 500ing the Learn tab.
  try {
    return await _listLearningObjectsMeta(orgId, programId, clubProgramId, true, viewer);
  } catch (e) {
    if (!_missingPersonalTier(e)) throw e;
    console.warn("[nexus] learning_objects optional columns or grants table missing — run migrations");
    return _listLearningObjectsMeta(orgId, programId, clubProgramId, false, null);
  }
}

async function _listLearningObjectsMeta(
  orgId: string,
  programId: string | null | undefined,
  clubProgramId: string | null | undefined,
  withCollections: boolean,
  viewer: LearningViewer | null | undefined,
): Promise<Row[]> {
  // One optional group for every column added by 0003/0004. They land together in
  // practice, and a single fallback keeps the pre-migration path to one query
  // rather than a matrix of maybe-present columns.
  const cols = withCollections
    ? sql`, coalesce(collection_ids, '[]'::jsonb) as collection_ids,
            coalesce(collection_names, '[]'::jsonb) as collection_names,
            version_number,
            published_at::text as published_at,
            coalesce(scope_level, 'program') as scope_level`
    : sql``;
  // Both layers ride the same flag, and both read learning_object_grants: the
  // club arm of _programScope answers "which programs' content", _personalScope
  // answers "whose". One fallback covers both because one table backs both.
  const scope = _programScope(programId, clubProgramId, withCollections, viewer?.profileId ?? null);
  const personal = withCollections ? _personalScope(viewer) : sql``;
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select id, type, title, owner_id, owner_name, status, scope, reuse_count,
             description, estimated_time, tags, source_ids, program_id::text as program_id,
             created_at::text as created_at, updated_at::text as updated_at
             ${cols}
      from learning_objects
      where organization_id = ${orgId} ${scope} ${personal}
      order by updated_at desc nulls last`);
    return rows as unknown as Row[];
  });
}

/**
 * One learning object, full row — scoped like the list.
 *
 * This used to filter on org and id ALONE, so any authenticated member of the org
 * could fetch any object of any program by id, `pipeline_draft` included — the
 * in-progress authoring draft that even the public share route deliberately withholds.
 * Once content is club-owned that is one club reading a sibling club's unpublished
 * work, which is the sharpest edge in this area and one predicate to close.
 *
 * Out of scope returns null and the route 404s, indistinguishable from a missing id —
 * the same rule the public route states, and the house 404-for-forbidden convention.
 *
 * Passing no program keeps the org-wide behaviour, which is what an org-level admin
 * with nothing pinned relies on.
 */
export async function getLearningObject(
  orgId: string,
  id: string,
  programId?: string | null,
  clubProgramId?: string | null,
  viewer?: LearningViewer | null,
): Promise<Row | null> {
  // This is the ONE learning read that had no undefined-column fallback, so a
  // deploy landing ahead of 0006/0007 would 500 the detail screen while every
  // listing degraded quietly. Same shape as the listings now.
  try {
    return await _getLearningObject(orgId, id, programId, clubProgramId, viewer);
  } catch (e) {
    if (!_missingPersonalTier(e)) throw e;
    console.warn("[nexus] learning_objects.scope_level or grants table missing — run migrations");
    return _getLearningObject(orgId, id, programId, clubProgramId, null);
  }
}

async function _getLearningObject(
  orgId: string,
  id: string,
  programId: string | null | undefined,
  clubProgramId: string | null | undefined,
  viewer: LearningViewer | null | undefined,
): Promise<Row | null> {
  // A club grant confers the right to OPEN an object, not merely to see its title
  // in a list, so the club arm has to be here too — otherwise a shared object
  // renders as a row that 404s when someone clicks it. `viewer === null` is the
  // caller's signal that the grants table is unavailable; both arms drop together.
  const scope = _programScope(programId, clubProgramId, viewer !== null, viewer?.profileId ?? null);
  const personal = viewer === null ? sql`` : _personalScope(viewer);
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select id, type, title, owner_id, owner_name, status, scope, reuse_count,
             description, estimated_time, blocks, tags, source_ids, pipeline_draft,
             -- FOLDER MEMBERSHIP TRAVELS WITH THE ROW. It was missing here while
             -- every listing carried it, so anything deciding access from an
             -- object's folders saw a row filed nowhere -- and a person holding a
             -- perfectly good folder grant was told the content was not shared
             -- with them. Coalesced because 0003 predates these columns.
             coalesce(collection_ids, '[]'::jsonb) as collection_ids,
             coalesce(collection_names, '[]'::jsonb) as collection_names,
             version_number, published_at::text as published_at,
             created_at::text as created_at, updated_at::text as updated_at
      from learning_objects
      where organization_id = ${orgId} and id = ${id} ${scope} ${personal}
      limit 1`);
    return ((rows as unknown as Row[])[0] as Row | undefined) ?? null;
  });
}

/**
 * One object by id for an ANONYMOUS caller — the public share link.
 *
 * Deliberately NOT org-scoped: that is what makes a link portable to a machine
 * with no session. The protection is the `shared_at` flag plus the id itself, so
 * the filter here is the whole security boundary — an unshared object must be
 * indistinguishable from one that does not exist, which is why this returns null
 * rather than throwing a "not shared" error a prober could tell apart.
 *
 * `pipeline_draft` is excluded: an in-progress authoring draft is not part of what
 * someone chose to publish.
 */
export async function getSharedLearningObject(id: string): Promise<Row | null> {
  // `shared_at` arrives with migration 0002_public_share.sql. Deploying this code
  // BEFORE that migration must not 500 — it should simply mean "nothing is
  // published yet", so a missing column is caught and read as null. Any other
  // error still propagates.
  try {
    return await _getSharedLearningObject(id);
  } catch (e) {
    if (_isUndefinedColumn(e)) {
      console.warn("[nexus] learning_objects.shared_at missing — run migrations to enable share links");
      return null;
    }
    throw e;
  }
}

/**
 * 23514 — a CHECK constraint refused the row.
 *
 * Here that means one thing in practice: a subject_type the database has not been
 * taught yet. learning_object_grants shipped in 0007 allowing only 'profile' and
 * 'role'; 'club' arrives with 0008 and 'app' with 0010. A deploy ahead of those
 * migrations rejects the insert, and it surfaced as a bare 500 — a content manager
 * clicking Save got "Couldn't update sharing" and no way to learn the cause was an
 * unapplied migration. A missing TABLE already says so plainly; a constraint that
 * has not been widened should too.
 */
function _isCheckViolation(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (e as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "23514";
}

/**
 * Postgres 23505 = unique_violation. Two folders of the same name under the same
 * parent (0012's sibling index). Surfaced as a 409 with the name in it, because
 * "New folder" clicked twice is a duplicate request and the person needs to know
 * the first one worked rather than that something broke.
 */
function _isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (e as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "23505";
}

/**
 * Postgres 42P01 = undefined_table. `learning_object_grants` arrives with 0007, and
 * a deploy that lands first must still serve every list.
 */
function _isUndefinedRelation(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (e as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "42P01";
}

/** The personal tier (0006's column, 0007's table) is not in the database yet. */
function _missingPersonalTier(e: unknown): boolean {
  return _isUndefinedColumn(e) || _isUndefinedRelation(e);
}

/** Postgres 42703 = undefined_column. */
function _isUndefinedColumn(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (e as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "42703";
}

async function _getSharedLearningObject(id: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select id, type, title, owner_id, owner_name, status, scope, reuse_count,
             description, estimated_time, blocks, tags, source_ids,
             created_at::text as created_at, updated_at::text as updated_at
      from learning_objects
      where id = ${id} and shared_at is not null
      limit 1`);
    return ((rows as unknown as Row[])[0] as Row | undefined) ?? null;
  });
}

// ── The personal tier: scope, and who it is shared with ────────────────────

/**
 * Mark a NEW object as personal.
 *
 * A separate statement rather than a column in the big upsert, on purpose. The
 * insert above has to keep working on a database that has not run 0006 yet, and
 * naming a missing column in an INSERT is a hard error with no partial success —
 * whereas this can fail on its own and leave a perfectly good object behind, filed
 * as the club's. The failure direction is the safe one: a personal draft that ends
 * up club-visible is a disappointment; a lost object is a bug.
 *
 * Guarded on `owner_id` so it cannot re-scope somebody else's row, and it never
 * moves an object that is already 'program' — a scope change is a deliberate act
 * with its own endpoint, not a side effect of a save.
 */
export async function setLearningObjectPersonal(
  orgId: string,
  id: string,
  ownerId: string,
): Promise<boolean> {
  try {
    return await asPrivileged(async (tx) => {
      const rows = await tx.execute(sql`
        update learning_objects
        set scope_level = 'user'
        where organization_id = ${orgId} and id = ${id} and owner_id = ${ownerId}
        returning id`);
      return (rows as unknown as Row[]).length > 0;
    });
  } catch (e) {
    if (_missingPersonalTier(e)) {
      console.warn("[nexus] learning_objects.scope_level missing — object saved as the club's; run migrations");
      return false;
    }
    throw e;
  }
}

/** One person or role a piece of content has been shared with. */
export interface LearningGrant {
  subjectType: "profile" | "role";
  subjectId: string;
  level: "view" | "edit";
}

/**
 * Everyone this object is shared with. Empty when the table is not there yet, which
 * reads as "shared with nobody" — true, and the same answer the product gave before
 * grants existed.
 */
export async function listLearningObjectGrants(objectId: string): Promise<LearningGrant[]> {
  try {
    return await asPrivileged(async (tx) => {
      // People and roles only. 'club' rows share this table (0008) but answer a
      // different question and belong to a different picker; returning them here
      // would list a club in the UI that invites colleagues, typed as a person.
      const rows = await tx.execute(sql`
        select subject_type, subject_id, level
        from learning_object_grants
        where object_id = ${objectId} and subject_type in ('profile', 'role')
        order by subject_type, subject_id`);
      return (rows as unknown as Row[]).map((r) => ({
        subjectType: r.subject_type as "profile" | "role",
        subjectId: r.subject_id as string,
        level: r.level as "view" | "edit",
      }));
    });
  } catch (e) {
    if (_missingPersonalTier(e)) return [];
    throw e;
  }
}

/**
 * The level this viewer holds on this object through a grant, or null.
 *
 * Highest wins: someone invited by name as a viewer and by role as an editor edits.
 * A narrower personal grant silently overriding a broader role grant would be a
 * demotion nobody performed.
 */
export async function learningGrantLevelFor(
  objectId: string,
  viewer: LearningViewer,
): Promise<"view" | "edit" | null> {
  const roles = viewer.roleIds?.length ? [...new Set(viewer.roleIds)] : [];
  try {
    return await asPrivileged(async (tx) => {
      const roleArm = roles.length
        ? sql`or (subject_type = 'role' and subject_id in (${sql.join(roles.map((r) => sql`${r}`), sql`, `)}))`
        : sql``;
      const rows = await tx.execute(sql`
        select level from learning_object_grants
        where object_id = ${objectId}
          and ((subject_type = 'profile' and subject_id = ${viewer.profileId}) ${roleArm})`);
      const levels = (rows as unknown as Row[]).map((r) => r.level as string);
      if (levels.includes("edit")) return "edit";
      return levels.includes("view") ? "view" : null;
    });
  } catch (e) {
    if (_missingPersonalTier(e)) return null;
    throw e;
  }
}

/** Invite a subject, or change the level they already hold. */
export async function setLearningObjectGrant(
  objectId: string,
  grant: LearningGrant,
  grantedBy: string | null,
): Promise<void> {
  await asPrivileged(async (tx) => {
    await tx.execute(sql`
      insert into learning_object_grants (object_id, subject_type, subject_id, level, granted_by)
      values (${objectId}, ${grant.subjectType}, ${grant.subjectId}, ${grant.level}, ${grantedBy}::uuid)
      on conflict (object_id, subject_type, subject_id)
      do update set level = excluded.level, granted_by = excluded.granted_by, created_at = now()`);
  });
}

/** Withdraw a share. Idempotent — removing a grant nobody holds is the state asked for. */
export async function removeLearningObjectGrant(
  objectId: string,
  subjectType: "profile" | "role",
  subjectId: string,
): Promise<void> {
  try {
    await asPrivileged(async (tx) => {
      await tx.execute(sql`
        delete from learning_object_grants
        where object_id = ${objectId} and subject_type = ${subjectType} and subject_id = ${subjectId}`);
    });
  } catch (e) {
    if (!_missingPersonalTier(e)) throw e;
  }
}

/**
 * Turn a public link on or off. Org-scoped on purpose — only someone who can see
 * the object in their own org may publish it.
 *
 * Returns false when the object is not this org's, so the route can 404 instead
 * of silently doing nothing.
 */
export async function setLearningObjectShared(
  orgId: string,
  id: string,
  shared: boolean,
): Promise<boolean> {
  // Same tolerance as the read, but LOUD: an author who clicks share must not be
  // told it worked when the column is missing, so this rethrows as a clear error
  // the route turns into a 503 rather than a silent success.
  try {
    return await _setLearningObjectShared(orgId, id, shared);
  } catch (e) {
    if (_isUndefinedColumn(e)) {
      throw new Error("share-unavailable: learning_objects.shared_at missing (run migrations)");
    }
    throw e;
  }
}

async function _setLearningObjectShared(
  orgId: string,
  id: string,
  shared: boolean,
): Promise<boolean> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      update learning_objects
      set shared_at = ${shared ? sql`now()` : sql`null`}, updated_at = now()
      where organization_id = ${orgId} and id = ${id}
      returning id`);
    return (rows as unknown as Row[]).length > 0;
  });
}

// ── Per-CLUB shares — the same grants table, subject_type 'club' (0008) ──────
//
// Three words that all mean "shared" live near each other; keep them apart:
//   • learning_objects.shared_at — the anonymous /o/<id> capability link.
//   • a 'profile' or 'role' grant — the personal tier, above.
//   • a 'club' grant — this: a content manager handing one object to a club.
// Route names carry the distinction too (/share vs /shares).

/** Is this object the caller's org's? learning_object_grants carries no
 *  organization_id — the object it points at is the only org anchor — so every
 *  club write checks the object first rather than trusting the caller's id. */
async function _objectInOrg(tx: Tx, orgId: string, objectId: string): Promise<boolean> {
  const rows = await tx.execute(sql`
    select 1 from learning_objects
    where organization_id = ${orgId} and id = ${objectId} limit 1`);
  return (rows as unknown as Row[]).length > 0;
}

/**
 * The clubs one object is currently granted to.
 *
 * THROWS when the table is missing, where the personal-tier reads return []. The
 * difference is what the caller does next: those render a list, this one backs a
 * picker whose save writes the whole set, so a swallowed error would read as
 * "granted to nobody" and then revoke everything.
 */
export async function listLearningObjectClubShares(orgId: string, objectId: string): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select g.subject_id as club_program_id, g.level, g.created_at::text as granted_at
      from learning_object_grants g
      join learning_objects o on o.id = g.object_id
      where g.object_id = ${objectId} and g.subject_type = 'club'
        and o.organization_id = ${orgId}
      order by g.created_at asc`);
    return rows as unknown as Row[];
  });
}

/**
 * Reconcile one object's CLUB grants to exactly `clubProgramIds`.
 *
 * A whole-set write rather than add/remove calls, because the picker is a
 * checklist: the client knows the state it wants, and sending it entire removes
 * the read-modify-write race where two managers each toggle one club and the
 * second save resurrects what the first revoked.
 *
 * Only 'club' rows are touched. A profile or role grant on the same object is
 * somebody else's decision and survives untouched — which is the reason the
 * delete carries `subject_type = 'club'` rather than just the object id.
 *
 * Returns false when the object is not this org's, so the route can 404 rather
 * than silently writing nothing.
 */
export async function setLearningObjectClubShares(
  orgId: string,
  objectId: string,
  clubProgramIds: string[],
  grantedBy: string | null,
): Promise<boolean> {
  const ids = [...new Set(clubProgramIds.filter(Boolean))];
  return asPrivileged(async (tx) => {
    if (!(await _objectInOrg(tx, orgId, objectId))) return false;
    // Revocations first, inside the one transaction, so a shrinking set never
    // momentarily holds both old and new rows.
    if (ids.length) {
      await tx.execute(sql`
        delete from learning_object_grants
        where object_id = ${objectId} and subject_type = 'club'
          and subject_id not in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
      await tx.execute(sql`
        insert into learning_object_grants (object_id, subject_type, subject_id, level, granted_by)
        values ${sql.join(
          ids.map((i) => sql`(${objectId}, 'club', ${i}, 'view', ${grantedBy}::uuid)`),
          sql`, `,
        )}
        on conflict (object_id, subject_type, subject_id)
        do update set level = excluded.level, granted_by = excluded.granted_by, created_at = now()`);
    } else {
      await tx.execute(sql`
        delete from learning_object_grants
        where object_id = ${objectId} and subject_type = 'club'`);
    }
    return true;
  });
}

/**
 * Every grant on a SET of objects — the library screen's share state in one query.
 *
 * The console renders a folder tree where each row shows who it reaches, so the
 * alternative is a request per object and a waterfall the length of the library.
 * Club and person grants come back together; the caller splits them by subject_type.
 */
export async function listLearningGrantsForObjects(
  orgId: string,
  objectIds: string[],
): Promise<Row[]> {
  if (!objectIds.length) return [];
  try {
    return await asPrivileged(async (tx) => {
      const rows = await tx.execute(sql`
        select g.object_id, g.subject_type, g.subject_id, g.level
        from learning_object_grants g
        join learning_objects o on o.id = g.object_id
        where o.organization_id = ${orgId}
          and g.subject_type in ('club', 'profile', 'app')
          and g.object_id in (${sql.join(objectIds.map((i) => sql`${i}`), sql`, `)})`);
      return rows as unknown as Row[];
    });
  } catch (e) {
    // A library that renders without its share badges beats one that does not
    // render. The WRITE path still refuses loudly when the table is missing.
    if (_isUndefinedRelation(e)) return [];
    throw e;
  }
}

/** App targets across a set of objects, for the same reason as the grants above. */
export async function listLearningAppTargetsForObjects(
  orgId: string,
  objectIds: string[],
): Promise<Row[]> {
  if (!objectIds.length) return [];
  try {
    return await asPrivileged(async (tx) => {
      const rows = await tx.execute(sql`
        select object_id, app_key, club_program_id::text as club_program_id,
               published_at::text as published_at
        from learning_object_app_targets
        where organization_id = ${orgId}
          and object_id in (${sql.join(objectIds.map((i) => sql`${i}`), sql`, `)})`);
      return rows as unknown as Row[];
    });
  } catch (e) {
    if (_isUndefinedRelation(e)) return [];
    throw e;
  }
}

/**
 * Reconcile CLUB and PERSON grants across many objects at once.
 *
 * "Share this folder" is one gesture over many rows, and it has to be one
 * transaction: a partial apply would leave a folder half-shared with nothing on
 * screen saying which half. Sharing a folder to a club and then discovering three
 * of its twelve items never went is worse than a failure that says so.
 *
 * Both subject types move together because the picker sets them together — a
 * dialog that lists clubs and people and then writes them in two round trips can
 * half-succeed in a way the UI cannot represent.
 *
 * ROLE grants are untouched. They belong to the personal tier's own UI, and a
 * bulk club/person write has no business dropping someone else's role share.
 *
 * Returns the ids it actually wrote — objects outside the caller's org are
 * dropped rather than failing the batch, so one stale id in a long selection
 * cannot cost the whole gesture. The route reports the difference.
 */
export async function setLearningGrantsBulk(
  orgId: string,
  objectIds: string[],
  /**
   * Which kinds to reconcile. A kind left UNDEFINED is not touched at all.
   *
   * This is not a convenience — it is the difference between a partial-authority
   * caller editing their own kind and wiping someone else's. A role holding only
   * share_club sends no app list; if that read as "no apps", their club edit would
   * silently revoke every app grant the content manager had made. Empty array
   * means "none of this kind"; absent means "not mine to say".
   */
  spec: { clubs?: string[]; profiles?: string[]; apps?: string[] },
  grantedBy: string | null,
): Promise<string[]> {
  const ids = [...new Set(objectIds.filter(Boolean))];
  if (!ids.length) return [];

  // Kind → the subject_type it writes. Only the kinds present are reconciled.
  const kinds: { type: "club" | "profile" | "app"; wanted: string[] }[] = [];
  if (spec.clubs !== undefined) kinds.push({ type: "club", wanted: [...new Set(spec.clubs.filter(Boolean))] });
  if (spec.profiles !== undefined) kinds.push({ type: "profile", wanted: [...new Set(spec.profiles.filter(Boolean))] });
  if (spec.apps !== undefined) kinds.push({ type: "app", wanted: [...new Set(spec.apps.filter(Boolean))] });
  if (!kinds.length) return [];

  try {
    return await asPrivileged(async (tx) => {
    // Org check as a set operation, not a loop: one query establishes which of
    // these ids are ours, and everything below works from that list.
    const owned = (await tx.execute(sql`
      select id from learning_objects
      where organization_id = ${orgId}
        and id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)) as unknown as Row[];
    const mine = owned.map((r) => String(r.id));
    if (!mine.length) return [];
    const inMine = sql.join(mine.map((i) => sql`${i}`), sql`, `);

    for (const { type, wanted } of kinds) {
      // Revocations first, so a shrinking set never momentarily holds both. Bounded
      // to this subject_type — a role grant belongs to the personal tier's own UI
      // and is never touched here.
      if (wanted.length) {
        await tx.execute(sql`
          delete from learning_object_grants
          where object_id in (${inMine}) and subject_type = ${type}
            and subject_id not in (${sql.join(wanted.map((w) => sql`${w}`), sql`, `)})`);
        await tx.execute(sql`
          insert into learning_object_grants (object_id, subject_type, subject_id, level, granted_by)
          values ${sql.join(
            mine.flatMap((oid) =>
              wanted.map((w) => sql`(${oid}, ${type}, ${w}, 'view', ${grantedBy}::uuid)`),
            ),
            sql`, `,
          )}
          on conflict (object_id, subject_type, subject_id)
          do update set level = excluded.level, granted_by = excluded.granted_by, created_at = now()`);
      } else {
        await tx.execute(sql`
          delete from learning_object_grants
          where object_id in (${inMine}) and subject_type = ${type}`);
        }
      }
      return mine;
    });
  } catch (e) {
    if (_isCheckViolation(e)) {
      throw new Error(
        "grants-subject-unavailable: this database does not accept that kind of grant yet (run migrations)",
      );
    }
    if (_isUndefinedRelation(e)) {
      throw new Error("shares-unavailable: learning_object_grants missing (run migrations)");
    }
    throw e;
  }
}

// ── App targets (learning_object_app_targets, 0007) ─────────────────────────

/** The apps one object is published to. */
export async function listLearningObjectAppTargets(orgId: string, objectId: string): Promise<Row[]> {
  try {
    return await asPrivileged(async (tx) => {
      const rows = await tx.execute(sql`
        select app_key, published_at::text as published_at, published_by
        from learning_object_app_targets
        where organization_id = ${orgId} and object_id = ${objectId}
        order by app_key asc`);
      return rows as unknown as Row[];
    });
  } catch (e) {
    if (_isUndefinedRelation(e)) return [];
    throw e;
  }
}

/**
 * Stamp an object as published to these apps.
 *
 * Additive like the shares, but for a different reason: publishing to app B does
 * not un-publish from app A, because the two are separate acts by separate
 * people. Clearing a target is an explicit empty-set PUT, not a side effect of
 * publishing somewhere else.
 */
/**
 * The sentinel 0010's unique index coalesces a NULL club_program_id to, so
 * "published to the whole app" stays a single row rather than one per insert.
 *
 * Module-level because BOTH writers need it and they must agree: it lived inside
 * the bulk function while the per-object writer named a narrower conflict target,
 * which is exactly how the two drifted apart and left one of them raising 42P10.
 */
const NO_CLUB = "00000000-0000-0000-0000-000000000000";

export async function setLearningObjectAppTargets(
  orgId: string,
  objectId: string,
  appKeys: string[],
  publishedBy: string | null,
): Promise<boolean> {
  const keys = [...new Set(appKeys.filter(Boolean))];
  try {
    return await asPrivileged(async (tx) => {
      if (!(await _objectInOrg(tx, orgId, objectId))) return false;
      // Reconcile, like the shares: the caller sends the set it wants. Returning
      // early on an empty list made "untick every app and save" answer {ok:true}
      // and change nothing — the modal then re-opened with the app still ticked,
      // which is the worst kind of failure: a success message and no effect.
      if (keys.length) {
        await tx.execute(sql`
          delete from learning_object_app_targets
          where organization_id = ${orgId} and object_id = ${objectId}
            and app_key not in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`);
        // THE CONFLICT TARGET MUST MATCH THE INDEX, and 0010 widened it. When
        // club_program_id arrived, the unique index became
        // (object_id, app_key, coalesce(club_program_id, sentinel)); this insert
        // kept naming (object_id, app_key), which matches no constraint, so
        // Postgres raised 42P10 and every whole-app publish through this endpoint
        // answered 500. The bulk writer was updated then and this one was not.
        //
        // NULL club_program_id is written explicitly: "the whole app" is a real
        // scope, and the sentinel in the index is what keeps it a single row.
        await tx.execute(sql`
          insert into learning_object_app_targets
            (organization_id, object_id, app_key, club_program_id, published_at, published_by)
          values ${sql.join(
            keys.map(
              (k) => sql`(${orgId}::uuid, ${objectId}, ${k}, null::uuid, now(), ${publishedBy})`,
            ),
            sql`, `,
          )}
          on conflict (object_id, app_key, coalesce(club_program_id, ${NO_CLUB}::uuid))
          do update set published_at = now(), published_by = excluded.published_by`);
      } else {
        await tx.execute(sql`
          delete from learning_object_app_targets
          where organization_id = ${orgId} and object_id = ${objectId}`);
      }
      return true;
    });
  } catch (e) {
    if (_isUndefinedRelation(e)) {
      throw new Error("app-targets-unavailable: learning_object_app_targets missing (run migrations)");
    }
    throw e;
  }
}

/**
 * Publish many objects to a set of apps in one transaction — the folder-level
 * and multi-select version of the call above, and the same all-or-nothing rule.
 *
 * Returns the ids actually written; ids outside the caller's org are dropped
 * rather than failing the batch.
 */
export async function setLearningAppTargetsBulk(
  orgId: string,
  objectIds: string[],
  appKeys: string[],
  publishedBy: string | null,
  /**
   * Which club sees this on the app. null = the whole app.
   *
   * SCOPED WRITES ONLY TOUCH THEIR OWN SCOPE. Publishing for one club must not
   * disturb the whole-app row or another club's, or an app administrator adding
   * Highbury would silently unpublish everyone else. So the reconcile below is
   * bounded by the scope it was given.
   */
  clubProgramId: string | null = null,
): Promise<string[]> {
  const ids = [...new Set(objectIds.filter(Boolean))];
  if (!ids.length) return [];
  const keys = [...new Set(appKeys.filter(Boolean))];
  // The sentinel the unique index coalesces to, so "whole app" is one row.

  const scope = clubProgramId ?? null;
  const scopeMatch = scope
    ? sql`and club_program_id = ${scope}::uuid`
    : sql`and club_program_id is null`;

  try {
    return await asPrivileged(async (tx) => {
      const owned = (await tx.execute(sql`
        select id from learning_objects
        where organization_id = ${orgId}
          and id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)) as unknown as Row[];
      const mine = owned.map((r) => String(r.id));
      if (!mine.length) return [];
      const inMine = sql.join(mine.map((i) => sql`${i}`), sql`, `);

      if (keys.length) {
        await tx.execute(sql`
          delete from learning_object_app_targets
          where organization_id = ${orgId} and object_id in (${inMine})
            ${scopeMatch}
            and app_key not in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`);
        await tx.execute(sql`
          insert into learning_object_app_targets
            (organization_id, object_id, app_key, club_program_id, published_at, published_by)
          values ${sql.join(
            mine.flatMap((oid) =>
              keys.map(
                (k) =>
                  sql`(${orgId}::uuid, ${oid}, ${k}, ${scope}::uuid, now(), ${publishedBy})`,
              ),
            ),
            sql`, `,
          )}
          on conflict (object_id, app_key, coalesce(club_program_id, ${NO_CLUB}::uuid))
          do update set published_at = now(), published_by = excluded.published_by`);
      } else {
        await tx.execute(sql`
          delete from learning_object_app_targets
          where organization_id = ${orgId} and object_id in (${inMine}) ${scopeMatch}`);
      }
      return mine;
    });
  } catch (e) {
    if (_isUndefinedRelation(e)) {
      throw new Error("app-targets-unavailable: learning_object_app_targets missing (run migrations)");
    }
    throw e;
  }
}

/**
 * Insert-or-update one learning object, always stamped to the caller's org.
 *
 * Returns FALSE when nothing was written — the row exists but belongs to another
 * org or another program. It used to return void, so a refused write reported
 * success and the route answered `{ok:true}`: an author could be told "saved"
 * while the update matched zero rows. That is how someone loses an afternoon.
 *
 * A row's program is STICKY. Content is club-scoped, so if this could re-stamp
 * `program_id` then a club member opening a parent-program object and autosaving
 * it would move that object into their club — out of the parent's library and out
 * of every sibling club's. `coalesce(existing, excluded)` lets a NULL row be
 * healed by its first stamp while making a *move* impossible.
 *
 * Ownership is likewise not rewritten on update. It was `owner_id =
 * excluded.owner_id` from the client payload, so whoever saved last owned the
 * object — which quietly breaks the Studio's "only content you created can be
 * deleted" rule for the original author.
 */
export async function upsertLearningObject(
  orgId: string,
  r: Row,
  programId?: string | null,
  author?: LearningAuthor | null,
): Promise<boolean> {
  // An UNKNOWN scope narrows nothing: with no program resolved, fall back to the
  // org guard alone, exactly as before. Only a caller that knows its program gets
  // the program predicate.
  //
  // The NULL arm is load-bearing and was verified the hard way — with `is not
  // distinct from` instead, a legacy row whose program_id is null matches nothing,
  // so the `coalesce` healing below never fires AND every pre-program object
  // becomes unsaveable: its author gets a 409 on content that works today. Here an
  // unclaimed row may be adopted (it is invisible to every program-scoped read
  // until it is, so nobody loses access), while a row that already belongs to a
  // program matches only its own program and therefore can never be moved.
  const programGuard = programId
    ? sql`and (learning_objects.program_id is null or learning_objects.program_id = ${programId})`
    : sql``;
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      insert into learning_objects
        (id, organization_id, program_id, type, title, owner_id, owner_name, status, scope,
         reuse_count, description, estimated_time, blocks, tags, source_ids, pipeline_draft,
         created_at, updated_at)
      values (
        ${r.id}, ${orgId}, ${programId ?? (r.program_id as string) ?? null}, ${r.type}, ${r.title ?? ""},
        ${author?.ownerId ?? (r.owner_id as string | null) ?? null},
        ${author ? (author.ownerName ?? null) : ((r.owner_name as string | null) ?? null)},
        ${r.status ?? "draft"}, ${r.scope ?? "bridge"},
        ${r.reuse_count ?? 0}, ${r.description ?? ""}, ${r.estimated_time ?? ""},
        ${JSON.stringify(r.blocks ?? [])}::jsonb, ${JSON.stringify(r.tags ?? [])}::jsonb,
        ${JSON.stringify(r.source_ids ?? [])}::jsonb,
        ${r.pipeline_draft != null ? JSON.stringify(r.pipeline_draft) : null}::jsonb,
        coalesce(${r.created_at ?? null}::timestamptz, now()), now())
      on conflict (id) do update set
        -- Sticky: an existing program always wins, a null one gets healed. Never a move.
        program_id = coalesce(learning_objects.program_id, excluded.program_id),
        title = excluded.title, type = excluded.type,
        -- owner_id / owner_name deliberately absent: authorship is set once, on insert.
        status = excluded.status, scope = excluded.scope,
        reuse_count = excluded.reuse_count, description = excluded.description,
        estimated_time = excluded.estimated_time, blocks = excluded.blocks,
        tags = excluded.tags, source_ids = excluded.source_ids,
        pipeline_draft = excluded.pipeline_draft, updated_at = now()
      where learning_objects.organization_id = ${orgId}
        ${programGuard}
      returning id`);
    return (rows as unknown as Row[]).length > 0;
  });
}

// ── Publishing (moved off the Content Studio's own service-role server) ─────
// The Studio published straight to Supabase with the service-role key from an
// UNAUTHENTICATED route, stamping org and program from environment variables. So
// "which club owns this content" was answered by a deployment setting rather than
// by the person publishing, and anyone who could reach that server could publish,
// unpublish or delete anything. These are the session-scoped replacements.
//
// They are SIBLINGS of upsertLearningObject rather than options on it. That one is
// the AUTOSAVE writer, and the separation is load-bearing: autosave must remain
// structurally incapable of touching published_at/version_number, or a draft keystroke
// can reach readers. Two writers, two shapes, one doctrine — see the Studio's own
// note on why a draft backup is not a publish.

/** What the write path needs to know about an object before writing it. */
/**
 * Who the server says wrote this, when it is being created.
 *
 * `owner_id` used to be taken verbatim from the request body and never checked, so
 * a caller could claim any author it liked — which made every ownership rule built
 * on it decorative. It is now supplied by the route from the resolved session.
 *
 * INSERT ONLY, both here and in the publish path: the `on conflict` clauses already
 * omit owner_id deliberately, so authorship is set once and no existing row moves.
 */
export interface LearningAuthor {
  ownerId: string;
  ownerName?: string | null;
}

export async function probeLearningObject(
  orgId: string,
  id: string,
): Promise<{
  programId: string | null;
  published: boolean;
  ownerId: string | null;
  type: string | null;
  scopeLevel: string | null;
} | null> {
  // Org-scoped on purpose. A cross-org id collision reports "not here", the write
  // is then attempted as an insert, and the conflict guard refuses it — so the
  // caller learns nothing about other orgs' ids from this probe.
  return asPrivileged(async (tx) => {
    // scope_level via a to_jsonb probe rather than a bare column, so this one query
    // works either side of 0006 without a second round-trip — the write path calls
    // it before every mutation and cannot afford a fallback query each time.
    const rows = await tx.execute(sql`
      select program_id, owner_id, type, published_at,
             to_jsonb(learning_objects.*) ->> 'scope_level' as scope_level
      from learning_objects
      where organization_id = ${orgId} and id = ${id}
      limit 1`);
    const row = (rows as unknown as Row[])[0] as Row | undefined;
    if (!row) return null;
    return {
      programId: (row.program_id as string | null) ?? null,
      published: row.published_at != null,
      ownerId: (row.owner_id as string | null) ?? null,
      type: (row.type as string | null) ?? null,
      scopeLevel: (row.scope_level as string | null) ?? null,
    };
  });
}

/**
 * Publish (or re-save) an object, including the columns autosave must not touch.
 *
 * `publish` stamps published_at — that is what makes it visible to reader apps.
 * `share` sets shared_at, and never clears it: a link already handed out keeps
 * working, which is the same reasoning the Studio's own path used.
 *
 * Returns false when the row belongs to another org or another program; the route
 * turns that into 409 rather than a silent success.
 */
export async function publishLearningObject(
  orgId: string,
  programId: string | null | undefined,
  r: Row,
  opts: { publish: boolean; share: boolean },
  author?: LearningAuthor | null,
): Promise<boolean> {
  try {
    return await _publishLearningObject(orgId, programId, r, opts, author);
  } catch (e) {
    if (_isUndefinedColumn(e)) {
      // LOUD, like the share toggle: someone clicking Publish must never be told it
      // worked when the column that makes it visible does not exist.
      throw new Error(
        "publish-unavailable: learning_objects is missing collection_*/version_number/published_at/shared_at (run migrations)",
      );
    }
    throw e;
  }
}

async function _publishLearningObject(
  orgId: string,
  programId: string | null | undefined,
  r: Row,
  opts: { publish: boolean; share: boolean },
  author?: LearningAuthor | null,
): Promise<boolean> {
  // Same guard as upsertLearningObject, for the same reasons: an unclaimed row may
  // be adopted, a row that belongs to a program can never be moved out of it.
  const programGuard = programId
    ? sql`and (learning_objects.program_id is null or learning_objects.program_id = ${programId})`
    : sql``;
  const pubInsert = opts.publish ? sql`, ${r.version_number ?? null}, now()` : sql`, null, null`;
  const pubUpdate = opts.publish
    ? sql`, version_number = excluded.version_number, published_at = now()`
    : sql``;
  const shareInsert = opts.share ? sql`, now()` : sql`, null`;
  // coalesce so an existing share survives a later publish that did not ask to share.
  const shareUpdate = opts.share
    ? sql`, shared_at = coalesce(learning_objects.shared_at, now())`
    : sql``;

  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      insert into learning_objects
        (id, organization_id, program_id, type, title, owner_id, owner_name, status, scope,
         reuse_count, description, estimated_time, blocks, tags, source_ids, pipeline_draft,
         collection_ids, collection_names, created_at, updated_at, version_number, published_at,
         shared_at)
      values (
        ${r.id}, ${orgId}, ${programId ?? (r.program_id as string) ?? null}, ${r.type},
        ${r.title ?? ""},
        ${author?.ownerId ?? (r.owner_id as string | null) ?? null},
        ${author ? (author.ownerName ?? null) : ((r.owner_name as string | null) ?? null)},
        ${r.status ?? "in-review"}, ${r.scope ?? "bridge"}, ${r.reuse_count ?? 0},
        ${r.description ?? ""}, ${r.estimated_time ?? ""},
        ${JSON.stringify(r.blocks ?? [])}::jsonb, ${JSON.stringify(r.tags ?? [])}::jsonb,
        ${JSON.stringify(r.source_ids ?? [])}::jsonb,
        ${r.pipeline_draft != null ? JSON.stringify(r.pipeline_draft) : null}::jsonb,
        ${JSON.stringify(r.collection_ids ?? [])}::jsonb,
        ${JSON.stringify(r.collection_names ?? [])}::jsonb,
        coalesce(${r.created_at ?? null}::timestamptz, now()), now() ${pubInsert} ${shareInsert})
      on conflict (id) do update set
        program_id = coalesce(learning_objects.program_id, excluded.program_id),
        title = excluded.title, type = excluded.type,
        status = excluded.status, scope = excluded.scope,
        reuse_count = excluded.reuse_count, description = excluded.description,
        estimated_time = excluded.estimated_time, blocks = excluded.blocks,
        tags = excluded.tags, source_ids = excluded.source_ids,
        pipeline_draft = excluded.pipeline_draft,
        -- PRESERVE PROGRAM-LIBRARY FOLDERS. This save carries the AUTHOR'S OWN
        -- folder ids from their browser; the 'lcol-' ids belong to the program
        -- library and to a different endpoint entirely. Replacing the whole array
        -- meant an autosave 2.5s after a mentor filed a tutorial into a shared
        -- folder silently took it back out. See 0012's "TWO WRITERS" note.
        collection_ids = learning_apply_studio_folders(
          learning_objects.collection_ids, excluded.collection_ids, excluded.collection_names) -> 'ids',
        collection_names = learning_apply_studio_folders(
          learning_objects.collection_ids, excluded.collection_ids, excluded.collection_names) -> 'names',
        updated_at = now() ${pubUpdate} ${shareUpdate}
      where learning_objects.organization_id = ${orgId}
        ${programGuard}
      returning id`);
    return (rows as unknown as Row[]).length > 0;
  });
}

/**
 * The draft backup: pipeline state and folder membership, nothing else.
 *
 * This is what autosave does to an ALREADY PUBLISHED object. Writing status or
 * blocks here would push work-in-progress to everyone reading the published
 * version, which is the whole reason the two paths are separate.
 */
export async function backupLearningObjectDraft(
  orgId: string,
  programId: string | null | undefined,
  id: string,
  r: Row,
): Promise<boolean> {
  const programGuard = programId
    ? sql`and (program_id is null or program_id = ${programId})`
    : sql``;
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      update learning_objects
      set pipeline_draft = ${r.pipeline_draft != null ? JSON.stringify(r.pipeline_draft) : null}::jsonb,
          -- THE SAME MERGE THE PUBLISH UPSERT USES, and this is the path that
          -- actually runs on every autosave.
          --
          -- It replaced the array wholesale, so a tutorial filed into a PROGRAM
          -- folder was pulled straight back out and re-filed into whichever local
          -- folder the Studio files that type into (bb-tutorials for tutorials).
          -- Editing the pipeline and saving therefore moved the object, silently,
          -- every single time. Two writers, one column, and only one of them had
          -- been taught the rule (0012's "TWO WRITERS" note) -- the sibling upsert
          -- was fixed and this one was missed.
          collection_ids = learning_apply_studio_folders(
            collection_ids,
            ${JSON.stringify(r.collection_ids ?? [])}::jsonb,
            ${JSON.stringify(r.collection_names ?? [])}::jsonb) -> 'ids',
          collection_names = learning_apply_studio_folders(
            collection_ids,
            ${JSON.stringify(r.collection_ids ?? [])}::jsonb,
            ${JSON.stringify(r.collection_names ?? [])}::jsonb) -> 'names',
          updated_at = now()
      where organization_id = ${orgId} and id = ${id}
        ${programGuard}
      returning id`);
    return (rows as unknown as Row[]).length > 0;
  });
}

/** Withdraw from reader apps, keeping the content and its backup. */
export async function unpublishLearningObject(
  orgId: string,
  programId: string | null | undefined,
  id: string,
): Promise<boolean> {
  const programGuard = programId
    ? sql`and (program_id is null or program_id = ${programId})`
    : sql``;
  // shared_at goes too. Withdrawing content while leaving the public link live is
  // the opposite of what the word means: /o/<id> serves anything with a shared_at
  // stamp, with no session and no reference to published_at, so an unpublish that
  // spared it left the withdrawn content readable by anyone holding the URL.
  //
  // Tolerant of the column being absent (0002 not yet applied), because the
  // unpublish itself must still work — an author withdrawing content on a database
  // that has no share feature has nothing to withdraw from.
  const clearShare = sql`, shared_at = null`;
  const run = (withShare: boolean) =>
    asPrivileged(async (tx) => {
      const rows = await tx.execute(sql`
        update learning_objects
        set published_at = null, version_number = null, status = 'draft', updated_at = now()
            ${withShare ? clearShare : sql``}
        where organization_id = ${orgId} and id = ${id}
          ${programGuard}
        returning id`);
      return (rows as unknown as Row[]).length > 0;
    });
  try {
    return await run(true);
  } catch (e) {
    if (!_isUndefinedColumn(e)) throw e;
    return run(false);
  }
}

/** Remove content from the shared store for good. */
export async function deleteLearningObject(
  orgId: string,
  programId: string | null | undefined,
  id: string,
): Promise<boolean> {
  const programGuard = programId
    ? sql`and (program_id is null or program_id = ${programId})`
    : sql``;
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      delete from learning_objects
      where organization_id = ${orgId} and id = ${id}
        ${programGuard}
      returning id`);
    return (rows as unknown as Row[]).length > 0;
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

// ── Library assets (learning_assets, 0011) ──────────────────────────────────
//
// Files nobody authored: a handout, an image, a recording. Their own table
// because a file has no blocks, no versions and no publish pipeline, and putting
// an unknown `type` into learning_objects would put it in front of every reader
// that switches on type — including the Bridge Bird app.

/** One asset as the library screen wants it. */
export async function listLearningAssets(
  orgId: string,
  programId: string | null | undefined,
): Promise<Row[]> {
  try {
    return await asPrivileged(async (tx) => {
      // Unpinned rows count as this program's, the same accommodation
      // _programScope makes for content authored before program_id existed.
      const scope = programId
        ? sql`and (program_id = ${programId}::uuid or program_id is null)`
        : sql``;
      const rows = await tx.execute(sql`
        select id, title, kind, content_type, byte_size, storage_key, external_url,
               coalesce(collection_ids, '[]'::jsonb)   as collection_ids,
               coalesce(collection_names, '[]'::jsonb) as collection_names,
               created_at::text as created_at
        from learning_assets
        where organization_id = ${orgId} ${scope}
        order by created_at desc`);
      return rows as unknown as Row[];
    });
  } catch (e) {
    // A library that renders without its files beats one that does not render.
    // The WRITE path still refuses loudly when the table is missing.
    if (_isUndefinedRelation(e)) return [];
    throw e;
  }
}

export async function createLearningAsset(
  orgId: string,
  programId: string | null,
  asset: {
    id: string;
    title: string;
    kind: string;
    contentType: string | null;
    byteSize: number | null;
    storageKey: string | null;
    externalUrl: string | null;
    collectionIds: string[];
    collectionNames: string[];
    uploadedBy: string | null;
  },
): Promise<Row | null> {
  try {
    return await asPrivileged(async (tx) => {
      const rows = await tx.execute(sql`
        insert into learning_assets
          (id, organization_id, program_id, title, kind, content_type, byte_size,
           storage_key, external_url, collection_ids, collection_names, uploaded_by)
        values (
          ${asset.id}, ${orgId}::uuid, ${programId}::uuid, ${asset.title}, ${asset.kind},
          ${asset.contentType}, ${asset.byteSize}, ${asset.storageKey}, ${asset.externalUrl},
          ${JSON.stringify(asset.collectionIds)}::jsonb,
          ${JSON.stringify(asset.collectionNames)}::jsonb,
          ${asset.uploadedBy}::uuid
        )
        returning id, title, kind, external_url, storage_key`);
      return ((rows as unknown as Row[])[0] as Row | undefined) ?? null;
    });
  } catch (e) {
    if (_isUndefinedRelation(e)) {
      throw new Error("assets-unavailable: learning_assets missing (run migrations)");
    }
    throw e;
  }
}

/**
 * Re-file an asset. Whole-set, like every other reconcile in this file: the
 * picker knows the folders it wants and sending them entire removes the
 * read-modify-write race between two managers each toggling one.
 *
 * Returns false when the asset is not this org's, so the route can 404 rather
 * than silently writing nothing.
 */
export async function setLearningAssetFolders(
  orgId: string,
  assetId: string,
  collectionIds: string[],
  collectionNames: string[],
): Promise<boolean> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      update learning_assets
      set collection_ids = ${JSON.stringify(collectionIds)}::jsonb,
          collection_names = ${JSON.stringify(collectionNames)}::jsonb,
          updated_at = now()
      where organization_id = ${orgId} and id = ${assetId}
      returning id`);
    return (rows as unknown as Row[]).length > 0;
  });
}

/** The row, so a caller can clean up the stored bytes before dropping it. */
export async function getLearningAsset(orgId: string, assetId: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select id, title, kind, storage_key, external_url
      from learning_assets
      where organization_id = ${orgId} and id = ${assetId}
      limit 1`);
    return ((rows as unknown as Row[])[0] as Row | undefined) ?? null;
  });
}

export async function deleteLearningAsset(orgId: string, assetId: string): Promise<boolean> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      delete from learning_assets
      where organization_id = ${orgId} and id = ${assetId}
      returning id`);
    return (rows as unknown as Row[]).length > 0;
  });
}

// ── Content Library folders (0012) ──────────────────────────────────────────
//
// Before 0012 a folder was a string carried on whatever content happened to be
// filed in it, so an empty folder did not exist, two authors had two trees, and
// nothing could be shared as a folder. These functions are the shared tree.
//
// One rule runs through all of them: a grant names ONE folder and means its whole
// SUBTREE. Nothing here ever copies a grant down into children — the walk happens
// at read time (collectionSubtreeIds), so adding a fifth subfolder tomorrow cannot
// leave yesterday's grant describing four.

/** Every folder in this program's library. The caller assembles the tree. */
export async function listLearningCollections(
  orgId: string,
  programId: string | null,
): Promise<Row[]> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select id, name, parent_id, created_by, created_at
      from learning_collections
      where organization_id = ${orgId}::uuid
        and program_id is not distinct from ${programId}::uuid
      order by lower(btrim(name))`);
    return rows as unknown as Row[];
  });
}

export async function getLearningCollection(orgId: string, id: string): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select id, name, parent_id, program_id, created_by
      from learning_collections
      where organization_id = ${orgId}::uuid and id = ${id}
      limit 1`);
    return ((rows as unknown as Row[])[0] as Row | undefined) ?? null;
  });
}

/**
 * Create a folder, optionally inside another.
 *
 * The parent is verified to be in the SAME org and program before the insert, not
 * trusted from the body. Without that check a caller could pass any folder id as
 * `parent_id` and graft a subtree of their own into someone else's library — the
 * unique-sibling index would not stop it, because a name unique under a foreign
 * parent is still unique.
 *
 * Returns null when the parent is not ours; throws HttpError(409) when a sibling
 * of that name already exists, because "New folder" clicked twice is a duplicate
 * request, not a new folder.
 */
export async function createLearningCollection(
  orgId: string,
  programId: string | null,
  input: { id: string; name: string; parentId: string | null; createdBy: string | null },
): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    if (input.parentId) {
      const parent = (await tx.execute(sql`
        select id from learning_collections
        where organization_id = ${orgId}::uuid
          and id = ${input.parentId}
          and program_id is not distinct from ${programId}::uuid
        limit 1`)) as unknown as Row[];
      if (!parent.length) return null;
    }
    try {
      const rows = await tx.execute(sql`
        insert into learning_collections
          (id, organization_id, program_id, parent_id, name, created_by)
        values (
          ${input.id}, ${orgId}::uuid, ${programId}::uuid,
          ${input.parentId}, ${input.name}, ${input.createdBy}::uuid
        )
        returning id, name, parent_id, created_at`);
      return ((rows as unknown as Row[])[0] as Row | undefined) ?? null;
    } catch (e) {
      if (_isUniqueViolation(e)) {
        throw new HttpError(409, `A folder named "${input.name}" is already here`);
      }
      throw e;
    }
  });
}

export async function renameLearningCollection(
  orgId: string,
  id: string,
  name: string,
): Promise<Row | null> {
  return asPrivileged(async (tx) => {
    try {
      const rows = await tx.execute(sql`
        update learning_collections
        set name = ${name}, updated_at = now()
        where organization_id = ${orgId}::uuid and id = ${id}
        returning id, name, parent_id`);
      return ((rows as unknown as Row[])[0] as Row | undefined) ?? null;
    } catch (e) {
      if (_isUniqueViolation(e)) {
        throw new HttpError(409, `A folder named "${name}" is already here`);
      }
      throw e;
    }
  });
}

/**
 * Delete a folder and its descendants. CONTENT IS NOT DELETED.
 *
 * The cascade in 0012 removes child folders and the grant rows that named them.
 * Objects and assets keep their own rows and simply become unfiled — losing a
 * folder must never mean losing content, and this function is where somebody
 * would be tempted to make it mean that.
 */
export async function deleteLearningCollection(orgId: string, id: string): Promise<boolean> {
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      delete from learning_collections
      where organization_id = ${orgId}::uuid and id = ${id}
      returning id`);
    return (rows as unknown as Row[]).length > 0;
  });
}

/**
 * A folder plus every folder beneath it, at any depth.
 *
 * This is what makes "shared with me" mean the subtree. A recursive CTE rather
 * than repeated queries per level, and `cycle` detection because parent_id is a
 * plain self-reference: a row whose ancestor chain loops would otherwise spin
 * here forever. The tree cannot legally contain a cycle — the API refuses to
 * reparent a folder under its own descendant — but a read path must not depend on
 * a write path having been correct.
 */
export async function collectionSubtreeIds(orgId: string, rootIds: string[]): Promise<string[]> {
  const roots = [...new Set(rootIds.filter(Boolean))];
  if (!roots.length) return [];
  return asPrivileged(async (tx) => {
    const rows = (await tx.execute(sql`
      with recursive walk as (
        select id, array[id] as seen
        from learning_collections
        where organization_id = ${orgId}::uuid
          and id in (${sql.join(roots.map((r) => sql`${r}`), sql`, `)})
        union all
        select child.id, walk.seen || child.id
        from learning_collections child
        join walk on child.parent_id = walk.id
        where child.organization_id = ${orgId}::uuid
          and not child.id = any(walk.seen)
      )
      select distinct id from walk`)) as unknown as Row[];
    return rows.map((r) => String(r.id));
  });
}

/** Who these folders are shared with — the share sheet's read. */
export async function listCollectionGrants(
  orgId: string,
  collectionIds: string[],
): Promise<Row[]> {
  const ids = [...new Set(collectionIds.filter(Boolean))];
  if (!ids.length) return [];
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      select g.collection_id, g.subject_type, g.subject_id, g.level
      from learning_collection_grants g
      join learning_collections c on c.id = g.collection_id
      where c.organization_id = ${orgId}::uuid
        and g.collection_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
    return rows as unknown as Row[];
  });
}

/**
 * Reconcile who a folder is shared with, one kind at a time.
 *
 * Same contract as setLearningGrantsBulk, and for the same reason: a kind left
 * UNDEFINED is not touched. A role holding only share_club sends no people list;
 * if that read as "no people", their club edit would silently revoke every person
 * the content manager had invited. Empty array means "none of this kind"; absent
 * means "not mine to say".
 *
 * One transaction, revocations before insertions, so a shrinking set never
 * momentarily holds both.
 */
export async function setCollectionGrants(
  orgId: string,
  collectionId: string,
  spec: {
    clubs?: string[];
    profiles?: string[];
    apps?: string[];
    roles?: string[];
    /**
     * Per-subject access level, by subject id. Absent = 'view'.
     *
     * 'view' is REVIEW ACCESS — open the folder, read a piece of content and its
     * whole pipeline, change nothing. 'edit' additionally allows changing it.
     * Both are the same grant row with a different level, which is why sharing a
     * folder and granting edit on it are one gesture rather than two systems.
     */
    levels?: Record<string, "view" | "edit">;
  },
  grantedBy: string | null,
): Promise<boolean> {
  const levelOf = (id: string): "view" | "edit" => spec.levels?.[id] ?? "view";
  const kinds: { type: "club" | "profile" | "app" | "role"; wanted: string[] }[] = [];
  if (spec.clubs !== undefined) kinds.push({ type: "club", wanted: [...new Set(spec.clubs.filter(Boolean))] });
  if (spec.profiles !== undefined) kinds.push({ type: "profile", wanted: [...new Set(spec.profiles.filter(Boolean))] });
  if (spec.apps !== undefined) kinds.push({ type: "app", wanted: [...new Set(spec.apps.filter(Boolean))] });
  if (spec.roles !== undefined) kinds.push({ type: "role", wanted: [...new Set(spec.roles.filter(Boolean))] });
  if (!kinds.length) return false;

  return asPrivileged(async (tx) => {
    const owned = (await tx.execute(sql`
      select id from learning_collections
      where organization_id = ${orgId}::uuid and id = ${collectionId}
      limit 1`)) as unknown as Row[];
    if (!owned.length) return false;

    for (const { type, wanted } of kinds) {
      if (wanted.length) {
        await tx.execute(sql`
          delete from learning_collection_grants
          where collection_id = ${collectionId} and subject_type = ${type}
            and subject_id not in (${sql.join(wanted.map((w) => sql`${w}`), sql`, `)})`);
        await tx.execute(sql`
          insert into learning_collection_grants
            (collection_id, subject_type, subject_id, level, granted_by)
          values ${sql.join(
            wanted.map(
              (w) => sql`(${collectionId}, ${type}, ${w}, ${levelOf(w)}, ${grantedBy}::uuid)`,
            ),
            sql`, `,
          )}
          on conflict (collection_id, subject_type, subject_id)
          do update set level = excluded.level, granted_by = excluded.granted_by, created_at = now()`);
      } else {
        await tx.execute(sql`
          delete from learning_collection_grants
          where collection_id = ${collectionId} and subject_type = ${type}`);
      }
    }
    return true;
  });
}

/**
 * The folders shared with this viewer, as ROOTS (not yet expanded).
 *
 * Four ways a folder can reach someone, matching learning_object_grants' four
 * subject kinds: as themselves, through a club they belong to, through a learning
 * role they hold, or through an app they administer.
 *
 * Empty result is meaningful and must not be confused with "everything": the
 * caller decides what no grants means, and for a governing role it means the
 * whole library while for an invited viewer it means nothing. Deciding that here
 * would put the difference in the wrong place — see _libraryFolderScope.
 */
export async function grantedCollectionRootsFor(
  orgId: string,
  programId: string | null,
  viewer: {
    profileId?: string | null;
    clubIds?: readonly string[];
    roleIds?: readonly string[];
    appKeys?: readonly string[];
  },
): Promise<string[]> {
  const subjects: { type: string; id: string }[] = [];
  if (viewer.profileId) subjects.push({ type: "profile", id: viewer.profileId });
  for (const cid of viewer.clubIds ?? []) if (cid) subjects.push({ type: "club", id: cid });
  for (const rid of viewer.roleIds ?? []) if (rid) subjects.push({ type: "role", id: rid });
  for (const ak of viewer.appKeys ?? []) if (ak) subjects.push({ type: "app", id: ak });
  if (!subjects.length) return [];

  return asPrivileged(async (tx) => {
    const rows = (await tx.execute(sql`
      select distinct g.collection_id
      from learning_collection_grants g
      join learning_collections c on c.id = g.collection_id
      where c.organization_id = ${orgId}::uuid
        and c.program_id is not distinct from ${programId}::uuid
        and (${sql.join(
          subjects.map((s) => sql`(g.subject_type = ${s.type} and g.subject_id = ${s.id})`),
          sql` or `,
        )})`)) as unknown as Row[];
    return rows.map((r) => String(r.collection_id));
  });
}

/**
 * The folders this viewer may reach, each with the STRONGEST level they hold.
 *
 * Two things make this more than a lookup:
 *
 *   INHERITANCE. A grant names one folder and means its subtree, so a level on
 *   "Staging" applies to "Staging › tutorials" without a row of its own.
 *
 *   MULTIPLE ROUTES. The same person can reach one folder as themselves, through
 *   a club, and through a role, each at a different level. The strongest wins —
 *   the alternative is a person who was explicitly given edit access being held
 *   to view because a club grant happened to be read-only.
 *
 * Returns an empty map when nothing is granted. The caller decides what that
 * means; it is NOT "everything" (see _libraryFolderScope).
 */
export async function collectionLevelsFor(
  orgId: string,
  programId: string | null,
  viewer: {
    profileId?: string | null;
    clubIds?: readonly string[];
    roleIds?: readonly string[];
    appKeys?: readonly string[];
  },
): Promise<Map<string, "view" | "edit">> {
  const subjects: { type: string; id: string }[] = [];
  if (viewer.profileId) subjects.push({ type: "profile", id: viewer.profileId });
  for (const cid of viewer.clubIds ?? []) if (cid) subjects.push({ type: "club", id: cid });
  for (const rid of viewer.roleIds ?? []) if (rid) subjects.push({ type: "role", id: rid });
  for (const ak of viewer.appKeys ?? []) if (ak) subjects.push({ type: "app", id: ak });
  if (!subjects.length) return new Map();

  const rows = await asPrivileged(async (tx) => {
    return (await tx.execute(sql`
      select g.collection_id, g.level
      from learning_collection_grants g
      join learning_collections c on c.id = g.collection_id
      where c.organization_id = ${orgId}::uuid
        and c.program_id is not distinct from ${programId}::uuid
        and (${sql.join(
          subjects.map((s) => sql`(g.subject_type = ${s.type} and g.subject_id = ${s.id})`),
          sql` or `,
        )})`)) as unknown as Row[];
  });
  if (!rows.length) return new Map();

  // Strongest level per granted ROOT, then pushed down the subtree.
  const rank = (l: string) => (l === "edit" || l === "admin" ? 2 : 1);
  const rootLevel = new Map<string, "view" | "edit">();
  for (const r of rows) {
    const id = String(r.collection_id);
    const lvl = rank(String(r.level)) === 2 ? "edit" : "view";
    if (!rootLevel.has(id) || rank(lvl) > rank(rootLevel.get(id)!)) rootLevel.set(id, lvl);
  }

  const out = new Map<string, "view" | "edit">();
  for (const [root, lvl] of rootLevel) {
    for (const id of await collectionSubtreeIds(orgId, [root])) {
      if (!out.has(id) || rank(lvl) > rank(out.get(id)!)) out.set(id, lvl);
    }
  }
  return out;
}

/** The partner programs (clubs) this profile belongs to — for club folder grants. */
export async function clubIdsForProfile(orgId: string, profileId: string): Promise<string[]> {
  return asPrivileged(async (tx) => {
    const rows = (await tx.execute(sql`
      select distinct m.program_id
      from org_memberships m
      join programs p on p.id = m.program_id
      where m.org_id = ${orgId}::uuid
        and m.profile_id = ${profileId}::uuid
        and m.program_id is not null
        and p.metadata_json->>'is_partner' = 'true'`)) as unknown as Row[];
    return rows.map((r) => String(r.program_id));
  });
}

/**
 * Set which folders an object is filed under.
 *
 * The asset twin of this (setLearningAssetFolders) has existed since 0011; objects
 * never had one because folder membership only ever arrived as a side effect of
 * the Studio publishing its whole row. Filing content into a folder someone else
 * owns is a different gesture from authoring it, and needs its own write.
 *
 * Names are stored beside ids for the reason 0003 gives — a reader can label a
 * folder without holding the folder table — so both move together or a rename
 * shows up in one place and not the other.
 */
export async function setLearningObjectFolders(
  orgId: string,
  objectId: string,
  collectionIds: string[],
  collectionNames: string[],
): Promise<boolean> {
  return asPrivileged(async (tx) => {
    // The mirror image of the autosave's merge: this endpoint owns the 'lcol-'
    // ids and must not take the author's own Studio folders away from them as a
    // side effect of filing something into a shared folder.
    //
    // `collectionNames` is accepted for the caller's convenience and deliberately
    // NOT used for the lcol- names: the function resolves those from
    // learning_collections, which is authoritative and makes a rename propagate.
    void collectionNames;
    const incoming = JSON.stringify(collectionIds);
    const rows = await tx.execute(sql`
      update learning_objects
      set collection_ids =
            learning_apply_program_folders(collection_ids, collection_names, ${incoming}::jsonb) -> 'ids',
          collection_names =
            learning_apply_program_folders(collection_ids, collection_names, ${incoming}::jsonb) -> 'names',
          updated_at = now()
      where organization_id = ${orgId} and id = ${objectId}
      returning id`);
    return (rows as unknown as Row[]).length > 0;
  });
}

/**
 * Every publication to one app, as object_id → its audiences.
 *
 * An audience of `null` means "the whole app" (0010's nullable club_program_id);
 * a uuid names one club. Both kinds are returned, because the caller has to tell
 * "published to everyone" from "published to nobody in particular" from "not
 * published here at all" — and an object absent from this map is the third case,
 * which is the one that decides whether the app serves it.
 */
export async function listAppTargetAudiences(
  orgId: string,
  appKey: string,
): Promise<Map<string, (string | null)[]>> {
  return asPrivileged(async (tx) => {
    const rows = (await tx.execute(sql`
      select object_id, club_program_id
      from learning_object_app_targets
      where organization_id = ${orgId} and app_key = ${appKey}`)) as unknown as Row[];
    const out = new Map<string, (string | null)[]>();
    for (const r of rows) {
      const id = String(r.object_id);
      const list = out.get(id) ?? [];
      list.push((r.club_program_id as string | null) ?? null);
      out.set(id, list);
    }
    return out;
  });
}

/**
 * Save an edited pipeline. Only the fields provided are written.
 *
 * Deliberately narrow: title, description, blocks and the authoring draft. It
 * cannot change an object's type, folders, owner, program or publish state,
 * because someone granted edit access to a FOLDER was trusted with the content
 * in it — not with where it lives or who else can see it.
 */
export async function updateLearningObjectPipeline(
  orgId: string,
  objectId: string,
  patch: {
    title?: string;
    description?: string;
    blocks?: unknown[];
    pipelineDraft?: unknown;
  },
): Promise<number | null> {
  const sets: SQL[] = [];
  if (patch.title !== undefined) sets.push(sql`title = ${patch.title}`);
  if (patch.description !== undefined) sets.push(sql`description = ${patch.description}`);
  // JSON.stringify + ::jsonb is RIGHT HERE, because `sql` is drizzle's: the text
  // is bound as a parameter and Postgres parses it via the cast. (The same
  // pattern through the postgres.js driver double-encodes, because that driver
  // serializes jsonb itself — which is how a jsonb STRING once got stored and
  // every reader then called .find on text. Different layer, opposite rule.)
  if (patch.blocks !== undefined) {
    sets.push(sql`blocks = ${JSON.stringify(patch.blocks)}::jsonb`);
  }
  if (patch.pipelineDraft !== undefined) {
    sets.push(
      patch.pipelineDraft === null
        ? sql`pipeline_draft = null`
        : sql`pipeline_draft = ${JSON.stringify(patch.pipelineDraft)}::jsonb`,
    );
  }
  if (!sets.length) return null;
  // EVERY SAVE IS A NEW VERSION, and the number comes back so the screen can say
  // which one. Editing content somebody else authored has to be legible after the
  // fact -- "saved" alone leaves a reviewer unable to tell their change landed,
  // and leaves the author unable to see that it did.
  //
  // Server-side and monotonic: the Studio's own version history is per browser
  // (objectVersionsStore), so it cannot be the count anybody else reads.
  sets.push(sql`version_number = coalesce(version_number, 0) + 1`);
  return asPrivileged(async (tx) => {
    const rows = await tx.execute(sql`
      update learning_objects
      set ${sql.join(sets, sql`, `)}, updated_at = now()
      where organization_id = ${orgId} and id = ${objectId}
      returning version_number`);
    const row = (rows as unknown as Row[])[0];
    return row ? Number(row.version_number) : null;
  });
}
