/** Platform layer API routes for orgs, challenges, permissions, and join codes. */

import { Hono } from "hono";
import { z } from "zod";

import {
  exchangeLaunchToken,
  createAuthUser,
  getCurrentUser,
  getOptionalUser,
  loadPlatformUser,
  signInUser,
  type PlatformUser,
} from "../auth";
import { getSettings } from "../config";
import { HttpError } from "../httpError";
import * as db from "../platformDb";
import { dbEnabled } from "../db/client";
import { provisionOrganization } from "../db/provisioning";
import * as graph from "../db/orgGraphRepo";
import { getStorage, orgKey } from "../storage";
import { isOfferingAdmin } from "../permissions";
import {
  canViewStage,
  roleLabel,
  visibleStages,
  type ProgramInfo,
  type StageNode,
} from "../permissions";
import {
  addMemberSchema,
  createJoinCodeSchema,
  createOrgSchema,
  integrationInputSchema,
  launchExchangeSchema,
  moduleKey,
  orgSetupSchema,
  orgThemeUpdateSchema,
  parseBody,
  programInput,
  programFeaturesUpdate,
  normalizeProgramFeatures,
  registerViaJoinCodeSchema,
  setEntitlementSchema,
  signupSchema,
  updateMemberSchema,
} from "../schemas";
import {
  BRIDGE_ROLE_MAP,
  LEARNING_ROLE_MAP,
  platformAppSlug,
  resolvePlatformAccess,
} from "../platformAccess";

type Row = Record<string, any>;

export const platformRouter = new Hono();

function _serializeStageTree(nodes: Row[]): Row[] {
  return nodes.map((n) => ({
    id: n.id,
    org_id: n.org_id,
    parent_id: n.parent_id ?? null,
    stage_type: n.stage_type,
    name: n.name,
    depth: n.depth ?? 0,
    path: n.path ?? "/",
    discord_url: n.discord_url ?? null,
    event_at: n.event_at ?? null,
    qualifier_status: n.qualifier_status ?? null,
    program_id: n.program_id ?? null,
    children: _serializeStageTree(n.children ?? []),
  }));
}

/**
 * Shareable/copyable redemption link for an invitation (email delivery is
 * out of scope — the admin copies this and sends it manually).
 */
function _redeemUrl(code: string): string {
  const base = (getSettings().frontendOrigin || "").replace(/\/+$/, "");
  return base ? `${base}/?join_code=${code}` : `/?join_code=${code}`;
}

function _invitationResponse(
  row: Row,
  orgName: string,
  stageName: string | null,
  program: Row | null,
): Row {
  const deliveryMethod = row.delivery_method ?? "join_code";
  return {
    id: row.id,
    code: deliveryMethod === "join_code" ? row.code : null,
    kind: row.kind,
    org_id: row.org_id,
    stage_node_id: row.stage_node_id ?? null,
    stage_name: stageName,
    org_name: orgName,
    program_id: program ? program.id ?? null : row.program_id ?? null,
    program_name: program ? program.name ?? null : null,
    program_category: program ? program.category ?? null : null,
    delivery_method: deliveryMethod,
    email: row.email ?? null,
    max_uses: row.max_uses ?? null,
    uses_remaining: row.uses_remaining ?? null,
    expires_at: row.expires_at ?? null,
    redeem_url: row.code ? _redeemUrl(row.code) : null,
  };
}

function _programResponse(row: Row): Row {
  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    category: row.category,
    description: row.description ?? null,
    icon: row.icon ?? null,
    instructor_label: row.instructor_label ?? null,
    learner_label: row.learner_label ?? null,
    features: normalizeProgramFeatures(row.features as Record<string, unknown>),
    course_count: row.course_count ?? 0,
    learner_count: row.learner_count ?? 0,
    instructor_count: row.instructor_count ?? 0,
    platforms: row.platforms ?? null,
  };
}

async function _membershipSummaries(user: PlatformUser): Promise<Row[]> {
  const summaries: Row[] = [];
  for (const m of user.memberships) {
    const org = await db.getOrganization(m.org_id);
    let stageName: string | null = null;
    let stageType = m.stage_type ?? null;
    if (m.stage_node_id) {
      const stage = await db.getStageNode(m.stage_node_id);
      if (stage) {
        stageName = stage.name ?? null;
        stageType = stage.stage_type ?? stageType;
      }
    }
    let programName: string | null = null;
    let programCategory: string | null = null;
    let registeredAppId: string | null = null;
    let appLaunchUrl: string | null = null;
    if (m.program_id) {
      const program = await db.getProgram(m.program_id);
      if (program) {
        programName = program.name ?? null;
        programCategory = program.category ?? null;
      }
      const apps = (await db.listRegisteredApps(m.program_id)).filter((a) => a.status === "active");
      if (apps.length > 0) {
        registeredAppId = apps[0].id;
        appLaunchUrl = apps[0].launch_url ?? null;
      }
    }
    summaries.push({
      id: m.id,
      org_id: m.org_id,
      org_name: org ? org.name : "",
      // The org-scoped person id (profiles.id) — the canonical identity WITHIN
      // this org's space (Phase 2). Platform context endpoints (bridge/learning)
      // key on this, never on the cross-cutting auth credential id.
      profile_id: m.profile_id ?? null,
      role: m.role,
      stage_node_id: m.stage_node_id ?? null,
      stage_name: stageName,
      stage_type: stageType,
      access: m.access,
      program_id: m.program_id ?? null,
      program_name: programName,
      program_category: programCategory,
      registered_app_id: registeredAppId,
      app_launch_url: appLaunchUrl,
    });
  }
  return summaries;
}

function _assertOrgAccess(user: PlatformUser, orgId: string, requireEdit = false): void {
  // Platform admins manage every organization.
  if (user.role === "platform_admin") return;
  const orgMemberships = user.memberships.filter((m) => m.org_id === orgId);
  if (orgMemberships.length === 0) {
    throw new HttpError(403, "Not a member of this organization");
  }
  if (requireEdit) {
    if (!orgMemberships.some((m) => m.role === "owner" || m.access === "edit")) {
      throw new HttpError(403, "Edit access required");
    }
  }
}

function _hasOrgAccess(user: PlatformUser, orgId: string | null | undefined): boolean {
  if (!orgId) return false;
  if (user.role === "platform_admin") return true;
  return user.memberships.some((m) => m.org_id === orgId);
}

// Phase 1 people isolation: Nexus governs an org's BOUNDARY (record, status,
// entitlements, capabilities), never the people inside it. Every endpoint that
// returns or mutates people uses this guard — the platform operator is refused
// outright instead of inheriting the _assertOrgAccess bypass.
function _assertOrgPeopleAccess(user: PlatformUser, orgId: string, requireEdit = false): void {
  if (user.role === "platform_admin") {
    throw new HttpError(403, "Nexus operators cannot access an organization's members");
  }
  _assertOrgAccess(user, orgId, requireEdit);
}

function _authUserResponse(user: PlatformUser, accessToken: string): Row {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    access_token: accessToken,
  };
}

platformRouter.post("/auth/signup", async (c) => {
  const req = parseBody(signupSchema, await c.req.json());

  if (req.signup_type === "org") {
    if (!req.org_name) throw new HttpError(400, "org_name is required for org signup");
    const auth = await createAuthUser(req.email, req.password);
    if (dbEnabled()) {
      // Canonical path (v0.4 §2.2): one transactional provisioning event creates
      // the org + owner + default entitlements + storage scope + theme + audit.
      await provisionOrganization({
        name: req.org_name,
        owner: { userId: auth.id, email: req.email, displayName: req.display_name ?? undefined },
      });
    } else {
      await db.createProfile(auth.id, req.email, "org_admin", req.display_name ?? null);
      const org = await db.createOrganization(req.org_name, auth.id);
      await db.recordAuditEvent("organization.created", {
        orgId: org.id,
        actorUserId: auth.id,
        scopeType: "organization",
        scopeId: org.id,
        metadata: { name: org.name },
      });
    }
    const session = await signInUser(req.email, req.password);
    const user = await loadPlatformUser(auth.id, req.email);
    return c.json(_authUserResponse(user, session.access_token));
  }

  if (req.signup_type === "student") {
    const auth = await createAuthUser(req.email, req.password);
    await db.createProfile(auth.id, req.email, "student", req.display_name ?? null);
    const session = await signInUser(req.email, req.password);
    const user = await loadPlatformUser(auth.id, req.email);
    return c.json(_authUserResponse(user, session.access_token));
  }

  if (!req.join_code) {
    throw new HttpError(400, "join_code is required for administrator/teacher signup");
  }

  const codeRow = await db.getJoinCode(req.join_code);
  if (!codeRow) throw new HttpError(404, "Invalid join code");

  if (req.signup_type === "administrator" && codeRow.kind !== "administrator") {
    throw new HttpError(400, "Join code is not valid for administrator signup");
  }
  if (req.signup_type === "teacher" && codeRow.kind !== "teacher") {
    throw new HttpError(400, "Join code is not valid for teacher signup");
  }

  const auth = await createAuthUser(req.email, req.password);
  const profileRole = req.signup_type === "administrator" ? "org_admin" : "teacher";
  // Org-scoped profile in the code's org (one login → many org profiles).
  const profileId = await db.ensureOrgProfile(auth.id, codeRow.org_id, {
    email: req.email,
    role: profileRole,
    displayName: req.display_name ?? null,
  });

  // Stored membership role uses the canonical "instructor" (Nexus addendum);
  // the public-facing "Coach"/"Teacher" word is derived from program category
  // in roleLabel(), not from this stored value.
  const membershipRole = req.signup_type === "administrator" ? "administrator" : "instructor";
  await db.addMembership(
    codeRow.org_id,
    profileId,
    membershipRole,
    codeRow.stage_node_id ?? null,
    "view",
    codeRow.program_id ?? null,
  );
  await db.consumeJoinCode(req.join_code);
  await db.recordAuditEvent("member.joined", {
    orgId: codeRow.org_id,
    actorUserId: auth.id,
    scopeType: "organization",
    scopeId: codeRow.org_id,
    metadata: { role: membershipRole, via: "join_code" },
  });

  const session = await signInUser(req.email, req.password);
  const user = await loadPlatformUser(auth.id, req.email);
  return c.json(_authUserResponse(user, session.access_token));
});

platformRouter.post("/auth/login", async (c) => {
  const body = (await c.req.json()) as Row;
  const email = body?.email;
  const password = body?.password;
  if (!email || !password) throw new HttpError(400, "email and password required");
  const session = await signInUser(email, password);
  const user = await loadPlatformUser(session.id, session.email);

  // Phase 2 org-scoped identity: an org portal passes its slug, and the session
  // is scoped to that one org — the person must have an identity THERE, and the
  // platform operator can never sign in through an org's door (§3.5 hard wall).
  const orgSlug = typeof body?.org_slug === "string" && body.org_slug.trim() ? body.org_slug.trim() : null;
  if (orgSlug) {
    const org = await db.getOrganizationBySlug(orgSlug);
    if (!org) throw new HttpError(404, "Organization not found");
    if (user.role === "platform_admin") {
      throw new HttpError(403, "Nexus operators sign in at the operator gate, not an organization portal");
    }
    const orgMemberships = user.memberships.filter((m) => m.org_id === org.id);
    if (orgMemberships.length === 0) {
      throw new HttpError(403, "No account at this organization");
    }
    const scoped: PlatformUser = { ...user, memberships: orgMemberships };
    return c.json({
      ..._authUserResponse(scoped, session.access_token),
      org_id: org.id,
      org_slug: org.slug,
    });
  }

  return c.json(_authUserResponse(user, session.access_token));
});

// ── Dev-only test login (local/dev only) ────────────────────────────────────
// Enabled when Supabase auth isn't configured (local demo mode) or explicitly
// via NEXUS_ENABLE_DEV_LOGIN=1. Lets the UI's "Test as…" lists become any real
// org member/admin without knowing their password, and auto-activates a pending
// invitee's account on first use. NEVER enabled in a Supabase-backed prod env.
const DEV_LOGIN_PASSWORD = "dev-password-123";
function _devLoginEnabled(): boolean {
  return process.env.NEXUS_ENABLE_DEV_LOGIN === "1" || !getSettings().supabaseEnabled;
}
function _profileRoleForMembership(role: string): string {
  return role === "administrator" || role === "owner" ? "org_admin" : "student";
}

// Every org's name + slug (dev only): powers the gate's dynamic portal list so
// a freshly provisioned org — and everyone invited into it — is immediately
// discoverable without editing any hardcoded list.
platformRouter.get("/dev/orgs", async (c) => {
  if (!_devLoginEnabled()) throw new HttpError(404, "Not found");
  const orgs = await db.listAllOrganizations();
  return c.json(orgs.map((o: Row) => ({ id: o.id, name: o.name, slug: o.slug })));
});

platformRouter.get("/dev/personas", async (c) => {
  if (!_devLoginEnabled()) throw new HttpError(404, "Not found");
  const slug = c.req.query("org_slug");
  const orgIdParam = c.req.query("org_id");
  if (!slug && !orgIdParam) throw new HttpError(400, "org_slug or org_id required");
  const org = orgIdParam ? await db.getOrganization(orgIdParam) : await db.getOrganizationBySlug(slug!);
  if (!org) throw new HttpError(404, "Organization not found");
  const members = (await db.listMembers(org.id))
    .map((m: Row) => {
      const p = (m.profiles ?? {}) as Row;
      return {
        email: (p.email ?? m.email ?? null) as string | null,
        display_name: (p.display_name ?? p.name ?? null) as string | null,
        role: m.role as string,
        program_id: (m.program_id ?? null) as string | null,
        kind: "member" as const,
      };
    })
    .filter((m) => m.email);
  const invites = (await graph.listInvitations(org.id))
    .filter((i: Row) => i.status === "pending" && i.email)
    .map((i: Row) => ({
      email: i.email as string,
      display_name: (i.display_name ?? null) as string | null,
      role: i.role as string,
      program_id: (i.program_id ?? null) as string | null,
      kind: "invite" as const,
    }));
  // Dedupe by email (a person may hold several memberships); members win over
  // pending invites, and org-level admin/owner rows win over program-scoped ones.
  const rank = (p: { role: string; program_id: string | null; kind: string }) =>
    (p.kind === "member" ? 100 : 0) +
    (p.program_id === null ? 10 : 0) +
    (p.role === "owner" ? 3 : p.role === "administrator" ? 2 : 1);
  const byEmail = new Map<string, (typeof members)[number] | (typeof invites)[number]>();
  for (const p of [...members, ...invites]) {
    const key = (p.email as string).toLowerCase();
    const cur = byEmail.get(key);
    if (!cur || rank(p) > rank(cur)) byEmail.set(key, p);
  }
  return c.json({ org: { id: org.id, name: org.name, slug: org.slug }, personas: [...byEmail.values()] });
});

platformRouter.post("/dev/login-as", async (c) => {
  if (!_devLoginEnabled()) throw new HttpError(404, "Not found");
  const body = (await c.req.json().catch(() => ({}))) as Row;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const orgSlug = body?.org_slug as string | undefined;
  const orgIdParam = body?.org_id as string | undefined;
  if (!email) throw new HttpError(400, "email required");

  let profile = await db.getProfileByEmail(email);
  let authId: string;

  if (profile) {
    // Use the auth CREDENTIAL id, not this profile row's own id — they can
    // differ (one auth id → many org-scoped profiles, migration 0010). The
    // token verifier only recognizes the auth id; using profile.id here was
    // the bug behind "test as" silently bouncing back to the wrong session.
    authId = (profile.auth_user_id as string | undefined) ?? (profile.id as string);
  } else {
    // Auto-activate: create the account, then honor any pending invitation's
    // org + role so the new user lands where the invite intended.
    let created: Row;
    try {
      created = await createAuthUser(email, DEV_LOGIN_PASSWORD);
    } catch {
      created = await signInUser(email, DEV_LOGIN_PASSWORD);
    }
    authId = created.id as string;
    let displayName = email.split("@")[0];
    let membershipRole = "administrator";
    let org: Row | null = orgIdParam
      ? await db.getOrganization(orgIdParam)
      : orgSlug
        ? await db.getOrganizationBySlug(orgSlug)
        : null;
    let programId: string | null = null;
    if (org) {
      const invite = (await graph.listInvitations(org.id)).find(
        (i: Row) => (i.email as string)?.toLowerCase() === email && i.status === "pending",
      );
      if (invite) {
        membershipRole = (invite.role as string) ?? "administrator";
        programId = (invite.program_id as string) ?? null;
        // Honor the name the inviter typed — don't fall back to the email prefix.
        if (invite.display_name) displayName = invite.display_name as string;
      }
    }
    if (org) {
      // Proper org-scoped profile (organization_id set → visible under org RLS),
      // with the membership pointing at the profile's own id, not the auth id.
      const profileId = await db.ensureOrgProfile(authId, org.id, {
        email,
        role: _profileRoleForMembership(membershipRole),
        displayName,
      });
      await db.addMembership(org.id, profileId, membershipRole, null, "edit", programId);
    } else {
      await db.createProfile(authId, email, _profileRoleForMembership(membershipRole), displayName);
    }
  }

  const user = await loadPlatformUser(authId, email);
  return c.json(_authUserResponse(user, authId));
});

/**
 * Swap a short-lived launch token (from GET /api/apps/{id}/launch-context)
 * for a real session access_token — replaces handing a raw platform session
 * token to a downstream app via URL query string.
 */
platformRouter.post("/auth/launch-exchange", async (c) => {
  const req = parseBody(launchExchangeSchema, await c.req.json());
  return c.json(await exchangeLaunchToken(req.launch_token));
});

platformRouter.get("/auth/me", async (c) => {
  const user = await getCurrentUser(c);
  return c.json({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    memberships: await _membershipSummaries(user),
  });
});

// ── Platform context endpoints (Phase 3 — the role→platform bridge) ─────────
// External platforms call these with the caller's session token to learn "may
// this person enter, and as what". The grant is derived from program membership
// + custom-role area perms + the program's feature switches (resolvePlatformAccess);
// the identity emitted is the ORG-SCOPED person id (Phase 2). 403 when the role
// doesn't grant the area or the feature is off — that IS the access control.

// Bridge Platform: emits the NexusBridgeContext shape from
// Components/laic-learner-contracts (programId is that contract's fixed domain
// literal; the real Nexus program uuid rides in nexus_program_id).
platformRouter.get("/bridge/context", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "bridge", c.req.query("program_id") ?? null);
  const mapped = BRIDGE_ROLE_MAP[access.level];
  return c.json({
    nexusUserId: access.profileId,
    laicOrgId: access.orgId,
    programId: "bridge_program",
    appId: await platformAppSlug(access.programId, "bridge-platform", "bridge_ai_coach"),
    // A pre-built role picked in the Nexus role builder is authoritative;
    // graded grants fall back to the level→role map.
    roles: access.platformRole ? [access.platformRole] : mapped.roles,
    permissions: [`bridge:${access.level}`],
    accessLevel: mapped.accessLevel,
    displayName: await _platformDisplayName(access.profileId, user),
    // Extensions beyond the contract (additive — Bridge's shape check ignores them).
    nexus_program_id: access.programId,
    program_name: access.programName,
    role_name: access.roleName,
  });
});

// ── Bridge People & Roles (administered from Bridge's own UI) ───────────────
// Bridge's admin surface manages who holds which PRE-BUILT Bridge role, but
// the data lives here: Nexus stays the single access authority, so org-portal
// logins and test-as resolve the same answer the Bridge UI configured.
// Assignable from Bridge's People & Roles: the simplified non-admin set.
// Admin is never assigned here — it comes from Nexus membership (§3.5).
// "Reviewer & Fellow" is one choice, stored as bridge_reviewer.
const _BRIDGE_ASSIGNABLE = ["bridge_coach", "bridge_reviewer", "bridge_learner"] as const;
const _BRIDGE_ROLE_BODY = z.object({
  program_id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(_BRIDGE_ASSIGNABLE).nullable(),
});

async function _requireBridgeAdmin(user: PlatformUser, programId: string) {
  const access = await resolvePlatformAccess(user, "bridge", programId);
  if (access.level !== "admin") throw new HttpError(403, "Bridge admin access required");
  return access;
}

platformRouter.get("/bridge/people", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.query("program_id");
  if (!programId) throw new HttpError(400, "program_id required");
  const access = await _requireBridgeAdmin(user, programId);
  const members = await graph.listProgramMembers(access.orgId, programId);
  const assignments = await graph.listPlatformRoleAssignments(programId, "bridge");
  const byEmail = new Map(assignments.map((a: Row) => [String(a.email).toLowerCase(), a.role]));
  return c.json(
    members.map((m: Row) => {
      const email = ((m.email as string) ?? "").toLowerCase();
      const isAdmin = m.membership_role === "administrator" || m.membership_role === "owner";
      return {
        email: m.email ?? null,
        display_name: m.display_name ?? null,
        status: m.status ?? "active",
        // Admin standing comes from Nexus membership and is not reassignable here.
        bridge_role: isAdmin ? "bridge_program_admin" : byEmail.get(email) ?? null,
        is_admin: isAdmin,
      };
    }),
  );
});

platformRouter.put("/bridge/people/role", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const req = parseBody(_BRIDGE_ROLE_BODY, await c.req.json());
  const access = await _requireBridgeAdmin(user, req.program_id);
  const members = await graph.listProgramMembers(access.orgId, req.program_id);
  const target = members.find((m: Row) => ((m.email as string) ?? "").toLowerCase() === req.email.toLowerCase());
  if (!target) throw new HttpError(404, "That person is not in this program");
  if (target.membership_role === "administrator" || target.membership_role === "owner") {
    throw new HttpError(409, "Program administrators already hold the Bridge Program Admin role via Nexus");
  }
  const row = await graph.setPlatformRoleAssignment(
    access.orgId, req.program_id, "bridge", req.email, req.role, access.profileId,
  );
  await db.recordAuditEvent("bridge.role.assigned", {
    orgId: access.orgId, actorUserId: user.id, scopeType: "program", scopeId: req.program_id,
    metadata: { email: req.email, role: req.role },
  });
  return c.json(row ?? { email: req.email.toLowerCase(), role: null });
});

// The person's display name in THIS org (their org-scoped profile), falling
// back to the session-level name/email so platforms never render a raw id.
async function _platformDisplayName(profileId: string, user: PlatformUser): Promise<string> {
  const profile = await db.getProfile(profileId).catch(() => null);
  return (
    (profile?.display_name as string) ||
    (profile?.name as string) ||
    user.display_name ||
    user.email ||
    profileId
  );
}

// Learning Platform: parallel shape (no prior contract — this defines it).
// Also honors the org-level learning module entitlement, like the launch seam.
platformRouter.get("/learning/context", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "learning", c.req.query("program_id") ?? null);
  if (!(await db.checkModuleAccess(access.orgId, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }
  const mapped = LEARNING_ROLE_MAP[access.level];
  return c.json({
    nexusUserId: access.profileId,
    laicOrgId: access.orgId,
    programId: access.programId,
    appId: await platformAppSlug(access.programId, "learning-platform", "learning_platform"),
    roles: mapped.roles,
    permissions: [`learning:${access.level}`],
    accessLevel: mapped.accessLevel,
    displayName: await _platformDisplayName(access.profileId, user),
    program_name: access.programName,
    role_name: access.roleName,
  });
});

platformRouter.post("/orgs", async (c) => {
  const user = await getCurrentUser(c);
  const req = parseBody(createOrgSchema, await c.req.json());
  const org = await db.createOrganization(req.name, user.id);
  return c.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    owner_id: org.owner_id ?? null,
    theme_accent_color: null,
    theme_logo_url: null,
  });
});

platformRouter.put("/orgs/:org_id/setup", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  const req = parseBody(orgSetupSchema, await c.req.json());
  _assertOrgAccess(user, orgId, true);

  const payload = {
    has_challenge: req.has_challenge,
    challenge_name: req.challenge_name ?? null,
    stage_types: req.stage_types,
    permission_defaults: Object.fromEntries(
      Object.entries(req.permission_defaults).map(([role, cfg]) => [
        role,
        {
          default_access: cfg!.default_access,
          per_level_overrides: cfg!.per_level_overrides ?? {},
        },
      ]),
    ),
    initial_stages: req.initial_stages.map((s) => ({
      stage_type: s.stage_type,
      name: s.name,
      discord_url: s.discord_url ?? null,
      event_at: s.event_at ?? null,
      program_id: s.program_id ?? null,
      children: (s.children ?? []).map((ch) => ({
        stage_type: ch.stage_type,
        name: ch.name,
        discord_url: ch.discord_url ?? null,
        event_at: ch.event_at ?? null,
        program_id: ch.program_id ?? null,
        children: [],
      })),
    })),
    discord_link: req.discord_link ?? null,
    discord_permission_level: req.discord_permission_level ?? null,
    programs: req.programs.map((p) => ({
      name: p.name,
      category: p.category,
      description: p.description ?? null,
      icon: p.icon ?? null,
      instructor_label: p.instructor_label ?? null,
      learner_label: p.learner_label ?? null,
      stage_type: p.stage_type ?? null,
      class_names: p.class_names,
    })),
  };
  const result = await db.setupOrganization(orgId, payload);
  await db.recordAuditEvent("organization.setup_completed", {
    orgId,
    actorUserId: user.id,
    scopeType: "organization",
    scopeId: orgId,
    metadata: { programs: req.programs.length, has_challenge: req.has_challenge },
  });
  return c.json(result);
});

platformRouter.get("/orgs/:org_id/programs", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  return c.json((await db.listPrograms(orgId)).map(_programResponse));
});

platformRouter.post("/orgs/:org_id/programs", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  const req = parseBody(programInput, await c.req.json());
  _assertOrgAccess(user, orgId, true);
  if (user.role !== "platform_admin") {
    const caps = await db.getOrgCapabilities(orgId);
    if (!(caps.programTypes as Row)[req.category]) {
      throw new HttpError(403, `This organization is not permitted to create '${req.category}' programs`);
    }
  }
  const row = await db.createProgram(orgId, req.name, req.category, {
    description: req.description ?? null,
    icon: req.icon ?? null,
    instructorLabel: req.instructor_label ?? null,
    learnerLabel: req.learner_label ?? null,
    features: req.features ?? null,
  });
  // Give the new program its own group scope, mirroring org_setup behavior.
  if (req.category === "edu") {
    await db.addStageNodes(
      orgId,
      [{ stage_type: req.stage_type || "national", name: req.name }],
      null,
      row.id,
    );
  } else if (req.class_names.length > 0) {
    await db.addStageNodes(
      orgId,
      req.class_names.map((cn) => ({ stage_type: "chapter", name: cn })),
      null,
      row.id,
    );
  }
  await db.recordAuditEvent("program.created", {
    orgId,
    actorUserId: user.id,
    scopeType: "program",
    scopeId: row.id,
    metadata: { name: row.name, category: row.category },
  });
  return c.json(_programResponse((await db.getProgram(row.id)) ?? row));
});

platformRouter.delete("/programs/:program_id", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _assertOrgAccess(user, program.org_id, true);
  await db.deleteProgram(programId);
  await db.recordAuditEvent("program.deleted", {
    orgId: program.org_id,
    actorUserId: user.id,
    scopeType: "program",
    scopeId: programId,
    metadata: { name: program.name },
  });
  return c.json({ ok: true });
});

// Which feature-areas are accessible inside a program (§3.5). Editable from
// two altitudes: org admins (configure any program) and the program's own
// administrator — running the program end to end includes its platforms.
function _assertProgramConfigAccess(user: PlatformUser, orgId: string, programId: string): void {
  if (user.role === "platform_admin") return;
  const ok = user.memberships.some(
    (m) =>
      m.org_id === orgId &&
      (m.role === "owner" || m.role === "administrator" || m.access === "edit") &&
      (!m.program_id || m.program_id === programId),
  );
  if (!ok) throw new HttpError(403, "Edit access required");
}

platformRouter.patch("/programs/:program_id/features", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _assertProgramConfigAccess(user, program.org_id, programId);
  const req = parseBody(programFeaturesUpdate, await c.req.json());
  const features = normalizeProgramFeatures(req.features);
  const row = await db.updateProgramFeatures(programId, features);
  if (!row) throw new HttpError(404, "Program not found");
  await db.recordAuditEvent("program.features.updated", {
    orgId: program.org_id,
    actorUserId: user.id,
    scopeType: "program",
    scopeId: programId,
    metadata: { features },
  });
  return c.json(_programResponse((await db.getProgram(programId)) ?? row));
});

platformRouter.patch("/orgs/:org_id/theme", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  const req = parseBody(orgThemeUpdateSchema, await c.req.json());
  _assertOrgAccess(user, orgId, true);
  const org = await db.updateOrgTheme(orgId, req.accent_color ?? null, req.logo_url ?? null);
  await db.recordAuditEvent("organization.theme_updated", {
    orgId,
    actorUserId: user.id,
    scopeType: "organization",
    scopeId: orgId,
  });
  const theme = (org.settings ?? {}).theme ?? {};
  return c.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    owner_id: org.owner_id ?? null,
    theme_accent_color: theme.accent_color ?? null,
    theme_logo_url: theme.logo_url ?? null,
  });
});

function _integrationResponse(r: Row): Row {
  return {
    id: r.id,
    organization_id: r.organization_id,
    program_id: r.program_id ?? null,
    integration_type: r.integration_type,
    config: r.config ?? {},
    permission_level: r.permission_level ?? "per_level",
    status: r.status ?? "active",
  };
}

platformRouter.get("/orgs/:org_id/integrations", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  return c.json((await db.listIntegrations(orgId)).map(_integrationResponse));
});

platformRouter.post("/orgs/:org_id/integrations", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  const req = parseBody(integrationInputSchema, await c.req.json());
  _assertOrgAccess(user, orgId, true);
  if (user.role !== "platform_admin") {
    const caps = await db.getOrgCapabilities(orgId);
    if (!(caps.features as Row).integrations) {
      throw new HttpError(403, "Integrations aren't enabled for this organization");
    }
  }
  const row = await db.createIntegration(
    orgId,
    req.integration_type,
    req.config,
    req.permission_level,
    req.program_id ?? null,
  );
  return c.json(_integrationResponse(row));
});

platformRouter.post("/programs/:program_id/join-codes", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const req = parseBody(createJoinCodeSchema, await c.req.json());
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _assertOrgAccess(user, program.org_id, true);

  const kind = req.kind !== "student" ? req.kind : "teacher";
  const row = await db.createProgramJoinCode(programId, kind, {
    deliveryMethod: req.delivery_method,
    email: req.email ?? null,
    maxUses: req.max_uses ?? null,
    expiresAt: req.expires_at ?? null,
    createdByUserId: user.id,
  });
  const org = await db.getOrganization(program.org_id);
  return c.json(_invitationResponse(row, org?.name ?? "", null, program));
});

platformRouter.get("/orgs/:org_id/stages", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  const allStages = await db.listStageNodes(orgId);
  const visible = visibleStages(user.memberships, allStages, orgId);
  const tree = db.buildStageTree(visible);
  return c.json(_serializeStageTree(tree));
});

platformRouter.post("/orgs/:org_id/stages", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  const nodes = (await c.req.json()) as Row[];
  const parentId = c.req.query("parent_id") ?? null;
  _assertOrgAccess(user, orgId, true);
  const created = await db.addStageNodes(orgId, nodes, parentId);
  return c.json(
    created.map((r) => ({
      id: r.id,
      org_id: r.org_id,
      parent_id: r.parent_id ?? null,
      stage_type: r.stage_type,
      name: r.name,
      depth: r.depth ?? 0,
      path: r.path ?? "/",
      discord_url: r.discord_url ?? null,
      event_at: r.event_at ?? null,
      qualifier_status: r.qualifier_status ?? null,
      program_id: r.program_id ?? null,
      children: [],
    })),
  );
});

platformRouter.post("/stages/:stage_id/join-codes", async (c) => {
  const user = await getCurrentUser(c);
  const stageId = c.req.param("stage_id");
  const req = parseBody(createJoinCodeSchema, await c.req.json());
  const stage = await db.getStageNode(stageId);
  if (!stage) throw new HttpError(404, "Stage not found");
  _assertOrgAccess(user, stage.org_id, true);

  const row = await db.createJoinCode(stageId, req.kind, {
    deliveryMethod: req.delivery_method,
    email: req.email ?? null,
    maxUses: req.max_uses ?? null,
    expiresAt: req.expires_at ?? null,
    createdByUserId: user.id,
  });
  const org = await db.getOrganization(stage.org_id);
  const orgName = (stage.organizations ?? {}).name || org?.name || "";
  return c.json(_invitationResponse(row, orgName, stage.name, null));
});

// Public org branding by slug — powers the per-org login portal (/@/:slug),
// which must render an org's name/logo/accent BEFORE anyone authenticates.
// Returns only a safe, non-sensitive branding subset.
platformRouter.get("/orgs/by-slug/:slug", async (c) => {
  const slug = c.req.param("slug");
  const org = await db.getOrganizationBySlug(slug);
  if (!org) throw new HttpError(404, "Organization not found");
  const theme = (org.settings ?? {}).theme ?? {};
  return c.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    theme_accent_color: theme.accent_color ?? null,
    theme_logo_url: theme.logo_url ?? org.logo_url ?? null,
  });
});

platformRouter.get("/join-codes/:code", async (c) => {
  const code = c.req.param("code");
  const row = await db.getJoinCode(code);
  if (!row) throw new HttpError(404, "Invalid join code");
  const stage = row.stage_nodes ?? {};
  const org = row.organizations ?? {};
  return c.json({
    id: row.id,
    code: row.code,
    kind: row.kind,
    org_id: row.org_id,
    stage_node_id: row.stage_node_id ?? null,
    stage_name: stage.name ?? "",
    org_name: org.name ?? "",
    program_id: null,
    program_name: null,
    program_category: null,
    delivery_method: "join_code",
    email: null,
    max_uses: null,
    uses_remaining: null,
    expires_at: null,
    redeem_url: null,
  });
});

platformRouter.post("/join-codes/:code/register", async (c) => {
  const code = c.req.param("code");
  const req = parseBody(registerViaJoinCodeSchema, await c.req.json());
  const user = await getOptionalUser(c);
  const row = await db.getJoinCode(code);
  if (!row) throw new HttpError(404, "Invalid join code");
  if (row.kind !== "student") {
    throw new HttpError(400, "This join code is not for student registration");
  }

  if (user === null) throw new HttpError(401, "Authentication required to register");

  const reg = await db.registerStudent(user.id, row, req.display_name ?? null);
  await db.recordAuditEvent("registration.student_joined", {
    orgId: reg.org_id,
    actorUserId: user.id,
    scopeType: "organization",
    scopeId: reg.org_id,
    targetType: "student_registration",
    targetId: reg.id,
    metadata: { via: "join_code" },
  });
  return c.json({ ok: true, registration_id: reg.id, org_id: reg.org_id });
});

platformRouter.get("/dashboard", async (c) => {
  const user = await getCurrentUser(c);
  if (user.memberships.length === 0) throw new HttpError(403, "No organization memberships");

  const targetOrgId = c.req.query("org_id") || user.memberships[0].org_id;
  const stageIdParam = c.req.query("stage_id") || null;
  _assertOrgAccess(user, targetOrgId);

  const org = await db.getOrganization(targetOrgId);
  if (!org) throw new HttpError(404, "Organization not found");

  const allStages = await db.listStageNodes(targetOrgId);
  const visible = visibleStages(user.memberships, allStages, targetOrgId);

  const registrations = await db.listStudentRegistrationsForStages(targetOrgId, visible);

  const stageTabs = visible.map((s) => ({
    id: s.id,
    stage_type: s.stage_type,
    name: s.name,
    signup_count: registrations.filter((r) => r.stage_node_id === s.id).length,
    event_at: s.event_at ?? null,
    discord_url: s.discord_url ?? null,
    qualifier_status: s.qualifier_status ?? null,
  }));

  const active = stageIdParam || (stageTabs.length > 0 ? stageTabs[0].id : null);
  const activeRegs = registrations.filter((r) => !active || r.stage_node_id === active);

  const students = activeRegs.slice(0, 50).map((r) => {
    const profile = r.profiles ?? {};
    const stage = r.stage_nodes ?? {};
    return {
      id: r.id,
      profile_id: r.profile_id,
      display_name: profile.display_name || profile.name || null,
      email: profile.email ?? null,
      stage_node_id: r.stage_node_id,
      stage_name: stage.name ?? "",
      registered_at: r.registered_at,
    };
  });

  const programInfos: ProgramInfo[] = (await db.listPrograms(targetOrgId)).map((p) => ({
    id: p.id,
    category: p.category,
    instructor_label: p.instructor_label ?? null,
    learner_label: p.learner_label ?? null,
  }));
  const theme = (org.settings ?? {}).theme ?? {};

  return c.json({
    org_id: targetOrgId,
    org_name: org.name,
    role_label: roleLabel(user.memberships, targetOrgId, allStages, programInfos),
    active_stage_id: active,
    stages: stageTabs,
    total_signups: registrations.length,
    students,
    theme_accent_color: theme.accent_color ?? null,
    theme_logo_url: theme.logo_url ?? null,
  });
});

platformRouter.get("/stages/:stage_id/students", async (c) => {
  const user = await getCurrentUser(c);
  const stageId = c.req.param("stage_id");
  const stage = await db.getStageNode(stageId);
  if (!stage) throw new HttpError(404, "Stage not found");

  const stageNode: StageNode = {
    id: stage.id,
    org_id: stage.org_id,
    parent_id: stage.parent_id ?? null,
    stage_type: stage.stage_type,
    name: stage.name,
    depth: stage.depth ?? 0,
    path: stage.path ?? "/",
  };
  if (!canViewStage(user.memberships, stageNode)) {
    throw new HttpError(403, "Cannot view this stage");
  }

  const allStages = await db.listStageNodes(stage.org_id);
  const visible = visibleStages(user.memberships, allStages, stage.org_id);
  const registrations = await db.listStudentRegistrationsForStages(stage.org_id, visible);
  const filtered = registrations.filter((r) => r.stage_node_id === stageId);

  return c.json(
    filtered.map((r) => {
      const profile = r.profiles ?? {};
      const st = r.stage_nodes ?? {};
      return {
        id: r.id,
        profile_id: r.profile_id,
        display_name: profile.display_name || profile.name || null,
        email: profile.email ?? null,
        stage_node_id: r.stage_node_id,
        stage_name: st.name ?? "",
        registered_at: r.registered_at,
      };
    }),
  );
});

function _memberResponse(row: Row, profile: Row, stageName: string | null): Row {
  return {
    id: row.id,
    profile_id: row.profile_id,
    email: profile.email ?? "",
    display_name: profile.display_name || profile.name || null,
    role: row.role,
    program_id: row.program_id ?? null,
    stage_node_id: row.stage_node_id ?? null,
    stage_name: stageName,
    access: row.access ?? "view",
  };
}

platformRouter.get("/orgs/:org_id/members", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  _assertOrgPeopleAccess(user, orgId);
  const rows = await db.listMembers(orgId);
  return c.json(
    rows.map((r) => {
      const profile = r.profiles ?? {};
      const stage = r.stage_nodes ?? {};
      return _memberResponse(r, profile, stage.name ?? null);
    }),
  );
});

platformRouter.post("/orgs/:org_id/members", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  _assertOrgPeopleAccess(user, orgId, true); // authz before body validation
  const req = parseBody(addMemberSchema, await c.req.json());

  const profile = await db.getProfileByEmail(req.email);
  if (!profile) throw new HttpError(404, "User with this email not found");

  const row = await db.addMembership(orgId, profile.id, req.role, req.stage_node_id, req.access);
  await db.recordAuditEvent("member.added", {
    orgId,
    actorUserId: user.id,
    scopeType: "organization",
    scopeId: orgId,
    targetType: "membership",
    targetId: row.id,
    metadata: { email: req.email, role: req.role },
  });
  const stage = req.stage_node_id ? await db.getStageNode(req.stage_node_id) : null;
  return c.json(_memberResponse(row, profile, stage?.name ?? null));
});

platformRouter.patch("/members/:member_id", async (c) => {
  const user = await getCurrentUser(c);
  const memberId = c.req.param("member_id");
  const req = parseBody(updateMemberSchema, await c.req.json());

  const row = await db.getMembership(memberId);
  if (!row) throw new HttpError(404, "Member not found");
  _assertOrgPeopleAccess(user, row.org_id, true);

  const updated = await db.updateMemberAccess(memberId, req.access);
  await db.recordAuditEvent("member.access_updated", {
    orgId: row.org_id,
    actorUserId: user.id,
    scopeType: "organization",
    scopeId: row.org_id,
    targetType: "membership",
    targetId: memberId,
    metadata: { access: req.access },
  });
  const profile = (await db.getProfile(updated.profile_id)) ?? {};
  let stageName: string | null = null;
  if (updated.stage_node_id) {
    const stage = await db.getStageNode(updated.stage_node_id);
    if (stage) stageName = stage.name ?? null;
  }
  return c.json(_memberResponse(updated, profile, stageName));
});

// True administrators only (owner / administrator) — deliberately stricter
// than isOfferingAdmin, which counts instructors for offering-management tasks.
// Removing PEOPLE is an admin act; an instructor must never be able to do it,
// and (Phase 1 people isolation) neither can the platform operator.
function _canManageMembers(user: PlatformUser, orgId: string, programId: string | null): boolean {
  return user.memberships.some(
    (m) =>
      m.org_id === orgId &&
      (m.role === "owner" || m.role === "administrator") &&
      (!m.program_id || m.program_id === programId),
  );
}

// Remove a member. Org-scoped memberships require org edit access; program-
// scoped ones may also be removed by that program's administrator (§3.5 — the
// program admin governs their own team). Owners can't be removed here (the
// org must always have one; ownership transfer is a separate concern).
platformRouter.delete("/members/:member_id", async (c) => {
  const user = await getCurrentUser(c);
  const memberId = c.req.param("member_id");
  const row = await db.getMembership(memberId);
  if (!row) throw new HttpError(404, "Member not found");
  if (row.role === "owner") throw new HttpError(400, "The organization owner cannot be removed");
  if (row.program_id) {
    if (!_canManageMembers(user, row.org_id, row.program_id)) {
      throw new HttpError(403, "Program admin access required");
    }
  } else {
    _assertOrgPeopleAccess(user, row.org_id, true);
  }
  await db.deleteMembership(memberId);
  await db.recordAuditEvent("member.removed", {
    orgId: row.org_id,
    actorUserId: user.id,
    scopeType: row.program_id ? "program" : "organization",
    scopeId: row.program_id ?? row.org_id,
    targetType: "membership",
    targetId: memberId,
    metadata: { role: row.role },
  });
  return c.json({ ok: true });
});

// Withdraw a pending invitation — the activation link stops working.
platformRouter.delete("/invitations/:invitation_id", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const invId = c.req.param("invitation_id");
  const inv = await graph.getInvitation(invId);
  if (!inv) throw new HttpError(404, "Invitation not found");
  if (inv.program_id) {
    if (!_canManageMembers(user, inv.organization_id as string, inv.program_id as string)) {
      throw new HttpError(403, "Program admin access required");
    }
  } else {
    _assertOrgPeopleAccess(user, inv.organization_id as string, true);
  }
  const revoked = await graph.revokeInvitation(invId);
  if (!revoked) throw new HttpError(410, "This invitation is no longer pending");
  await db.recordAuditEvent("invitation.revoked", {
    orgId: inv.organization_id as string,
    actorUserId: user.id,
    scopeType: inv.program_id ? "program" : "organization",
    scopeId: (inv.program_id as string) ?? (inv.organization_id as string),
    targetType: "invitation",
    targetId: invId,
    metadata: { email: inv.email },
  });
  return c.json({ ok: true });
});

platformRouter.get("/orgs/mine", async (c) => {
  const user = await getCurrentUser(c);
  const rows = await db.getUserOrgs(user.id);
  const seen = new Set<string>();
  const result: Row[] = [];
  for (const r of rows) {
    const org = r.organizations ?? {};
    const oid = org.id;
    if (oid && !seen.has(oid)) {
      seen.add(oid);
      result.push({ id: oid, name: org.name ?? null, slug: org.slug ?? null, role: r.role ?? null });
    }
  }
  return c.json(result);
});

platformRouter.get("/orgs/:org_id/challenge", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  const data = await db.getOrgChallenge(orgId);
  if (!data) throw new HttpError(404, "Organization not found");
  return c.json({
    org_id: data.org_id,
    org_name: data.org_name,
    enabled: data.enabled,
    name: data.name ?? null,
    stage_types: data.stage_types ?? [],
  });
});

// ── Audit log ────────────────────────────────────────────────────────────────
platformRouter.get("/orgs/:org_id/audit", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  const rawLimit = c.req.query("limit");
  let limit = 50;
  if (rawLimit !== undefined) {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit)) {
      throw new HttpError(422, [
        { loc: ["query", "limit"], msg: "Input should be a valid integer", type: "int_parsing" },
      ]);
    }
    if (limit > 200) {
      throw new HttpError(422, [
        { loc: ["query", "limit"], msg: "Input should be less than or equal to 200", type: "less_than_equal" },
      ]);
    }
  }
  _assertOrgAccess(user, orgId);
  const events = await db.listAuditEvents(orgId, limit);
  const actorIds = new Set(events.map((e) => e.actor_user_id).filter(Boolean) as string[]);
  const names = new Map<string, string>();
  for (const aid of actorIds) {
    const profile = (await db.getProfile(aid)) ?? {};
    names.set(aid, profile.display_name || profile.name || profile.email || "");
  }
  return c.json(
    events.map((e) => ({
      id: e.id,
      organization_id: e.organization_id ?? null,
      actor_user_id: e.actor_user_id ?? null,
      actor_name: names.get(e.actor_user_id ?? "") ?? null,
      action: e.action,
      scope_type: e.scope_type ?? null,
      scope_id: e.scope_id ?? null,
      target_type: e.target_type ?? null,
      target_id: e.target_id ?? null,
      metadata: e.metadata ?? {},
      created_at: e.created_at,
    })),
  );
});

// Platform operator: audit feed across every organization — boundary-level
// actions only (provisioning, governance, capabilities), never an org's content
// or people. Phase 2 (org-scoped identity) enforces the allowlist: org-internal
// events (members, invitations, offerings, registrations, …) never surface here.
const BOUNDARY_AUDIT_ACTIONS = new Set([
  "organization.provisioned",
  "organization.created",
  "organization.setup_completed",
  "organization.capabilities_updated",
  "organization.entitlement_updated",
]);

platformRouter.get("/admin/audit", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  const rawLimit = c.req.query("limit");
  let limit = 100;
  if (rawLimit !== undefined) {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit)) throw new HttpError(422, [{ loc: ["query", "limit"], msg: "Input should be a valid integer", type: "int_parsing" }]);
    if (limit > 500) throw new HttpError(422, [{ loc: ["query", "limit"], msg: "Input should be less than or equal to 500", type: "less_than_equal" }]);
  }
  const events = (await db.listAllAuditEvents(limit)).filter((e) =>
    BOUNDARY_AUDIT_ACTIONS.has(e.action as string),
  );
  const orgIds = new Set(events.map((e) => e.organization_id).filter(Boolean) as string[]);
  const orgNames = new Map<string, string>();
  for (const oid of orgIds) {
    const org = await db.getOrganization(oid);
    if (org) orgNames.set(oid, org.name as string);
  }
  const actorIds = new Set(events.map((e) => e.actor_user_id).filter(Boolean) as string[]);
  const names = new Map<string, string>();
  for (const aid of actorIds) {
    const profile = (await db.getProfile(aid)) ?? {};
    names.set(aid, profile.display_name || profile.name || profile.email || "");
  }
  return c.json(
    events.map((e) => ({
      id: e.id,
      organization_id: e.organization_id ?? null,
      organization_name: e.organization_id ? (orgNames.get(e.organization_id) ?? null) : null,
      actor_user_id: e.actor_user_id ?? null,
      actor_name: names.get(e.actor_user_id ?? "") ?? null,
      action: e.action,
      scope_type: e.scope_type ?? null,
      scope_id: e.scope_id ?? null,
      target_type: e.target_type ?? null,
      target_id: e.target_id ?? null,
      metadata: e.metadata ?? {},
      created_at: e.created_at,
    })),
  );
});

// ── Entitlements ─────────────────────────────────────────────────────────────
function _entitlementResponse(row: Row): Row {
  return {
    id: row.id,
    organization_id: row.organization_id,
    subject_type: row.subject_type ?? "organization",
    subject_id: row.subject_id,
    module: row.module,
    status: row.status ?? "active",
    limits: row.limits ?? {},
    starts_at: row.starts_at ?? null,
    ends_at: row.ends_at ?? null,
  };
}

platformRouter.get("/orgs/:org_id/entitlements", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  return c.json((await db.ensureDefaultEntitlements(orgId)).map(_entitlementResponse));
});

platformRouter.put("/orgs/:org_id/entitlements/:module", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  const moduleParam = c.req.param("module");
  const moduleParse = moduleKey.safeParse(moduleParam);
  if (!moduleParse.success) {
    throw new HttpError(422, [
      {
        loc: ["path", "module"],
        msg: "Input should be 'nexus', 'learning', 'coaching', 'analytics' or 'community'",
        type: "enum",
      },
    ]);
  }
  const req = parseBody(setEntitlementSchema, await c.req.json());
  _assertOrgAccess(user, orgId, true);
  if (moduleParse.data === "nexus") {
    throw new HttpError(400, "The nexus module cannot be disabled");
  }
  const row = await db.setEntitlement(orgId, moduleParse.data, req.status);
  await db.recordAuditEvent(
    req.status === "active" || req.status === "trial" ? "entitlement.enabled" : "entitlement.disabled",
    {
      orgId,
      actorUserId: user.id,
      scopeType: "organization",
      scopeId: orgId,
      targetType: "entitlement",
      targetId: row.id,
      metadata: { module: moduleParse.data, status: req.status },
    },
  );
  return c.json(_entitlementResponse(row));
});

// ── Capability envelope (§3.5 governance): what an org may create — program
// categories, offering types, platform features. Boundary control only, so
// read is any org member (they see their own envelope), write is operator-only.
platformRouter.get("/orgs/:org_id/capabilities", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  return c.json(await db.getOrgCapabilities(orgId));
});

const capabilityPatchSchema = z.object({
  programTypes: z.record(z.string(), z.boolean()).optional(),
  offeringTypes: z.record(z.string(), z.boolean()).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
});

platformRouter.put("/orgs/:org_id/capabilities", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  if (user.role !== "platform_admin") throw new HttpError(403, "Platform admin access required");
  const req = parseBody(capabilityPatchSchema, await c.req.json());
  const caps = await db.setOrgCapabilities(orgId, req);
  await db.recordAuditEvent("organization.capabilities_updated", {
    orgId,
    actorUserId: user.id,
    scopeType: "organization",
    scopeId: orgId,
  });
  return c.json(caps);
});

// ─── Slice 11: relationships, affiliations, groups, invitations ─────────────
function _requireDb(): void {
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
}
function _requireProgramAdmin(user: PlatformUser, orgId: string, programId: string): void {
  if (user.role === "platform_admin") return;
  if (!isOfferingAdmin(user.memberships, orgId, programId)) {
    throw new HttpError(403, "Program admin access required");
  }
}
function _requirePlatformAdmin(user: PlatformUser): void {
  if (user.role !== "platform_admin") throw new HttpError(403, "Platform admin access required");
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function _assertUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new HttpError(422, `${field} must be a valid id`);
  return value;
}

// Platform admin: manage every organization.
platformRouter.get("/admin/organizations", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  return c.json(await db.listAllOrganizations());
});

// The operator's provisioning event — a fixed, repeatable sequence: create the
// org + isolation boundary, grant default entitlements, then invite every named
// administrator (first = owner). No password is ever set by the operator; each
// administrator activates through their own invitation link, same as any invite.
const provisionOrgSchema = z.object({
  name: z.string().min(1),
  admins: z.array(z.object({ email: z.string().email(), display_name: z.string().nullish() })).min(1),
});

platformRouter.post("/admin/organizations", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const req = parseBody(provisionOrgSchema, await c.req.json());
  const result = await graph.provisionOrganizationWithAdmins(
    req.name,
    req.admins.map((a) => ({ email: a.email, displayName: a.display_name ?? null })),
  );
  await db.recordAuditEvent("organization.provisioned", {
    orgId: result.organization.id as string,
    actorUserId: user.id,
    scopeType: "organization",
    scopeId: result.organization.id as string,
    metadata: { name: req.name, admin_count: req.admins.length },
  });
  const base = (getSettings().frontendOrigin || "").replace(/\/+$/, "");
  return c.json({
    organization: result.organization,
    invitations: result.invitations.map((inv) => ({
      ...inv,
      redeem_url: base ? `${base}/invite/${inv.token}` : `/invite/${inv.token}`,
    })),
  });
});

// Organizations the caller may reference (affiliations / relationships).
// Any authenticated user gets the names-only directory of every org so they can
// link partners/chapters/coach-orgs. This exposes org names + slugs (not any
// org's private data), a deliberate relaxation of strict isolation for linking.
platformRouter.get("/orgs/selectable", async (c) => {
  await getCurrentUser(c);
  _requireDb();
  return c.json(await db.listOrgDirectory());
});

// Organization relationships
platformRouter.get("/orgs/:org_id/relationships", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  return c.json(await graph.listOrgRelationships(orgId));
});
platformRouter.post("/orgs/:org_id/relationships", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId, true);
  const body = (await c.req.json()) as Row;
  if (!body?.target_organization_id || !body?.relationship_type) {
    throw new HttpError(422, "target_organization_id and relationship_type are required");
  }
  _assertUuid(body.target_organization_id, "target_organization_id");
  const row = await graph.createOrgRelationship(orgId, {
    targetOrganizationId: body.target_organization_id,
    relationshipType: body.relationship_type,
    metadataJson: body.metadata_json ?? {},
  });
  await db.recordAuditEvent("organization.relationship_created", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId,
    targetType: "org_relationship", targetId: row.id as string,
  });
  return c.json(row);
});
// Accept a proposed relationship (target org) or update its status. Either the
// initiating or the target org may act.
platformRouter.patch("/relationships/:id", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const id = c.req.param("id");
  const existing = await graph.getOrgRelationship(id);
  if (!existing) throw new HttpError(404, "Relationship not found");
  if (!_hasOrgAccess(user, existing.source_organization_id as string) && !_hasOrgAccess(user, existing.target_organization_id as string)) {
    throw new HttpError(403, "Not authorized for this relationship");
  }
  const status = ((await c.req.json().catch(() => ({}))) as Row)?.status as string ?? "active";
  const row = await graph.updateOrgRelationship(id, status);
  if (!row) throw new HttpError(404, "Relationship not found");
  await db.recordAuditEvent(`organization.relationship_${status === "active" ? "accepted" : "updated"}`, {
    orgId: existing.target_organization_id as string, actorUserId: user.id,
    scopeType: "organization", scopeId: existing.target_organization_id as string,
    targetType: "org_relationship", targetId: id, metadata: { status },
  });
  return c.json(row);
});
// Remove a relationship — deletes the single row, so it's gone for both orgs.
platformRouter.delete("/relationships/:id", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const id = c.req.param("id");
  const existing = await graph.getOrgRelationship(id);
  if (!existing) throw new HttpError(404, "Relationship not found");
  if (!_hasOrgAccess(user, existing.source_organization_id as string) && !_hasOrgAccess(user, existing.target_organization_id as string)) {
    throw new HttpError(403, "Not authorized for this relationship");
  }
  await graph.deleteOrgRelationship(id);
  await db.recordAuditEvent("organization.relationship_removed", {
    orgId: existing.source_organization_id as string, actorUserId: user.id,
    scopeType: "organization", scopeId: existing.source_organization_id as string,
    targetType: "org_relationship", targetId: id, metadata: {},
  });
  return c.json({ ok: true });
});

// Program ↔ organization affiliations
platformRouter.get("/programs/:program_id/org-affiliations", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _assertOrgAccess(user, program.org_id);
  return c.json(await graph.listProgramOrgAffiliations(programId));
});
platformRouter.post("/programs/:program_id/org-affiliations", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireProgramAdmin(user, program.org_id, programId);
  const body = (await c.req.json()) as Row;
  if (!body?.organization_id || !body?.affiliation_type) {
    throw new HttpError(422, "organization_id and affiliation_type are required");
  }
  const row = await graph.createProgramOrgAffiliation(programId, {
    organizationId: body.organization_id, affiliationType: body.affiliation_type,
    tenantAccessMode: body.tenant_access_mode, visibility: body.visibility, metadataJson: body.metadata_json ?? {},
  });
  await db.recordAuditEvent("program.org_affiliation_created", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    targetType: "program_org_affiliation", targetId: row.id as string,
  });
  return c.json(row);
});
// Incoming affiliation requests addressed to an org (Org B's inbox).
platformRouter.get("/orgs/:org_id/incoming-affiliations", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  return c.json(await graph.listIncomingProgramOrgAffiliations(orgId));
});
// Programs shared with an org via an ACTIVE affiliation (only appear once accepted).
platformRouter.get("/orgs/:org_id/affiliated-programs", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  return c.json(await graph.listAffiliatedPrograms(orgId));
});
// The shared program's data (courses + students), read-only for the invited org.
platformRouter.get("/orgs/:org_id/affiliated-programs/:program_id", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  const programId = c.req.param("program_id");
  _assertOrgAccess(user, orgId);
  if (!(await graph.hasActiveAffiliation(orgId, programId))) {
    throw new HttpError(403, "This program is not shared with your organization");
  }
  return c.json(await graph.getAffiliatedProgramDetail(programId));
});
// Accept / decline / pause an org affiliation. Either side may update status:
// the invited org (Org B) accepts/declines, the program's org (Org A) cancels.
platformRouter.patch("/org-affiliations/:id", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const id = c.req.param("id");
  const existing = await graph.getProgramOrgAffiliation(id);
  if (!existing) throw new HttpError(404, "Affiliation not found");
  const invitedOrg = existing.organization_id as string;
  const programOrg = existing.from_organization_id as string | null;
  if (!_hasOrgAccess(user, invitedOrg) && !_hasOrgAccess(user, programOrg)) {
    throw new HttpError(403, "Not authorized for this affiliation");
  }
  const status = ((await c.req.json().catch(() => ({}))) as Row)?.status as string ?? "active";
  const row = await graph.updateProgramOrgAffiliation(id, status);
  if (!row) throw new HttpError(404, "Affiliation not found");
  const action = status === "active" ? "accepted" : status === "archived" ? "declined" : "updated";
  await db.recordAuditEvent(`program.org_affiliation_${action}`, {
    orgId: invitedOrg, actorUserId: user.id, scopeType: "program", scopeId: existing.program_id as string,
    targetType: "program_org_affiliation", targetId: id, metadata: { status },
  });
  return c.json(row);
});

// Program affiliations (actor → program)
platformRouter.get("/programs/:program_id/affiliations", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _assertOrgAccess(user, program.org_id);
  return c.json(await graph.listProgramAffiliations(programId));
});
platformRouter.post("/programs/:program_id/affiliations", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireProgramAdmin(user, program.org_id, programId);
  const body = (await c.req.json()) as Row;
  if (!body?.subject_type || !body?.subject_id || !body?.affiliation_type) {
    throw new HttpError(422, "subject_type, subject_id and affiliation_type are required");
  }
  _assertUuid(body.subject_id, "subject_id");
  if (body.represented_organization_id) _assertUuid(body.represented_organization_id, "represented_organization_id");
  const row = await graph.createProgramAffiliation(programId, {
    subjectType: body.subject_type, subjectId: body.subject_id, affiliationType: body.affiliation_type,
    representedOrganizationId: body.represented_organization_id ?? null, visibility: body.visibility, metadataJson: body.metadata_json ?? {},
  });
  await db.recordAuditEvent("program.affiliation_created", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    targetType: "program_affiliation", targetId: row.id as string,
  });
  return c.json(row);
});
platformRouter.patch("/affiliations/:id", async (c) => {
  await getCurrentUser(c);
  _requireDb();
  const body = (await c.req.json()) as Row;
  const row = await graph.updateProgramAffiliation(c.req.param("id"), (body?.status as string) ?? "active");
  if (!row) throw new HttpError(404, "Affiliation not found");
  return c.json(row);
});

// Groups
platformRouter.get("/orgs/:org_id/groups", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  return c.json(await graph.listGroups(orgId, c.req.query("program_id") ?? null));
});
platformRouter.post("/orgs/:org_id/groups", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId, true);
  const body = (await c.req.json()) as Row;
  if (!body?.name) throw new HttpError(422, "name is required");
  const row = await graph.createGroup(orgId, {
    programId: body.program_id ?? null, offeringId: body.offering_id ?? null, name: body.name,
    label: body.label ?? null, parentGroupId: body.parent_group_id ?? null,
    ownerUserId: body.owner_user_id ?? user.id, ownerOrganizationId: body.owner_organization_id ?? null,
    metadataJson: body.metadata_json ?? {},
  });
  await db.recordAuditEvent("group.created", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId, targetType: "group", targetId: row.id as string,
  });
  return c.json(row);
});
platformRouter.get("/groups/:id", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const row = await graph.getGroup(c.req.param("id"));
  if (!row) throw new HttpError(404, "Group not found");
  _assertOrgAccess(user, row.organization_id as string);
  return c.json(row);
});
platformRouter.patch("/groups/:id", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const existing = await graph.getGroup(c.req.param("id"));
  if (!existing) throw new HttpError(404, "Group not found");
  _assertOrgAccess(user, existing.organization_id as string, true);
  const body = (await c.req.json()) as Row;
  const row = await graph.updateGroup(c.req.param("id"), {
    name: body.name as string | undefined, label: body.label as string | null | undefined,
    visibility: body.visibility as string | undefined, parentGroupId: body.parent_group_id as string | null | undefined,
  });
  return c.json(row);
});
platformRouter.get("/groups/:id/members", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const g = await graph.getGroup(c.req.param("id"));
  if (!g) throw new HttpError(404, "Group not found");
  _assertOrgPeopleAccess(user, g.organization_id as string);
  return c.json(await graph.listGroupMembers(c.req.param("id")));
});
platformRouter.post("/groups/:id/members", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const g = await graph.getGroup(c.req.param("id"));
  if (!g) throw new HttpError(404, "Group not found");
  _assertOrgPeopleAccess(user, g.organization_id as string, true);
  const body = (await c.req.json()) as Row;
  return c.json(await graph.addGroupMember(c.req.param("id"), g.organization_id as string, { userId: body.user_id ?? null, role: body.role ?? null }));
});
platformRouter.delete("/groups/:id/members/:member_id", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const g = await graph.getGroup(c.req.param("id"));
  if (!g) throw new HttpError(404, "Group not found");
  _assertOrgPeopleAccess(user, g.organization_id as string, true);
  await graph.removeGroupMember(c.req.param("member_id"));
  return c.json({ ok: true });
});

// Invitations (secure-token invite link)
platformRouter.post("/orgs/:org_id/invitations", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _assertOrgPeopleAccess(user, orgId, true);
  const body = (await c.req.json()) as Row;
  const { invitation, token } = await graph.createInvitation(orgId, user.id, {
    email: body.email ?? null, displayName: body.display_name ?? null, role: (body.role as string) ?? "learner",
    programId: body.program_id ?? null, offeringId: body.offering_id ?? null, groupId: body.group_id ?? null,
    expiresAt: body.expires_at ?? null,
  });
  await db.recordAuditEvent("invitation.created", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId, targetType: "invitation", targetId: invitation.id as string,
  });
  const base = (getSettings().frontendOrigin || "").replace(/\/+$/, "");
  return c.json({ ...invitation, token, redeem_url: base ? `${base}/invite/${token}` : `/invite/${token}` });
});
// List pending invitations for an org — lets the Members UI show "invited" people
// immediately (before anyone accepts), which is otherwise invisible.
platformRouter.get("/orgs/:org_id/invitations", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _assertOrgPeopleAccess(user, orgId);
  const rows = (await graph.listInvitations(orgId)).filter((i: Row) => i.status === "pending");
  return c.json(rows);
});
platformRouter.get("/invitations/:token", async (c) => {
  _requireDb();
  const row = await graph.getInvitationByToken(c.req.param("token"));
  if (!row) throw new HttpError(404, "Invitation not found");
  return c.json(row);
});
platformRouter.post("/invitations/:token/accept", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const body = (await c.req.json().catch(() => ({}))) as Row;
  const row = await graph.acceptInvitation(
    c.req.param("token"),
    user.id,
    (body?.display_name as string) ?? null,
    user.email ?? null,
  );
  return c.json(row);
});

// ─── Slice 12: org-scoped storage (logo upload + FS serve) ──────────────────
const _LOGO_EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
};
const _MAX_LOGO_BYTES = 1_048_576; // ~1 MB (§9)

platformRouter.post("/orgs/:org_id/logo", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId, true);
  const body = (await c.req.json()) as { data?: string; content_type?: string };
  const ext = _LOGO_EXT[body.content_type ?? ""];
  if (!body.data || !ext) throw new HttpError(422, "data (base64) and a valid image content_type are required");
  const buf = Buffer.from(body.data, "base64");
  if (buf.length === 0) throw new HttpError(422, "Empty upload");
  if (buf.length > _MAX_LOGO_BYTES) throw new HttpError(413, "Logo exceeds the 1 MB limit");

  const key = orgKey(orgId, `logo.${ext}`);
  await getStorage().put(key, buf, body.content_type as string);
  const url = await getStorage().url(key);
  await db.updateOrgTheme(orgId, null, url);
  await db.recordAuditEvent("organization.logo_uploaded", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId, metadata: { key, bytes: buf.length },
  });
  return c.json({ logo_url: url });
});

// Serve locally-stored objects (FS adapter dev mode). Public — logos are org page assets.
platformRouter.get("/storage/:key{.+}", async (c) => {
  const obj = await getStorage().get(c.req.param("key"));
  if (!obj) throw new HttpError(404, "Not found");
  const ab = obj.body.buffer.slice(obj.body.byteOffset, obj.body.byteOffset + obj.body.byteLength) as ArrayBuffer;
  return c.body(ab, 200, { "Content-Type": obj.contentType });
});
