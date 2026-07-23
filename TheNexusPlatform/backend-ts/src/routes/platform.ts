/** Platform layer API routes for orgs, challenges, permissions, and join codes. */

import { Hono, type Context } from "hono";
import { z } from "zod";

import {
  demoMode,
  exchangeLaunchToken,
  createAuthUser,
  getCurrentUser,
  getOptionalUser,
  loadPlatformUser,
  mintSupabaseSession,
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
  platformRoleConfig,
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
    secondary_categories: row.secondary_categories ?? [],
    branding: row.branding ?? null,
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
      org_slug: org ? org.slug ?? null : null,
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

// LOOSE membership check: any membership that touches this org (org-level OR
// program-scoped). Use ONLY where a program member legitimately belongs (self
// info, or a program-workspace surface). Org-WIDE administration must use
// _assertOrgStaff so a program-scoped member can't read the whole org.
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

/** Org-LEVEL memberships only (not scoped to a single program) — real org staff. */
function _orgLevelMemberships(user: PlatformUser, orgId: string) {
  return user.memberships.filter((m) => m.org_id === orgId && !m.program_id);
}

// STRICT: org-WIDE administration. Platform admins + org-level members only. A
// program-scoped membership (confined to one program) grants NO org-wide reach —
// this is the wall that stops a program instructor reading the whole org.
function _assertOrgStaff(user: PlatformUser, orgId: string, requireEdit = false): void {
  if (user.role === "platform_admin") return;
  const orgLevel = _orgLevelMemberships(user, orgId);
  if (orgLevel.length === 0) throw new HttpError(403, "Organization staff access required");
  if (requireEdit && !orgLevel.some((m) => m.role === "owner" || m.access === "edit")) {
    throw new HttpError(403, "Edit access required");
  }
}

// PROGRAM-SCOPED operations (a program's own join codes, affiliations, …): org
// staff OR a member of THAT specific program. Blocks members of a *different*
// program in the same org.
function _assertProgramAccess(user: PlatformUser, orgId: string, programId: string, requireEdit = false): void {
  if (user.role === "platform_admin") return;
  const candidates = [
    ..._orgLevelMemberships(user, orgId),
    ...user.memberships.filter((m) => m.program_id === programId),
  ];
  if (candidates.length === 0) throw new HttpError(403, "Not a member of this program");
  if (
    requireEdit &&
    !candidates.some((m) => m.role === "owner" || m.role === "administrator" || m.access === "edit")
  ) {
    throw new HttpError(403, "Edit access required");
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
  // Org people management is org-staff only — a program-scoped member manages
  // people through their program's own surfaces, not the org roster.
  _assertOrgStaff(user, orgId, requireEdit);
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
      // Students hold no memberships — their standing is a learner participant
      // record (the Registrations funnel). They may sign in through the org's
      // door for THEIR APPS; the console refuses participant_only sessions.
      const participations = user.email
        ? await graph.findLearnerParticipations(user.email).catch(() => [] as Row[])
        : [];
      if (!participations.some((p) => p.organization_id === org.id)) {
        throw new HttpError(403, "No account at this organization");
      }
      return c.json({
        ..._authUserResponse({ ...user, memberships: [] }, session.access_token),
        org_id: org.id,
        org_slug: org.slug,
        participant_only: true,
      });
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
  // Demo mode: the token IS the auth id. Supabase mode: mint a REAL session
  // so the one-click "test as" login produces a working JWT, not a dead id.
  // (This impersonates without a password — _devLoginEnabled gates it; the
  // NEXUS_ENABLE_DEV_LOGIN flag must NEVER be set in a production env.)
  const token = (await demoMode()) ? authId : await mintSupabaseSession(user.email);
  return c.json(_authUserResponse(user, token));
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

// ── Gate entry (public) — sign up / sign in through a program gate ──────────
// No session required (a sign-up gate is for people with no account). The gate
// decides which actions it allows; sign-up creates a program participant
// (approval-gated if configured). Access itself still flows from participation.
platformRouter.post("/gates/:gate_id/signup", async (c) => {
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const gate = await graph.getGate(c.req.param("gate_id"));
  if (!gate) throw new HttpError(404, "Gate not found");
  if (!gate.allow_signup) throw new HttpError(403, "This gate does not allow sign-up");
  const body = (await c.req.json()) as Row;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = (body.name as string | undefined) ?? null;
  if (!email || !password) throw new HttpError(400, "Email and password are required");

  const orgId = gate.organization_id as string;
  const programId = gate.program_id as string;
  // New account, or an existing one joining through this gate: create if new,
  // otherwise authenticate the existing account (correct password required).
  // Either way we then ensure the membership/role — so "sign up" on an email
  // that already exists still admits + assigns, instead of failing.
  let authId: string;
  try {
    authId = (await createAuthUser(email, password)).id as string;
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) {
      authId = (await signInUser(email, password)).id as string;
    } else {
      throw err;
    }
  }

  if (gate.audience === "member") {
    // Internal member gate → a program membership + (chosen) role, so the person
    // lands in Team & Roles as staff, NOT in Registrations. The gate offers a
    // set of roles; the signer picks one. Validate the pick against the offer so
    // nobody can grant themselves a role the gate didn't advertise.
    const offered = Array.isArray(gate.role_ids) ? (gate.role_ids as string[]) : [];
    const requested = typeof body.role_id === "string" && body.role_id ? body.role_id : null;
    let chosenRole: string | null;
    if (requested) {
      if (!offered.includes(requested)) throw new HttpError(400, "That role isn't offered by this gate");
      chosenRole = requested;
    } else {
      // No pick sent: fine only when the gate offers exactly one (or none).
      if (offered.length > 1) throw new HttpError(400, "Please choose a role to sign up as");
      chosenRole = offered[0] ?? null;
    }
    const profileId = await db.ensureOrgProfile(authId, orgId, { email, role: "teacher", displayName: name });
    const members = await db.listMembers(orgId).catch(() => [] as Row[]);
    const alreadyMember = members.some(
      (m) => m.profile_id === profileId && ((m.program_id as string | null) ?? null) === programId,
    );
    if (!alreadyMember) await db.addMembership(orgId, profileId, "instructor", null, "edit", programId);
    if (chosenRole) {
      await graph.setProgramRoleAssignment(orgId, programId, email, chosenRole).catch((e) => console.error("gate member role:", e));
    }
    await db.recordAuditEvent("gate.member_joined", {
      orgId, scopeType: "program", scopeId: programId, targetType: "gate", targetId: gate.id as string,
      metadata: { email, role_id: chosenRole },
    });
  } else {
    // Participant gate → a learner participant (Registrations), approval-gated.
    await db.ensureOrgProfile(authId, orgId, { email, role: "student", displayName: name });
    const reg = await db.createRegistration(orgId, null, {
      programId, registrationSource: "gate_signup", email, name, userId: authId,
      status: gate.approval_required ? "pending_review" : "directly_added",
    });
    if (!gate.approval_required) {
      await db.createProgramParticipant(orgId, programId, {
        userId: authId, participantType: "learner", registrationId: reg.id,
      });
      await db.grantStudentAccess(reg).catch((e) => console.error("gate signup grant:", e));
    }
    await db.recordAuditEvent("gate.signup", {
      orgId, scopeType: "program", scopeId: programId, targetType: "gate", targetId: gate.id as string,
      metadata: { email, approval: gate.approval_required },
    });
    if (gate.approval_required) {
      const session = await signInUser(email, password);
      return c.json({ access_token: session.access_token, pending: true, landing: gate.landing ?? null });
    }
  }

  const session = await signInUser(email, password);
  return c.json({ access_token: session.access_token, pending: false, landing: gate.landing ?? null });
});

platformRouter.post("/gates/:gate_id/signin", async (c) => {
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const gate = await graph.getGate(c.req.param("gate_id"));
  if (!gate) throw new HttpError(404, "Gate not found");
  if (!gate.allow_signin) throw new HttpError(403, "This gate does not allow sign-in");
  const body = (await c.req.json()) as Row;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) throw new HttpError(400, "Email and password are required");
  // Authenticate (401 "Invalid credentials" here if the account/password is wrong).
  const session = await signInUser(email, password);

  // The account is real — but does it belong to THIS gate's program, as this
  // gate's audience? If not, refuse here (with a clear message) rather than let
  // the sign-in succeed and bounce them out of the console.
  const orgId = gate.organization_id as string;
  const programId = gate.program_id as string;
  let belongs = false;
  if (gate.audience === "member") {
    const u = await loadPlatformUser(session.id as string, email);
    belongs = u.memberships.some(
      (m) =>
        m.program_id === programId ||
        (m.org_id === orgId && (m.role === "owner" || m.role === "administrator")),
    );
  } else {
    const parts = await graph.findLearnerParticipations(email, programId).catch(() => [] as Row[]);
    belongs = parts.length > 0;
  }
  if (!belongs) {
    throw new HttpError(
      403,
      `That account isn't part of this program yet. Ask an administrator to add you${gate.allow_signup ? ", or create an account below" : ""}.`,
    );
  }
  return c.json({ access_token: session.access_token, landing: gate.landing ?? null });
});

platformRouter.get("/auth/me", async (c) => {
  const user = await getCurrentUser(c);
  // A confined Nexus operator (custom platform-scope role) — drives the
  // operator mode + confined console nav.
  const nexusRole =
    dbEnabled() && user.email && user.role !== "platform_admin"
      ? await graph.getNexusRoleForEmail(user.email).catch(() => null)
      : null;
  return c.json({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    memberships: await _membershipSummaries(user),
    nexus_role: nexusRole,
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

// ── Platform People & Roles (administered from each platform's own UI) ──────
// A platform's admin surface manages who holds which PRE-BUILT platform role,
// but the data lives here: Nexus stays the single access authority, so
// org-portal logins and test-as resolve the same answer the platform's UI set.
// Admin is never assigned here — it comes from Nexus membership (§3.5). One set
// of generic handlers serves every platform (bridge, learning, …), mounted at
// /platforms/:platform/people and, for the already-deployed Bridge app, the
// legacy /bridge/people aliases.

async function _requirePlatformRoleAdmin(user: PlatformUser, platform: string, programId: string) {
  if (!platformRoleConfig(platform)) throw new HttpError(404, "Unknown platform");
  const access = await resolvePlatformAccess(user, platform as never, programId);
  if (access.level !== "admin") throw new HttpError(403, "Platform admin access required");
  return access;
}

// A person is an admin of this platform if: Nexus membership owner/administrator,
// OR their custom program role grants the area "administrator", OR their stored
// assignment is an admin-tier role. Either way it's Nexus territory (read-only).
function _memberIsPlatformAdmin(m: Row, platform: string, assignedRole: string | null): boolean {
  if (m.membership_role === "administrator" || m.membership_role === "owner") return true;
  if ((m.role_perms as Row | undefined)?.[platform] === "administrator") return true;
  const cfg = platformRoleConfig(platform);
  return !!(cfg && assignedRole && cfg.adminRoles.includes(assignedRole));
}

async function _platformPeopleList(user: PlatformUser, platform: string, programId: string): Promise<Row[]> {
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const access = await _requirePlatformRoleAdmin(user, platform, programId);
  const members = await graph.listProgramMembers(access.orgId, programId);
  const assignments = await graph.listPlatformRoleAssignments(programId, platform);
  const byEmail = new Map(assignments.map((a: Row) => [String(a.email).toLowerCase(), a.role]));
  const adminRole = platformRoleConfig(platform)?.adminRoles[0] ?? "administrator";
  return members.map((m: Row) => {
    const email = ((m.email as string) ?? "").toLowerCase();
    const assigned = byEmail.get(email) ?? null;
    const isAdmin = _memberIsPlatformAdmin(m, platform, assigned);
    return {
      email: m.email ?? null,
      display_name: m.display_name ?? null,
      status: m.status ?? "active",
      membership_id: m.membership_id ?? null,
      invitation_id: m.invitation_id ?? null,
      role: isAdmin ? adminRole : assigned,
      is_admin: isAdmin,
    };
  });
}

async function _platformRolePut(user: PlatformUser, platform: string, body: Row): Promise<Row> {
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const cfg = platformRoleConfig(platform);
  if (!cfg) throw new HttpError(404, "Unknown platform");
  const schema = z.object({
    program_id: z.string().uuid(),
    email: z.string().email(),
    role: z.string().nullable(),
  });
  const req = parseBody(schema, body);
  if (req.role !== null && !cfg.assignable.includes(req.role)) {
    throw new HttpError(400, `Not an assignable ${platform} role`);
  }
  const access = await _requirePlatformRoleAdmin(user, platform, req.program_id);
  const members = await graph.listProgramMembers(access.orgId, req.program_id);
  const target = members.find((m: Row) => ((m.email as string) ?? "").toLowerCase() === req.email.toLowerCase());
  if (!target) throw new HttpError(404, "That person is not in this program");
  if (target.membership_role === "administrator" || target.membership_role === "owner") {
    throw new HttpError(409, "Program administrators hold admin via Nexus, not here");
  }
  const row = await graph.setPlatformRoleAssignment(
    access.orgId, req.program_id, platform, req.email, req.role, access.profileId,
  );
  await db.recordAuditEvent(`${platform}.role.assigned`, {
    orgId: access.orgId, actorUserId: user.id, scopeType: "program", scopeId: req.program_id,
    metadata: { email: req.email, role: req.role },
  });
  return row ?? { email: req.email.toLowerCase(), role: null };
}

async function _platformPersonDelete(user: PlatformUser, platform: string, programId: string, email: string): Promise<Row> {
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const access = await _requirePlatformRoleAdmin(user, platform, programId);
  const members = await graph.listProgramMembers(access.orgId, programId);
  const target = members.find((m: Row) => ((m.email as string) ?? "").toLowerCase() === email.toLowerCase());
  if (!target) throw new HttpError(404, "That person is not in this program");
  const assignments = await graph.listPlatformRoleAssignments(programId, platform);
  const assigned = (assignments.find((a: Row) => String(a.email).toLowerCase() === email.toLowerCase())?.role as string | undefined) ?? null;
  if (_memberIsPlatformAdmin(target, platform, assigned)) {
    throw new HttpError(409, "Admins are managed from the Nexus console, not removed here");
  }
  await graph.setPlatformRoleAssignment(access.orgId, programId, platform, email, null);
  if (target.membership_id) await db.deleteMembership(target.membership_id as string);
  else if (target.invitation_id) await graph.revokeInvitation(target.invitation_id as string);
  await db.recordAuditEvent(`${platform}.person.removed`, {
    orgId: access.orgId, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { email },
  });
  return { ok: true };
}

// Generic routes (any platform).
platformRouter.get("/platforms/:platform/people", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.query("program_id");
  if (!programId) throw new HttpError(400, "program_id required");
  return c.json(await _platformPeopleList(user, c.req.param("platform"), programId));
});
platformRouter.put("/platforms/:platform/people/role", async (c) => {
  const user = await getCurrentUser(c);
  return c.json(await _platformRolePut(user, c.req.param("platform"), await c.req.json()));
});
platformRouter.delete("/platforms/:platform/people", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.query("program_id");
  const email = c.req.query("email");
  if (!programId || !email) throw new HttpError(400, "program_id and email required");
  return c.json(await _platformPersonDelete(user, c.req.param("platform"), programId, email));
});

// Legacy Bridge aliases (the deployed bridge-web calls these). Same handlers,
// plus a `bridge_role` field mirror so the app's existing reads keep working.
platformRouter.get("/bridge/people", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.query("program_id");
  if (!programId) throw new HttpError(400, "program_id required");
  const rows = await _platformPeopleList(user, "bridge", programId);
  return c.json(rows.map((r) => ({ ...r, bridge_role: r.role })));
});
platformRouter.put("/bridge/people/role", async (c) => {
  const user = await getCurrentUser(c);
  return c.json(await _platformRolePut(user, "bridge", await c.req.json()));
});
platformRouter.delete("/bridge/people", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.query("program_id");
  const email = c.req.query("email");
  if (!programId || !email) throw new HttpError(400, "program_id and email required");
  return c.json(await _platformPersonDelete(user, "bridge", programId, email));
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
  // A person's custom Learning role (if assigned) carries per-area view/edit
  // perms that gate the app's nav/screens. Admins get no custom role (they see
  // everything); everyone else is confined to their role's granted areas.
  const isAdmin = access.level === "admin";
  const customRole = !isAdmin && user.email ? await graph.getLearningRoleForEmail(access.programId, user.email) : null;
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
    is_admin: isAdmin,
    learning_role: customRole, // { role_id, role_name, perms } or null
  });
});

// Learning objects, proxied through Nexus (Option B): the browser no longer
// hits Supabase directly, so org isolation is preserved. Both routes resolve
// the caller's org server-side and scope to it.
platformRouter.get("/learning/objects", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "learning", c.req.query("program_id") ?? null);
  if (!(await db.checkModuleAccess(access.orgId, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }
  return c.json(await graph.listLearningObjects(access.orgId));
});

platformRouter.put("/learning/objects", async (c) => {
  const user = await getCurrentUser(c);
  const body = (await c.req.json()) as Row;
  const access = await resolvePlatformAccess(user, "learning", (body.program_id as string) ?? c.req.query("program_id") ?? null);
  if (!(await db.checkModuleAccess(access.orgId, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }
  if (!body.id || !body.type) throw new HttpError(422, "id and type are required");
  await graph.upsertLearningObject(access.orgId, body);
  return c.json({ ok: true });
});

// ── Learning Platform custom roles (the learning app's own People tab) ──────
const _learningPerms = z.record(z.string(), z.enum(["view", "edit"]));
const learningRoleCreateSchema = z.object({ program_id: z.string(), name: z.string().min(1), perms: _learningPerms.default({}) });
const learningRoleUpdateSchema = z.object({ name: z.string().min(1).optional(), perms: _learningPerms.optional() });
const learningAssignSchema = z.object({ program_id: z.string(), email: z.string().email(), role_id: z.string().nullable() });

/** The caller must be a learning admin of the program. Returns the resolved access. */
async function _learningAdmin(c: Context, programId: string) {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "learning", programId);
  if (access.level !== "admin") throw new HttpError(403, "Learning admin access required");
  return access;
}

platformRouter.get("/learning/roles", async (c) => {
  const pid = c.req.query("program_id") ?? "";
  const access = await _learningAdmin(c, pid);
  return c.json(await graph.listLearningRoles(access.orgId, access.programId));
});

platformRouter.post("/learning/roles", async (c) => {
  const req = parseBody(learningRoleCreateSchema, await c.req.json());
  const access = await _learningAdmin(c, req.program_id);
  return c.json(await graph.createLearningRole(access.orgId, access.programId, req.name, req.perms));
});

platformRouter.patch("/learning/roles/:id", async (c) => {
  const body = parseBody(learningRoleUpdateSchema, await c.req.json());
  const pid = c.req.query("program_id") ?? "";
  await _learningAdmin(c, pid);
  const row = await graph.updateLearningRole(c.req.param("id"), { name: body.name, perms: body.perms });
  if (!row) throw new HttpError(404, "Role not found");
  return c.json(row);
});

platformRouter.delete("/learning/roles/:id", async (c) => {
  const pid = c.req.query("program_id") ?? "";
  await _learningAdmin(c, pid);
  await graph.deleteLearningRole(c.req.param("id"));
  return c.json({ ok: true });
});

platformRouter.get("/learning/roster", async (c) => {
  const pid = c.req.query("program_id") ?? "";
  const access = await _learningAdmin(c, pid);
  return c.json(await graph.listLearningPeople(access.orgId, access.programId));
});

platformRouter.put("/learning/assign", async (c) => {
  const req = parseBody(learningAssignSchema, await c.req.json());
  const access = await _learningAdmin(c, req.program_id);
  await graph.setLearningRoleAssignment(access.orgId, access.programId, req.email, req.role_id);
  return c.json({ ok: true });
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
  _assertOrgStaff(user, orgId, true);

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
  _assertOrgStaff(user, orgId);
  return c.json((await db.listPrograms(orgId)).map(_programResponse));
});

platformRouter.post("/orgs/:org_id/programs", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  const req = parseBody(programInput, await c.req.json());
  await _requireOrgArea(user, orgId, "programs", "edit");
  {
    const caps = await db.getOrgCapabilities(orgId);
    // Program capacity (Nexus-governed; null = unlimited). Applies to everyone —
    // the envelope is the org's boundary, not a per-caller permission.
    const capacity = caps.programCapacity as number | null;
    if (capacity != null) {
      const count = (await db.listPrograms(orgId)).length;
      if (count >= capacity) {
        throw new HttpError(403, `Program capacity reached (${capacity}). Raise it from the Nexus console.`);
      }
    }
  }
  const row = await db.createProgram(orgId, req.name, req.category, {
    description: req.description ?? null,
    icon: req.icon ?? null,
    instructorLabel: req.instructor_label ?? null,
    learnerLabel: req.learner_label ?? null,
    features: req.features ?? null,
    secondaryCategories: req.secondary_categories?.filter((c) => c !== req.category) ?? null,
  });
  // Give the new program its own group scope, mirroring org_setup behavior.
  if (req.category !== "game") {
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
  await _requireOrgArea(user, program.org_id, "programs", "edit");
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
async function _assertProgramConfigAccess(user: PlatformUser, orgId: string, programId: string): Promise<void> {
  if (user.role === "platform_admin") return;
  const ok = user.memberships.some(
    (m) =>
      m.org_id === orgId &&
      (m.role === "owner" || m.role === "administrator" || m.access === "edit") &&
      (!m.program_id || m.program_id === programId),
  );
  if (ok) return;
  // Custom org role with Programs · edit configures any program (Team & Roles
  // at the org altitude — the toggle has to actually do something).
  await _requireOrgArea(user, orgId, "programs", "edit");
}

platformRouter.patch("/programs/:program_id/features", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  await _assertProgramConfigAccess(user, program.org_id, programId);
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
  await _requireOrgArea(user, orgId, "settings", "edit");
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

const orgNameSchema = z.object({ name: z.string().trim().min(1).max(120) });

platformRouter.patch("/orgs/:org_id/name", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  const req = parseBody(orgNameSchema, await c.req.json());
  await _requireOrgArea(user, orgId, "settings", "edit");
  const org = await db.updateOrgName(orgId, req.name);
  await db.recordAuditEvent("organization.renamed", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId,
    metadata: { name: req.name },
  });
  return c.json({ id: org.id, name: org.name, slug: org.slug });
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
  _assertOrgStaff(user, orgId);
  return c.json((await db.listIntegrations(orgId)).map(_integrationResponse));
});

platformRouter.post("/orgs/:org_id/integrations", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  const req = parseBody(integrationInputSchema, await c.req.json());
  _assertOrgStaff(user, orgId, true);
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
  _assertProgramAccess(user, program.org_id, programId, true);

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
  _assertOrgStaff(user, orgId);
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
  _assertOrgStaff(user, orgId, true);
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
  _assertOrgStaff(user, stage.org_id, true);

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
  _assertOrgStaff(user, targetOrgId);

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
type OrgArea = "programs" | "team" | "settings" | "audit";
type NexusArea = "organizations" | "audit" | "settings";

/**
 * Area-level access at the ORG altitude. Owners/administrators pass
 * everything; custom org roles (Team & Roles, org scope) grant per-area
 * view/edit. The operator passes boundary areas but is walled off "team".
 */
async function _requireOrgArea(
  user: PlatformUser,
  orgId: string,
  area: OrgArea,
  level: "view" | "edit",
): Promise<void> {
  if (user.role === "platform_admin") {
    if (area === "team") throw new HttpError(403, "Nexus operators cannot access an organization's members");
    return;
  }
  const mine = user.memberships.filter((m) => m.org_id === orgId);
  if (mine.length === 0) throw new HttpError(403, "Not a member of this organization");
  if (mine.some((m) => !m.program_id && ["owner", "administrator"].includes(m.role))) return;
  if (dbEnabled() && user.email) {
    const role = await graph.getOrgRoleForEmail(orgId, user.email).catch(() => null);
    const g = (role?.perms as Row | undefined)?.[area] as string | undefined;
    if (g === "edit" || (level === "view" && (g === "view" || g === "on"))) return;
  }
  throw new HttpError(403, `Your role does not grant ${level} access to ${area}`);
}

/** Area-level access at the NEXUS altitude: platform_admin passes everything;
 * confined operators carry a nexus-scope custom role. */
async function _requireNexusArea(user: PlatformUser, area: NexusArea, level: "view" | "edit"): Promise<void> {
  if (user.role === "platform_admin") return;
  if (dbEnabled() && user.email) {
    const role = await graph.getNexusRoleForEmail(user.email).catch(() => null);
    const g = (role?.perms as Row | undefined)?.[area] as string | undefined;
    if (g === "edit" || (level === "view" && (g === "view" || g === "on"))) return;
  }
  throw new HttpError(403, "Nexus operator access required");
}

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
  } else if (row.role === "administrator") {
    // Admins stay owner/admin-managed (Q1) — a custom Team·edit role can't
    // remove them.
    _assertOrgPeopleAccess(user, row.org_id, true);
  } else {
    await _requireOrgArea(user, row.org_id, "team", "edit");
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
  _assertOrgStaff(user, orgId);
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
  await _requireOrgArea(user, orgId, "audit", "view");
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
  _assertOrgStaff(user, orgId);
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
  await _requireNexusArea(user, "audit", "view");
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
  _assertOrgStaff(user, orgId);
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
  _assertOrgStaff(user, orgId, true);
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
  _assertOrgStaff(user, orgId);
  return c.json(await db.getOrgCapabilities(orgId));
});

const capabilityPatchSchema = z.object({
  programTypes: z.record(z.string(), z.boolean()).optional(),
  offeringTypes: z.record(z.string(), z.boolean()).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  // Max programs the org may create; null = unlimited.
  programCapacity: z.number().int().min(1).nullable().optional(),
});

platformRouter.put("/orgs/:org_id/capabilities", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  await _requireNexusArea(user, "organizations", "edit");
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

// ── Branding: Nexus platform + per-program (theme + logo) ───────────────────
// Same shape as the org theme; Nexus's own branding lives in platform_settings
// and a program's rides its metadata (revert = clear, falls back to the org).

platformRouter.get("/platform/branding", async (c) => {
  // Public: the operator console shell (and login gate) needs it pre-auth.
  if (!dbEnabled()) return c.json({ accent: null, logo: null, title: null });
  const b = ((await db.getPlatformSetting("branding")) ?? {}) as Row;
  return c.json({
    accent: (b.accent as string) ?? null,
    logo: (b.logo as string) ?? null,
    title: (b.title as string) ?? null,
  });
});

const platformNameSchema = z.object({ title: z.string().trim().min(1).max(120) });

platformRouter.patch("/admin/platform/name", async (c) => {
  const user = await getCurrentUser(c);
  await _requireNexusArea(user, "settings", "edit");
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const req = parseBody(platformNameSchema, await c.req.json());
  const cur = ((await db.getPlatformSetting("branding")) ?? {}) as Row;
  const next = { ...cur, title: req.title };
  await db.setPlatformSetting("branding", next);
  return c.json(next);
});

const platformThemeSchema = z.object({ accent_color: z.string().trim().min(1).max(32) });

platformRouter.patch("/admin/platform/theme", async (c) => {
  const user = await getCurrentUser(c);
  await _requireNexusArea(user, "settings", "edit");
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const req = parseBody(platformThemeSchema, await c.req.json());
  const cur = ((await db.getPlatformSetting("branding")) ?? {}) as Row;
  const next = { ...cur, accent: req.accent_color };
  await db.setPlatformSetting("branding", next);
  return c.json(next);
});

platformRouter.post("/admin/platform/logo", async (c) => {
  const user = await getCurrentUser(c);
  await _requireNexusArea(user, "settings", "edit");
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const body = (await c.req.json()) as { data?: string; content_type?: string };
  const ext = _LOGO_EXT[body.content_type ?? ""];
  if (!body.data || !ext) throw new HttpError(422, "data (base64) and a valid image content_type are required");
  const buf = Buffer.from(body.data, "base64");
  if (buf.length === 0) throw new HttpError(422, "Empty upload");
  if (buf.length > _MAX_LOGO_BYTES) throw new HttpError(413, "Logo exceeds the 1 MB limit");
  const key = `platform/logo.${ext}`;
  await getStorage().put(key, buf, body.content_type as string);
  const url = await getStorage().url(key);
  const cur = ((await db.getPlatformSetting("branding")) ?? {}) as Row;
  await db.setPlatformSetting("branding", { ...cur, logo: url });
  return c.json({ logo_url: url });
});

const programThemeSchema = z.object({
  accent_color: z.string().trim().min(1).max(32).nullish(),
  /** true clears the program's branding entirely (revert to the org's). */
  revert: z.boolean().optional(),
  /** true clears just the card cover image, leaving accent/logo intact. */
  remove_cover: z.boolean().optional(),
});

const programCategoriesSchema = z.object({
  category: z.string().trim().min(1).max(60).optional(),
  secondary_categories: z.array(z.string().trim().min(1).max(60)).optional(),
});

platformRouter.patch("/programs/:program_id/categories", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  await _assertProgramConfigAccess(user, program.org_id, programId);
  const req = parseBody(programCategoriesSchema, await c.req.json());
  const row = await db.updateProgramCategories(programId, {
    category: req.category,
    secondaryCategories: req.secondary_categories,
  });
  if (!row) throw new HttpError(404, "Program not found");
  await db.recordAuditEvent("program.categories_updated", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { category: row.category, secondary_categories: row.secondary_categories },
  });
  return c.json(_programResponse(row));
});

const programNameSchema = z.object({ name: z.string().trim().min(1).max(120) });

platformRouter.patch("/programs/:program_id/name", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  await _assertProgramConfigAccess(user, program.org_id, programId);
  const req = parseBody(programNameSchema, await c.req.json());
  const row = await db.updateProgramName(programId, req.name);
  if (!row) throw new HttpError(404, "Program not found");
  await db.recordAuditEvent("program.renamed", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { name: req.name },
  });
  return c.json(_programResponse(row));
});

platformRouter.patch("/programs/:program_id/theme", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  await _assertProgramConfigAccess(user, program.org_id, programId);
  const req = parseBody(programThemeSchema, await c.req.json());
  const branding = req.revert
    ? await db.setProgramBranding(programId, null)
    : req.remove_cover
      ? await db.setProgramBranding(programId, { cover: null })
      : await db.setProgramBranding(programId, { accent: req.accent_color ?? null });
  await db.recordAuditEvent(req.revert ? "program.branding.reverted" : "program.theme_updated", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
  });
  return c.json({ branding: branding ?? null });
});

platformRouter.post("/programs/:program_id/logo", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  await _assertProgramConfigAccess(user, program.org_id, programId);
  const body = (await c.req.json()) as { data?: string; content_type?: string };
  const ext = _LOGO_EXT[body.content_type ?? ""];
  if (!body.data || !ext) throw new HttpError(422, "data (base64) and a valid image content_type are required");
  const buf = Buffer.from(body.data, "base64");
  if (buf.length === 0) throw new HttpError(422, "Empty upload");
  if (buf.length > _MAX_LOGO_BYTES) throw new HttpError(413, "Logo exceeds the 1 MB limit");
  const key = orgKey(program.org_id, `programs/${programId}/logo.${ext}`);
  await getStorage().put(key, buf, body.content_type as string);
  const url = await getStorage().url(key);
  await db.setProgramBranding(programId, { logo: url });
  await db.recordAuditEvent("program.logo_uploaded", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { key, bytes: buf.length },
  });
  return c.json({ logo_url: url });
});

// Program card cover (the background image on the Programs page). Larger cap
// than a logo since it's a full-bleed photo, but still small enough for the
// DB-backed storage adapter.
platformRouter.post("/programs/:program_id/cover", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  await _assertProgramConfigAccess(user, program.org_id, programId);
  const body = (await c.req.json()) as { data?: string; content_type?: string };
  const ext = _LOGO_EXT[body.content_type ?? ""];
  if (!body.data || !ext) throw new HttpError(422, "data (base64) and a valid image content_type are required");
  const buf = Buffer.from(body.data, "base64");
  if (buf.length === 0) throw new HttpError(422, "Empty upload");
  if (buf.length > _MAX_COVER_BYTES) throw new HttpError(413, "Cover image exceeds the 4 MB limit");
  const key = orgKey(program.org_id, `programs/${programId}/cover.${ext}`);
  await getStorage().put(key, buf, body.content_type as string);
  const url = await getStorage().url(key);
  await db.setProgramBranding(programId, { cover: url });
  await db.recordAuditEvent("program.cover_uploaded", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { key, bytes: buf.length },
  });
  return c.json({ cover_url: url });
});

// ── Org-defined program categories (Settings → Categories) ──────────────────
const categoryNameSchema = z.object({ name: z.string().trim().min(1).max(60) });
const categoryRenameSchema = z.object({
  from: z.string().trim().min(1).max(60),
  to: z.string().trim().min(1).max(60),
});

platformRouter.get("/orgs/:org_id/categories", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  _assertOrgStaff(user, orgId);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  return c.json(await db.listOrgCategories(orgId));
});

platformRouter.post("/orgs/:org_id/categories", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "settings", "edit");
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const req = parseBody(categoryNameSchema, await c.req.json());
  const list = await db.addOrgCategory(orgId, req.name);
  await db.recordAuditEvent("organization.category.added", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId, metadata: { name: req.name },
  });
  return c.json(list);
});

platformRouter.delete("/orgs/:org_id/categories", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "settings", "edit");
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const name = c.req.query("name");
  if (!name) throw new HttpError(400, "name required");
  try {
    const list = await db.removeOrgCategory(orgId, name);
    await db.recordAuditEvent("organization.category.removed", {
      orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId, metadata: { name },
    });
    return c.json(list);
  } catch (e) {
    throw new HttpError(409, e instanceof Error ? e.message : "Category is in use");
  }
});

platformRouter.patch("/orgs/:org_id/categories", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "settings", "edit");
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const req = parseBody(categoryRenameSchema, await c.req.json());
  const list = await db.renameOrgCategory(orgId, req.from, req.to);
  await db.recordAuditEvent("organization.category.renamed", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId,
    metadata: { from: req.from, to: req.to },
  });
  return c.json(list);
});

// ── Team & Roles: ORGANIZATION altitude ──────────────────────────────────────
const scopedRoleSchema = z.object({ name: z.string().trim().min(1).max(80), perms: z.record(z.string(), z.string()) });

platformRouter.get("/orgs/:org_id/roles", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "team", "view");
  return c.json(await graph.listOrgRoles(orgId));
});

platformRouter.post("/orgs/:org_id/roles", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "team", "edit");
  const req = parseBody(scopedRoleSchema, await c.req.json());
  const row = await graph.createOrgRole(orgId, req.name, req.perms);
  await db.recordAuditEvent("organization.role.created", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId, metadata: { name: req.name },
  });
  return c.json(row);
});

platformRouter.get("/orgs/:org_id/team", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "team", "view");
  return c.json(await graph.listOrgTeam(orgId));
});

const orgTeamInviteSchema = z.object({
  email: z.string().email(),
  display_name: z.string().nullish(),
  role_id: z.string().nullish(),
});

platformRouter.post("/orgs/:org_id/team", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "team", "edit");
  const req = parseBody(orgTeamInviteSchema, await c.req.json());
  const { invitation, token } = await graph.createInvitation(orgId, user.id, {
    email: req.email, displayName: req.display_name ?? null, role: "member", programId: null,
  });
  if (req.role_id) await graph.setOrgRoleAssignment(orgId, req.email, req.role_id);
  await db.recordAuditEvent("organization.member.invited", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId,
    metadata: { email: req.email, role_id: req.role_id ?? null },
  });
  const base = (getSettings().frontendOrigin || "").replace(/\/+$/, "");
  return c.json({ ...invitation, token, redeem_url: base ? `${base}/invite/${token}` : `/invite/${token}` });
});

const orgTeamRoleSchema = z.object({ email: z.string().email(), role_id: z.string().nullable() });

platformRouter.put("/orgs/:org_id/team/role", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "team", "edit");
  const req = parseBody(orgTeamRoleSchema, await c.req.json());
  await graph.setOrgRoleAssignment(orgId, req.email, req.role_id);
  return c.json({ ok: true });
});

platformRouter.get("/orgs/:org_id/my-role", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  if (!user.email) return c.json(null);
  return c.json(await graph.getOrgRoleForEmail(orgId, user.email));
});

// ── Team & Roles: NEXUS altitude (full operators only manage it) ────────────
platformRouter.get("/admin/nexus/roles", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  return c.json(await graph.listNexusRoles());
});

platformRouter.post("/admin/nexus/roles", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const req = parseBody(scopedRoleSchema, await c.req.json());
  return c.json(await graph.createNexusRole(req.name, req.perms));
});

platformRouter.get("/admin/nexus/team", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  return c.json(await graph.listNexusTeam());
});

const nexusInviteSchema = z.object({
  email: z.string().email(),
  display_name: z.string().nullish(),
  /** Full operator, or confined by role_id. */
  role_id: z.string().nullish(),
});

platformRouter.post("/admin/nexus/team", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const req = parseBody(nexusInviteSchema, await c.req.json());
  const { invitation, token } = await graph.createNexusInvitation({
    email: req.email, displayName: req.display_name ?? null, full: !req.role_id,
  });
  if (req.role_id) await graph.setNexusRoleAssignment(req.email, req.role_id);
  const base = (getSettings().frontendOrigin || "").replace(/\/+$/, "");
  return c.json({ ...invitation, token, redeem_url: base ? `${base}/invite/${token}` : `/invite/${token}` });
});

platformRouter.put("/admin/nexus/team/role", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const req = parseBody(orgTeamRoleSchema, await c.req.json());
  await graph.setNexusRoleAssignment(req.email, req.role_id);
  return c.json({ ok: true });
});

platformRouter.delete("/admin/nexus/team", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const email = c.req.query("email");
  if (!email) throw new HttpError(400, "email required");
  if (user.email && email.toLowerCase() === user.email.toLowerCase()) {
    throw new HttpError(409, "You can't remove yourself — another operator must do it");
  }
  await graph.removeNexusOperator(email);
  return c.json({ ok: true });
});

platformRouter.get("/nexus/my-role", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled() || !user.email) return c.json(null);
  return c.json(await graph.getNexusRoleForEmail(user.email));
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
  await _requireNexusArea(user, "organizations", "view");
  return c.json(await db.listAllOrganizations());
});

// The operator's provisioning event — a fixed, repeatable sequence: create the
// org + isolation boundary, grant default entitlements, then enroll every named
// administrator (first = owner) as an ACTIVE member with an account right away —
// no pending activation link. New accounts get a shared temp password (returned
// so the operator can hand it off) until the real reset flow lands.
const PROVISION_PASSWORD = "NexusDev2026!";
const provisionOrgSchema = z.object({
  name: z.string().min(1),
  admins: z.array(z.object({ email: z.string().email(), display_name: z.string().nullish() })).min(1),
});

/** Resolve an existing login by email, or create one. Returns the auth id. */
async function _resolveOrCreateAccount(email: string): Promise<{ authId: string; created: boolean }> {
  const existing = await db.getProfileByEmail(email.trim().toLowerCase());
  if (existing) return { authId: (existing.auth_user_id as string) ?? (existing.id as string), created: false };
  const acct = await createAuthUser(email.trim().toLowerCase(), PROVISION_PASSWORD);
  return { authId: acct.id as string, created: true };
}

platformRouter.post("/admin/organizations", async (c) => {
  const user = await getCurrentUser(c);
  await _requireNexusArea(user, "organizations", "edit");
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const req = parseBody(provisionOrgSchema, await c.req.json());

  const [owner, ...rest] = req.admins;
  // Owner: the canonical transactional provisioning event creates the org +
  // isolation boundary + entitlements + an ACTIVE owner membership in one shot.
  const ownerAcct = await _resolveOrCreateAccount(owner.email);
  const result = await provisionOrganization({
    name: req.name,
    owner: { userId: ownerAcct.authId, email: owner.email.trim().toLowerCase(), displayName: owner.display_name ?? undefined },
    // The operator explicitly designating this account as owner is consent to
    // let an existing account (from another org) also own this one.
    allowSecondOrg: true,
  });

  const enrolled: Array<{ email: string; role: string; created: boolean }> = [
    { email: owner.email.trim().toLowerCase(), role: "owner", created: ownerAcct.created },
  ];
  // Remaining named admins → active administrator memberships in the new org.
  for (const a of rest) {
    const email = a.email.trim().toLowerCase();
    const acct = await _resolveOrCreateAccount(email);
    const profileId = await db.ensureOrgProfile(acct.authId, result.organizationId, {
      email, role: "org_admin", displayName: a.display_name ?? null, allowSecondOrg: true,
    });
    await db.addMembership(result.organizationId, profileId, "administrator", null, "edit", null);
    enrolled.push({ email, role: "administrator", created: acct.created });
  }

  await db.recordAuditEvent("organization.provisioned", {
    orgId: result.organizationId,
    actorUserId: user.id,
    scopeType: "organization",
    scopeId: result.organizationId,
    metadata: { name: req.name, admin_count: req.admins.length },
  });
  return c.json({
    organization: { id: result.organizationId, name: req.name, slug: result.slug, status: "active" },
    admins: enrolled.map((e) => ({ ...e, temp_password: e.created ? PROVISION_PASSWORD : null })),
  });
});

// ── Boundary administrators (Nexus "Edit" tab) ──────────────────────────────
// Who RUNS the org is boundary-governance data (the operator provisioned them
// in the first place), distinct from the org's people (0021 wall): these
// endpoints expose and manage ONLY org-level owner/administrator standing —
// never program members, learners, or anyone else inside.
platformRouter.get("/admin/organizations/:org_id/admins", async (c) => {
  const user = await getCurrentUser(c);
  await _requireNexusArea(user, "organizations", "edit");
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  // Privileged boundary read — the 0021 people wall hides org memberships from
  // the operator, but WHO RUNS the org is governance data the operator set up.
  return c.json(await graph.listOrgLevelAdmins(orgId));
});

const orgAdminAddSchema = z.object({ email: z.string().email(), display_name: z.string().nullish() });

platformRouter.post("/admin/organizations/:org_id/admins", async (c) => {
  const user = await getCurrentUser(c);
  await _requireNexusArea(user, "organizations", "edit");
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  const req = parseBody(orgAdminAddSchema, await c.req.json());
  const { invitation, token } = await graph.createOrgAdminInvitation(orgId, {
    email: req.email,
    displayName: req.display_name ?? null,
  });
  await db.recordAuditEvent("organization.administrator.invited", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId,
    metadata: { email: req.email },
  });
  const base = (getSettings().frontendOrigin || "").replace(/\/+$/, "");
  return c.json({ ...invitation, token, redeem_url: base ? `${base}/invite/${token}` : `/invite/${token}` });
});

platformRouter.delete("/admin/organizations/:org_id/admins", async (c) => {
  const user = await getCurrentUser(c);
  await _requireNexusArea(user, "organizations", "edit");
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  const membershipId = c.req.query("membership_id");
  const invitationId = c.req.query("invitation_id");
  await graph.removeOrgLevelAdmin(orgId, { membershipId, invitationId });
  await db.recordAuditEvent("organization.administrator.removed", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId,
    metadata: { membership_id: membershipId ?? null, invitation_id: invitationId ?? null },
  });
  return c.json({ ok: true });
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
  _assertOrgStaff(user, orgId);
  return c.json(await graph.listOrgRelationships(orgId));
});
platformRouter.post("/orgs/:org_id/relationships", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _assertOrgStaff(user, orgId, true);
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
  _assertProgramAccess(user, program.org_id, programId);
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
  _assertOrgStaff(user, orgId);
  return c.json(await graph.listIncomingProgramOrgAffiliations(orgId));
});
// Programs shared with an org via an ACTIVE affiliation (only appear once accepted).
platformRouter.get("/orgs/:org_id/affiliated-programs", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _assertOrgStaff(user, orgId);
  return c.json(await graph.listAffiliatedPrograms(orgId));
});
// The shared program's data (courses + students), read-only for the invited org.
platformRouter.get("/orgs/:org_id/affiliated-programs/:program_id", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  const programId = c.req.param("program_id");
  _assertOrgStaff(user, orgId);
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
  _assertProgramAccess(user, program.org_id, programId);
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
platformRouter.delete("/groups/:id", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const existing = await graph.getGroup(c.req.param("id"));
  if (!existing) throw new HttpError(404, "Group not found");
  _assertOrgAccess(user, existing.organization_id as string, true);
  await graph.deleteGroup(c.req.param("id"));
  await db.recordAuditEvent("group.deleted", {
    orgId: existing.organization_id as string, actorUserId: user.id,
    scopeType: "organization", scopeId: existing.organization_id as string,
    targetType: "group", targetId: c.req.param("id"),
  });
  return c.json({ ok: true });
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
const _MAX_COVER_BYTES = 4_194_304; // ~4 MB — full-bleed card cover photos

platformRouter.post("/orgs/:org_id/logo", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "settings", "edit");
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
