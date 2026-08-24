/** Platform layer API routes for orgs, challenges, permissions, and join codes. */

import { randomBytes, randomUUID } from "node:crypto";

import { Hono, type Context } from "hono";
import { z } from "zod";

import {
  demoMode,
  exchangeLaunchToken,
  createAuthUser,
  getCurrentUser,
  setAuthUserPassword,
  getOptionalUser,
  loadPlatformUser,
  mintSupabaseSession,
  refreshUserSession,
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
import { slugify } from "../platformLocalStore";
import * as catalogue from "../accessCatalogue/store";
import * as provisioning from "../accessCatalogue/provisioning";
import * as clubAppAccess from "../accessCatalogue/clubAppAccess";
import * as contentCaps from "../accessCatalogue/contentCapMap";
import type { CapabilityCatalogueDocument } from "../accessCatalogue/types";
import { resolveCapabilities, surfacesForCapabilities, grantableCapabilities } from "../accessCatalogue/resolver";
import { capabilitiesFor, requireCapability } from "../accessCatalogue/enforce";
import * as bridgeRoles from "../accessCatalogue/bridgeRoles";
import * as appRoles from "../accessCatalogue/appRoles";
import * as appAdmins from "../accessCatalogue/contentAppAdmins";
import type { ProviderId } from "../accessCatalogue/types";
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
  adminSetPasswordSchema,
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
  usernameSchema,
  avatarDataUrlSchema,
  CONTENT_APP_TARGETS,
  CONTENT_APP_TARGET_KEYS,
} from "../schemas";
import {
  BRIDGE_ROLE_MAP,
  LEARNING_ROLE_MAP,
  platformAppSlug,
  platformRoleConfig,
  resolvePlatformAccess,
  type ResolvedPlatformAccess,
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
    platforms_open: row.platforms_open !== false,
    feature_access: row.feature_access ?? null,
    is_partner: row.is_partner ?? false,
    connected_program_id: row.connected_program_id ?? null,
    slug: row.slug ?? null,
  };
}

async function _membershipSummaries(user: PlatformUser): Promise<Row[]> {
  // One read per DISTINCT org/stage/program, all in flight together. This was
  // a sequential loop making up to four round trips PER membership, which put
  // /auth/me — called on every app launch and role check — at ~130ms for a
  // one-membership learner but ~900ms for a coach. The people with the most
  // memberships paid the most, on the least interesting endpoint.
  const distinct = <T>(xs: (T | null | undefined)[]): T[] => [...new Set(xs.filter((x): x is T => Boolean(x)))];
  const orgIds = distinct(user.memberships.map((m) => m.org_id));
  const stageIds = distinct(user.memberships.map((m) => m.stage_node_id));
  const programIds = distinct(user.memberships.map((m) => m.program_id));

  const [orgRows, stageRows, programRows, appRows] = await Promise.all([
    Promise.all(orgIds.map((id) => db.getOrganization(id))),
    Promise.all(stageIds.map((id) => db.getStageNode(id))),
    Promise.all(programIds.map((id) => db.getProgram(id))),
    Promise.all(programIds.map((id) => db.listRegisteredApps(id))),
  ]);
  const orgs = new Map(orgIds.map((id, i) => [id, orgRows[i]]));
  const stages = new Map(stageIds.map((id, i) => [id, stageRows[i]]));
  const programs = new Map(programIds.map((id, i) => [id, programRows[i]]));
  const apps = new Map(programIds.map((id, i) => [id, appRows[i]]));

  return user.memberships.map((m) => {
    const org = orgs.get(m.org_id) ?? null;
    const stage = m.stage_node_id ? (stages.get(m.stage_node_id) ?? null) : null;
    const program = m.program_id ? (programs.get(m.program_id) ?? null) : null;
    const active = m.program_id
      ? (apps.get(m.program_id) ?? []).filter((a) => a.status === "active")
      : [];
    return {
      id: m.id,
      org_id: m.org_id,
      org_name: org ? org.name : "",
      org_slug: org ? (org.slug ?? null) : null,
      // The org-scoped person id (profiles.id) — the canonical identity WITHIN
      // this org's space (Phase 2). Platform context endpoints (bridge/learning)
      // key on this, never on the cross-cutting auth credential id.
      profile_id: m.profile_id ?? null,
      role: m.role,
      stage_node_id: m.stage_node_id ?? null,
      stage_name: stage ? (stage.name ?? null) : null,
      stage_type: stage ? (stage.stage_type ?? m.stage_type ?? null) : (m.stage_type ?? null),
      access: m.access,
      program_id: m.program_id ?? null,
      program_name: program ? (program.name ?? null) : null,
      program_category: program ? (program.category ?? null) : null,
      registered_app_id: active.length > 0 ? active[0].id : null,
      app_launch_url: active.length > 0 ? (active[0].launch_url ?? null) : null,
    };
  });
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

/** The session's refresh fields, when the auth backend mints them (Supabase
 *  mode). Demo-mode sessions carry neither — clients read absence as "no
 *  refresh flow" and keep their old expiry behavior. */
function _sessionExtras(session: Row): Row {
  const extras: Row = {};
  if (session.refresh_token) extras.refresh_token = session.refresh_token;
  if (session.expires_at != null) extras.expires_at = session.expires_at;
  return extras;
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
    const ownerProfileId = dbEnabled()
      ? await db.resolveProfileId(auth.id, null).catch(() => null)
      : null;
    if (ownerProfileId) await db.markPasswordClaimed(ownerProfileId).catch(() => {});
    const session = await signInUser(req.email, req.password);
    const user = await loadPlatformUser(auth.id, req.email);
    return c.json(_authUserResponse(user, session.access_token));
  }

  if (req.signup_type === "student") {
    const auth = await createAuthUser(req.email, req.password);
    const profile = await db.createProfile(auth.id, req.email, "student", req.display_name ?? null);
    // They chose this password themselves, so it is theirs from the start (0046).
    // Without this the app would greet them by asking them to replace the
    // "temporary password" they had just invented.
    if (profile?.id) await db.markPasswordClaimed(profile.id as string).catch(() => {});
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
  // Chosen by them at signup, so theirs from the start (0046).
  if (profileId) await db.markPasswordClaimed(profileId as string).catch(() => {});

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
  const password = body?.password;
  // The identifier field accepts an email OR a username: a username can never
  // contain "@" (usernameSchema), so the two are unambiguous. `username` is
  // also accepted explicitly for callers that keep them in separate fields.
  const identifier: string | undefined =
    (typeof body?.email === "string" && body.email.trim() ? body.email.trim() : undefined) ??
    (typeof body?.username === "string" && body.username.trim() ? body.username.trim() : undefined);
  if (!identifier || !password) throw new HttpError(400, "email and password required");

  let email = identifier;
  if (!identifier.includes("@")) {
    // Resolve the username to the email its auth credential is keyed by. The
    // failure is deliberately the same 401 as a bad password, so this cannot be
    // used to enumerate which usernames exist.
    const byUsername = dbEnabled() ? await db.getProfileByUsername(identifier) : null;
    const resolved = byUsername?.email;
    if (!resolved) throw new HttpError(401, "Invalid credentials");
    email = resolved as string;
  }
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
        ..._sessionExtras(session),
        org_id: org.id,
        org_slug: org.slug,
        participant_only: true,
      });
    }
    const scoped: PlatformUser = { ...user, memberships: orgMemberships };
    return c.json({
      ..._authUserResponse(scoped, session.access_token),
      ..._sessionExtras(session),
      org_id: org.id,
      org_slug: org.slug,
    });
  }

  return c.json({ ..._authUserResponse(user, session.access_token), ..._sessionExtras(session) });
});

// Trade a refresh token for a fresh session. Rotation: the response's
// refresh_token replaces the one sent — always store the newest. 401 on a
// spent/invalid token; 404 in demo mode (no refresh flow there).
platformRouter.post("/auth/refresh", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Row;
  const refreshToken = typeof body?.refresh_token === "string" ? body.refresh_token : "";
  if (!refreshToken) throw new HttpError(400, "refresh_token required");
  const session = await refreshUserSession(refreshToken);
  return c.json(session);
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
/**
 * A gate may declare which PLATFORMS its sign-ups join, and with which role
 * (`config.platform_roles`, e.g. { bridge: "bridge_learner" }). Writing the
 * assignment is what makes a gate-registered person appear under that
 * platform's People with a real role — and what lets capability grants reach
 * them. Additive: participation still grants entry on its own, so a gate
 * without this config behaves exactly as before. Best-effort per platform: a
 * bad entry must never fail the sign-up itself.
 */
async function _grantGatePlatformRoles(
  gate: Row,
  orgId: string,
  programId: string,
  email: string,
): Promise<void> {
  const map = ((gate.config as Row | undefined)?.platform_roles ?? null) as
    | Record<string, string>
    | null;
  if (!map) return;
  for (const [platform, role] of Object.entries(map)) {
    const cfg = platformRoleConfig(platform);
    if (!cfg || !cfg.assignable.includes(role)) {
      console.error(`gate ${gate.id}: skipping invalid platform grant ${platform}/${role}`);
      continue;
    }
    await graph
      .setPlatformRoleAssignment(orgId, programId, platform, email, role, null, true)
      .catch((e) => console.error(`gate signup ${platform} role:`, e));
  }
}

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
      // Email already has an account. The correct password admits them; a wrong
      // one gets a clear message (not a confusing "invalid credentials" on a
      // sign-UP form).
      try {
        authId = (await signInUser(email, password)).id as string;
      } catch {
        throw new HttpError(409, "An account with this email already exists. Sign in through the app, or use a different email.");
      }
    } else {
      throw err;
    }
  }

  // The gate offers a set of roles; the signer picks one. Validate the pick so
  // nobody grants themselves a role the gate didn't advertise. (Shared by member
  // and org-member gates.)
  const offeredRoleIds = Array.isArray(gate.role_ids) ? (gate.role_ids as string[]) : [];
  function _chosenGateRole(): string | null {
    const requested = typeof body.role_id === "string" && body.role_id ? body.role_id : null;
    if (requested) {
      if (!offeredRoleIds.includes(requested)) throw new HttpError(400, "That role isn't offered by this gate");
      return requested;
    }
    if (offeredRoleIds.length > 1) throw new HttpError(400, "Please choose a role to sign up as");
    return offeredRoleIds[0] ?? null;
  }

  if (gate.level === "nexus") {
    // Operator gate → a confined nexus operator, but ALWAYS approval-gated: we
    // create the account and QUEUE a request, we do NOT assign the nexus role
    // here. A platform_admin approves it, which is the only path to operator
    // access — a public gate can never mint an operator directly. The base
    // profile is low-privilege (never platform_admin); the confined role is
    // applied on approval.
    const chosenRole = _chosenGateRole();
    await db.createProfile(authId, email, "student", name).catch(() => {});
    await graph.createGateMemberRequest({ gateId: gate.id as string, level: "nexus", email, displayName: name, roleId: chosenRole });
    await db.recordAuditEvent("nexus_gate.request_raised", {
      scopeType: "platform", scopeId: null, targetType: "gate", targetId: gate.id as string,
      metadata: { email, role_id: chosenRole },
    });
    // No session: the person has no operator access until approved, so signing
    // them in would land them nowhere. The page shows a "pending approval" note.
    return c.json({ pending: true, landing: gate.landing ?? null });
  }

  if (gate.level === "organization") {
    // Org member gate → an ORG-LEVEL membership (program_id null) + (chosen) org
    // role. Base membership is low-privilege "instructor"; the real permissions
    // come from the org role. Writes run privileged (public gate).
    const chosenRole = _chosenGateRole();
    // Ensure the identity exists either way (so the person can be found at
    // approval time), but grant nothing yet when approval is required.
    const profileId = await db.ensureOrgProfile(authId, orgId, { email, role: "teacher", displayName: name });
    if (gate.approval_required) {
      await graph.createGateMemberRequest({ gateId: gate.id as string, level: "organization", email, displayName: name, roleId: chosenRole });
      await db.recordAuditEvent("org_gate.request_raised", {
        orgId, scopeType: "organization", scopeId: orgId, targetType: "gate", targetId: gate.id as string,
        metadata: { email, role_id: chosenRole },
      });
      return c.json({ pending: true, landing: gate.landing ?? null });
    }
    const members = await db.listMembers(orgId).catch(() => [] as Row[]);
    const alreadyOrgMember = members.some((m) => m.profile_id === profileId && !m.program_id);
    if (!alreadyOrgMember) await db.addMembership(orgId, profileId, "instructor", null, "edit", null);
    if (chosenRole) {
      await graph.setOrgRoleAssignment(orgId, email, chosenRole, true).catch((e) => console.error("org gate role:", e));
    }
    await db.recordAuditEvent("org_gate.member_joined", {
      orgId, scopeType: "organization", scopeId: orgId, targetType: "gate", targetId: gate.id as string,
      metadata: { email, role_id: chosenRole },
    });
  } else if (gate.audience === "member") {
    // Internal member gate → a program membership + (chosen) role, so the person
    // lands in Team & Roles as staff, NOT in Registrations.
    const chosenRole = _chosenGateRole();
    const profileId = await db.ensureOrgProfile(authId, orgId, { email, role: "teacher", displayName: name });
    if (gate.approval_required) {
      await graph.createGateMemberRequest({ gateId: gate.id as string, level: "program", email, displayName: name, roleId: chosenRole });
      await db.recordAuditEvent("gate.request_raised", {
        orgId, scopeType: "program", scopeId: programId, targetType: "gate", targetId: gate.id as string,
        metadata: { email, role_id: chosenRole },
      });
      return c.json({ pending: true, landing: gate.landing ?? null });
    }
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
    // Idempotent: if they're already a participant of this program, don't create
    // a duplicate registration — just admit them (a re-submitted sign-up, or a
    // returning student, shouldn't pile up rows or error).
    const existing = await graph.findLearnerParticipations(email, programId).catch(() => [] as Row[]);
    if (existing.length === 0) {
      // PUBLIC gate: run privileged (bypass RLS). The caller may be anonymous or
      // carry an unrelated user's token; the gate authorizes the sign-up, not the
      // caller's identity — otherwise the registration INSERT fails RLS.
      const reg = await db.createRegistration(orgId, null, {
        programId, registrationSource: "gate_signup", email, name, userId: authId,
        status: gate.approval_required ? "pending_review" : "directly_added",
      }, true);
      if (!gate.approval_required) {
        await db.createProgramParticipant(orgId, programId, {
          userId: authId, participantType: "learner", registrationId: reg.id,
        }, true);
        await db.grantStudentAccess(reg).catch((e) => console.error("gate signup grant:", e));
        await _grantGatePlatformRoles(gate, orgId, programId, email);
      }
      await db.recordAuditEvent("gate.signup", {
        orgId, scopeType: "program", scopeId: programId, targetType: "gate", targetId: gate.id as string,
        metadata: { email, approval: gate.approval_required },
      });
      if (gate.approval_required) {
        const session = await signInUser(email, password);
        return c.json({ access_token: session.access_token, ..._sessionExtras(session), pending: true, landing: gate.landing ?? null });
      }
    }
  }

  const session = await signInUser(email, password);
  return c.json({ access_token: session.access_token, ..._sessionExtras(session), pending: false, landing: gate.landing ?? null });
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
  if (gate.level === "nexus") {
    // Operator gate: the account belongs only once a platform_admin has approved
    // its request — i.e. it now holds a nexus role (or is a full platform_admin).
    const u = await loadPlatformUser(session.id as string, email);
    const nx = await graph.getNexusRoleForEmail(email).catch(() => null);
    belongs = u.role === "platform_admin" || !!nx;
  } else if (gate.audience === "member") {
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
    if (gate.level === "nexus") {
      throw new HttpError(
        403,
        `This account hasn't been approved as an operator yet. A platform administrator must approve your request${gate.allow_signup ? ", or you can request access below" : ""}.`,
      );
    }
    throw new HttpError(
      403,
      `That account isn't part of this program yet. Ask an administrator to add you${gate.allow_signup ? ", or create an account below" : ""}.`,
    );
  }
  return c.json({ access_token: session.access_token, ..._sessionExtras(session), landing: gate.landing ?? null });
});

platformRouter.get("/auth/me", async (c) => {
  const user = await getCurrentUser(c);
  // The confined-operator role and the membership summaries touch different
  // tables and share nothing — fetched together. This endpoint is called on
  // every launch and every role check, so its latency is pure overhead.
  const [nexusRole, memberships, claim] = await Promise.all([
    // A confined Nexus operator (custom platform-scope role) — drives the
    // operator mode + confined console nav.
    dbEnabled() && user.email && user.role !== "platform_admin"
      ? graph.getNexusRoleForEmail(user.email).catch(() => null)
      : Promise.resolve(null),
    _membershipSummaries(user),
    // Has this person set their own password? Until they have, the credential
    // is one an admin handed them, and the app makes them choose their own
    // before it shows anything else (0046). Its two reads chain on each other
    // but on nothing else here, so the chain runs as one parallel strand.
    (async () => {
      if (!dbEnabled()) return null;
      const orgId = user.memberships[0]?.org_id ?? null;
      const profileId = await db.resolveProfileId(user.id, orgId).catch(() => null);
      return profileId ? await db.getClaimState(profileId).catch(() => null) : null;
    })(),
  ]);
  return c.json({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    memberships,
    nexus_role: nexusRole,
    // Absent/false for an operator or a demo backend — nothing to claim there.
    must_set_password: claim ? !claim.claimed : false,
  });
});

// ── Profile picture ────────────────────────────────────────────────────────
//
// Your own picture, set by you. There is deliberately no admin path here: a
// password an admin can reset is an access control, a face is not, and nothing
// in the console asks to change someone's photo.
//
// Reading is separate from /auth/me because an avatar is tens of kilobytes and
// /auth/me is called on every launch and every role check.

const avatarSchema = z.object({ avatar: avatarDataUrlSchema.nullable() });

/** The caller's own profile id in the org their session belongs to. */
async function _selfProfileId(user: { id: string; memberships: { org_id: string }[] }) {
  const orgId = user.memberships[0]?.org_id ?? null;
  const profileId = await db.resolveProfileId(user.id, orgId);
  if (!profileId) throw new HttpError(404, "Profile not found");
  return profileId;
}

platformRouter.get("/profile/avatar", async (c) => {
  const user = await getCurrentUser(c);
  const profileId = await _selfProfileId(user);
  return c.json({ avatar: await db.getProfileAvatar(profileId) });
});

platformRouter.put("/profile/avatar", async (c) => {
  const user = await getCurrentUser(c);
  const profileId = await _selfProfileId(user);
  const req = parseBody(avatarSchema, await c.req.json());
  await db.setProfileAvatar(profileId, req.avatar);
  return c.json({ avatar: req.avatar });
});

/**
 * Pictures for a set of profiles, as { profile_id: data_url }.
 *
 * Batched by design: a roster or a chat thread draws many faces at once, and one
 * request per face would be dozens of round trips. Ids the caller may not see —
 * or that have no picture — are simply absent from the response rather than an
 * error, so a partial list still renders.
 */
platformRouter.post("/profile/avatars", async (c) => {
  await getCurrentUser(c);
  const req = parseBody(
    z.object({ profile_ids: z.array(z.string().uuid()).max(200) }),
    await c.req.json(),
  );
  return c.json({ avatars: await db.getProfileAvatars(req.profile_ids) });
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
  const isAdmin = access.level === "admin";
  // Effective bridge capabilities — the app gates its tabs on these, exactly
  // like learning:
  //   • admin         → everything the bridge catalogue grants (all tabs)
  //   • assigned role → that role's capabilities (custom role id or pre-built)
  //   • program role  → a "partial" program-role grant binds specific bridge
  //                     capabilities (filtered to the bridge catalogue)
  //   • otherwise     → the launch level's sample-role capabilities
  // Capability computation must NEVER break context resolution — a corrupted
  // catalogue or role blob would otherwise 500 here and bounce the user back to
  // "sign in through Nexus". Compute defensively; on any failure, fall back to
  // an empty set (the coarse role/level still governs the app).
  let capabilities: string[] = [];
  try {
    const bridgeDoc = await catalogue.getCatalogue("bridge");
    if (isAdmin) {
      capabilities = bridgeRoles.bridgeCapsForLevel(bridgeDoc, "admin");
    } else {
      const assignedCaps = access.platformRole
        ? await bridgeRoles.capsForAssignedRole(access.programId, access.platformRole)
        : null;
      const programCaps = access.programRoleCapabilities?.length
        ? await catalogue.validGrantsAcross([{ providerId: "bridge" }], access.programRoleCapabilities)
        : [];
      capabilities = assignedCaps && assignedCaps.length
        ? assignedCaps
        : programCaps.length
          ? programCaps
          : bridgeRoles.bridgeCapsForLevel(bridgeDoc, access.level as "edit" | "comment" | "view");
    }
  } catch (e) {
    console.error("bridge/context capability computation failed (using empty set):", e);
  }
  /**
   * For a PARTNER-CLUB caller, the capabilities their club role grants in the
   * APP's own catalogue (`club-app`).
   *
   * bridge-access deliberately lets every club member reach challenge.create at
   * the platform level and leaves the real decision to the club: "the platform
   * allows it, the club role gates it" (see its challenge.create entry). But the
   * create surfaces live in the bridge web, which had no way to see the app's
   * catalogue — so the club's gate was never actually applied and every club
   * member got a +. Emitting them here is what lets the web honour it.
   *
   * Resolved exactly as /club-app/context does, and defensively: a corrupted role
   * or catalogue must never break context resolution, so any failure leaves the
   * set empty and the coarse bridge role still governs.
   */
  let appCapabilities: string[] = [];
  // Unset until resolved: absent means "no ceiling known", never "nothing given".
  let appProvisioned: { enabled: boolean; capabilities: string[] | null } | null = null;
  if (access.partnerClub && access.partnerProgramId) {
    try {
      const clubProgram = await db.getProgram(access.partnerProgramId);
      const clubOrgId = (clubProgram?.org_id as string | undefined) ?? null;
      const resolved = await clubAppAccess.clubAppAccessFor(
        user,
        access.partnerProgramId,
        clubOrgId,
        (programId, email) => graph.getProgramRoleForEmail(programId, email),
      );
      appCapabilities = resolved.capabilities;
      // The org's CEILING, separate from the role's grants — canCreateChallenge
      // falls back to a coarse "a mentor may create" rule when the grants are
      // empty, and that fallback must not outrank provisioning. See
      // accessCatalogue/provisioning.ts.
      appProvisioned = await provisioning.appProvisioning(access.partnerProgramId);
    } catch (e) {
      console.error("bridge/context app-capability resolution failed (using empty set):", e);
    }
  }

  // Is this club caller a COACH? The club's own role decides (owner direction
  // 2026-08-11: "the role that was given Coaching access should be accessed in
  // as coaches"): a role that grants the coaching menu IS the club's coaching
  // tier, whatever the club named it ("Mentors", "Strange Mentor"). The
  // catalogue toggle is therefore the whole assignment story — flip COACHING
  // on a role and its holders get the coach view, no second enrollment step.
  //
  // The membership role is deliberately NOT consulted. Every enroll path
  // writes the base membership as "instructor" — the club invite
  // (offerings.ts _enrollActiveMember call: membershipRole "instructor",
  // unconditional), both gate joins, and the schema has no "member" role at
  // all (schemas.ts membershipRole: owner|administrator|instructor). So
  // "instructor" is what EVERY club member holds and says nothing about
  // coaching; the earlier `role === "instructor"` check (2026-08-10, "the
  // club's instructor is its coach") promoted the entire club — B2F3's
  // Members included — and is why assigning the member role changed nothing.
  //
  // This also supersedes 2026-08-10's "a club's admin gets bridge_club_member":
  // the structural tier resolves every capability, coaching included, so a
  // club's owner/manager lands on the coach view too — bridge_club_admin
  // still isn't emitted, the platform's admin areas stay out of clubs.
  // On a failed capability resolve (empty set, logged above) a mentor demotes
  // to the member surface for that request — the safe side, and it heals on
  // the next resolve.
  const clubCoach = access.partnerClub && appCapabilities.includes("app.coaching.view");

  // The display name of the role the person actually holds — a custom
  // capability-bound role's own name wins over the level→prebuilt fallback, so
  // the app shows e.g. "Bridge Knowledge + Partnerships", not "Coach".
  const isPrebuilt = !!(access.platformRole && platformRoleConfig("bridge")?.prebuilt.includes(access.platformRole));
  let roleName: string | null = access.roleName;
  if (isAdmin) {
    roleName = "Administrator";
  } else if (access.platformRole && !isPrebuilt) {
    roleName = (await bridgeRoles.getBridgeRole(access.programId, access.platformRole).catch(() => null))?.name ?? roleName;
  }
  return c.json({
    nexusUserId: access.profileId,
    laicOrgId: access.orgId,
    programId: "bridge_program",
    appId: await platformAppSlug(access.programId, "bridge-platform", "bridge_ai_coach"),
    // A pre-built role picked in the Nexus role builder is authoritative;
    // a custom (capability-bound) role or graded grant falls back to the
    // level→role map so the emitted `roles` stays a valid BridgeRole set.
    //
    // A club's people: coaches (clubCoach above — a role granting the coaching
    // menu) emit bridge_coach, or the hire loop dead-ends: their reviews
    // queue, learner pages and assignment flows all sit behind the platform's
    // coach gates, and every one of those surfaces is already scoped to their
    // own hires by data. Everyone else gets bridge_club_member — the ordinary
    // member surface, with their coach pool restricted to the club.
    //
    // accessLevel must AGREE with the club role. The partner grant's level is
    // a flat "edit" for every club member (it measures entry, not standing),
    // and mapping it through BRIDGE_ROLE_MAP said accessLevel:"coach" beside
    // roles:["bridge_club_member"] — a self-contradictory context, and the
    // club app believed the coach half: every B2F3 member landed on the coach
    // view. For a club the level map has nothing to say; the role decides.
    roles: isPrebuilt
      ? [access.platformRole]
      : access.partnerClub
        ? [clubCoach ? "bridge_coach" : "bridge_club_member"]
        : mapped.roles,
    permissions: [`bridge:${access.level}`],
    accessLevel: access.partnerClub ? (clubCoach ? "coach" : "learner") : mapped.accessLevel,
    capabilities, // effective bridge-catalogue capability ids (tab gating + display)
    is_admin: isAdmin,
    displayName: await _platformDisplayName(access.profileId, user),
    // Extensions beyond the contract (additive — Bridge's shape check ignores them).
    nexus_program_id: access.programId,
    /**
     * The CLUB's own program id, when this caller reached the bridge through a
     * partner club. `nexus_program_id` above is the CONNECTED PARENT for such a
     * caller — right for data scope, wrong for "who is in my club". Anything
     * asking about the club's people must use this.
     */
    nexus_club_program_id: access.partnerProgramId ?? null,
    /** The club role's APP capabilities — empty/absent for a non-club caller. */
    nexus_app_capabilities: appCapabilities,
    nexus_app_enabled: appProvisioned ? appProvisioned.enabled : undefined,
    nexus_app_provisioned_capabilities: appProvisioned ? appProvisioned.capabilities : undefined,
    program_name: access.programName,
    role_name: roleName,
  });
});

// The coach's learner roster (the mobile app's "My learners", Phase 2's
// review queue). Coaches see the learners who HIRED them (their roster
// group); program admins see the whole program. Learners can't enumerate
// each other.
platformRouter.get("/bridge/learners", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "bridge", c.req.query("program_id") ?? null);
  if (access.level === "admin") {
    return c.json(await graph.listProgramLearners(access.orgId, access.programId));
  }
  if (access.level !== "edit") throw new HttpError(403, "Coach access required");
  const coaches = await graph.listProgramCoaches(access.orgId, access.programId);
  const me = coaches.find((co) => co.coach_id === access.profileId);
  // The roster is the UNION of the legacy roster group (learners whose
  // PRIMARY this coach is) and the multi-coach relationship rows (0040) —
  // a learner's second coach must see them too.
  const participantIds = await graph.listParticipantIdsForCoach(
    access.orgId, access.programId, String(access.profileId),
  );
  if (!me?.group_id && participantIds.length === 0) return c.json([]); // nobody yet
  return c.json(
    await graph.listProgramLearners(access.orgId, access.programId, {
      ...(me?.group_id ? { groupId: me.group_id as string } : {}),
      participantIds,
    }),
  );
});

// ── Hire a coach (Phase 1.5) ─────────────────────────────────────────────────
// Learners browse the program's coaches and pick one; the relationship is the
// coach's Nexus roster group (see orgGraphRepo). One coach at a time —
// hiring another switches. Instant (no approval) in v1.

/** The program's coaches — visible to every bridge-program member/learner. */
/**
 * The hirable coach pool for THIS caller. Entered through a club, the pool is
 * the club's own coaching tier and nobody else — the people whose club role
 * grants the coaching menu (the same capability rule as clubCoach above), not
 * the parent program's coach list, and never the whole club.
 */
async function _hirableCoaches(access: ResolvedPlatformAccess): Promise<Row[]> {
  return access.partnerClub && access.partnerProgramId
    ? graph.listClubCoaches(access.orgId, access.partnerProgramId, access.programId)
    : graph.listProgramCoaches(access.orgId, access.programId);
}

platformRouter.get("/bridge/coaches", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "bridge", c.req.query("program_id") ?? null);
  const coaches = await _hirableCoaches(access);
  // Names + ids only (people isolation: no emails to browsing learners).
  return c.json(
    coaches.map((co) => ({
      coach_id: co.coach_id,
      name: co.name,
      learner_count: Number(co.learner_count ?? 0),
    })),
  );
});

/**
 * One hired coach as the learner's own surfaces see them: who they are, plus
 * how many of THIS learner's games sit with them. Deliberately not named
 * plays_reviewed/reviews_pending — those keys exist at the summary's top level
 * with the roles flipped (there, "pending" means awaiting MY review as a
 * coach), and reusing them here would guarantee a future misreading.
 * Number() guards against the driver handing aggregates back as strings.
 */
function learnerCoachOut(co: Row) {
  return {
    coach_id: co.coach_id,
    name: co.name,
    sent: Number(co.sent ?? 0),
    reviewed: Number(co.reviewed ?? 0),
    pending: Number(co.pending ?? 0),
  };
}

/** The calling learner's current coach, or { coach: null }. */
/** Role-aware activity counts for the coach app's live Home screen. */
platformRouter.get("/bridge/summary", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "bridge", c.req.query("program_id") ?? null);
  // Four independent strands, previously run one after another. Only the
  // coach lookup is a true chain (participant → their coaches → the group's
  // primary); the tallies, the resume list and the day's board never needed
  // to wait behind it. This endpoint is the app's most frequent call — every
  // tab focus — so its shape IS the app's felt baseline.
  const coachStrand = (async (): Promise<{ coach: Row | null; coachList: Row[] }> => {
    if (!user.email) return { coach: null, coachList: [] };
    const participant = await graph.getLearnerParticipant(access.orgId, access.programId, user.email);
    if (!participant) return { coach: null, coachList: [] };
    const [coachList, groupCoach] = await Promise.all([
      graph.listLearnerCoaches(
        access.orgId,
        access.programId,
        participant,
        access.profileId,
        // Tallies count SUBMISSIONS, which for a club's people are stamped
        // with the club (same reasoning as dataProgramId below).
        access.partnerProgramId ?? access.programId,
      ),
      participant.group_id
        ? graph.getCoachForGroup(participant.group_id as string)
        : Promise.resolve(null),
    ]);
    return { coach: groupCoach ?? coachList[0] ?? null, coachList };
  })();
  // WHICH PROGRAM ID THE BRIDGE DATA CARRIES. A club's launch pins the CLUB,
  // and bridge-web stamps every session, assignment and submission with the
  // pinned program (its launch cookie) — so for a club's people the data rows
  // say <club>, while access.programId resolves to the connected PARENT.
  // Querying the parent found nothing: Resume sat empty and every tally read
  // zero for exactly the people the club feature is for. People (participant,
  // roster group) and content (deal of the day) stay parent-scoped — that is
  // where they actually live.
  const dataProgramId = access.partnerProgramId ?? access.programId;
  const [s, { coach, coachList }, inProgress, deal] = await Promise.all([
    graph.getBridgeActivitySummary(access.orgId, dataProgramId, access.profileId),
    coachStrand,
    graph
      .listBridgeInProgressSessions(dataProgramId, access.profileId)
      .catch(() => [] as Row[]),
    graph
      .getBridgeDealOfTheDay(
        access.orgId,
        access.programId,
        Math.floor(Date.now() / 86_400_000),
      )
      .catch(() => null),
  ]);
  return c.json({
    assignments_open: Number(s.assignments_open ?? 0),
    plays_reviewed: Number(s.plays_reviewed ?? 0),
    reviews_pending: Number(s.reviews_pending ?? 0),
    // The HIRED roster, in clubs too (owner direction 2026-08-11, second
    // pass): subscription happens through Hire a Coach — never implicitly by
    // club membership — so the coach's headline counts exactly the learners
    // who picked them, the same set every roster surface shows.
    roster_count: Number(s.roster_count ?? 0),
    coach,
    coaches: coachList.map(learnerCoachOut),
    in_progress: inProgress.map((r) => ({
      session_id: r.session_id,
      board_name: r.board_name,
      updated_at: r.updated_at,
    })),
    deal_of_the_day: deal
      ? {
          entry_id: deal.entry_id,
          name: deal.name,
          dealer: deal.dealer,
          vul: deal.vul,
          contract_label: deal.contract_label,
        }
      : null,
  });
});

/** Which library collections THIS caller may view via role designation —
 *  the resolved form the bridge platform feeds into the library component's
 *  principal (collectionGrants). Union of: their assigned role's
 *  designations + the program-wide "*" designation. */
platformRouter.get("/bridge/my-collections", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "bridge", c.req.query("program_id") ?? null);
  const map = await bridgeRoles.getCollectionDesignations(access.programId);
  const grants = new Set<string>(map["*"] ?? []);
  // Designation keys are ROLE ids: the assigned platform role (prebuilt or
  // custom) AND the level-mapped roles the context reports (a participant
  // with no explicit assignment is still a bridge_learner).
  const roleKeys = new Set<string>(BRIDGE_ROLE_MAP[access.level]?.roles ?? []);
  if (access.platformRole) roleKeys.add(access.platformRole);
  for (const role of roleKeys) for (const id of map[role] ?? []) grants.add(id);
  return c.json({ collections: [...grants] });
});

/** Admin: read/replace the designation map (roleId → collection ids). */
platformRouter.get("/bridge/collection-designations", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "bridge", c.req.query("program_id") ?? null);
  if (access.level !== "admin") throw new HttpError(403, "Bridge admin access required");
  return c.json(await bridgeRoles.getCollectionDesignations(access.programId));
});
platformRouter.put("/bridge/collection-designations", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "bridge", c.req.query("program_id") ?? null);
  if (access.level !== "admin") throw new HttpError(403, "Bridge admin access required");
  const body = (await c.req.json()) as Record<string, string[]>;
  return c.json(await bridgeRoles.setCollectionDesignations(access.programId, body));
});

platformRouter.get("/bridge/my-coach", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "bridge", c.req.query("program_id") ?? null);
  if (!user.email) return c.json({ coach: null });
  const participant = await graph.getLearnerParticipant(access.orgId, access.programId, user.email);
  if (!participant?.group_id) return c.json({ coach: null });
  return c.json({ coach: await graph.getCoachForGroup(participant.group_id as string) });
});

/** EVERY coach this learner has hired (multi-coach, 0040). The my-coach
 *  singular above stays as the PRIMARY (roster group) for older callers. */
platformRouter.get("/bridge/my-coaches", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "bridge", c.req.query("program_id") ?? null);
  if (!user.email) return c.json({ coaches: [] });
  const participant = await graph.getLearnerParticipant(access.orgId, access.programId, user.email);
  if (!participant) return c.json({ coaches: [] });
  const coachList = await graph.listLearnerCoaches(
    access.orgId,
    access.programId,
    participant,
    access.profileId,
    // A club member's submissions are stamped with the club (see the
    // summary's dataProgramId note) — the tallies must look there.
    access.partnerProgramId ?? access.programId,
  );
  return c.json({ coaches: coachList.map(learnerCoachOut) });
});

/** Hire a coach — ADDITIVE (owner direction 2026-08-09: a learner can hold
 *  several coaches and picks per game who reviews it). The FIRST hire also
 *  becomes the roster-group primary, which is what assignments and legacy
 *  rosters key on; later hires only join the relationship table. Learner
 *  participants only. */
platformRouter.post("/bridge/my-coach", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "bridge", c.req.query("program_id") ?? null);
  const body = (await c.req.json()) as Row;
  const coachId = String(body.coach_id ?? "");
  if (!coachId) throw new HttpError(400, "coach_id is required");
  if (!user.email) throw new HttpError(403, "Only learners can hire a coach");
  let participant = await graph.getLearnerParticipant(access.orgId, access.programId, user.email);
  if (!participant && access.partnerClub) {
    // A club member has no registration and therefore no participant row in
    // the parent instance — their first hire mints one, which is what the
    // relationship, the roster group, and every learner-side read key on.
    participant = await graph.ensureClubLearnerParticipant(
      access.orgId, access.programId, access.profileId,
    );
  }
  if (!participant) throw new HttpError(403, "Only program learners can hire a coach");
  // THE POOL IS THE POLICY: entered through a club, only that club's own
  // instructors are offered — and only they pass validation here, so a
  // free-typed coach_id cannot reach outside the club either.
  const coaches = await _hirableCoaches(access);
  const coach = coaches.find((co) => co.coach_id === coachId);
  if (!coach) throw new HttpError(404, "That coach is not part of this program");
  await graph.addLearnerCoach(access.orgId, access.programId, participant.id as string, coachId);
  // First coach also becomes the primary: the roster group participants.group_id
  // points at. A learner who already has a primary keeps it — no switching.
  let groupId = (participant.group_id as string | null) ?? null;
  if (!groupId) {
    const group = await graph.ensureCoachRosterGroup(
      access.orgId, access.programId, coachId, String(coach.name ?? "Coach"),
    );
    groupId = group.id as string;
    await graph.setParticipantGroup(participant.id as string, groupId);
  }
  await db.recordAuditEvent("bridge.coach.hired", {
    orgId: access.orgId, scopeType: "program", scopeId: access.programId,
    targetType: "group", targetId: groupId ?? coachId,
    metadata: { learner_email: user.email, coach_id: coachId },
  });
  return c.json({ coach: { coach_id: coach.coach_id, name: coach.name } });
});

/** Part ways with one coach. If they were the primary (roster group), the
 *  next remaining hire is promoted so assignments keep a home; with nobody
 *  left the learner is coachless again. */
platformRouter.delete("/bridge/my-coach/:coach_id", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "bridge", c.req.query("program_id") ?? null);
  const coachId = c.req.param("coach_id");
  if (!user.email) throw new HttpError(403, "Only learners can part with a coach");
  const participant = await graph.getLearnerParticipant(access.orgId, access.programId, user.email);
  if (!participant) throw new HttpError(403, "Only program learners can part with a coach");
  await graph.removeLearnerCoach(participant.id as string, coachId);
  const groupCoach = participant.group_id
    ? await graph.getCoachForGroup(participant.group_id as string)
    : null;
  if (groupCoach && String(groupCoach.coach_id) === coachId) {
    const remaining = (
      await graph.listLearnerCoaches(access.orgId, access.programId, {
        ...participant,
        group_id: null,
      })
    ).filter((co) => String(co.coach_id) !== coachId);
    const next = remaining[0] ?? null;
    if (next) {
      const group = await graph.ensureCoachRosterGroup(
        access.orgId, access.programId, String(next.coach_id), String(next.name ?? "Coach"),
      );
      await graph.setParticipantGroup(participant.id as string, group.id as string);
    } else {
      await graph.setParticipantGroup(participant.id as string, null);
    }
  }
  await db.recordAuditEvent("bridge.coach.hired", {
    orgId: access.orgId, scopeType: "program", scopeId: access.programId,
    targetType: "group", targetId: coachId,
    metadata: { learner_email: user.email, coach_id: coachId, removed: true },
  });
  return c.json({ ok: true });
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
  const rows = members.map((m: Row) => {
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
      is_participant: false,
    };
  });

  // Gate-registered PARTICIPANTS who hold a role on this platform (their gate
  // joined them to it) belong in People too — they're people with a role
  // here, even though their enrollment lives in Registrations. Participants
  // without an assignment stay out: they're registrations, not platform
  // members. `is_participant` lets the UI segment them.
  const memberEmails = new Set(rows.map((r) => String(r.email ?? "").toLowerCase()));
  const learners = await graph
    .listProgramLearners(access.orgId, programId)
    .catch(() => [] as Row[]);
  for (const l of learners) {
    const email = String(l.email ?? "").toLowerCase();
    if (!email || memberEmails.has(email)) continue;
    const assigned = byEmail.get(email);
    if (!assigned) continue;
    rows.push({
      email: (l.email as string) ?? null,
      display_name: (l.name as string) ?? null,
      status: "active",
      membership_id: null,
      invitation_id: null,
      role: assigned,
      is_admin: false,
      is_participant: true,
    });
  }
  return rows;
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
  // A role is assignable if it's a pre-built assignable role OR (for bridge) a
  // custom capability-bound role defined for this program.
  if (req.role !== null && !cfg.assignable.includes(req.role)) {
    // A custom role id is assignable too — each platform looks up its own store.
    const custom =
      platform === "bridge"
        ? await bridgeRoles.getBridgeRole(req.program_id, req.role)
        : platform === "club-app"
          ? await appRoles.getAppRole(req.program_id, req.role)
          : null;
    if (!custom) throw new HttpError(400, `Not an assignable ${platform} role`);
  }
  const access = await _requirePlatformRoleAdmin(user, platform, req.program_id);
  const members = await graph.listProgramMembers(access.orgId, req.program_id);
  const target = members.find((m: Row) => ((m.email as string) ?? "").toLowerCase() === req.email.toLowerCase());
  if (!target) {
    // Not a member — but a gate-registered PARTICIPANT of this program is a
    // legitimate target: gates can join learners to a platform with a role,
    // so an admin must be able to change or clear that role afterwards.
    const parts = await graph
      .findLearnerParticipations(req.email, req.program_id)
      .catch(() => [] as Row[]);
    if (parts.length === 0) throw new HttpError(404, "That person is not in this program");
  } else if (target.membership_role === "administrator" || target.membership_role === "owner") {
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

// ── Bridge access catalogue + custom roles (parity with learning) ───────────
/** The caller must be a bridge admin of the program. Returns the resolved access. */
async function _bridgeAdmin(c: Context, programId: string) {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "bridge", programId);
  if (access.level !== "admin") throw new HttpError(403, "Bridge admin access required");
  return access;
}

// Shared bridge catalogue — the app's inventory of surfaces + capabilities.
// Read: any bridge member; Write: a bridge admin.
platformRouter.get("/bridge/catalogue", async (c) => {
  const user = await getCurrentUser(c);
  await resolvePlatformAccess(user, "bridge", c.req.query("program_id") ?? null);
  return c.json(await catalogue.getCatalogue("bridge"));
});
platformRouter.put("/bridge/catalogue", async (c) => {
  await _bridgeAdmin(c, c.req.query("program_id") ?? "");
  const doc = (await c.req.json()) as CapabilityCatalogueDocument;
  if (doc?.documentType !== "capability_catalogue" || !Array.isArray(doc.capabilities) || !Array.isArray(doc.groups)) {
    throw new HttpError(422, "Not a valid catalogue document");
  }
  if (doc.provider?.id !== "bridge-platform") throw new HttpError(422, 'provider.id must equal "bridge-platform"');
  return c.json(await catalogue.saveCatalogue("bridge", doc));
});
platformRouter.delete("/bridge/catalogue", async (c) => {
  await _bridgeAdmin(c, c.req.query("program_id") ?? "");
  return c.json(await catalogue.resetCatalogue("bridge"));
});

// Custom bridge roles (capability-bound), stored per program. Admin only.
const bridgeRoleCreateSchema = z.object({ program_id: z.string(), name: z.string().min(1), capabilities: z.array(z.string()).default([]) });
const bridgeRoleUpdateSchema = z.object({ name: z.string().min(1).optional(), capabilities: z.array(z.string()).optional() });

platformRouter.get("/bridge/roles", async (c) => {
  const pid = c.req.query("program_id") ?? "";
  await _bridgeAdmin(c, pid);
  return c.json(await bridgeRoles.listBridgeRoles(pid));
});
platformRouter.post("/bridge/roles", async (c) => {
  const req = parseBody(bridgeRoleCreateSchema, await c.req.json());
  await _bridgeAdmin(c, req.program_id);
  return c.json(await bridgeRoles.createBridgeRole(req.program_id, req.name, req.capabilities));
});
platformRouter.patch("/bridge/roles/:id", async (c) => {
  const pid = c.req.query("program_id") ?? "";
  await _bridgeAdmin(c, pid);
  const body = parseBody(bridgeRoleUpdateSchema, await c.req.json());
  const row = await bridgeRoles.updateBridgeRole(pid, c.req.param("id"), body);
  if (!row) throw new HttpError(404, "Role not found");
  return c.json(row);
});
platformRouter.delete("/bridge/roles/:id", async (c) => {
  const pid = c.req.query("program_id") ?? "";
  await _bridgeAdmin(c, pid);
  await bridgeRoles.deleteBridgeRole(pid, c.req.param("id"));
  return c.json({ ok: true });
});

// ── Bridge Bird APP roles & context (provider: club-app) ───────────────────
//
// The app's own permission surface, separate from the Bridge PLATFORM's above:
// a club authors roles here ("Strange Mentor"), each binding capabilities from
// the club-app catalogue, and the app asks /club-app/context for what the caller
// holds. Administration is the club's, so the same admin guard applies.

const appRoleCreateSchema = z.object({
  program_id: z.string(),
  name: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
});
const appRoleUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  capabilities: z.array(z.string()).optional(),
});

/** The app's catalogue — read by any member (the role builder needs it), written
 *  by a club admin. */
platformRouter.get("/club-app/catalogue", async (c) => {
  await getCurrentUser(c);
  return c.json(await catalogue.getCatalogue("club-app"));
});

platformRouter.get("/club-app/roles", async (c) => {
  const pid = c.req.query("program_id") ?? "";
  await _bridgeAdmin(c, pid);
  return c.json(await appRoles.listAppRoles(pid));
});

platformRouter.post("/club-app/roles", async (c) => {
  const req = parseBody(appRoleCreateSchema, await c.req.json());
  await _bridgeAdmin(c, req.program_id);
  return c.json(await appRoles.createAppRole(req.program_id, req.name, req.capabilities), 201);
});

platformRouter.patch("/club-app/roles/:id", async (c) => {
  const pid = c.req.query("program_id") ?? "";
  await _bridgeAdmin(c, pid);
  const body = parseBody(appRoleUpdateSchema, await c.req.json());
  const row = await appRoles.updateAppRole(pid, c.req.param("id") ?? "", body);
  if (!row) throw new HttpError(404, "Role not found");
  return c.json(row);
});

platformRouter.delete("/club-app/roles/:id", async (c) => {
  const pid = c.req.query("program_id") ?? "";
  await _bridgeAdmin(c, pid);
  await appRoles.deleteAppRole(pid, c.req.param("id") ?? "");
  return c.json({ ok: true });
});

/**
 * What the CALLER may do in the app, for one program.
 *
 * The app calls this on launch and gates every surface on `capabilities`.
 * `role_name` is the one role they hold, shown beside them in the roster.
 *
 * Never 500s on a bad role or catalogue: a failure here would lock someone out
 * of the app entirely, so it degrades to an empty set and lets the app fall back
 * to its pre-roles behaviour.
 */
/**
 * Resolve the caller against THE CLUB THEY ASKED ABOUT.
 *
 * Deliberately NOT resolvePlatformAccess: for a partner program that redirects
 * to the CONNECTED program (so partners see the parent's bridge content), which
 * is right for the desktop platform and wrong here — a club's app roles, its
 * members and its chat all belong to the club itself, not to the Bridge Program
 * it hangs off. It also gates on the `bridge` feature, which a partner club may
 * legitimately have off while still using the app.
 */
async function _clubAppActor(c: Context) {
  const user = await getCurrentUser(c);
  const programId = c.req.query("program_id") ?? "";
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  const orgId = program.org_id as string;
  // A Nexus operator has no place inside an org's club, exactly as on every
  // other People surface.
  if (user.role === "platform_admin") {
    throw new HttpError(403, "Nexus operators cannot access an organization's members");
  }
  if (!user.memberships.some((m) => m.org_id === orgId)) {
    throw new HttpError(403, "You are not a member of this organization");
  }

  // Structural tier: this club's own administrator, or the org's owner/admin.
  // They hold the app entire, without needing a role — the same bypass every
  // other catalogue gives them.
  const isAdminRole = (m: { org_id: string; role: string; program_id?: string | null }) =>
    m.org_id === orgId && ["owner", "administrator"].includes(m.role);
  const structuralTier = user.memberships.some(
    (m) => isAdminRole(m) && (!m.program_id || m.program_id === programId),
  );

  return {
    user,
    programId,
    orgId,
    programName: (program.name as string) ?? null,
    programDescription: (program.description as string | null) ?? null,
    structuralTier,
  };
}

platformRouter.get("/club-app/context", async (c) => {
  const { user, programId, orgId, programName, programDescription, structuralTier } =
    await _clubAppActor(c);

  // The ONE role they hold in this club, and what it grants. Shared with
  // /bridge/context and the learning path so the three cannot disagree; it also
  // absorbs the "a bad role must never lock someone out" guard that used to sit here.
  const result = await clubAppAccess.clubAppAccessFor(user, programId, orgId, (pid, email) =>
    graph.getProgramRoleForEmail(pid, email),
  );
  // The org's CEILING, sent as its own fact. The app cannot derive it from
  // `capabilities` above: an empty set there means "no fine role" (and the app
  // falls back to coarse behaviour), while an admin skips capabilities entirely.
  // Provisioning has to be enforceable in both of those cases. See
  // provisioning.ts → appProvisioning.
  const ceiling = await provisioning.appProvisioning(programId).catch(() => ({
    enabled: true,
    capabilities: null as string[] | null,
  }));
  return c.json({
    program_id: programId,
    program_name: programName,
    // The club's own one-line label, so the app can show it and offer to change it
    // without a second round-trip. Nullable: most clubs have never set one.
    program_description: programDescription,
    role_name: result.roleName,
    capabilities: result.capabilities,
    is_admin: structuralTier,
    app_enabled: ceiling.enabled,
    provisioned_capabilities: ceiling.capabilities,
  });
});

/** Every member of the program with the app role they hold — the roster's
 *  labels, and the source of the club's role filter. */
platformRouter.get("/club-app/members", async (c) => {
  const { programId, orgId } = await _clubAppActor(c);
  const [members, roles] = await Promise.all([
    graph.listProgramMembers(orgId, programId),
    graph.listProgramRoles(programId).catch(() => [] as Row[]),
  ]);
  // Which of the club's roles COACH — the same capability rule as
  // /bridge/context's clubCoach: the role grants the coaching menu, or grants
  // the whole app area at "administrator" (which stores no per-capability
  // ids). Emitted per member as `is_coach` so the app can split its roster
  // into coaches and learners WITHOUT re-deriving role semantics client-side
  // — the membership role can't do that job (every enrollee is "instructor").
  const coachingRoleIds = new Set(
    roles
      .filter((r: Row) => {
        const perms = (r.perms as Record<string, unknown>) ?? {};
        const caps = Array.isArray(perms.capabilities) ? (perms.capabilities as string[]) : [];
        return perms.clubapp === "administrator" || caps.includes("app.coaching.view");
      })
      .map((r: Row) => r.id as string),
  );
  // listProgramMembers already carries `role_name` — the club role each person
  // holds — so the roster's label is a join it has done for us.
  return c.json(
    members.map((m: Row) => {
      // A club administrator holds the app structurally, so they are labelled
      // as such rather than appearing role-less.
      const isAdmin = m.membership_role === "administrator" || m.membership_role === "owner";
      return {
        ...m,
        app_role_id: (m.role_id as string | null) ?? null,
        app_role_name: isAdmin ? "Administrator" : ((m.role_name as string | null) ?? null),
        is_coach: isAdmin || coachingRoleIds.has((m.role_id as string | null) ?? ""),
      };
    }),
  );
});

// ── Password ownership: claim codes (0046) ──────────────────────────────────
//
// No email is wired in this stack, so recovery for a claimed account is a
// single-use code an admin issues and reads out. The person redeems it in the app
// and picks a password nobody else ever sees — which is the whole point: the
// admin regains the ability to HELP without regaining the ability to log in as
// them.

/** Issue a claim code for a member. Same authority as setting credentials. */
platformRouter.post("/members/:member_id/claim-code", async (c) => {
  const user = await getCurrentUser(c);
  const memberId = c.req.param("member_id") ?? "";
  const membership = await db.getMembership(memberId);
  if (!membership) throw new HttpError(404, "Member not found");
  _assertCanManageCredentials(user, membership);

  const profile = await db.getProfile(membership.profile_id as string);
  if (!profile) throw new HttpError(404, "Profile not found");
  if (!profile.email) throw new HttpError(400, "This member has no email");

  const issued = await db.issueClaimCode(membership.profile_id as string);
  await db.recordAuditEvent("member.claim_code_issued", {
    orgId: membership.org_id as string,
    actorUserId: user.id,
    scopeType: "program",
    scopeId: (membership.program_id as string) ?? null,
    targetType: "profile",
    targetId: membership.profile_id as string,
    // The code itself is never recorded — only that one was issued.
    metadata: { email: profile.email, expires_at: issued.expiresAt },
  });
  return c.json({ code: issued.code, expires_at: issued.expiresAt });
});

/**
 * Redeem a claim code and set a password. UNAUTHENTICATED by necessity — the
 * person cannot sign in, which is why they have a code.
 */
platformRouter.post("/auth/claim", async (c) => {
  const body = parseBody(
    z.object({
      identifier: z.string().trim().min(1),
      code: z.string().trim().min(1),
      password: z.string().min(8, "Use at least 8 characters").max(128),
    }),
    await c.req.json(),
  );
  const redeemed = await db.redeemClaimCode(body.identifier, body.code);
  // One message for every failure — a wrong code, an expired one and an unknown
  // account must be indistinguishable.
  if (!redeemed) throw new HttpError(400, "That code is not valid or has expired");

  await setAuthUserPassword(redeemed.email, body.password);
  await db.markPasswordClaimed(redeemed.profileId);
  return c.json({ ok: true, email: redeemed.email });
});

/** Change your own password. The current one is required — a live session is not
 *  on its own proof enough to replace the credential it rests on. */
platformRouter.post("/auth/password", async (c) => {
  const user = await getCurrentUser(c);
  const body = parseBody(
    z.object({
      current_password: z.string().min(1),
      password: z.string().min(8, "Use at least 8 characters").max(128),
    }),
    await c.req.json(),
  );
  if (!user.email) throw new HttpError(400, "This account has no email");
  // Verified by signing in with it, which is the only check that cannot be
  // fooled by a stale session.
  await signInUser(user.email, body.current_password).catch(() => {
    throw new HttpError(403, "That current password is not right");
  });
  await setAuthUserPassword(user.email, body.password);

  const orgId = user.memberships[0]?.org_id ?? null;
  const profileId = await db.resolveProfileId(user.id, orgId);
  if (profileId) await db.markPasswordClaimed(profileId);
  return c.json({ ok: true });
});

/**
 * Change your OWN display name — the app's profile editor.
 *
 * Self-service and global: it renames the person everywhere they appear, in every
 * club, because a name belongs to the person and not to a club. An admin renaming
 * someone else still goes through the console's people surface; this route only
 * ever touches the caller's own rows.
 *
 * The name is what the roster, the leaderboard and every chat message are labelled
 * with, so it is trimmed, length-capped, and stripped of control characters (a
 * newline would break a single-line row wherever one is rendered).
 */
platformRouter.patch("/auth/me", async (c) => {
  const user = await getCurrentUser(c);
  const body = parseBody(
    z.object({
      display_name: z
        .string()
        .transform((v) => v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim())
        .refine((v) => v.length >= 1, "A name cannot be empty")
        .refine((v) => v.length <= 80, "That name is too long"),
    }),
    await c.req.json(),
  );
  const changed = await db.setOwnDisplayName(user.id, user.email ?? null, body.display_name);
  if (!changed) throw new HttpError(404, "No profile to rename");
  return c.json({ ok: true, display_name: body.display_name, profiles_updated: changed });
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
  const eff = await _learningEffective(user, access);
  const { isAdmin, capabilities, customRole } = eff;
  // An exact pre-built learning role on the grant (picked in the role builder,
  // or implied — a bridge coach arrives as the learning app's `coach`) is
  // authoritative, same as the bridge context: flattening it through the
  // level map turned `coach`/`object-reviewer` into `content-developer`/
  // `course-reviewer`, which are different apps entirely.
  const prebuiltLearning =
    access.platformRole &&
    platformRoleConfig("learning")?.prebuilt.includes(access.platformRole)
      ? access.platformRole
      : null;
  return c.json({
    nexusUserId: access.profileId,
    laicOrgId: access.orgId,
    programId: access.programId,
    // The CLUB, when the caller arrived through one — `programId` above is the
    // connected PARENT, so without this no client can tell which club it is in.
    // Mirrors nexus_club_program_id on the bridge context.
    nexus_club_program_id: access.partnerProgramId ?? null,
    /** …and its NAME, so the Studio can say which club publishing will feed. */
    nexus_club_program_name: access.partnerProgramName ?? null,
    appId: await platformAppSlug(access.programId, "learning-platform", "learning_platform"),
    roles: prebuiltLearning ? [prebuiltLearning] : mapped.roles,
    permissions: [`learning:${access.level}`],
    accessLevel: prebuiltLearning ?? mapped.accessLevel,
    capabilities, // effective learning-catalogue capability ids (screen gating)
    // The club role's raw app.content.* grants, sent as their own fact. One of them
    // — app.content.create.personal — has NO learning image on purpose: "for myself
    // or for the club" is a scope question and the learning catalogue has no id for
    // it, so faking one would be inventing a permission that governs nothing.
    app_content_capabilities: eff.appContentCaps,
    displayName: await _platformDisplayName(access.profileId, user),
    program_name: access.programName,
    role_name: access.roleName,
    is_admin: isAdmin,
    learning_role: customRole, // { role_id, role_name, perms:{...,capabilities} } or null
    /**
     * EVERY ROLE THIS PERSON ACTUALLY HOLDS, for the console to name at the top.
     *
     * Derived, never a list somebody typed. Two sources, because a role here comes
     * from two genuinely different places and a person can hold both:
     *
     *   ASSIGNED    a learning role in this program (Club Mentor, Content Editor).
     *               What they are.
     *   FROM ACCESS the folder grants they hold. Editing content is a role in
     *               practice even when nobody assigned it a name — Milind is a Club
     *               Mentor who was ALSO given edit on a folder, and a header saying
     *               only "Club Mentor" hides half of what he can do.
     *
     * Deduplicated on the label, so somebody assigned Content Editor who also holds
     * edit access is listed once rather than twice for the same fact.
     */
    roles_held: await _rolesHeld(access, eff),
  });
});

/**
 * The role labels one person holds in one program.
 *
 * The access-derived labels use the STRONGEST level anywhere: edit somewhere makes
 * you an editor, and only-view everywhere makes you a reviewer. A person with edit
 * on one folder and view on another is an editor, not both -- "reviewer" would
 * understate them, and listing both reads as a contradiction.
 */
async function _rolesHeld(
  access: ResolvedPlatformAccess,
  eff: { capabilities: string[]; clubRoleId?: string | null; customRole?: { role_name?: string } | null },
): Promise<{ label: string; source: "assigned" | "access" }[]> {
  const out: { label: string; source: "assigned" | "access" }[] = [];
  const seen = new Set<string>();
  const add = (label: string, source: "assigned" | "access") => {
    const key = label.trim().toLowerCase();
    if (!label.trim() || seen.has(key)) return;
    seen.add(key);
    out.push({ label: label.trim(), source });
  };

  if (eff.customRole?.role_name) add(eff.customRole.role_name, "assigned");
  if (access.level === "admin") add("Administrator", "assigned");

  // NOT inferring "Content Manager" from governing capabilities. Milind holds
  // share_club so he can share with his own club, and that made him read as a
  // content manager -- a title nobody gave him, sitting in the list beside ones
  // that were. An assigned role is a thing somebody assigned; anything else here
  // has to come from a grant and be marked as such.

  if (access.profileId) {
    const clubIds = await graph
      .clubIdsForProfile(access.orgId, access.profileId)
      .catch(() => [] as string[]);
    if (access.partnerProgramId) clubIds.push(access.partnerProgramId);
    const levels = await graph
      .collectionLevelsFor(access.orgId, access.programId, {
        profileId: access.profileId,
        clubIds,
        roleIds: eff.clubRoleId ? [eff.clubRoleId] : [],
      })
      .catch(() => new Map<string, "view" | "edit">());
    const vals = [...levels.values()];
    if (vals.includes("edit")) add("Content Editor", "access");
    else if (vals.length) add("Content Reviewer", "access");
  }
  return out;
}

// Learning objects, proxied through Nexus (Option B): the browser no longer
// hits Supabase directly, so org isolation is preserved. Both routes resolve
// the caller's org server-side and scope to it.
platformRouter.get("/learning/objects", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "learning", c.req.query("program_id") ?? null);
  if (!(await db.checkModuleAccess(access.orgId, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }
  // ?meta=1 → metadata only (no blocks/pipeline_draft). The full listing can
  // run to tens of MB once authored content accumulates; list screens should
  // never pay that — fetch one object's content via GET /learning/objects/:id.
  // Program-scoped either way: each program is its own Content Studio instance.
  // WHO is asking now matters, not just which program: personal content is its
  // owner's plus whoever it was shared with.
  const effList = await _learningEffective(user, access);
  const viewer = _learningViewer(access, effList.clubRoleId);

  /**
   * WHAT THE CLUB APP ACTUALLY SERVES.
   *
   * This endpoint feeds the app's Learn tab, and it used to ignore
   * learning_object_app_targets entirely — so publishing to an app and narrowing
   * it to one club was recorded faithfully and changed nothing about what the app
   * showed. A control that reports success and has no effect is worse than no
   * control at all.
   *
   * TWO RULES, and the second one is a deliberate, awkward trade:
   *
   *  1. CLUB SCOPE IS HONOURED. Content published to this app for specific clubs
   *     is served only to members of those clubs.
   *
   *  2. ONCE A PROGRAM PUBLISHES ANYTHING TO THIS APP, the app serves ONLY what
   *     was published to it. Before the first publish it serves the whole
   *     curriculum, exactly as it always has.
   *
   * Rule 2 exists because "publish this to the app" has to mean something, and
   * the alternative readings are both bad: ignoring it (today's behaviour) makes
   * the feature a lie, and gating unconditionally would empty the Learn tab of
   * every club that has never touched app targeting. Keying on whether the
   * program has EVER published makes the feature opt-in by use.
   *
   * The wart, stated plainly because someone will hit it: the FIRST publish flips
   * a program's app from "everything" to "just this", which is a large change from
   * a small gesture. If that turns out to be the wrong default, the fix is an
   * explicit per-program setting rather than softening this into ambiguity.
   *
   * STAFF ARE EXEMPT — an author or administrator browsing the library needs to
   * see what they curate, not what a learner would receive.
   *
   * "Staff" is decided by CAPABILITY, not by access.level. On this deployment an
   * ordinary club member resolves to level `edit` (their learning role reads
   * "content-developer"), so exempting `edit` exempted every learner and the gate
   * did nothing at all. A level is about the platform; holding object.edit or
   * library.console is about the job.
   */
  // NOT the authoring capabilities. On this deployment an ordinary club member is
  // provisioned as a "content-developer" and arrives holding object.create,
  // object.edit, composition.create and more — so keying staff on those exempted
  // every learner in the club. Authoring rights are the default here and
  // therefore carry no information about who is staff.
  //
  // library.console and app.administer are the ones that do: both are granted
  // deliberately, by a person, to run the library or an app.
  const STAFF_CAPABILITIES = [
    "learning.library.console",
    "learning.app.administer",
  ];
  const narrowForApp = async <T extends Row>(rows: T[]): Promise<T[]> => {
    // NOT `!fineGrained`. That idiom means "ungated admin" when the subject holds
    // a role, but a learner holds no role at all and reads the same way — so
    // including it exempted every learner and the gate did nothing, twice over.
    const isStaff =
      access.level === "admin" ||
      STAFF_CAPABILITIES.some((cap) => effList.capabilities.includes(cap));
    if (isStaff) return rows;
    const targets = await graph
      .listAppTargetAudiences(access.orgId, "clubapp")
      .catch(() => new Map<string, (string | null)[]>());
    if (!targets.size) return rows; // this program has never published to the app

    // Which clubs is this viewer in? The club they launched with, plus any
    // membership — a scope naming their club must match either way.
    const mine = new Set<string>();
    if (access.partnerProgramId) mine.add(access.partnerProgramId);
    if (access.profileId) {
      for (const id of await graph
        .clubIdsForProfile(access.orgId, access.profileId)
        .catch(() => [] as string[])) {
        mine.add(id);
      }
    }
    return rows.filter((r) => {
      const audiences = targets.get(String(r.id));
      if (!audiences) return false;                     // not on this app
      // null = the whole app; otherwise the viewer must be in a named club.
      return audiences.some((a) => a === null || mine.has(a));
    });
  };

  if (c.req.query("meta") === "1") {
    return c.json(
      await narrowForApp(
        await graph.listLearningObjectsMeta(access.orgId, access.programId, access.partnerProgramId ?? null, viewer),
      ),
    );
  }
  return c.json(
    await narrowForApp(
      await graph.listLearningObjects(access.orgId, access.programId, access.partnerProgramId ?? null, viewer),
    ),
  );
});

// The bridge platform's program-instance library, for the LP's authoring
// picker (library ↔ LP intersection). Authors only — the embed is a snapshot
// the author places into a lesson, so browsing is a staff activity.
platformRouter.get("/learning/bridge-library", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "learning", c.req.query("program_id") ?? null);
  if (access.level !== "admin" && access.level !== "edit") {
    throw new HttpError(403, "Content-author access required");
  }
  if (!(await db.checkModuleAccess(access.orgId, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }
  return c.json(await graph.listBridgeLibraryForLearning(access.orgId, access.programId));
});

platformRouter.get("/learning/objects/:object_id", async (c) => {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "learning", c.req.query("program_id") ?? null);
  if (!(await db.checkModuleAccess(access.orgId, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }
  // Scoped like the list: club ∪ parent. The embed chain survives this because the
  // mobile launch carries the club id and the Studio sends it back on every by-id
  // call, so a by-id fetch resolves to a SUPERSET of the list that offered the item.
  const effRead = await _learningEffective(user, access);
  const row = await graph.getLearningObject(
    access.orgId,
    c.req.param("object_id"),
    access.programId,
    access.partnerProgramId ?? null,
    _learningViewer(access, effRead.clubRoleId),
  );
  if (!row) throw new HttpError(404, "Learning object not found");
  return c.json(row);
});

platformRouter.put("/learning/objects", async (c) => {
  const user = await getCurrentUser(c);
  const body = (await c.req.json()) as Row;
  const access = await resolvePlatformAccess(user, "learning", (body.program_id as string) ?? c.req.query("program_id") ?? null);
  // Writing content requires content-author access, the same test its neighbours
  // apply (/bridge-library above, /share below). This route had NO level check at
  // all, so a `view`-level learner could upsert any object into the program — and
  // because the repo's conflict clause rewrites owner_id from the payload, could
  // also take authorship of someone else's work.
  if (access.level !== "admin" && access.level !== "edit") {
    throw new HttpError(403, "Content-author access required");
  }
  if (!(await db.checkModuleAccess(access.orgId, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }
  if (!body.id || !body.type) throw new HttpError(422, "id and type are required");
  // Autosave is a write like any other: a role scoped to Tutorials must not be able to
  // edit a Quiz by letting the editor's own save fire. Stored type wins over the
  // payload's for an existing row, so a relabel cannot slip past the scope.
  const eff = await _learningEffective(user, access);
  const probe = await graph.probeLearningObject(access.orgId, String(body.id));
  _requireLearningCap(
    eff,
    probe ? "learning.object.edit" : "learning.object.create",
    (probe?.type ?? (body.type as string | null)) ?? null,
  );
  // Capability said "you may edit content"; this says "you may edit THIS content".
  await _requireObjectOwnership(probe, access, eff, String(body.id), eff.clubRoleId);
  // A NEW object may be filed as the author's own rather than the club's. Existing
  // rows keep their scope — moving one is a deliberate act, not a save.
  const wantsPersonal = !probe && String(body.scope_level ?? "") === "user";
  if (wantsPersonal) {
    _requireLearningCap(eff, "learning.object.create", (body.type as string | null) ?? null);
  }
  const wrote = await graph.upsertLearningObject(access.orgId, body, _learningWriteScope(access), {
    ownerId: access.profileId,
    ownerName: (body.owner_name as string | null) ?? null,
  });
  if (!wrote) {
    // The id exists, in this org or another, under a different program. Refusing is
    // the point — see upsertLearningObject — but it must SAY so: answering {ok:true}
    // on a write that matched no rows tells an author their work is saved when it
    // is not. 409, not 404: the object is there, it is just not theirs to write.
    throw new HttpError(409, "That object belongs to another program");
  }
  if (wantsPersonal) await graph.setLearningObjectPersonal(access.orgId, String(body.id), access.profileId);
  return c.json({ ok: true });
});

// ── Publishing, with a session ──────────────────────────────────────────────
// These replace the Content Studio's own /api/learning/* routes, which were
// UNAUTHENTICATED and wrote with the service-role key, stamping org and program
// from environment variables. Two consequences that made club-owned content
// impossible: the publisher's identity never reached the row, and every object
// landed in one env-configured program however it was authored.
//
// The body envelope is deliberately identical to the route being replaced
// ({ object, share }), so the Studio's call sites move by changing which fetch
// helper they use and nothing else.
//
// AUTHORITY here is the coarse content-author guard (admin|edit), the same one
// /share applies. Per-capability and per-content-type enforcement (a role scoped to
// Tutorials but not Quizzes) is the next pass and belongs in _learningEffective,
// which already resolves typeScopes for it.


/**
 * Who is asking, for the personal tier — the profile id `owner_id` holds, plus any
 * club role they hold, so grants addressed to "Club Mentor" resolve.
 *
 * Cheap and cached upstream: `_learningEffective` has already resolved the club role
 * for its own branch, so this reuses that answer rather than asking again.
 */
function _learningViewer(
  access: ResolvedPlatformAccess,
  clubRoleId: string | null,
): graph.LearningViewer {
  return { profileId: access.profileId, roleIds: clubRoleId ? [clubRoleId] : [] };
}

/**
 * May this caller mutate THIS row, given who owns it?
 *
 * Capability answers "may you edit content"; this answers "may you edit THIS
 * content". They are different questions and only the second one knows about the
 * personal tier.
 *
 * Silent on anything that is not personal — club content stays governed by the
 * club's capabilities exactly as before, which is what keeps this additive. A
 * personal row is its owner's alone, unless they shared it at `edit`, or the caller
 * is the club's structural tier, or holds `app.content.manage_others` for
 * housekeeping.
 */
async function _requireObjectOwnership(
  probe: { ownerId: string | null; scopeLevel: string | null } | null,
  access: ResolvedPlatformAccess,
  eff: { appContentCaps: string[]; isAdmin: boolean; clubTier: boolean },
  objectId: string,
  clubRoleId: string | null,
): Promise<void> {
  if (!probe || probe.scopeLevel !== "user") return;
  if (probe.ownerId && probe.ownerId === access.profileId) return;
  if (eff.isAdmin || eff.clubTier) return;
  if (eff.appContentCaps.includes("app.content.manage_others")) return;
  const granted = await graph.learningGrantLevelFor(objectId, _learningViewer(access, clubRoleId));
  if (granted === "edit") return;
  // 404-shaped on purpose would be wrong here: the caller can SEE the object (they
  // got this far), so hiding the reason only wastes their time.
  throw new HttpError(403, "That content belongs to someone else");
}

/**
 * The program a write is stamped with — ONE expression, so club ownership arrives
 * everywhere at once or nowhere.
 *
 * The CLUB when the caller came through one, the program otherwise. Both writers go
 * through here, which is what stops the same row ping-ponging between two program ids
 * on alternate saves.
 *
 * No backfill was owed. The diagnostic found every existing object stamped with a
 * parent program (Bridge Program 16, Brain Bee 5) or nothing at all (14, none of them
 * published) and NOT ONE owned by a club — so there is no attribution to undo, and
 * parent-stamped content keeps flowing down to every connected club through the read
 * arm.
 *
 * The consequence that was signed off: a club member can no longer save edits to
 * PARENT curriculum. The sticky guard in upsertLearningObject refuses it and the route
 * answers 409, rather than the old behaviour of silently moving the object into their
 * club. Someone authoring AS the parent (the usual Content Studio launch) is
 * unaffected — their scope is the program, exactly as before.
 */
function _learningWriteScope(access: ResolvedPlatformAccess): string | null {
  return access.partnerProgramId ?? access.programId ?? null;
}

/**
 * May this caller use `capId` on content of this TYPE?
 *
 * Two independent questions, and they deserve different answers on the wire: "you
 * cannot publish" and "you cannot publish QUIZZES" send an author to different
 * places.
 *
 * Only FINE-GRAINED callers are gated. The sample templates are incomplete —
 * `learning-content-developer` grants no `object.delete` and none of the
 * `publish.*` ids — and every partner club member is pinned to level "edit", which
 * maps to that template. So gating on capability alone would strip publishing and
 * deleting from every club member the day it shipped. Level-derived callers stay
 * governed by each route's coarse admin|edit guard, which is the same accommodation
 * enforce.ts already makes for the same reason.
 *
 * An absent or empty type list means EVERY type — the pruning never stores an empty
 * one, and absence has to keep meaning "unrestricted" here as everywhere else.
 */
/**
 * Like _requireLearningCap, but WITHOUT the level-derived escape hatch.
 *
 * The escape above exists for backwards compatibility: the sample templates are
 * incomplete and every partner club member is pinned to level "edit", so gating
 * old routes on capability alone would have stripped publishing and deleting
 * from every club member on day one. That argument is about not breaking what
 * already worked.
 *
 * It does not extend to a NEW surface. Per-club sharing has no incumbent users
 * to protect, and letting it inherit the hatch would mean any ordinary member of
 * any club could hand the parent program's library to sibling clubs — the exact
 * cross-club exposure this feature exists to govern, ungated on the day it
 * shipped. Admins still pass: their capability set is the whole catalogue.
 */
function _requireLearningCapStrict(
  eff: { fineGrained: boolean; capabilities: string[]; typeScopes: Record<string, string[]> },
  capId: string,
  objectType: string | null | undefined,
): void {
  if (!eff.capabilities.includes(capId)) {
    throw new HttpError(403, `Missing capability: ${capId}`);
  }
  const types = eff.typeScopes[capId];
  if (!types?.length) return;
  if (!objectType || !types.includes(objectType)) {
    throw new HttpError(403, `That role's ${capId} is limited to specific content types`);
  }
}

function _requireLearningCap(
  eff: { fineGrained: boolean; capabilities: string[]; typeScopes: Record<string, string[]> },
  capId: string,
  objectType: string | null | undefined,
): void {
  if (!eff.fineGrained) return;
  if (!eff.capabilities.includes(capId)) {
    throw new HttpError(403, `Missing capability: ${capId}`);
  }
  const types = eff.typeScopes[capId];
  if (!types?.length) return;
  if (!objectType || !types.includes(objectType)) {
    throw new HttpError(403, `That role's ${capId} is limited to specific content types`);
  }
}

/**
 * Learning MEMBERSHIP, without the author-level bar — for the governance surface.
 *
 * `_learningAuthor` requires level admin|edit, which is right for authoring: you
 * should not be able to write content you were only given to read. It is wrong
 * for the Content Library, and shipping it there quietly broke the sub-roles
 * feature this file already enforces.
 *
 * A learning sub-role stores its grant as `perms.capabilities`, so the coarse
 * level derived for its holder is "view" (_platformLevel looks for an "edit"
 * VALUE among the perms, and an array of capability ids is not one). A role
 * granting library.share_club therefore arrived here as a viewer and was refused
 * before its capability was ever consulted — the ceiling machinery working
 * perfectly and the door bolted anyway.
 *
 * So these routes gate on the CAPABILITY alone, via _requireLearningCapStrict.
 * That is the same call the write paths already make, and it is stricter than the
 * level test in the way that matters: the level is inherited from how someone
 * launched, the capability is what an administrator deliberately granted.
 *
 * The org's module check stays — a disabled platform is still closed.
 */
async function _learningMember(c: Context, pinned: string | null) {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "learning", pinned);
  if (!(await db.checkModuleAccess(access.orgId, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }
  const eff = await _learningEffective(user, access);
  return { user, access, eff };
}

/** Capabilities that ARE authoring. Holding one is the same claim `level: edit`
 *  makes, said in the fine-grained vocabulary instead of the coarse one. */
const _AUTHORING_CAPABILITIES = [
  "learning.object.create",
  "learning.object.edit",
  "learning.composition.create",
  "learning.composition.edit",
];

async function _learningAuthor(c: Context, pinned: string | null) {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "learning", pinned);
  if (!(await db.checkModuleAccess(access.orgId, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }
  // Resolved here so the coarse guard and the fine one are never out of step, and so
  // no route can forget the org's provisioning ceiling (_learningEffective clamps).
  const eff = await _learningEffective(user, access);

  // THE LEVEL **OR** AN AUTHORING CAPABILITY.
  //
  // This used to be the level alone, which made every capability-only role
  // invisible here: a learning role grants capabilities but does not raise the
  // launch LEVEL, so someone explicitly granted `learning.object.edit` still
  // arrived as `student` and every authoring write answered
  // "Content-author access required" — a granted capability the server refuses to
  // honour, with a message naming an access level nobody can see or set.
  //
  // Checked AFTER _learningEffective so the org's provisioning ceiling has already
  // clamped the list: this can only be satisfied by a capability the org is
  // actually entitled to, never by one a role merely claims.
  const authorByLevel = access.level === "admin" || access.level === "edit";
  const authorByCapability = _AUTHORING_CAPABILITIES.some((cap) =>
    eff.capabilities.includes(cap),
  );
  if (!authorByLevel && !authorByCapability) {
    throw new HttpError(
      403,
      "Content-author access required: this needs edit access to the program, or a role granting learning.object.edit",
    );
  }
  return { user, access, eff };
}

platformRouter.post("/learning/objects/publish", async (c) => {
  const body = (await c.req.json()) as {
    object?: Row;
    share?: boolean;
    program_id?: string;
    /** Destination apps for this publish. Optional — omitting it leaves whatever
     *  targets the object already had, so an autosave never clears a choice. */
    app_keys?: string[];
  };
  const row = (body.object ?? (body as unknown as Row)) as Row;
  // AUTH FIRST, then shape. Validating ahead of the session let an unauthenticated
  // caller tell a real route from a missing one by the error it got back.
  // program_id is only the launch PIN fed to access resolution — resolvePlatformAccess
  // verifies membership, and the id that gets WRITTEN comes from the resolved access.
  const { user, access, eff } = await _learningAuthor(
    c,
    body.program_id ?? (row?.program_id as string) ?? c.req.query("program_id") ?? null,
  );
  if (!row?.id || !row?.type) throw new HttpError(422, "id and type are required");
  const scope = _learningWriteScope(access);
  const share = body.share === true;

  // The same mode decision the Studio's server made: a version number means this is
  // a real publish; otherwise, if the object is already published, an autosave must
  // only refresh the draft backup — never the reader-visible columns.
  const isPublish = Number.isFinite(Number(row.version_number));
  const probe = await graph.probeLearningObject(access.orgId, String(row.id));

  // The type is the OBJECT's, and for an existing row the stored one wins: a payload
  // may not relabel a quiz as a tutorial to slip past a type-scoped role.
  const objectType = (probe?.type ?? (row.type as string | null)) ?? null;
  _requireLearningCap(
    eff,
    probe ? "learning.object.edit" : "learning.object.create",
    objectType,
  );
  if (isPublish) _requireLearningCap(eff, "learning.publish.release", objectType);
  if (share) _requireLearningCap(eff, "learning.publish.audience", objectType);
  await _requireObjectOwnership(probe, access, eff, String(row.id), eff.clubRoleId);
  const wrote =
    !isPublish && !share && probe?.published
      ? await graph.backupLearningObjectDraft(access.orgId, scope, String(row.id), row)
      : await graph.publishLearningObject(access.orgId, scope, row, { publish: isPublish, share }, {
          ownerId: access.profileId,
          ownerName: (row.owner_name as string | null) ?? null,
        });

  if (!wrote) throw new HttpError(409, "That object belongs to another program");
  // The compose flow creates through THIS route, not only through autosave, so the
  // scope choice has to be honoured in both places or "Just me" silently means "the
  // club" whenever publishing happens to be the first write.
  if (!probe && String(row.scope_level ?? "") === "user") {
    await graph.setLearningObjectPersonal(access.orgId, String(row.id), access.profileId);
  }

  // App targets ride along with a real publish so "publish this, to there" is one
  // act rather than two requests that can half-succeed. Checked separately from
  // publish.release: a role may be allowed to press Publish without choosing a
  // destination, and the reverse.
  const appKeys = Array.isArray(body.app_keys) ? body.app_keys.map(String) : null;
  if (appKeys?.length) {
    _requireLearningCapStrict(eff, "learning.publish.app_target", objectType);
    const unknown = appKeys.filter((k) => !CONTENT_APP_TARGET_KEYS.has(k));
    if (unknown.length) throw new HttpError(422, `Unknown app: ${unknown.join(", ")}`);
    try {
      await graph.setLearningObjectAppTargets(access.orgId, String(row.id), appKeys, user.email ?? null);
    } catch (e) {
      // The content is already saved; a missing targets table must not turn a
      // successful publish into a 500. Say it in the response instead of lying
      // by omission.
      if (e instanceof Error && e.message.startsWith("app-targets-unavailable")) {
        return c.json({ ok: true, id: row.id, app_keys: [], app_targets_unavailable: true });
      }
      throw e;
    }
  }
  return c.json({ ok: true, id: row.id, ...(appKeys ? { app_keys: appKeys } : {}) });
});

platformRouter.post("/learning/objects/unpublish", async (c) => {
  const body = (await c.req.json()) as { id?: string; program_id?: string };
  const { access, eff } = await _learningAuthor(
    c,
    body.program_id ?? c.req.query("program_id") ?? null,
  );
  if (!body.id) throw new HttpError(422, "id is required");
  const probe = await graph.probeLearningObject(access.orgId, body.id);
  _requireLearningCap(eff, "learning.publish.release", probe?.type);
  await _requireObjectOwnership(probe, access, eff, body.id, eff.clubRoleId);
  const ok = await graph.unpublishLearningObject(access.orgId, _learningWriteScope(access), body.id);
  if (!ok) throw new HttpError(404, "Learning object not found");
  return c.json({ ok: true });
});

platformRouter.delete("/learning/objects/:object_id", async (c) => {
  const { access, eff } = await _learningAuthor(c, c.req.query("program_id") ?? null);
  const probe = await graph.probeLearningObject(access.orgId, c.req.param("object_id"));
  _requireLearningCap(eff, "learning.object.delete", probe?.type);
  await _requireObjectOwnership(probe, access, eff, c.req.param("object_id"), eff.clubRoleId);
  const ok = await graph.deleteLearningObject(
    access.orgId,
    _learningWriteScope(access),
    c.req.param("object_id"),
  );
  if (!ok) throw new HttpError(404, "Learning object not found");
  return c.json({ ok: true });
});


// ── Sharing one object with named people ───────────────────────────────────
//
// The Docs model, and deliberately NOT a second visibility system running beside
// program scope. An object's default audience is still its scope + program; a grant
// is the exception to that default, for one named subject.
//
// CONFINEMENT: a grant may only name someone who is in the club that owns the
// object, or a role that club has authored. Enforced HERE rather than by a foreign
// key, because no key can express "this profile belongs to the club on that row" —
// the club is on the object and the membership is in another table. Club isolation
// is the property the whole system rests on, and sharing narrows within a club; it
// never reaches across one.

/** Who may change who an object is shared with: its owner, the club's tier, or
 *  someone holding the housekeeping capability. Editors do not re-share. */
async function _requireGrantAuthority(
  c: Context,
  objectId: string,
): Promise<{
  access: ResolvedPlatformAccess;
  eff: Awaited<ReturnType<typeof _learningEffective>>;
  probe: NonNullable<Awaited<ReturnType<typeof graph.probeLearningObject>>>;
}> {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "learning", c.req.query("program_id") ?? null);
  if (!(await db.checkModuleAccess(access.orgId, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }
  const eff = await _learningEffective(user, access);
  const probe = await graph.probeLearningObject(access.orgId, objectId);
  if (!probe) throw new HttpError(404, "Learning object not found");
  const owns = !!probe.ownerId && probe.ownerId === access.profileId;
  if (!owns && !eff.isAdmin && !eff.clubTier && !eff.appContentCaps.includes("app.content.manage_others")) {
    throw new HttpError(403, "Only the author can change who this is shared with");
  }
  return { access, eff, probe };
}

/** Everyone this object is shared with. */
platformRouter.get("/learning/objects/:object_id/grants", async (c) => {
  const objectId = c.req.param("object_id");
  await _requireGrantAuthority(c, objectId);
  return c.json({ grants: await graph.listLearningObjectGrants(objectId) });
});

/** Invite someone, or change the level they hold. */
platformRouter.put("/learning/objects/:object_id/grants", async (c) => {
  const objectId = c.req.param("object_id");
  const body = (await c.req.json()) as {
    subject_type?: string;
    subject_id?: string;
    level?: string;
  };
  const { access, probe } = await _requireGrantAuthority(c, objectId);

  const subjectType = body.subject_type === "role" ? "role" : "profile";
  const subjectId = String(body.subject_id ?? "").trim();
  const level = body.level === "edit" ? "edit" : "view";
  if (!subjectId) throw new HttpError(422, "subject_id is required");

  // The owning club, from the ROW — never from the request. A caller naming another
  // club's program would otherwise widen their own confinement check.
  const owningProgram = probe.programId ?? _learningWriteScope(access);
  if (!owningProgram) {
    throw new HttpError(409, "That content has no club, so it cannot be shared with one");
  }

  if (subjectType === "profile") {
    const members = await graph.listProgramMembers(access.orgId, owningProgram);
    const inClub = members.some((m) => String((m as Row).profile_id ?? "") === subjectId);
    if (!inClub) throw new HttpError(403, "That person is not in this club");
  } else {
    const roles = await graph.listProgramRoles(owningProgram).catch(() => [] as Row[]);
    const isClubRole = roles.some((r) => String((r as Row).id ?? "") === subjectId);
    if (!isClubRole) throw new HttpError(403, "That role does not belong to this club");
  }

  await graph.setLearningObjectGrant(
    objectId,
    { subjectType, subjectId, level },
    access.profileId ?? null,
  );
  return c.json({ ok: true, subject_type: subjectType, subject_id: subjectId, level });
});

/** Withdraw a share. Idempotent — removing one nobody holds is the state asked for. */
platformRouter.delete("/learning/objects/:object_id/grants", async (c) => {
  const objectId = c.req.param("object_id");
  const subjectType = c.req.query("subject_type") === "role" ? "role" : "profile";
  const subjectId = String(c.req.query("subject_id") ?? "").trim();
  if (!subjectId) throw new HttpError(422, "subject_id is required");
  await _requireGrantAuthority(c, objectId);
  await graph.removeLearningObjectGrant(objectId, subjectType, subjectId);
  return c.json({ ok: true });
});

// ── Public share links for Content Studio objects ───────────────────────────
//
// A /o/<id> link used to resolve only in the browser that authored the object
// (the viewer fell back to localStorage), so the link was permanent but the data
// was not portable. These two routes make it portable: the author publishes, and
// anyone holding the link can then read it with no session at all.

/** Publish or unpublish. Org-scoped: only someone who can see the object may
 *  share it, and content-author access is required to change its visibility. */
platformRouter.put("/learning/objects/:object_id/share", async (c) => {
  const user = await getCurrentUser(c);
  const body = (await c.req.json().catch(() => ({}))) as { shared?: boolean; program_id?: string };
  const access = await resolvePlatformAccess(user, "learning", body.program_id ?? c.req.query("program_id") ?? null);
  if (access.level !== "admin" && access.level !== "edit") {
    throw new HttpError(403, "Content-author access required");
  }
  if (!(await db.checkModuleAccess(access.orgId, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }
  const shared = body.shared !== false; // default: publish
  // This route had NO capability check at all, and setLearningObjectShared is
  // org-scoped rather than write-scoped — so any club member could make ANY object
  // in the organization, including a sibling club's, readable by the whole internet
  // with nothing more than its id. Publishing to the world is the widest act in this
  // file and was the only one ungated.
  const effShare = await _learningEffective(user, access);
  const probeShare = await graph.probeLearningObject(access.orgId, c.req.param("object_id"));
  _requireLearningCap(effShare, "learning.publish.audience", probeShare?.type);
  await _requireObjectOwnership(probeShare, access, effShare, c.req.param("object_id"), effShare.clubRoleId);
  // And the object must be in the caller's own write scope, not merely their org.
  const shareScope = _learningWriteScope(access);
  if (shareScope && probeShare && probeShare.programId && probeShare.programId !== shareScope) {
    throw new HttpError(409, "That object belongs to another program");
  }
  let ok: boolean;
  try {
    ok = await graph.setLearningObjectShared(access.orgId, c.req.param("object_id"), shared);
  } catch (e) {
    // The column arrives with migration 0002_public_share.sql. Until it is
    // applied, say so plainly — an author must never be told a link is public
    // when it is not.
    if (e instanceof Error && e.message.startsWith("share-unavailable")) {
      throw new HttpError(503, "Share links are not enabled yet on this deployment");
    }
    throw e;
  }
  if (!ok) throw new HttpError(404, "Learning object not found");
  return c.json({ ok: true, shared });
});

// ── Per-club shares ─────────────────────────────────────────────────────────
//
// NOT the route above. `/share` (singular) is the anonymous /o/<id> capability
// link — one boolean, no audience. `/shares` (plural) is the named grant: this
// object, those clubs. They share a word and nothing else.

/** The clubs this program may share TO — its partner programs. Validated against
 *  on every write, so a hand-rolled request cannot grant an object to a club in
 *  someone else's program (or to a program id that is not a club at all). */
/** 42P01 — learning_object_grants (0007) or its club constraint (0008) has not
 *  run. A content manager granting access must never be told it worked when
 *  there is nowhere to write it, so this becomes a 503 rather than an empty list. */
function _missingGrantsTable(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (e as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "42P01";
}

async function _clubIdsFor(access: ResolvedPlatformAccess): Promise<Set<string>> {
  // Always the PARENT's partner list: a club sharing onward still picks from the
  // siblings its parent program defines, and access.programId is already the
  // parent for a club-scoped caller (platformAccess.ts).
  const partners = await db.listPartnersForProgram(access.programId).catch(() => []);
  return new Set(partners.map((p) => String(p.id)));
}

platformRouter.get("/learning/objects/:object_id/shares", async (c) => {
  const { access, eff } = await _learningMember(c, c.req.query("program_id") ?? null);
  const objectId = c.req.param("object_id");
  // Scoped read first: "who is this shared with?" must not answer for an object
  // the caller could not open, or the share list becomes an existence oracle for
  // another club's library.
  const object = await graph.getLearningObject(
    access.orgId, objectId, access.programId, access.partnerProgramId ?? null,
  );
  if (!object) throw new HttpError(404, "Learning object not found");
  _requireLearningCapStrict(eff, "learning.library.share_view", (object.type as string | null) ?? null);
  try {
    return c.json(await graph.listLearningObjectClubShares(access.orgId, objectId));
  } catch (e) {
    if (_missingGrantsTable(e)) {
      throw new HttpError(503, "Per-club sharing is not enabled yet on this deployment");
    }
    throw e;
  }
});

platformRouter.put("/learning/objects/:object_id/shares", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    club_program_ids?: string[];
    program_id?: string;
  };
  const { access, eff } = await _learningMember(
    c, body.program_id ?? c.req.query("program_id") ?? null,
  );
  const objectId = c.req.param("object_id");
  const object = await graph.getLearningObject(
    access.orgId, objectId, access.programId, access.partnerProgramId ?? null,
  );
  if (!object) throw new HttpError(404, "Learning object not found");
  _requireLearningCapStrict(eff, "learning.library.share_club", (object.type as string | null) ?? null);

  const requested = Array.isArray(body.club_program_ids) ? body.club_program_ids.map(String) : [];
  const allowed = await _clubIdsFor(access);
  const unknown = requested.filter((id) => !allowed.has(id));
  // Loud, not silent. Dropping an unrecognised club would report success on a
  // grant that never happened — a content manager would believe a club has
  // access it does not, which is the one failure this whole feature must not have.
  if (unknown.length) {
    throw new HttpError(422, `Not a club of this program: ${unknown.join(", ")}`);
  }

  let ok: boolean;
  try {
    // granted_by is a uuid column — the acting PROFILE, not the email the older
    // learning writes carry, or the insert fails its cast at the last moment.
    ok = await graph.setLearningObjectClubShares(
      access.orgId, objectId, requested, access.profileId ?? null,
    );
  } catch (e) {
    if (_missingGrantsTable(e)) {
      throw new HttpError(503, "Per-club sharing is not enabled yet on this deployment");
    }
    throw e;
  }
  if (!ok) throw new HttpError(404, "Learning object not found");
  return c.json({ ok: true, club_program_ids: requested });
});

// ── App targets ─────────────────────────────────────────────────────────────

platformRouter.get("/learning/objects/:object_id/app-targets", async (c) => {
  const { access } = await _learningMember(c, c.req.query("program_id") ?? null);
  const objectId = c.req.param("object_id");
  const object = await graph.getLearningObject(
    access.orgId, objectId, access.programId, access.partnerProgramId ?? null,
  );
  if (!object) throw new HttpError(404, "Learning object not found");
  // No capability gate on the READ: an author who can open an object may see where
  // it went. Choosing the destination is the governed act, not knowing it.
  return c.json(await graph.listLearningObjectAppTargets(access.orgId, objectId));
});

platformRouter.put("/learning/objects/:object_id/app-targets", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { app_keys?: string[]; program_id?: string };
  const { user, access, eff } = await _learningMember(
    c, body.program_id ?? c.req.query("program_id") ?? null,
  );
  const objectId = c.req.param("object_id");
  const object = await graph.getLearningObject(
    access.orgId, objectId, access.programId, access.partnerProgramId ?? null,
  );
  if (!object) throw new HttpError(404, "Learning object not found");
  _requireLearningCapStrict(eff, "learning.publish.app_target", (object.type as string | null) ?? null);

  const keys = Array.isArray(body.app_keys) ? body.app_keys.map(String) : [];
  const unknown = keys.filter((k) => !CONTENT_APP_TARGET_KEYS.has(k));
  if (unknown.length) throw new HttpError(422, `Unknown app: ${unknown.join(", ")}`);

  try {
    const ok = await graph.setLearningObjectAppTargets(access.orgId, objectId, keys, user.email ?? null);
    if (!ok) throw new HttpError(404, "Learning object not found");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("app-targets-unavailable")) {
      throw new HttpError(503, "App targeting is not enabled yet on this deployment");
    }
    throw e;
  }
  return c.json({ ok: true, app_keys: keys });
});

// ── The Nexus-level Content Library ─────────────────────────────────────────
//
// The console renders folders, content and their sharing WITHOUT opening the
// Content Studio. These three endpoints are that screen's whole API: what is in
// the library, who it can be shared with, and the two bulk writes.
//
// Why not reuse GET /learning/objects: that answers "the library" for an
// AUTHOR and carries blocks/pipeline_draft or a meta subset. This screen needs
// the share state beside each row, and fetching it per object would be a
// waterfall the length of the library.

/**
 * May this caller open the library at all?
 *
 * Two independent answers, and an app administrator has the second one. A content
 * manager holds a CAPABILITY; an app administrator is in the REGISTER for an app,
 * which is what "an app has administrators" means — there is no capability to
 * check because the authority is per-app and lives beside the program.
 *
 * Gating on the capability alone locked app administrators out of the very screen
 * built for them. Gating on the register alone would lock out the content manager
 * who grants to them. It is an OR, and the row filter downstream is what keeps an
 * app administrator to their own catalogue.
 */
async function _libraryReader(c: Context, pinned: string | null) {
  const { user, access, eff } = await _learningMember(c, pinned);
  const administers = await appAdmins.appsAdministeredBy(
    access.partnerProgramId ?? access.programId,
    access.profileId ?? null,
  );
  // library.console FIRST, because its entire meaning is "this person may open
  // the Content Library" — it is what draws the tab. Leaving it out produced the
  // one thing a permission system must never do: a granted capability that names
  // a screen, a sidebar entry that appears because of it, and a screen that then
  // refuses to load, citing a capability nobody was asked for.
  const byCapability =
    eff.capabilities.includes("learning.library.console") ||
    eff.capabilities.includes("learning.library.share_view") ||
    eff.capabilities.includes("learning.library.share_club") ||
    eff.capabilities.includes("learning.library.share_member") ||
    eff.capabilities.includes("learning.app.administer");
  if (!byCapability && !administers.length) {
    throw new HttpError(403, "Missing capability: learning.library.console");
  }
  return { user, access, eff, administers };
}

platformRouter.get("/learning/library", async (c) => {
  const { access, eff } = await _libraryReader(c, c.req.query("program_id") ?? null);

  // FOLDER CONFINEMENT. Null = this caller governs the library and sees all of
  // it; a Set = specific folders were shared with them and those folders are the
  // whole of their library. See _libraryFolderScope for why having grants is what
  // narrows the view rather than lacking a capability.
  //
  // Applied HERE, on the server, and not left to the screen: "they only have
  // access to this folder" has to be a property of the response, or a crafted
  // request reads the rest of the library anyway.
  const folderScope = await _libraryFolderScope(access, eff);
  const inScope = (ids: unknown): boolean =>
    !folderScope || (Array.isArray(ids) && ids.some((i) => folderScope.has(String(i))));

  /**
   * CONTENT IN A DRIVE IS NOT LIBRARY CONTENT.
   *
   * `?scope=drive` reads the other side. An object filed in BOTH a drive and a
   * shared folder belongs to both and appears in both -- it is only excluded here
   * when every folder it is in is a drive folder, which is what "this is somebody's
   * own work and nothing else" actually means.
   */
  const driveIds = await graph
    .driveCollectionIds(access.orgId, access.programId)
    .catch(() => new Set<string>());
  const wantDrive = c.req.query("scope") === "drive";
  const driveRootParam = c.req.query("drive") ?? null;
  const driveWanted = wantDrive && driveRootParam
    ? new Set(await graph.collectionSubtreeIdsPublic(access.orgId, [driveRootParam]))
    : null;
  const isDriveOnly = (ids: unknown): boolean =>
    Array.isArray(ids) && ids.length > 0 && ids.every((i) => driveIds.has(String(i)));
  const driveFilter = (ids: unknown): boolean =>
    wantDrive
      ? Array.isArray(ids) && ids.some((i) => (driveWanted ?? driveIds).has(String(i)))
      : !isDriveOnly(ids);

  /**
   * WHO THIS VIEWER IS, as grant subjects — so a folder-confined person still
   * sees anything shared with them DIRECTLY.
   *
   * Confinement narrows the program's library to the folders someone was given.
   * It must never narrow away a grant: handing a person a specific object and
   * then hiding it from them because it sits in a folder they were not given is
   * the one failure direction sharing can never have. A grant is a deliberate
   * exception to the default audience (0007's header says exactly this) and
   * confinement is a default, so the grant wins.
   *
   * Only computed when confinement is actually in force; a governing caller sees
   * everything anyway and this would be pure cost.
   */
  const grantSubjects = new Set<string>();
  if (folderScope) {
    if (access.profileId) grantSubjects.add(`profile:${access.profileId}`);
    if (eff.clubRoleId) grantSubjects.add(`role:${eff.clubRoleId}`);
    if (access.partnerProgramId) grantSubjects.add(`club:${access.partnerProgramId}`);
    if (access.profileId) {
      for (const cid of await graph
        .clubIdsForProfile(access.orgId, access.profileId)
        .catch(() => [] as string[])) {
        grantSubjects.add(`club:${cid}`);
      }
    }
  }

  const objects = await graph.listLearningObjectsMeta(
    access.orgId,
    access.programId,
    access.partnerProgramId ?? null,
    // Personal rows belong to their owner, not to a governance screen: a
    // content manager curating what reaches a club has no business listing
    // someone's "just for me" drafts. Passing no viewer excludes them.
    null,
  );
  const ids = objects.map((o) => String(o.id));
  const [grants, targets] = await Promise.all([
    graph.listLearningGrantsForObjects(access.orgId, ids),
    graph.listLearningAppTargetsForObjects(access.orgId, ids),
  ]);

  const shape = (objectId: string) => ({
    clubs: grants
      .filter((g) => g.object_id === objectId && g.subject_type === "club")
      .map((g) => String(g.subject_id)),
    people: grants
      .filter((g) => g.object_id === objectId && g.subject_type === "profile")
      .map((g) => String(g.subject_id)),
    // Granted TO an app — its administrators may see it and decide.
    granted_apps: grants
      .filter((g) => g.object_id === objectId && g.subject_type === "app")
      .map((g) => String(g.subject_id)),
    // Actually ON an app. Distinct from the grant: being handed content is not
    // the same as having carried it, and an app administrator's whole job lives
    // in the gap between those two facts.
    apps: [
      ...new Set(
        targets.filter((t) => t.object_id === objectId).map((t) => String(t.app_key)),
      ),
    ],
    app_scopes: targets
      .filter((t) => t.object_id === objectId)
      .map((t) => ({
        app_key: String(t.app_key),
        club_program_id: (t.club_program_id as string | null) ?? null,
      })),
  });

  // What this caller may DO here, answered once by the server rather than
  // guessed at by the client from a capability list it would have to interpret.
  const administers = await appAdmins.appsAdministeredBy(
    access.partnerProgramId ?? access.programId,
    access.profileId ?? null,
  );

  // Files ride along in the same response: they live in the same folders and the
  // screen groups by folder, so fetching them separately would mean rendering the
  // tree twice or waiting on two requests to draw it once.
  //
  // An app administrator is not shown them. Their remit is a granted catalogue,
  // and an asset cannot be granted yet (0011's header explains why), so every
  // file would be outside it — listing them would imply otherwise.
  const assets = administers.length
    ? []
    : (await graph.listLearningAssets(access.orgId, access.partnerProgramId ?? access.programId))
        .filter((a) => inScope(a.collection_ids));

  return c.json({
    assets: assets.map((a) => ({
      id: String(a.id),
      title: (a.title as string) ?? "",
      kind: (a.kind as string) ?? "link",
      content_type: (a.content_type as string | null) ?? null,
      byte_size: (a.byte_size as number | null) ?? null,
      external_url: (a.external_url as string | null) ?? null,
      collection_ids: (a.collection_ids as string[]) ?? [],
      collection_names: (a.collection_names as string[]) ?? [],
      created_at: (a.created_at as string | null) ?? null,
    })),
    // An app administrator sees only what their apps were granted. Their remit is
    // the catalogue they were handed, not the program's whole library — and this
    // is the filter, not a UI convenience, so a crafted request cannot widen it.
    objects: objects
      .map((o) => ({
        id: String(o.id),
        title: (o.title as string) ?? "",
        type: (o.type as string) ?? "",
        status: (o.status as string) ?? "draft",
        published_at: (o.published_at as string | null) ?? null,
        // WHICH VERSION IS LIVE, so a governance screen can say what it is about
        // to put on an app. Not a version LIST — the snapshots live in the
        // Studio's localStorage (objectVersionsStore.ts, "local-first"), so the
        // server knows only the number that was published, never the history.
        version_number: (o.version_number as number | null) ?? null,
        collection_ids: (o.collection_ids as string[]) ?? [],
        collection_names: (o.collection_names as string[]) ?? [],
        ...shape(String(o.id)),
      }))
      // BEING AN APP ADMINISTRATOR IS WHAT NARROWS THIS, not the absence of a
      // sharing capability. Someone who administers an app has a catalogue they
      // were handed and no business browsing the rest; someone who got here by
      // capability was given the library by a content manager, and filtering them
      // to nothing would make the screen they were granted useless.
      //
      // GRANTED TO THEIR APP **OR** ALREADY ON IT. These are two different facts
      // (0010's header draws the distinction, and it is a real one — being handed
      // content is not the same as having carried it), but both put the content
      // squarely in an app administrator's remit. Filtering on the grant alone
      // meant content PUBLISHED to Bridge Bird was invisible to the person who
      // administers Bridge Bird: they could not see it, scope it to a club, or
      // take it down. An administrator must always be able to see what their app
      // is carrying, however it got there.
      .filter((o) =>
        administers.length
          ? o.granted_apps.some((a) => administers.includes(a)) ||
            o.apps.some((a) => administers.includes(a))
          : true,
      )
      // A folder-confined viewer sees what is filed in their folders and nothing
      // else — including nothing UNFILED, which is the case worth stating: an
      // object in no folder is in none of theirs.
      //
      // UNLESS IT WAS SHARED WITH THEM. An explicit grant outranks the folder
      // scope; see grantSubjects above for why that direction and not the other.
      .filter((o) => driveFilter(o.collection_ids))
      .filter(
        (o) =>
          inScope(o.collection_ids) ||
          grants.some(
            (g) =>
              g.object_id === o.id &&
              grantSubjects.has(`${g.subject_type}:${g.subject_id}`),
          ),
      ),
    confined_to_folders: folderScope !== null,
    administers_apps: administers,
  });
});

/**
 * The clubs this program can share to, each with its members.
 *
 * Its own endpoint rather than the console's /programs/:id/partners because that
 * one requires ORG-level staff, and a Content Manager is scoped to a program —
 * they would be refused the very list their job depends on. Gated instead on the
 * capability that means "you may see who content reaches".
 *
 * Members ride along: the picker offers a club and the people inside it in one
 * tree, and a request per club would be a waterfall for a dialog that opens on a
 * click.
 */
platformRouter.get("/learning/clubs", async (c) => {
  // Same door as the library: an app administrator needs the club list to say
  // "only Highbury sees this on the app", and that is the whole point of their
  // publish dialog.
  const { access } = await _libraryReader(c, c.req.query("program_id") ?? null);

  // THE PARENT PROGRAM'S PEOPLE, not the club's.
  //
  // `clubs` below comes from listPartnersForProgram(access.programId) — the
  // PARENT's clubs. So the complement has to be drawn from the same place, or the
  // two lists describe different populations. Using `partnerProgramId ?? programId`
  // here (the idiom for club-scoped DATA) returned the CLUB's own members for a
  // club-scoped caller, every one of whom is then filtered out as "already in a
  // club" — leaving the Program members section silently empty for exactly the
  // people most likely to be looking for it.
  const programId = access.programId;
  // The program's own people, not only club rosters.
  //
  // A club is a grouping WITHIN the program, not the only way to belong to it. The
  // first version of this endpoint returned club members alone, so a coach or an
  // administrator who had never joined a club was unreachable — not hidden, but
  // absent from the only list the share dialog could draw, and refused by the
  // write path for the same reason.
  const programMembers = await graph
    .listProgramMembers(access.orgId, programId)
    .catch(() => [] as Row[]);

  const partners = await db.listPartnersForProgram(access.programId).catch(() => []);
  const clubs = await Promise.all(
    partners.map(async (p) => {
      const members = await graph
        .listProgramMembers(access.orgId, String(p.id))
        .catch(() => [] as Row[]);
      return {
        id: String(p.id),
        name: (p.name as string) ?? "Club",
        members: members
          // Only people who can actually be granted to: a grant keys on
          // profile_id, and an invited-but-not-activated member has none yet.
          .filter((m) => m.profile_id)
          .map((m) => ({
            profile_id: String(m.profile_id),
            display_name: (m.display_name as string | null) ?? (m.email as string | null) ?? "Member",
            email: (m.email as string | null) ?? null,
          })),
      };
    }),
  );
  return c.json({
    clubs,
    // Everyone in the program. The client shows under "Program members" whoever is
    // not already listed inside a club, so the two sections never repeat a person;
    // sending the complete set keeps that decision in one place rather than making
    // the server guess which grouping the UI prefers.
    program_members: programMembers
      .filter((m) => m.profile_id)
      .map((m) => ({
        profile_id: String(m.profile_id),
        display_name: (m.display_name as string | null) ?? (m.email as string | null) ?? "Member",
        email: (m.email as string | null) ?? null,
      })),
  });
});

// ── Library assets: files nobody authored ──────────────────────────────────
//
// A handout, an image, a recording. Uploaded or linked, filed into folders, and
// listed beside authored content in the Content Library.
//
// WHY THERE IS A SIZE LIMIT AND A LINK OPTION. Production has no S3 configured,
// so the storage adapter writes base64 rows into Postgres and an upload travels
// as base64 inside a JSON body — Vercel caps that at ~4.5 MB, which after base64
// expansion is about 3 MB of actual file. Fine for a handout, useless for a
// recording. So video is expected to arrive as a LINK until a bucket exists, and
// the limit below is enforced rather than discovered.

/** ~3 MB. base64 is 4 bytes per 3, so this lands under the ~4.5 MB body cap. */
const _MAX_ASSET_BYTES = 3 * 1024 * 1024;

const _ASSET_KIND_FOR_CT: { test: RegExp; kind: string }[] = [
  { test: /^application\/pdf$/, kind: "pdf" },
  { test: /^image\//, kind: "image" },
  { test: /^video\//, kind: "video" },
];

function _assetKind(contentType: string | null, externalUrl: string | null): string {
  for (const { test, kind } of _ASSET_KIND_FOR_CT) {
    if (contentType && test.test(contentType)) return kind;
  }
  // A link with no content type: guess from the extension, and fall back to
  // "link" rather than mislabelling something as a document.
  const ext = (externalUrl ?? "").split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (["mov", "mp4", "m4v", "webm"].includes(ext)) return "video";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "link";
}

const _ASSET_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif",
  "image/webp": "webp", "image/svg+xml": "svg",
  "video/quicktime": "mov", "video/mp4": "mp4", "video/webm": "webm",
};

platformRouter.get("/learning/assets", async (c) => {
  const { access } = await _libraryReader(c, c.req.query("program_id") ?? null);
  return c.json({
    assets: await graph.listLearningAssets(
      access.orgId, access.partnerProgramId ?? access.programId,
    ),
  });
});

const _assetCreateSchema = z.object({
  program_id: z.string().optional(),
  title: z.string().trim().min(1).max(300),
  /** base64 file bytes, OR external_url. Exactly one. */
  data: z.string().optional(),
  content_type: z.string().optional(),
  external_url: z.string().url().optional(),
  collection_ids: z.array(z.string()).default([]),
  collection_names: z.array(z.string()).default([]),
});

platformRouter.post("/learning/assets", async (c) => {
  const req = parseBody(_assetCreateSchema, await c.req.json());
  const { access, eff } = await _learningMember(
    c, req.program_id ?? c.req.query("program_id") ?? null,
  );
  _requireLearningCapStrict(eff, "learning.library.upload", null);

  const hasFile = !!req.data;
  const hasLink = !!req.external_url;
  if (hasFile === hasLink) {
    throw new HttpError(422, "Provide either file data or an external_url, not both");
  }

  const programId = access.partnerProgramId ?? access.programId;
  const id = `ast_${randomBytes(9).toString("base64url")}`;
  let storageKey: string | null = null;
  let byteSize: number | null = null;
  const contentType = req.content_type ?? null;

  if (hasFile) {
    const buf = Buffer.from(req.data as string, "base64");
    if (!buf.length) throw new HttpError(422, "Empty upload");
    if (buf.length > _MAX_ASSET_BYTES) {
      // Say the number and the way round it. "Too large" with no ceiling and no
      // alternative is a dead end for someone holding a recording.
      throw new HttpError(
        413,
        `That file is ${(buf.length / 1024 / 1024).toFixed(1)} MB. This deployment can store up to ` +
          `${(_MAX_ASSET_BYTES / 1024 / 1024).toFixed(0)} MB — add larger files, including video, by link instead.`,
      );
    }
    const ext = _ASSET_EXT[contentType ?? ""] ?? "bin";
    storageKey = orgKey(access.orgId, `library-assets/${id}.${ext}`);
    await getStorage().put(storageKey, buf, contentType ?? "application/octet-stream");
    byteSize = buf.length;
  }

  // Ids AND names. Names are the only shared truth about folders — Studio folders
  // live in that app's localStorage — and they are what makes an asset appear
  // beside authored content in the library's folder list.
  const names = [...new Set(req.collection_names.map((n) => n.trim()).filter(Boolean))];

  let row: Row | null;
  try {
    row = await graph.createLearningAsset(access.orgId, programId, {
      id,
      title: req.title.trim(),
      kind: _assetKind(contentType, req.external_url ?? null),
      contentType,
      byteSize,
      storageKey,
      externalUrl: req.external_url ?? null,
      collectionIds: [...new Set(req.collection_ids.filter(Boolean))],
      collectionNames: names,
      uploadedBy: access.profileId ?? null,
    });
  } catch (e) {
    // The bytes are already stored; do not leave them orphaned behind a failed row.
    if (storageKey) await getStorage().delete(storageKey).catch(() => {});
    if (e instanceof Error && e.message.startsWith("assets-unavailable")) {
      throw new HttpError(503, "Library files are not enabled yet on this deployment (learning pack 0011)");
    }
    throw e;
  }
  if (!row) throw new HttpError(500, "The file could not be recorded");
  return c.json({ ok: true, id, url: storageKey ? await getStorage().url(storageKey) : req.external_url });
});

const _assetFoldersSchema = z.object({
  program_id: z.string().optional(),
  collection_ids: z.array(z.string()).default([]),
  collection_names: z.array(z.string()).default([]),
});

platformRouter.put("/learning/assets/:asset_id/folders", async (c) => {
  const req = parseBody(_assetFoldersSchema, await c.req.json());
  const { access, eff } = await _learningMember(
    c, req.program_id ?? c.req.query("program_id") ?? null,
  );
  _requireLearningCapStrict(eff, "learning.library.upload", null);
  const ok = await graph.setLearningAssetFolders(
    access.orgId,
    c.req.param("asset_id"),
    [...new Set(req.collection_ids.filter(Boolean))],
    [...new Set(req.collection_names.map((n) => n.trim()).filter(Boolean))],
  );
  if (!ok) throw new HttpError(404, "File not found");
  return c.json({ ok: true });
});

platformRouter.delete("/learning/assets/:asset_id", async (c) => {
  const { access, eff } = await _learningMember(c, c.req.query("program_id") ?? null);
  _requireLearningCapStrict(eff, "learning.library.upload", null);
  const assetId = c.req.param("asset_id");
  // Read first so the stored bytes can go too — the table has no cascade to
  // storage, and an orphaned blob is invisible and paid for forever.
  const asset = await graph.getLearningAsset(access.orgId, assetId);
  if (!asset) throw new HttpError(404, "File not found");
  const ok = await graph.deleteLearningAsset(access.orgId, assetId);
  if (!ok) throw new HttpError(404, "File not found");
  if (asset.storage_key) await getStorage().delete(asset.storage_key as string).catch(() => {});
  return c.json({ ok: true });
});

// ── The app-administrator register ─────────────────────────────────────────
//
// Granting content to an app grants it to these people. Kept beside the library
// because appointing them is the same act as deciding who may carry content —
// the content manager's job, not the org admin's.

// ── Content Library folders (0012) ──────────────────────────────────────────
//
// Folders became server-side rows so that an empty folder can exist, two people
// can see one tree, and a folder can be SHARED as a folder — see 0012's header
// for what each of those was impossible before.

const _collectionCreateSchema = z.object({
  program_id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  /** null / absent = a root folder of this program's library. */
  parent_id: z.string().nullish(),
});

const _collectionRenameSchema = z.object({
  program_id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
});

const _collectionSharesSchema = z.object({
  program_id: z.string().optional(),
  /**
   * Per-person access level: 'view' = review (read the pipeline, change nothing),
   * 'edit' = edit it. Keyed by profile id; anyone omitted gets 'view'.
   *
   * Only profiles carry a level. A club or an app is a standing audience, and
   * "everyone in this club may edit" is not a thing anybody asked for — it would
   * hand authoring to whoever joins next.
   */
  levels: z.record(z.string(), z.enum(["view", "edit"])).optional(),
  // NO DEFAULTS, for the reason _bulkSharesSchema gives: absent means "not mine
  // to say", empty array means "none of this kind". A role holding only
  // share_member must not revoke the club grants a content manager made.
  club_program_ids: z.array(z.string()).optional(),
  profile_ids: z.array(z.string()).optional(),
  app_keys: z.array(z.string()).optional(),
});

const _fileIntoFolderSchema = z.object({
  program_id: z.string().optional(),
  // The object is the PATH param. It was briefly required in the body too, which
  // meant every well-formed request was rejected for omitting a value the URL
  // already carried.
  /** The folders this object should be filed under. Empty = unfile it. */
  collection_ids: z.array(z.string()),
});

/**
 * Does this caller GOVERN the library, or were they invited into part of it?
 *
 * The distinction decides whether folder grants confine them. A content manager
 * curates the whole library and must keep seeing all of it even after somebody
 * shares a folder with them; a Content Editor who was handed one folder must see
 * that folder and nothing else.
 *
 * Keyed on the capabilities that ACT on the library as a whole rather than on
 * `library.console`, which only means "may open this screen" — every one of these
 * people holds console too, so using it here would exempt everybody and confine
 * nobody.
 */
export function _governsLibrary(eff: { capabilities: string[]; fineGrained?: boolean }): boolean {
  // A role with no fine-grained capabilities at all is an ungated admin (see
  // _requireLearningCap) — not a confined viewer.
  if (eff.fineGrained === false) return true;
  return (
    eff.capabilities.includes("learning.library.folder_manage") ||
    eff.capabilities.includes("learning.library.share_club") ||
    eff.capabilities.includes("learning.library.share_member") ||
    eff.capabilities.includes("learning.library.share_app") ||
    eff.capabilities.includes("learning.roles.delegate")
  );
}

/**
 * Which folders may this caller see — null meaning "all of them".
 *
 * CONFINEMENT IS DERIVED FROM HAVING BEEN GIVEN FOLDERS, not from lacking a
 * capability. Someone with no folder grants is unaffected and sees what they
 * always saw; the moment a content manager hands them specific folders, those
 * folders become the whole of their library. That ordering matters twice over:
 *
 *   - It cannot regress anyone. No existing role has folder grants, so no
 *     existing role changes behaviour when this ships.
 *   - It says what the person sharing meant. "Give Nitin the B2F3 folder" is a
 *     statement about what Nitin should see, and reading it as "…in addition to
 *     everything else" would make the gesture pointless.
 *
 * A governing role is exempt, so a content manager who shares a folder with
 * themselves does not thereby lock themselves out of the rest of the library.
 *
 * Returns a Set of ids INCLUDING every descendant, because a grant names one
 * folder and means its subtree.
 */
async function _libraryFolderScope(
  access: ResolvedPlatformAccess,
  eff: { capabilities: string[]; fineGrained?: boolean; clubRoleId?: string | null },
): Promise<Set<string> | null> {
  if (_governsLibrary(eff)) return null;
  const programId = access.programId;
  const clubIds = access.profileId
    ? await graph.clubIdsForProfile(access.orgId, access.profileId).catch(() => [] as string[])
    : [];
  if (access.partnerProgramId) clubIds.push(access.partnerProgramId);
  const roots = await graph.grantedCollectionRootsFor(access.orgId, programId, {
    profileId: access.profileId ?? null,
    clubIds,
    // The club role's id, for grants addressed to a role rather than a person.
    roleIds: (eff as { clubRoleId?: string | null }).clubRoleId
      ? [(eff as { clubRoleId?: string | null }).clubRoleId as string]
      : [],
  });
  if (!roots.length) return null;
  return new Set(await graph.collectionSubtreeIds(access.orgId, roots));
}

/**
 * This program's folder tree, plus who each folder is shared with.
 *
 * Shares ride along rather than sitting behind a second request, because the
 * screen draws a share state per row and a request per folder would be a
 * waterfall for one render. They are omitted for a caller who may not see them —
 * a folder-confined viewer has no business reading the guest list of a folder
 * they were invited to.
 */
platformRouter.get("/learning/collections", async (c) => {
  const { access, eff } = await _libraryReader(c, c.req.query("program_id") ?? null);
  const scope = await _libraryFolderScope(access, eff);
  const everything = await graph
    .listLearningCollections(access.orgId, access.programId)
    .catch(() => [] as Row[]);

  /**
   * DRIVES ARE NOT PART OF THE SHARED LIBRARY.
   *
   * They are a different space, not a second view of one: a personal drive sitting
   * in the program's tree puts somebody's private work beside the program's, which
   * is the confusion the whole feature exists to end. `?scope=drive` asks for the
   * other side -- one drive's subtree and nothing else -- and is how the My Drive
   * screen reads. Neither view can see the other's folders.
   */
  const driveIds = await graph
    .driveCollectionIds(access.orgId, access.programId)
    .catch(() => new Set<string>());
  const wantDrive = c.req.query("scope") === "drive";
  const driveRoot = c.req.query("drive") ?? null;
  const all = wantDrive
    ? everything.filter((f) => driveIds.has(String(f.id)))
    : everything.filter((f) => !driveIds.has(String(f.id)));

  // Confinement hides the folder AND its ancestors' contents, but the ancestors
  // themselves have to stay in the payload or the client cannot draw a path to
  // what it is allowed to open. They are marked, not silently included.
  let visible = scope ? all.filter((f) => scope.has(String(f.id))) : all;
  if (wantDrive && driveRoot) {
    const wanted = new Set(await graph.collectionSubtreeIdsPublic(access.orgId, [driveRoot]));
    visible = visible.filter((f) => wanted.has(String(f.id)));
  }
  const byId = new Map(all.map((f) => [String(f.id), f]));
  const withAncestors = new Map(visible.map((f) => [String(f.id), { row: f, reachable: true }]));
  if (scope) {
    for (const f of visible) {
      let pid = (f.parent_id as string | null) ?? null;
      while (pid && byId.has(pid) && !withAncestors.has(pid)) {
        withAncestors.set(pid, { row: byId.get(pid)!, reachable: false });
        pid = (byId.get(pid)!.parent_id as string | null) ?? null;
      }
    }
  }

  const ids = [...withAncestors.keys()];
  const canSeeShares =
    eff.capabilities.includes("learning.library.share_view") ||
    eff.capabilities.includes("learning.library.share_club") ||
    eff.capabilities.includes("learning.library.share_member") ||
    eff.capabilities.includes("learning.library.share_app") ||
    eff.fineGrained === false;
  const grants = canSeeShares
    ? await graph.listCollectionGrants(access.orgId, ids).catch(() => [] as Row[])
    : [];
  const of = (cid: string, kind: string) =>
    grants.filter((g) => g.collection_id === cid && g.subject_type === kind)
      .map((g) => String(g.subject_id));

  return c.json({
    // `confined` tells the client the truth about its own view, so a screen can
    // say "shared with you" instead of implying this is the whole library.
    confined: scope !== null,
    folders: [...withAncestors.values()].map(({ row, reachable }) => ({
      id: String(row.id),
      name: (row.name as string) ?? "",
      parent_id: (row.parent_id as string | null) ?? null,
      created_at: (row.created_at as string | null) ?? null,
      // False for an ancestor included only so a path can be drawn: the folder
      // is a signpost, not something this caller may open.
      reachable,
      clubs: of(String(row.id), "club"),
      people: of(String(row.id), "profile"),
      granted_apps: of(String(row.id), "app"),
      // Per-person level, so the share sheet can show Review vs Edit rather than
      // making the content manager remember which they picked.
      levels: Object.fromEntries(
        grants
          .filter((g) => g.collection_id === row.id && g.subject_type === "profile")
          .map((g) => [String(g.subject_id), String(g.level) === "edit" ? "edit" : "view"]),
      ),
    })),
  });
});

platformRouter.post("/learning/collections", async (c) => {
  const req = parseBody(_collectionCreateSchema, await c.req.json());
  const { access, eff } = await _learningMember(
    c, req.program_id ?? c.req.query("program_id") ?? null,
  );
  _requireLearningCapStrict(eff, "learning.library.folder_manage", null);
  const id = `lcol-${randomUUID()}`;
  const row = await graph.createLearningCollection(access.orgId, access.programId, {
    id,
    name: req.name.trim(),
    parentId: req.parent_id ?? null,
    createdBy: access.profileId ?? null,
  });
  // Null means the parent was not ours — a 404 rather than a 403, because the
  // caller should not learn from this endpoint whether a foreign folder id exists.
  if (!row) throw new HttpError(404, "Parent folder not found");
  return c.json({
    id: String(row.id),
    name: (row.name as string) ?? "",
    parent_id: (row.parent_id as string | null) ?? null,
  });
});

platformRouter.patch("/learning/collections/:id", async (c) => {
  const req = parseBody(_collectionRenameSchema, await c.req.json());
  const { access, eff } = await _learningMember(
    c, req.program_id ?? c.req.query("program_id") ?? null,
  );
  _requireLearningCapStrict(eff, "learning.library.folder_manage", null);
  const row = await graph.renameLearningCollection(
    access.orgId, c.req.param("id"), req.name.trim(),
  );
  if (!row) throw new HttpError(404, "Folder not found");
  return c.json({ id: String(row.id), name: (row.name as string) ?? "" });
});

platformRouter.delete("/learning/collections/:id", async (c) => {
  const { access, eff } = await _learningMember(c, c.req.query("program_id") ?? null);
  _requireLearningCapStrict(eff, "learning.library.folder_manage", null);
  const ok = await graph.deleteLearningCollection(access.orgId, c.req.param("id"));
  if (!ok) throw new HttpError(404, "Folder not found");
  // Said out loud in the response because the cascade is the surprising part:
  // subfolders go, filed content does not.
  return c.json({ ok: true, content_kept: true });
});

/**
 * Share a folder — and with it everything inside, now and later.
 *
 * The per-kind capability checks are the same three as /learning/shares/bulk,
 * because they are the same three decisions: a club is a standing group whose
 * administrators decide onward, a person is one named individual, an app hands a
 * catalogue to whoever runs it. Checked on PRESENCE, so revoking a kind needs the
 * capability that granted it.
 *
 * The subject checks are the same too — a club must be a club of this program, a
 * person must belong to this program or one of its clubs. Sharing a folder must
 * not reach further than sharing a single object does.
 */
platformRouter.put("/learning/collections/:id/shares", async (c) => {
  const req = parseBody(_collectionSharesSchema, await c.req.json());
  const { access, eff } = await _learningMember(
    c, req.program_id ?? c.req.query("program_id") ?? null,
  );
  const touchesClubs = req.club_program_ids !== undefined;
  const touchesPeople = req.profile_ids !== undefined;
  const touchesApps = req.app_keys !== undefined;
  if (!touchesClubs && !touchesPeople && !touchesApps) {
    throw new HttpError(422, "Nothing to change: name at least one of clubs, people or apps");
  }
  if (touchesClubs) _requireLearningCapStrict(eff, "learning.library.share_club", null);
  if (touchesPeople) _requireLearningCapStrict(eff, "learning.library.share_member", null);
  if (touchesApps) _requireLearningCapStrict(eff, "learning.library.share_app", null);

  const appKeys = req.app_keys ?? [];
  const unknownApps = appKeys.filter((k) => !CONTENT_APP_TARGET_KEYS.has(k));
  if (unknownApps.length) throw new HttpError(422, `Unknown app: ${unknownApps.join(", ")}`);

  const clubs = await _clubIdsFor(access);
  const unknownClubs = (req.club_program_ids ?? []).filter((id) => !clubs.has(id));
  if (unknownClubs.length) {
    throw new HttpError(422, `Not a club of this program: ${unknownClubs.join(", ")}`);
  }
  const profileIds = req.profile_ids ?? [];
  if (profileIds.length) {
    const allowed = new Set<string>();
    const own = await graph
      .listProgramMembers(access.orgId, access.partnerProgramId ?? access.programId)
      .catch(() => [] as Row[]);
    for (const m of own) if (m.profile_id) allowed.add(String(m.profile_id));
    for (const clubId of clubs) {
      const members = await graph.listProgramMembers(access.orgId, clubId).catch(() => [] as Row[]);
      for (const m of members) if (m.profile_id) allowed.add(String(m.profile_id));
    }
    const strangers = profileIds.filter((p) => !allowed.has(p));
    if (strangers.length) {
      throw new HttpError(422, `Not a member of this program or its clubs: ${strangers.join(", ")}`);
    }
  }

  const ok = await graph.setCollectionGrants(
    access.orgId,
    c.req.param("id"),
    {
      ...(touchesClubs ? { clubs: req.club_program_ids } : {}),
      ...(touchesPeople ? { profiles: req.profile_ids } : {}),
      ...(touchesApps ? { apps: req.app_keys } : {}),
      ...(req.levels ? { levels: req.levels } : {}),
    },
    access.profileId ?? null,
  );
  if (!ok) throw new HttpError(404, "Folder not found");
  return c.json({ ok: true });
});

// ── Drives ─────────────────────────────────────────────────────────────────
//
// A drive is a collection root with an owner (0014): a person's, a coach's, a
// club's or an app's. "Personal" and "shared" are the same object with different
// owners, so there is one set of endpoints rather than two.

const _drivePermsSchema = z.object({
  program_id: z.string().optional(),
  subject_type: z.enum(["profile", "coach", "club", "app"]),
  subject_id: z.string().min(1),
  has_drive: z.boolean(),
  can_create: z.boolean(),
  /**
   * Which object types they may author. Null is "unrestricted"; [] is "none",
   * and the difference is load-bearing -- an empty list is somebody deciding,
   * a null is nobody having decided.
   */
  create_types: z.array(z.string()).nullable().optional(),
  /** Studio surface ids reachable inside the drive. Null = the default set. */
  surfaces: z.array(z.string()).nullable().optional(),
  /** Shown as the drive's name. Only used when one is created. */
  name: z.string().trim().min(1).max(120).optional(),
});

/** Who has drive permissions in this program. Governors only — it is granting. */
platformRouter.get("/learning/drives", async (c) => {
  const programId = c.req.query("program_id") ?? null;
  const { access, eff } = await _libraryReader(c, programId);
  if (!_governsLibrary(eff) && access.level !== "admin") {
    throw new HttpError(403, "Missing capability: learning.library.folder_manage");
  }
  const perms = await graph.listDrivePermissions(access.orgId, access.programId);
  const withDrives = await Promise.all(
    perms.map(async (p) => {
      const drive = await graph.getDriveFor(access.orgId, access.programId, p.subjectType, p.subjectId);
      return {
        subject_type: p.subjectType,
        subject_id: p.subjectId,
        has_drive: p.hasDrive,
        can_create: p.canCreate,
        create_types: p.createTypes,
        surfaces: p.surfaces,
        drive_id: drive ? String(drive.id) : null,
        drive_name: drive ? String(drive.name) : null,
      };
    }),
  );
  return c.json({ drives: withDrives });
});

platformRouter.put("/learning/drives", async (c) => {
  const req = parseBody(_drivePermsSchema, await c.req.json());
  const { access, eff } = await _libraryReader(c, req.program_id ?? null);
  if (!_governsLibrary(eff) && access.level !== "admin") {
    throw new HttpError(403, "Missing capability: learning.library.folder_manage");
  }
  const { driveId } = await graph.setDrivePermissions(
    access.orgId,
    access.programId,
    {
      subjectType: req.subject_type,
      subjectId: req.subject_id,
      hasDrive: req.has_drive,
      canCreate: req.can_create,
      createTypes: req.create_types ?? null,
      surfaces: req.surfaces ?? null,
    },
    access.profileId ?? null,
    req.name ?? "My drive",
  );
  return c.json({ ok: true, drive_id: driveId });
});

/**
 * THE CALLER'S OWN DRIVE, and what they may do in it.
 *
 * Answered for the person themselves rather than read off a roster, because this
 * is what the Studio and the app both boot against: "do I have a drive, may I
 * create in it, which types, which tabs". A subject with no permissions row gets
 * has_drive false rather than an error -- not having a drive is an ordinary
 * state, not a failure.
 */
platformRouter.get("/learning/drives/mine", async (c) => {
  const programId = c.req.query("program_id") ?? null;
  const { access } = await _libraryReader(c, programId);
  if (!access.profileId) return c.json({ has_drive: false });
  const p = await graph.getDrivePermissions(
    access.orgId, access.programId, "profile", access.profileId,
  );
  const drive = p?.hasDrive
    ? await graph.getDriveFor(access.orgId, access.programId, "profile", access.profileId)
    : null;
  return c.json({
    has_drive: p?.hasDrive === true,
    can_create: p?.canCreate === true,
    create_types: p?.createTypes ?? null,
    surfaces: p?.surfaces ?? null,
    drive_id: drive ? String(drive.id) : null,
    drive_name: drive ? String(drive.name) : null,
  });
});

// ── Reviewing and editing one object, without the Content Studio ────────────
//
// A folder grant carries a LEVEL (0012): 'view' is review access — open a piece
// of content and read its whole pipeline — and 'edit' additionally allows
// changing it. These two endpoints are what those levels actually buy, and they
// exist so that being trusted with one folder does not require handing somebody
// the whole authoring app.

/**
 * The level this caller holds on a given object, via the folders it sits in.
 *
 * Returns 'edit', 'view', or null for no access. The STRONGEST level across the
 * object's folders wins: content filed in two places, one of them shared for
 * editing, is editable — the alternative would make an object's editability
 * depend on which of its folders you happened to look at.
 *
 * A library GOVERNOR (content manager) always gets 'edit': they curate this
 * library, and locking them out of content they can already delete would be
 * theatre.
 */
async function _objectAccessLevel(
  access: ResolvedPlatformAccess,
  eff: { capabilities: string[]; fineGrained?: boolean; clubRoleId?: string | null },
  object: Row,
): Promise<"edit" | "view" | null> {
  if (access.level === "admin" || _governsLibrary(eff)) return "edit";
  const clubIds = access.profileId
    ? await graph.clubIdsForProfile(access.orgId, access.profileId).catch(() => [] as string[])
    : [];
  if (access.partnerProgramId) clubIds.push(access.partnerProgramId);
  const levels = await graph.collectionLevelsFor(access.orgId, access.programId, {
    profileId: access.profileId ?? null,
    clubIds,
    roleIds: eff.clubRoleId ? [eff.clubRoleId] : [],
  });
  const ids = Array.isArray(object.collection_ids) ? (object.collection_ids as string[]) : [];
  let best: "edit" | "view" | null = null;
  for (const id of ids) {
    const l = levels.get(String(id));
    if (l === "edit") return "edit";
    if (l === "view") best = "view";
  }
  return best;
}

/**
 * One object's full pipeline, for reading or editing inside Nexus.
 *
 * Returns `can_edit` so the screen never has to infer it from a capability list
 * — the server already knows, and a reviewer shown an editable surface would be
 * told "no" only on save.
 */
platformRouter.get("/learning/objects/:object_id/pipeline", async (c) => {
  const { access, eff } = await _libraryReader(c, c.req.query("program_id") ?? null);
  const object = await graph.getLearningObject(access.orgId, c.req.param("object_id"));
  if (!object) throw new HttpError(404, "Content not found");
  const level = await _objectAccessLevel(access, eff, object);
  if (!level) throw new HttpError(403, "That content was not shared with you");
  return c.json({
    id: String(object.id),
    title: (object.title as string) ?? "",
    type: (object.type as string) ?? "",
    status: (object.status as string) ?? "draft",
    description: (object.description as string) ?? "",
    blocks: Array.isArray(object.blocks) ? object.blocks : [],
    pipeline_draft: object.pipeline_draft ?? null,
    collection_names: Array.isArray(object.collection_names) ? object.collection_names : [],
    version_number: (object.version_number as number | null) ?? null,
    can_edit: level === "edit",
  });
});

const _pipelineSaveSchema = z.object({
  program_id: z.string().optional(),
  /**
   * A DELIBERATE SAVE, not an autosave.
   *
   * Only a commit moves the version number and records a snapshot. Every write
   * used to bump it, autosaves included, so a tutorial reached v11 from being
   * opened and looked at -- and a history of eleven identical entries buries the
   * two saves somebody actually made. An autosave still persists the content; it
   * just does not claim to be a version.
   */
  commit: z.boolean().optional(),
  /**
   * 'draft' when this commit is the editor closing with uncommitted edits.
   *
   * The work is kept -- losing it because somebody clicked the wrong X would be
   * indefensible -- but it is tagged, because a list that showed an accident
   * beside a decision would make the decisions unfindable.
   */
  status: z.enum(["committed", "draft"]).optional(),
  /** The author's own words about this save, shown in the history. */
  note: z.string().trim().max(500).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(4000).optional(),
  /** The whole block list, as edited. Absent leaves it untouched. */
  blocks: z.array(z.any()).optional(),
  /** The authoring draft (sections, parts). Absent leaves it untouched. */
  pipeline_draft: z.any().optional(),
});

platformRouter.put("/learning/objects/:object_id/pipeline", async (c) => {
  const req = parseBody(_pipelineSaveSchema, await c.req.json());
  const { access, eff } = await _libraryReader(
    c, req.program_id ?? c.req.query("program_id") ?? null,
  );
  const object = await graph.getLearningObject(access.orgId, c.req.param("object_id"));
  if (!object) throw new HttpError(404, "Content not found");
  const level = await _objectAccessLevel(access, eff, object);
  // REVIEW ACCESS IS READ-ONLY, and says so in those words. "Missing capability"
  // would be wrong twice over: they hold the right capability, and the thing they
  // lack is a level on a folder somebody else controls.
  if (level !== "edit") {
    throw new HttpError(
      403,
      level === "view"
        ? "You have review access to this content, not edit access"
        : "That content was not shared with you",
    );
  }
  const commit = req.commit === true;
  const version = await graph.updateLearningObjectPipeline(access.orgId, String(object.id), {
    title: req.title,
    description: req.description,
    blocks: req.blocks,
    pipelineDraft: req.pipeline_draft,
    bumpVersion: commit,
  });
  if (version === null) throw new HttpError(404, "Content not found");
  if (commit) {
    // Snapshot what was JUST written, re-read rather than reassembled from the
    // request: a partial save (blocks only, say) would otherwise record a version
    // missing everything the request did not mention.
    const saved = await graph.getLearningObject(access.orgId, String(object.id));
    await graph.recordLearningObjectVersion(access.orgId, String(object.id), {
      versionNumber: version,
      title: (saved?.title as string) ?? null,
      blocks: Array.isArray(saved?.blocks) ? (saved!.blocks as unknown[]) : [],
      pipelineDraft: saved?.pipeline_draft ?? null,
      createdBy: access.profileId ?? null,
      // The NAME as well as the id, because a history list still has to show who
      // wrote v11 after that person has left the program and the join is empty.
      createdByName: access.profileId
        ? await graph
            .getProfileName(access.orgId, access.profileId)
            .catch(() => null)
        : null,
      note: req.note ?? null,
      status: req.status ?? "committed",
    });
  }
  return c.json({ ok: true, version_number: version, committed: commit });
});

/**
 * One object's version history.
 *
 * REVIEW ACCESS IS ENOUGH. Reading history is reading, and a reviewer who cannot
 * see what changed is being asked to review a moving target. Writing a version
 * still needs edit access, which is the save endpoint above.
 */
platformRouter.get("/learning/objects/:object_id/versions", async (c) => {
  const { access, eff } = await _libraryReader(c, c.req.query("program_id") ?? null);
  const object = await graph.getLearningObject(access.orgId, c.req.param("object_id"));
  if (!object) throw new HttpError(404, "Content not found");
  if (!(await _objectAccessLevel(access, eff, object))) {
    throw new HttpError(403, "That content was not shared with you");
  }
  const rows = await graph.listLearningObjectVersions(access.orgId, String(object.id));
  return c.json({
    current_version: (object.version_number as number | null) ?? null,
    versions: rows.map((r) => ({
      version_number: Number(r.version_number),
      title: (r.title as string) ?? null,
      created_by_name: (r.created_by_name as string) ?? null,
      note: (r.note as string) ?? null,
      status: (r.status as string) ?? "committed",
      created_at: (r.created_at as string) ?? null,
      block_count: Number(r.block_count ?? 0),
    })),
  });
});

/**
 * Put an old version back, as a NEW version.
 *
 * HISTORY IS APPEND-ONLY. Restoring v3 does not delete v4..v9 or rewind the
 * counter -- it writes v3's content forward as v10, noting where it came from. A
 * restore that erased what it replaced would destroy the record of a decision
 * being reversed, which is exactly the thing a history exists to keep.
 *
 * Needs EDIT access, because it changes what the library and the app carry. Being
 * able to read the history does not imply being able to move it.
 */
platformRouter.post("/learning/objects/:object_id/versions/:n/restore", async (c) => {
  const programId = c.req.query("program_id") ?? null;
  const { access, eff } = await _libraryReader(c, programId);
  const object = await graph.getLearningObject(access.orgId, c.req.param("object_id"));
  if (!object) throw new HttpError(404, "Content not found");
  const level = await _objectAccessLevel(access, eff, object);
  if (level !== "edit") {
    throw new HttpError(
      403,
      level === "view"
        ? "You have review access to this content, not edit access"
        : "That content was not shared with you",
    );
  }
  const n = Number(c.req.param("n"));
  if (!Number.isFinite(n)) throw new HttpError(400, "That is not a version number");
  const snap = await graph.getLearningObjectVersion(access.orgId, String(object.id), n);
  if (!snap) throw new HttpError(404, "No such version");

  const version = await graph.updateLearningObjectPipeline(access.orgId, String(object.id), {
    title: (snap.title as string) ?? undefined,
    blocks: Array.isArray(snap.blocks) ? (snap.blocks as unknown[]) : [],
    pipelineDraft: snap.pipeline_draft ?? null,
    bumpVersion: true,
  });
  if (version === null) throw new HttpError(404, "Content not found");
  await graph.recordLearningObjectVersion(access.orgId, String(object.id), {
    versionNumber: version,
    title: (snap.title as string) ?? null,
    blocks: Array.isArray(snap.blocks) ? (snap.blocks as unknown[]) : [],
    pipelineDraft: snap.pipeline_draft ?? null,
    createdBy: access.profileId ?? null,
    createdByName: access.profileId
      ? await graph.getProfileName(access.orgId, access.profileId).catch(() => null)
      : null,
    // Where it came from, in the row itself: a list showing only "v10" would
    // leave a reader unable to tell a restore from an ordinary save.
    note: `Restored from v${n}`,
    status: "committed",
  });
  return c.json({ ok: true, version_number: version, restored_from: n });
});

/** One version's full snapshot, for reading it or comparing against it. */
platformRouter.get("/learning/objects/:object_id/versions/:n", async (c) => {
  const { access, eff } = await _libraryReader(c, c.req.query("program_id") ?? null);
  const object = await graph.getLearningObject(access.orgId, c.req.param("object_id"));
  if (!object) throw new HttpError(404, "Content not found");
  if (!(await _objectAccessLevel(access, eff, object))) {
    throw new HttpError(403, "That content was not shared with you");
  }
  const n = Number(c.req.param("n"));
  if (!Number.isFinite(n)) throw new HttpError(400, "That is not a version number");
  const row = await graph.getLearningObjectVersion(access.orgId, String(object.id), n);
  if (!row) throw new HttpError(404, "No such version");
  return c.json({
    version_number: Number(row.version_number),
    title: (row.title as string) ?? null,
    blocks: Array.isArray(row.blocks) ? row.blocks : [],
    pipeline_draft: row.pipeline_draft ?? null,
    created_by_name: (row.created_by_name as string) ?? null,
    note: (row.note as string) ?? null,
    created_at: (row.created_at as string) ?? null,
  });
});

/**
 * File a Studio object into program-library folders.
 *
 * This is the Studio's "publish into the Content Library" — the gesture a club
 * mentor makes when they pick a tutorial and put it in B2F3 › Tutorials. It sets
 * folder membership on an object that already exists; it never creates content,
 * and it never creates a folder.
 *
 * ONLY FOLDERS THE CALLER CAN ALREADY SEE. A mentor confined to B2F3's subtree
 * can file into B2F3 and its four subfolders and nowhere else. Without this check
 * `collection_ids` would be an arbitrary list of ids from the body, and filing
 * would be a way to put content into a folder that was never shared with you —
 * a write that reaches where the matching read cannot.
 */
platformRouter.put("/learning/objects/:object_id/folders", async (c) => {
  const req = parseBody(_fileIntoFolderSchema, await c.req.json());
  const { access, eff } = await _learningMember(
    c, req.program_id ?? c.req.query("program_id") ?? null,
  );
  const object = await graph.getLearningObject(access.orgId, c.req.param("object_id"));
  if (!object) throw new HttpError(404, "Content not found");
  _requireLearningCapStrict(
    eff, "learning.library.file_content", (object.type as string | null) ?? null,
  );

  const wanted = [...new Set(req.collection_ids.filter(Boolean))];
  const all = await graph.listLearningCollections(access.orgId, access.programId);
  const known = new Map(all.map((f) => [String(f.id), (f.name as string) ?? ""]));
  const unknown = wanted.filter((id) => !known.has(id));
  if (unknown.length) throw new HttpError(422, `Not a folder of this library: ${unknown.join(", ")}`);

  const scope = await _libraryFolderScope(access, eff);
  if (scope) {
    const outside = wanted.filter((id) => !scope.has(id));
    if (outside.length) {
      throw new HttpError(
        403,
        `That folder was not shared with you: ${outside.map((i) => known.get(i) ?? i).join(", ")}`,
      );
    }
  }

  const ok = await graph.setLearningObjectFolders(
    access.orgId,
    c.req.param("object_id"),
    wanted,
    wanted.map((id) => known.get(id) ?? ""),
  );
  if (!ok) throw new HttpError(404, "Content not found");
  return c.json({ ok: true, collection_ids: wanted, collection_names: wanted.map((id) => known.get(id) ?? "") });
});

platformRouter.get("/learning/app-admins", async (c) => {
  const { access } = await _libraryReader(c, c.req.query("program_id") ?? null);
  const programId = access.partnerProgramId ?? access.programId;
  const admins = await appAdmins.listContentAppAdmins(programId);
  // Names, not bare ids: a register that reads as a list of uuids cannot be
  // checked by the person responsible for it.
  const members = await graph.listProgramMembers(access.orgId, programId).catch(() => [] as Row[]);
  const nameOf = new Map(
    members
      .filter((m) => m.profile_id)
      .map((m) => [
        String(m.profile_id),
        ((m.display_name as string | null) ?? (m.email as string | null) ?? "Member"),
      ]),
  );
  return c.json({
    apps: CONTENT_APP_TARGETS.map((a) => ({
      key: a.key,
      label: a.label,
      admins: (admins[a.key] ?? []).map((id) => ({
        profile_id: id,
        display_name: nameOf.get(id) ?? "Former member",
      })),
    })),
    candidates: members
      .filter((m) => m.profile_id)
      .map((m) => ({
        profile_id: String(m.profile_id),
        display_name:
          ((m.display_name as string | null) ?? (m.email as string | null) ?? "Member"),
      })),
  });
});

const _appAdminsSchema = z.object({
  program_id: z.string().optional(),
  app_key: z.string(),
  profile_ids: z.array(z.string()).default([]),
});

platformRouter.put("/learning/app-admins", async (c) => {
  const req = parseBody(_appAdminsSchema, await c.req.json());
  const { access, eff } = await _learningMember(
    c, req.program_id ?? c.req.query("program_id") ?? null,
  );
  // Appointing is strictly the sharer's power. An app administrator must not be
  // able to appoint more app administrators — that is the unbounded-tree problem
  // roles.delegate already refuses, in another costume.
  _requireLearningCapStrict(eff, "learning.library.share_app", null);
  if (!CONTENT_APP_TARGET_KEYS.has(req.app_key)) {
    throw new HttpError(422, `Unknown app: ${req.app_key}`);
  }
  const programId = access.partnerProgramId ?? access.programId;
  // Only people who are actually in the program: an id from elsewhere would be
  // stored happily and never match anyone.
  const members = await graph.listProgramMembers(access.orgId, programId).catch(() => [] as Row[]);
  const known = new Set(members.filter((m) => m.profile_id).map((m) => String(m.profile_id)));
  const strangers = req.profile_ids.filter((id) => !known.has(id));
  if (strangers.length) {
    throw new HttpError(422, `Not a member of this program: ${strangers.join(", ")}`);
  }
  const next = await appAdmins.setContentAppAdmins(programId, req.app_key, req.profile_ids);
  return c.json({ ok: true, admins: next[req.app_key] ?? [] });
});

const _bulkSharesSchema = z.object({
  program_id: z.string().optional(),
  object_ids: z.array(z.string()).min(1).max(2000),
  // NO DEFAULTS. Absent means "this caller is not saying anything about that
  // kind", which is not the same as "none of them" — see setLearningGrantsBulk.
  // A role holding only share_club omits app_keys, and must not thereby revoke
  // every app grant a content manager made.
  club_program_ids: z.array(z.string()).optional(),
  profile_ids: z.array(z.string()).optional(),
  /** App slugs. Granting to an app grants to its administrators (0010). */
  app_keys: z.array(z.string()).optional(),
});

platformRouter.put("/learning/shares/bulk", async (c) => {
  const req = parseBody(_bulkSharesSchema, await c.req.json());
  const { access, eff } = await _learningMember(
    c, req.program_id ?? c.req.query("program_id") ?? null,
  );
  // No object type is in hand for a batch, so a type-scoped role cannot be
  // checked per item here. Refuse the bulk route for such a role rather than
  // silently ignoring the scope — the per-object endpoint still serves them.
  // Two capabilities, because they are two decisions. Sharing with a club is a
  // curriculum call; sharing with an app hands content to whoever administers
  // that app's catalogue, which is a different person and a different blast
  // radius. Each is required only for the targets actually being set, so a role
  // holding one is not refused for the other's sake.
  // Checked on PRESENCE, not on length. Sending an empty list for a kind is a
  // revocation of that kind and needs the same capability as granting it.
  // THREE KINDS, THREE CAPABILITIES. Clubs, named people and apps are separate
  // decisions with separate reach: a club is a standing group whose administrators
  // decide onward, a person is one named individual, an app hands a catalogue to
  // whoever runs it. A role can now be given any one without the others — which
  // is the whole point of splitting share_member out of share_club.
  const touchesClubs = req.club_program_ids !== undefined;
  const touchesPeople = req.profile_ids !== undefined;
  const touchesApps = req.app_keys !== undefined;
  if (!touchesClubs && !touchesPeople && !touchesApps) {
    throw new HttpError(422, "Nothing to change: name at least one of clubs, people or apps");
  }
  if (touchesClubs) _requireLearningCapStrict(eff, "learning.library.share_club", null);
  if (touchesPeople) _requireLearningCapStrict(eff, "learning.library.share_member", null);
  if (touchesApps) _requireLearningCapStrict(eff, "learning.library.share_app", null);

  const appKeys = req.app_keys ?? [];
  const clubIds = req.club_program_ids ?? [];
  const profileIds = req.profile_ids ?? [];
  const unknownApps = appKeys.filter((k) => !CONTENT_APP_TARGET_KEYS.has(k));
  if (unknownApps.length) throw new HttpError(422, `Unknown app: ${unknownApps.join(", ")}`);

  const clubs = await _clubIdsFor(access);
  const unknownClubs = clubIds.filter((id) => !clubs.has(id));
  if (unknownClubs.length) {
    throw new HttpError(422, `Not a club of this program: ${unknownClubs.join(", ")}`);
  }
  // A person may only be granted content through a club they belong to. Without
  // this the endpoint would share to any profile id in the org — a wider reach
  // than the picker offers, and not one anybody asked for.
  // A person may be granted content if they belong to this PROGRAM — through a
  // club or directly. Scoping this to club rosters alone made the program's own
  // people unreachable, which is the opposite of the intent: the check exists to
  // stop the endpoint granting to any profile id in the org, not to require a club.
  if (profileIds.length) {
    const allowed = new Set<string>();
    const own = await graph
      .listProgramMembers(access.orgId, access.partnerProgramId ?? access.programId)
      .catch(() => [] as Row[]);
    for (const m of own) if (m.profile_id) allowed.add(String(m.profile_id));
    for (const clubId of clubs) {
      const members = await graph.listProgramMembers(access.orgId, clubId).catch(() => [] as Row[]);
      for (const m of members) if (m.profile_id) allowed.add(String(m.profile_id));
    }
    const strangers = profileIds.filter((p) => !allowed.has(p));
    if (strangers.length) {
      throw new HttpError(422, `Not a member of this program or its clubs: ${strangers.join(", ")}`);
    }
  }

  let written: string[];
  try {
    written = await graph.setLearningGrantsBulk(
      access.orgId,
      req.object_ids,
      {
        // Pass through the PRESENCE, so a kind nobody spoke about stays untouched.
        ...(req.club_program_ids !== undefined ? { clubs: clubIds } : {}),
        ...(req.profile_ids !== undefined ? { profiles: profileIds } : {}),
        ...(req.app_keys !== undefined ? { apps: appKeys } : {}),
      },
      access.profileId ?? null,
    );
  } catch (e) {
    // Name the missing piece. "Couldn't update sharing" over an unapplied
    // migration is undiagnosable from the outside — and this exact case shipped
    // as a bare 500, which is how a working feature looks broken.
    if (e instanceof Error && e.message.startsWith("grants-subject-unavailable")) {
      throw new HttpError(
        503,
        "This deployment's database has not been migrated for club and app sharing yet (learning pack 0008/0010)",
      );
    }
    if (e instanceof Error && e.message.startsWith("shares-unavailable")) {
      throw new HttpError(503, "Per-club sharing is not enabled yet on this deployment");
    }
    if (_missingGrantsTable(e)) {
      throw new HttpError(503, "Per-club sharing is not enabled yet on this deployment");
    }
    throw e;
  }
  // Say what was skipped rather than reporting a clean success over a partial
  // one — a folder that shared eleven of twelve items must not look like twelve.
  const skipped = req.object_ids.filter((id) => !written.includes(id));
  return c.json({ ok: true, shared: written.length, skipped });
});

const _bulkAppTargetsSchema = z.object({
  program_id: z.string().optional(),
  object_ids: z.array(z.string()).min(1).max(2000),
  app_keys: z.array(z.string()).default([]),
  /** Omitted / null = the whole app. A club id limits it to that club. */
  club_program_id: z.string().nullable().optional(),
});

platformRouter.put("/learning/app-targets/bulk", async (c) => {
  const req = parseBody(_bulkAppTargetsSchema, await c.req.json());
  const { access, eff } = await _learningMember(
    c, req.program_id ?? c.req.query("program_id") ?? null,
  );
  const unknown = req.app_keys.filter((k) => !CONTENT_APP_TARGET_KEYS.has(k));
  if (unknown.length) throw new HttpError(422, `Unknown app: ${unknown.join(", ")}`);

  // TWO WAYS TO HOLD THIS. A content manager publishes by capability
  // (publish.app_target) across any app. An APP ADMINISTRATOR publishes to the
  // app they administer and no other — their authority comes from the register,
  // not from a capability, which is what "an app has administrators" means.
  //
  // Checked per app rather than once: someone who administers Bridge Bird must
  // not be able to publish to a second app by naming it in the same request.
  const administers = await appAdmins.appsAdministeredBy(
    access.partnerProgramId ?? access.programId,
    access.profileId ?? null,
  );
  const byCapability = eff.capabilities.includes("learning.publish.app_target");
  if (!byCapability) {
    const beyond = req.app_keys.filter((k) => !administers.includes(k));
    if (beyond.length || !req.app_keys.length) {
      throw new HttpError(403, `Missing capability: learning.publish.app_target`);
    }
  }

  // Limiting to one club is its own decision, and its own capability. An app
  // administrator holds it implicitly for their own app — deciding which club
  // sees what on the app they run is the job.
  if (req.club_program_id) {
    if (!administers.length) {
      _requireLearningCapStrict(eff, "learning.app.publish_club", null);
    }
    const clubs = await _clubIdsFor(access);
    if (!clubs.has(req.club_program_id)) {
      throw new HttpError(422, `Not a club of this program: ${req.club_program_id}`);
    }
  }

  let written: string[];
  try {
    written = await graph.setLearningAppTargetsBulk(
      access.orgId, req.object_ids, req.app_keys, access.profileId ?? null,
      req.club_program_id ?? null,
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("app-targets-unavailable")) {
      throw new HttpError(503, "App targeting is not enabled yet on this deployment");
    }
    throw e;
  }
  const skipped = req.object_ids.filter((id) => !written.includes(id));
  return c.json({ ok: true, published: written.length, skipped });
});

// ── Learning Platform custom roles (the learning app's own People tab) ──────
const _learningPerms = z.record(z.string(), z.enum(["view", "edit"]));
// A learning role now binds fine-grained capability ids from the learning
// catalogue (her capability-based model). The legacy per-area view/edit `perms`
// stays for backward compatibility; capabilities are the new source of truth.
// A capability may additionally be narrowed to particular content types:
// capability id → the object types it covers. Absent/empty means every type.
const _learningTypeScopes = z.record(z.string(), z.array(z.string()));
const learningRoleCreateSchema = z.object({ program_id: z.string(), name: z.string().min(1), perms: _learningPerms.default({}), capabilities: z.array(z.string()).optional(), type_scopes: _learningTypeScopes.optional() });
const learningRoleUpdateSchema = z.object({ name: z.string().min(1).optional(), perms: _learningPerms.optional(), capabilities: z.array(z.string()).optional(), type_scopes: _learningTypeScopes.optional() });
const learningAssignSchema = z.object({ program_id: z.string(), email: z.string().email(), role_id: z.string().nullable() });

/** Fold sanitized learning-catalogue capabilities into a role's perms blob
 *  (dropping unknown/reserved ids), mirroring the org/program role builders.
 *  Type scopes ride along beside them, pruned to the capabilities that
 *  survived so a scope can never outlive the capability it narrows. */
async function _learningPermsWithCaps(
  perms: Record<string, unknown>,
  capabilities: string[] | undefined,
  typeScopes?: Record<string, string[]>,
): Promise<Record<string, unknown>> {
  if (capabilities === undefined && typeScopes === undefined) return perms;
  const next = { ...perms };
  if (capabilities !== undefined) {
    next.capabilities = await catalogue.validGrantsAcross([{ providerId: "learning" }], capabilities);
  }
  if (typeScopes !== undefined) {
    const granted = new Set((next.capabilities as string[] | undefined) ?? []);
    const scopes: Record<string, string[]> = {};
    for (const [capId, ids] of Object.entries(typeScopes)) {
      if (!granted.has(capId)) continue;
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length) scopes[capId] = unique;
    }
    if (Object.keys(scopes).length) next.typeScopes = scopes;
    else delete next.typeScopes;
  }
  return next;
}

/**
 * What the caller may do in the learning platform — the ONE resolver.
 *
 * Every learning route reads this; none computes capabilities itself. That is the
 * discipline `appAccessFor` uses for the club app (accessCatalogue/appRoles.ts):
 * there is no unclamped export, so no call site can forget the org's ceiling.
 *
 * Precedence, unchanged from what /learning/context did inline:
 *   • admin        → everything the catalogue grants
 *   • custom role  → exactly what that Content Studio role binds
 *   • program role → a "partial" grant's learning capabilities
 *   • otherwise    → the launch LEVEL's sample-role capabilities
 *
 * `fineGrained` records WHICH of those answered. It matters because the sample
 * templates are incomplete — `learning-content-developer` grants no
 * `object.delete` and none of the `publish.*` ids — and every partner club member
 * is hardcoded to level "edit", so a naive "capability absent → refuse" would strip
 * publishing and deleting from every club member on day one. Level-derived callers
 * are therefore governed by each endpoint's coarse guard, exactly as
 * enforce.ts:76-85 already decides for the same reason.
 */
async function _learningEffective(
  user: PlatformUser,
  access: ResolvedPlatformAccess,
): Promise<{
  isAdmin: boolean;
  fineGrained: boolean;
  capabilities: string[];
  typeScopes: Record<string, string[]>;
  customRole: Row | null;
  /** The club role's raw `app.content.*` grants. `manage_others` has no learning
   *  image — it answers an ownership question — so it is read from here. */
  appContentCaps: string[];
  /** The club role's id, for grants addressed to a role. */
  clubRoleId: string | null;
  /** Club administrator or the org's owner/admin — bypasses ownership. */
  clubTier: boolean;
}> {
  const isAdmin = access.level === "admin";
  const customRole = !isAdmin && user.email
    // Under the CLUB when there is one: the Studio has always SENT the club id when
    // saving a role (it posts whatever program it was launched with), while this read
    // looked under the parent — so a club's own roles were written where nothing read
    // them. One footing, or per-club permissions cannot be expressed at all.
    ? await graph.getLearningRoleForEmail(access.partnerProgramId ?? access.programId, user.email)
    : null;

  /**
   * The club role's content grants, or null when this is not a club, the switch is
   * off, or the role says nothing about content.
   *
   * `null` IS THE BACKWARD-COMPATIBILITY HINGE. A club that has never been granted an
   * `app.content.*` id falls straight through to the branches below and gets exactly
   * the answer it gets today. Absent is not denial, here as everywhere.
   */
  let clubContent: { roleName: string | null; capabilities: string[] } | null = null;
  let clubRoleId: string | null = null;
  let clubTier = false;
  if (process.env.NEXUS_CLUB_CONTENT_CAPS !== "off" && access.partnerClub && access.partnerProgramId) {
    try {
      const clubProgram = await db.getProgram(access.partnerProgramId);
      const resolved = await clubAppAccess.clubAppAccessFor(
        user,
        access.partnerProgramId,
        (clubProgram?.org_id as string | undefined) ?? null,
        (pid, email) => graph.getProgramRoleForEmail(pid, email),
      );
      clubRoleId = resolved.roleId;
      clubTier = resolved.structuralTier;
      if (contentCaps.hasContentCaps(resolved.capabilities)) clubContent = resolved;
    } catch (e) {
      // A club-app failure must not decide a learning question. Falls through to
      // today's branches, which is the answer this person already had.
      console.error("club content capability resolution failed (falling back):", e);
    }
  }

  let capabilities: string[] = [];
  let fineGrained = false;
  // Defensive: never let capability computation break context resolution.
  try {
    const learningDoc = await catalogue.getCatalogue("learning");
    const roleCaps = (customRole?.perms as Row | undefined)?.capabilities;
    const programCaps = access.programRoleCapabilities?.length
      ? await catalogue.validGrantsAcross([{ providerId: "learning" }], access.programRoleCapabilities)
      : [];
    if (isAdmin) {
      capabilities = _learningCapsForLevel(learningDoc, "admin");
    } else if (Array.isArray(roleCaps) && roleCaps.length) {
      capabilities = roleCaps as string[];
      fineGrained = true;
    } else if (clubContent) {
      // The club role governs CONTENT, the same way it already governs challenges
      // and chat. See accessCatalogue/contentCapMap.ts for why this exists: without
      // it, a club member's content authority is the club's PROVISIONING envelope,
      // so every member of a provisioned club has identical authority and "who in
      // this club may author?" has nowhere to be answered.
      //
      // UNION, not replacement. Only the ids in GOVERNED_LEARNING_CAPS are ever
      // enforced here or drive a button; the rest of the catalogue is Studio screen
      // gating, and taking it away would remove screens a member reaches today
      // through their level — a silent revocation on surfaces nobody tests.
      capabilities = contentCaps.unionWithLevel(
        contentCaps.mapContentCaps(clubContent.capabilities),
        _learningCapsForLevel(learningDoc, access.level as "edit" | "comment" | "view"),
      );
      // STILL FALSE in this phase, deliberately — this is the dry run. Turning it on
      // is what makes _requireLearningCap start refusing, and it must not happen
      // until the log below has shown who that would affect. One line, one flip.
      fineGrained = false;
      const wouldRefuse = [...contentCaps.GOVERNED_LEARNING_CAPS].filter(
        (id) => !capabilities.includes(id),
      );
      if (wouldRefuse.length) {
        console.log(
          "[club-content dry-run]",
          JSON.stringify({
            club: access.partnerProgramId,
            email: user.email ?? null,
            role: clubContent.roleName,
            appCaps: clubContent.capabilities.filter((c) => c.startsWith("app.content.")),
            wouldRefuse,
          }),
        );
      }
    } else if (programCaps.length) {
      capabilities = programCaps;
      fineGrained = true;
    } else {
      capabilities = _learningCapsForLevel(learningDoc, access.level as "edit" | "comment" | "view");
    }
  } catch (e) {
    console.error("learning/context capability computation failed (using empty set):", e);
  }

  // The org's CEILING, applied to every branch above INCLUDING admin. A club's
  // administrator holds what the club WAS GIVEN, not everything the catalogue
  // defines — the same call the club app makes (appAccessFor), and the case most
  // likely to be tested first. Clamped against the CLUB's own program id, because
  // that is where feature_access lives; clampCapsToProvisioning intersects the
  // org's envelope as well, so the parent's ceiling still applies.
  //
  // Deliberately OUTSIDE the try above: an unloadable program already imposes no
  // ceiling (provisioning.ts), and a catalogue failure must leave the set
  // unclamped rather than read as denial. Absent is not denial, all the way down.
  capabilities = await provisioning.clampCapsForProgram(
    access.partnerProgramId ?? access.programId,
    capabilities,
  );

  const rawScopes = (customRole?.perms as Row | undefined)?.typeScopes;
  const typeScopes =
    rawScopes && typeof rawScopes === "object" ? (rawScopes as Record<string, string[]>) : {};

  return {
    isAdmin,
    fineGrained,
    capabilities,
    typeScopes,
    customRole,
    appContentCaps: (clubContent?.capabilities ?? []).filter((c) => c.startsWith("app.content.")),
    clubRoleId,
    clubTier,
  };
}

/** The capability ids a launch LEVEL implies, sourced from the learning
 *  catalogue's own sample roles: admin → everything grantable; edit →
 *  content-developer; comment → reviewer; view → learner. This is the coarse
 *  Nexus access → learning capability bridge for people without a custom role. */
function _learningCapsForLevel(doc: CapabilityCatalogueDocument, level: "admin" | "edit" | "comment" | "view"): string[] {
  if (level === "admin") return grantableCapabilities(doc);
  const sampleId = level === "edit" ? "learning-content-developer" : level === "comment" ? "learning-reviewer" : "learner";
  const tmpl = (doc.sampleRoleTemplates ?? []).find((r) => r.id === sampleId);
  const ids = tmpl?.grants?.flatMap((g) => g.capabilityIds) ?? [];
  return [...new Set(ids)];
}

/** The caller must be a learning admin of the program. Returns the resolved access. */
/**
 * Does this person ADMINISTER the club they arrived through?
 *
 * Judged on their membership, not on `access.level` — a partner club's level is
 * hardcoded to "edit" for everyone (platformAccess.ts), so no club member can ever
 * reach admin through it. This is the same test the club app already uses to decide
 * a structural tier, applied to the club rather than the parent, which is why it can
 * grant a club authority over its own roles WITHOUT loosening that hardcoded level
 * for anything else.
 */
function _clubStructuralTier(user: PlatformUser, access: ResolvedPlatformAccess): boolean {
  if (!access.partnerProgramId || !access.orgId) return false;
  return user.memberships.some(
    (m) =>
      m.org_id === access.orgId &&
      ["owner", "administrator"].includes(m.role) &&
      (!m.program_id || m.program_id === access.partnerProgramId),
  );
}

/**
 * The caller must administer the learning program — or the club they came through.
 *
 * Clubs were locked out entirely: every /learning/roles* route required
 * `level === "admin"`, and a partner club is pinned to "edit", so a club
 * administrator got 403 on their own club's roles. Per-club content permissions were
 * therefore only ever configurable by the parent org, which is not what "one club =
 * one program" is supposed to mean.
 */
async function _learningAdmin(c: Context, programId: string) {
  const { access } = await _learningAdminWithCeiling(c, programId);
  return access;
}

/**
 * STRUCTURAL admin only — a delegate is refused however many capabilities they hold.
 *
 * `learning.roles.delegate` widens `_learningAdmin` to anyone who may mint
 * sub-roles, and that is right for the role routes. It is wrong for the
 * CATALOGUE, which is the definition of what capabilities exist at all:
 *
 *   • sampleRoleTemplates feed _learningCapsForLevel, and every partner club
 *     member is pinned to level "edit" → the content-developer template. Editing
 *     it hands capabilities to everyone on that level at once.
 *   • deleting a capability from the catalogue makes validGrantsAcross drop it
 *     from every role that is saved afterwards, including an admin's.
 *
 * Neither is escalation for the delegate themselves — their own set is a custom
 * role, unaffected — but both let someone whose remit is "curate the library"
 * rewrite the permission system for the whole program. The ceiling exists so a
 * delegate cannot exceed their own grants; being able to redefine the grants
 * would make it decorative.
 */
async function _learningStructuralAdmin(c: Context, programId: string) {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "learning", programId);
  if (access.level !== "admin" && !_clubStructuralTier(user, access)) {
    throw new HttpError(403, "Learning admin access required");
  }
  return access;
}

/**
 * The same gate, plus the answer to "what may this caller GRANT?".
 *
 * Three ways in, and the third is new. Two are STRUCTURAL — a learning admin, or a
 * club's own owner/administrator — and hold everything. The third is a CAPABILITY:
 * `learning.roles.delegate`, mirroring the one existing precedent for
 * capability-gated role creation (`org.roles.manage`, further down this file). It
 * is what lets a Content Manager mint sub-roles without being made an admin.
 *
 * A delegated creator is CEILINGED to their own effective capabilities. Without
 * that clamp `roles.delegate` is not a delegation primitive but a privilege-
 * escalation one: hold it, write yourself a role granting everything, assign it,
 * and the gate has bought nothing. `ceiling === null` means structural — no clamp.
 */
export interface LearningCeiling {
  capabilities: string[];
  /** capability id → the content types the CREATOR is limited to. */
  typeScopes: Record<string, string[]>;
}

async function _learningAdminWithCeiling(
  c: Context,
  programId: string,
): Promise<{ access: ResolvedPlatformAccess; ceiling: LearningCeiling | null }> {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "learning", programId);
  if (access.level === "admin" || _clubStructuralTier(user, access)) {
    return { access, ceiling: null };
  }
  const eff = await _learningEffective(user, access);
  if (eff.capabilities.includes("learning.roles.delegate")) {
    return { access, ceiling: { capabilities: eff.capabilities, typeScopes: eff.typeScopes } };
  }
  throw new HttpError(403, "Learning admin access required");
}

/**
 * Trim a requested capability set to what the creator actually holds.
 *
 * Silent, not an error: the role builder shows a delegated creator only the
 * capabilities they hold, so anything outside the ceiling arriving here is a
 * stale client or a hand-rolled request, and dropping it is the same shape as
 * `validGrantsAcross` dropping an unknown id. `roles.delegate` itself is
 * withheld — a sub-role that can mint further sub-roles turns one grant into an
 * unbounded tree, and nothing in the described use needs it.
 */
export function _clampToCeiling(requested: string[], ceiling: LearningCeiling | null): string[] {
  if (ceiling === null) return requested;
  const allowed = new Set(ceiling.capabilities);
  return requested.filter((id) => id !== "learning.roles.delegate" && allowed.has(id));
}

/**
 * A sub-role's type scopes may only NARROW the creator's, never widen them.
 *
 * Capability ids alone are not the whole of a grant. A Content Manager limited
 * to `publish.release` on quizzes still reports `publish.release` in their
 * capability list, so an id-only ceiling would happily mint a sub-role holding
 * it for every content type — and then they assign it to themselves. Wherever
 * the creator is scoped, the sub-role inherits at least that narrowing;
 * requested types outside it are dropped, and an empty intersection falls back
 * to the creator's own list rather than to "unrestricted", because absent means
 * EVERY type here (_requireLearningCap) and would be an escalation.
 */
export function _clampScopesToCeiling(
  requested: Record<string, string[]> | undefined,
  capabilities: string[],
  ceiling: LearningCeiling | null,
): Record<string, string[]> | undefined {
  if (ceiling === null) return requested;
  const out: Record<string, string[]> = { ...(requested ?? {}) };
  for (const capId of capabilities) {
    const mine = ceiling.typeScopes[capId];
    if (!mine?.length) continue; // creator unrestricted → nothing to inherit
    const theirs = out[capId];
    const narrowed = theirs?.length ? theirs.filter((t) => mine.includes(t)) : [];
    out[capId] = narrowed.length ? narrowed : mine;
  }
  return Object.keys(out).length ? out : requested;
}

/**
 * A delegate may never leave a role with NO capabilities.
 *
 * This is the sharpest edge in the whole delegation design and it is worth being
 * explicit about. `_requireLearningCap` opens with `if (!eff.fineGrained) return;`
 * — every fine-grained gate is a no-op for a caller whose capabilities came from
 * their launch LEVEL rather than from a role, which is the accommodation that
 * keeps ordinary club members working. So a capability-less role is not a weak
 * role: it is an UNGATED one, governed only by each route's coarse admin|edit
 * guard.
 *
 * Which means "strip my own role down to nothing" is a privilege ESCALATION, and
 * an id-set clamp cannot see it — the empty set is trivially within any ceiling.
 * A structural admin may still do this (they already hold everything); a delegate
 * may not.
 */
export function _assertNotDisarming(capabilities: string[], ceiling: LearningCeiling | null): void {
  if (ceiling === null) return;
  if (!capabilities.length) {
    throw new HttpError(
      422,
      "A role you create must grant at least one capability — an empty role is not a limited one",
    );
  }
}

/**
 * A delegated caller may only touch a role that sits inside their own ceiling.
 *
 * Minting roles is clamped by _clampToCeiling, but that is not the whole of the
 * escalation surface: ASSIGNING an existing role, and DELETING one, both reach
 * roles the delegate never wrote. Without this check a Content Manager could
 * hand themselves whatever role the org admin had already created — a longer
 * path to the same privilege, and one the create-side clamp does not see.
 *
 * Structural callers (`ceiling === null`) are unaffected.
 */
async function _assertRoleWithinCeiling(
  roleId: string | null,
  ceiling: LearningCeiling | null,
  programId?: string,
): Promise<void> {
  if (!roleId) return;
  const role = await graph.getLearningRole(roleId).catch(() => null);
  if (!role) throw new HttpError(404, "Role not found");
  // SCOPE FIRST, for everyone including structural admins. getLearningRole and
  // its update/delete siblings filter on the role id ALONE, under asPrivileged —
  // so without this an id from another org's program is editable by anyone who
  // can reach the route at all. 404, not 403: whether a role exists elsewhere is
  // not this caller's business.
  if (programId && role.program_id && String(role.program_id) !== programId) {
    throw new HttpError(404, "Role not found");
  }
  if (ceiling === null) return;
  const caps = ((role.perms as Row | undefined)?.capabilities ?? []) as string[];
  const allowed = new Set(ceiling.capabilities);
  // A role with NO capabilities is a coarse/legacy role whose power comes from the
  // level path, not from a set this can compare — refuse rather than guess.
  if (!caps.length || caps.some((id) => !allowed.has(id))) {
    throw new HttpError(403, "That role grants more than your own role does");
  }
  // And its scopes must be at least as narrow as the creator's, for the same
  // reason _clampScopesToCeiling exists: an unscoped capability is a wider one.
  const scopes = ((role.perms as Row | undefined)?.typeScopes ?? {}) as Record<string, string[]>;
  for (const capId of caps) {
    const mine = ceiling.typeScopes[capId];
    if (!mine?.length) continue;
    const theirs = scopes[capId];
    if (!theirs?.length || theirs.some((t) => !mine.includes(t))) {
      throw new HttpError(403, "That role grants more than your own role does");
    }
  }
}

// The shared learning catalogue — the app's own inventory of surfaces +
// capabilities. Read: any learning member (the role builder + screen gating
// need it). Write: a learning admin (it's the learning team's own catalogue).
platformRouter.get("/learning/catalogue", async (c) => {
  const user = await getCurrentUser(c);
  // Any caller who can enter learning may read it (admins + members).
  await resolvePlatformAccess(user, "learning", c.req.query("program_id") ?? null);
  return c.json(await catalogue.getCatalogue("learning"));
});
platformRouter.put("/learning/catalogue", async (c) => {
  await _learningStructuralAdmin(c, c.req.query("program_id") ?? "");
  const doc = (await c.req.json()) as CapabilityCatalogueDocument;
  if (doc?.documentType !== "capability_catalogue" || !Array.isArray(doc.capabilities) || !Array.isArray(doc.groups)) {
    throw new HttpError(422, "Not a valid catalogue document");
  }
  if (doc.provider?.id !== "learning-platform") throw new HttpError(422, 'provider.id must equal "learning-platform"');
  return c.json(await catalogue.saveCatalogue("learning", doc));
});
platformRouter.delete("/learning/catalogue", async (c) => {
  await _learningStructuralAdmin(c, c.req.query("program_id") ?? "");
  return c.json(await catalogue.resetCatalogue("learning"));
});

platformRouter.get("/learning/roles", async (c) => {
  const pid = c.req.query("program_id") ?? "";
  const access = await _learningAdmin(c, pid);
  return c.json(
    await graph.listLearningRoles(access.orgId, access.partnerProgramId ?? access.programId),
  );
});

platformRouter.post("/learning/roles", async (c) => {
  const req = parseBody(learningRoleCreateSchema, await c.req.json());
  const { access, ceiling } = await _learningAdminWithCeiling(c, req.program_id);
  const caps = req.capabilities && _clampToCeiling(req.capabilities, ceiling);
  // Omitting `capabilities` entirely reaches the same ungated state as sending an
  // empty list, just by a quieter door — refuse both before doing any work.
  if (ceiling !== null && caps === undefined) {
    throw new HttpError(422, "A role you create must grant at least one capability");
  }
  if (caps) _assertNotDisarming(caps, ceiling);
  const perms = await _learningPermsWithCaps(
    req.perms,
    caps,
    _clampScopesToCeiling(req.type_scopes, caps ?? [], ceiling),
  );
  // Stored under the CLUB when there is one, matching where getLearningRoleForEmail
  // now reads. Both sides move together or a club's roles are written where nothing
  // looks for them.
  return c.json(
    await graph.createLearningRole(
      access.orgId,
      access.partnerProgramId ?? access.programId,
      req.name,
      perms,
    ),
  );
});

platformRouter.patch("/learning/roles/:id", async (c) => {
  const body = parseBody(learningRoleUpdateSchema, await c.req.json());
  const pid = c.req.query("program_id") ?? "";
  const { access, ceiling } = await _learningAdminWithCeiling(c, pid);
  // The TARGET too, not just the incoming capabilities: `perms` carries the legacy
  // area grants, which _clampToCeiling never sees, so editing someone else's
  // stronger role has to be refused at the door rather than trimmed on the way in.
  // Also scopes the role to this program for EVERY caller — see the helper.
  await _assertRoleWithinCeiling(
    c.req.param("id"), ceiling, access.partnerProgramId ?? access.programId,
  );
  // Merge capabilities into whatever perms are being written (or the existing
  // blob) so the area perms and capabilities don't clobber each other.
  let perms = body.perms as Record<string, unknown> | undefined;
  if (body.capabilities !== undefined || body.type_scopes !== undefined) {
    const existing = await graph.getLearningRole(c.req.param("id")).catch(() => null);
    const base = (perms ?? (existing?.perms as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const nextCaps = body.capabilities && _clampToCeiling(body.capabilities, ceiling);
    if (nextCaps) _assertNotDisarming(nextCaps, ceiling);
    perms = await _learningPermsWithCaps(
      base,
      nextCaps,
      _clampScopesToCeiling(
        body.type_scopes,
        nextCaps ?? ((base.capabilities as string[] | undefined) ?? []),
        ceiling,
      ),
    );
  } else if (perms !== undefined) {
    // A bare `perms` write REPLACES the blob, capabilities and all — the quiet
    // way to empty a role without ever naming `capabilities`. Carry the existing
    // grants across so a delegate cannot disarm a role by omission.
    const existing = await graph.getLearningRole(c.req.param("id")).catch(() => null);
    const prior = (existing?.perms as Record<string, unknown> | undefined) ?? {};
    perms = { ...perms, capabilities: prior.capabilities, typeScopes: prior.typeScopes };
    _assertNotDisarming((prior.capabilities as string[] | undefined) ?? [], ceiling);
  }
  const row = await graph.updateLearningRole(c.req.param("id"), { name: body.name, perms });
  if (!row) throw new HttpError(404, "Role not found");
  return c.json(row);
});

platformRouter.delete("/learning/roles/:id", async (c) => {
  const pid = c.req.query("program_id") ?? "";
  const { access, ceiling } = await _learningAdminWithCeiling(c, pid);
  await _assertRoleWithinCeiling(
    c.req.param("id"), ceiling, access.partnerProgramId ?? access.programId,
  );
  await graph.deleteLearningRole(c.req.param("id"));
  return c.json({ ok: true });
});

platformRouter.get("/learning/roster", async (c) => {
  const pid = c.req.query("program_id") ?? "";
  const access = await _learningAdmin(c, pid);
  return c.json(
    await graph.listLearningPeople(access.orgId, access.partnerProgramId ?? access.programId),
  );
});

platformRouter.put("/learning/assign", async (c) => {
  const req = parseBody(learningAssignSchema, await c.req.json());
  const { access, ceiling } = await _learningAdminWithCeiling(c, req.program_id);
  // UNASSIGNING IS NOT THE SAFE DIRECTION. Removing someone's role drops them to
  // their launch level, where `fineGrained` is false and every _requireLearningCap
  // gate stops firing — so "take away their role" hands them the ungated path,
  // themselves included. A structural admin may do it; a delegate may not.
  if (ceiling !== null && !req.role_id) {
    throw new HttpError(403, "Removing a role needs a learning administrator");
  }
  await _assertRoleWithinCeiling(
    req.role_id, ceiling, access.partnerProgramId ?? access.programId,
  );
  // The club again: an assignment must live where the role and the lookup do.
  await graph.setLearningRoleAssignment(
    access.orgId,
    access.partnerProgramId ?? access.programId,
    req.email,
    req.role_id,
  );
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
  // Returns ALL programs incl. partners (the shell needs the partner row to know
  // it's a partner). The Programs GRID filters partners out client-side; they
  // surface on each program's Partners tab.
  return c.json((await db.listPrograms(orgId)).map(_programResponse));
});

platformRouter.post("/orgs/:org_id/programs", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  const req = parseBody(programInput, await c.req.json());
  await _requireOrgArea(user, orgId, "programs", "edit");
  await _requireOrgCap(user, orgId, "org.programs.create");
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

// ── Partners ("sister programs") ────────────────────────────────────────────
const partnerCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  connected_program_id: z.string().uuid(),
  slug: z.string().trim().max(60).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  feature_access: z.record(z.string(), z.object({ capabilities: z.array(z.string()) })).optional(),
});

// Create a partner connected to one of the org's programs. Same provisioning
// path as a program (org-admin), plus a required connecting program.
platformRouter.post("/orgs/:org_id/partners", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "programs", "edit");
  await _requireOrgCap(user, orgId, "org.programs.create");
  const req = parseBody(partnerCreateSchema, await c.req.json());
  const connected = await db.getProgram(req.connected_program_id);
  if (!connected || connected.org_id !== orgId) throw new HttpError(422, "Connecting program not found in this organization");
  const featureAccess = req.feature_access ? await _sanitizeFeatureAccess(req.feature_access) : undefined;
  const row = await db.createPartner(orgId, {
    name: req.name,
    connectedProgramId: req.connected_program_id,
    description: req.description ?? null,
    slug: req.slug || undefined,
    features: req.features,
    featureAccess,
  });
  await db.addStageNodes(orgId, [{ stage_type: "national", name: req.name }], null, row.id as string);
  // Auto-create a default "join" gate so the partner has a self-sign-up link out
  // of the box (at /partner/<slug>/join), alongside the login link.
  await graph.createGate(orgId, row.id as string, {
    level: "program", slug: "join", title: `Join ${row.name}`,
    audience: "member", allowSignin: true, allowSignup: true, approvalRequired: false,
  }).catch(() => {});
  await db.recordAuditEvent("partner.created", {
    orgId, actorUserId: user.id, scopeType: "program", scopeId: row.id as string,
    metadata: { name: row.name, connected_program_id: req.connected_program_id },
  });
  return c.json(_programResponse(row));
});

// A program's partners (its Partners tab).
platformRouter.get("/programs/:program_id/partners", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _assertOrgStaff(user, program.org_id);
  return c.json((await db.listPartnersForProgram(programId)).map(_programResponse));
});

/**
 * Remove a partner FROM the program it is connected to.
 *
 * Only from the program's side, never the partner's. That is not a policy check
 * bolted on: a partner carries `connected_program_id` pointing AT its parent, and
 * the parent carries none pointing back, so the requirement below — "the target
 * must be a partner of THIS program" — can only ever be satisfied in one
 * direction. A partner admin calling this against the program they hang off
 * fails on the relationship itself, before any permission is considered.
 *
 * A partner IS a program, so removing one deletes that program and everything
 * scoped to it: its memberships, gates, stage nodes and app roles. The console
 * asks for confirmation; this endpoint does not soft-delete.
 */
platformRouter.delete("/programs/:program_id/partners/:partner_id", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id") ?? "";
  const partnerId = c.req.param("partner_id") ?? "";

  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  const partner = await db.getProgram(partnerId);
  if (!partner) throw new HttpError(404, "Partner not found");

  // The relationship, checked before the permission — this is the one-way guard.
  if (!partner.is_partner || partner.connected_program_id !== programId) {
    throw new HttpError(422, "That program is not a partner of this program");
  }
  // Belt and braces: a partner and its parent are always in one org, and a
  // cross-org delete should never be reachable.
  if (partner.org_id !== program.org_id) {
    throw new HttpError(422, "That partner belongs to a different organization");
  }
  // Authority over the CONNECTING program — its own administrator, or an org
  // admin. A partner's administrator holds their membership against the partner,
  // so they never satisfy this for the parent.
  await _assertProgramConfigAccess(user, program.org_id as string, programId);
  await _requireOrgCap(user, program.org_id as string, "org.programs.delete");

  await db.deleteProgram(partnerId);
  await db.recordAuditEvent("partner.removed", {
    orgId: program.org_id as string,
    actorUserId: user.id,
    scopeType: "program",
    scopeId: partnerId,
    metadata: { name: partner.name, connected_program_id: programId },
  });
  return c.json({ ok: true });
});

// Partner login-portal context — resolve a partner by its slug (privileged, the
// visitor is a partner member). Returns the partner + connected program summary.
platformRouter.get("/partner-portal/:slug", async (c) => {
  const slug = c.req.param("slug");
  _requireDb();
  const partner = await db.getPartnerBySlug(slug);
  if (!partner) throw new HttpError(404, "Partner not found");
  const connected = partner.connected_program_id ? await db.getProgram(partner.connected_program_id as string) : null;
  const org = await db.getOrganization(partner.org_id as string).catch(() => null);
  return c.json({
    partner: _programResponse(partner),
    connected_program: connected ? { id: connected.id, name: connected.name } : null,
    org_id: partner.org_id,
    org_slug: org?.slug ?? null,
  });
});

platformRouter.delete("/programs/:program_id", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  await _requireOrgArea(user, program.org_id, "programs", "edit");
  await _requireOrgCap(user, program.org_id, "org.programs.delete");
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

// Partial-access provisioning is scoped to the platform areas that have their
// own Access Catalog (matching the role builder's 3-way): learning + bridge.
const _FEATURE_ACCESS_PROVIDERS: Record<string, ProviderId> = {
  learning: "learning",
  bridge: "bridge",
  clubapp: "club-app",
};
/** Keep only platform-area keys, with capabilities validated against that
 *  platform's catalog (unknown/foreign ids dropped). */
async function _sanitizeFeatureAccess(
  input: Record<string, { capabilities: string[] }>,
): Promise<Record<string, { capabilities: string[] }>> {
  const out: Record<string, { capabilities: string[] }> = {};
  for (const [key, val] of Object.entries(input)) {
    const providerId = _FEATURE_ACCESS_PROVIDERS[key];
    if (!providerId) continue;
    const caps = await catalogue.validGrantsAcross([{ providerId }], val.capabilities ?? []);
    if (caps.length) out[key] = { capabilities: caps };
  }
  return out;
}

platformRouter.patch("/programs/:program_id/features", async (c) => {
  const user = await getCurrentUser(c);
  const programId = c.req.param("program_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  await _assertProgramConfigAccess(user, program.org_id, programId);
  await _requireOrgCap(user, program.org_id, "org.programs.configure");
  const req = parseBody(programFeaturesUpdate, await c.req.json());
  const features = normalizeProgramFeatures(req.features);
  const featureAccess = req.feature_access ? await _sanitizeFeatureAccess(req.feature_access) : undefined;
  const row = await db.updateProgramFeatures(programId, features, req.platforms_open, featureAccess);
  if (!row) throw new HttpError(404, "Program not found");
  await db.recordAuditEvent("program.features.updated", {
    orgId: program.org_id,
    actorUserId: user.id,
    scopeType: "program",
    scopeId: programId,
    metadata: { features, platforms_open: req.platforms_open },
  });
  return c.json(_programResponse((await db.getProgram(programId)) ?? row));
});

platformRouter.patch("/orgs/:org_id/theme", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  const req = parseBody(orgThemeUpdateSchema, await c.req.json());
  await _requireOrgArea(user, orgId, "settings", "edit");
  await _requireOrgCap(user, orgId, "org.settings.branding");
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
    theme_favicon_url: theme.favicon_url ?? null,
  });
});

const orgNameSchema = z.object({ name: z.string().trim().min(1).max(120) });

platformRouter.patch("/orgs/:org_id/name", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  const req = parseBody(orgNameSchema, await c.req.json());
  await _requireOrgArea(user, orgId, "settings", "edit");
  await _requireOrgCap(user, orgId, "org.settings.branding");
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
    theme_favicon_url: theme.favicon_url ?? null,
  });
});

// Is a URL slug free? (operator provisioning check) — returns the normalized
// slug so the UI shows exactly what the URL will be.
platformRouter.get("/orgs/slug-available/:slug", async (c) => {
  const user = await getCurrentUser(c);
  await _requireNexusArea(user, "organizations", "view");
  const slug = slugify(c.req.param("slug") ?? "");
  const existing = slug ? await db.getOrganizationBySlug(slug) : null;
  return c.json({ slug, available: !!slug && !existing });
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
    /** Optional second sign-in identifier, so the roster can show/edit it. */
    username: profile.username ?? null,
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

// ── Credentials (admin-set username / password) ─────────────────────────────

const credentialsSchema = z
  .object({
    password: adminSetPasswordSchema.optional(),
    // null clears the username; undefined leaves it untouched.
    username: usernameSchema.nullable().optional(),
  })
  .refine((v) => v.password !== undefined || v.username !== undefined, {
    message: "Provide a password, a username, or both",
  });

/** How much authority a membership role carries, for the outranking rule below. */
function _roleRank(role: string | null | undefined): number {
  if (role === "owner") return 3;
  if (role === "administrator") return 2;
  return 1;
}

/**
 * May `user` set another person's username/password?
 *
 * Credentials are the strongest thing an admin can touch — setting a password is
 * equivalent to becoming that person — so this is deliberately stricter than the
 * ordinary people guards:
 *
 *   • The Nexus operator is refused outright (Phase 1 people isolation, §3.5):
 *     Nexus governs an org's boundary, never the people inside it.
 *   • Only owners and administrators qualify. An instructor with "edit" can
 *     manage content, not identities.
 *   • ALTITUDE: an org-level admin can manage anyone in the org; a
 *     program-scoped admin can manage only members of THAT program. This is what
 *     lets Club 1's administrator manage Club 1 without reaching the whole org.
 *   • OUTRANKING: you can never touch someone who outranks you. Without this an
 *     administrator could set the owner's password and take over the org.
 */
function _assertCanManageCredentials(user: PlatformUser, target: Row): void {
  if (user.role === "platform_admin") {
    throw new HttpError(403, "Nexus operators cannot change an organization's credentials");
  }
  const orgId = target.org_id as string;
  const programId = (target.program_id ?? null) as string | null;

  const orgLevelAdmin = user.memberships.filter(
    (m) => m.org_id === orgId && !m.program_id && (m.role === "owner" || m.role === "administrator"),
  );
  const programAdmin = programId
    ? user.memberships.filter(
        (m) => m.program_id === programId && (m.role === "owner" || m.role === "administrator"),
      )
    : [];

  const actors = [...orgLevelAdmin, ...programAdmin];
  if (actors.length === 0) {
    throw new HttpError(403, "Administrator access is required to change credentials");
  }
  const actorRank = Math.max(...actors.map((m) => _roleRank(m.role)));
  if (_roleRank(target.role) > actorRank) {
    throw new HttpError(403, "You cannot change the credentials of someone who outranks you");
  }
}

/**
 * Set a member's username and/or password. Admin-initiated, never self-service —
 * a person changing their OWN password goes through the auth provider's flow.
 *
 * Setting a password for someone who already owns theirs is ALLOWED and releases
 * their claim, so the app makes them choose again at the next sign in. See the
 * password branch below for why that trade is the one being made.
 *
 * The password is written straight to the auth backend and never stored,
 * returned, or logged; the audit event records only WHICH fields changed.
 */
platformRouter.patch("/members/:member_id/credentials", async (c) => {
  const user = await getCurrentUser(c);
  const memberId = c.req.param("member_id");
  const req = parseBody(credentialsSchema, await c.req.json());

  const membership = await db.getMembership(memberId);
  if (!membership) throw new HttpError(404, "Member not found");
  _assertCanManageCredentials(user, membership);

  const profile = await db.getProfile(membership.profile_id);
  if (!profile) throw new HttpError(404, "Profile not found");
  const email = (profile.email ?? null) as string | null;
  if (!email) throw new HttpError(400, "This member has no email, so credentials cannot be set");

  const changed: string[] = [];

  if (req.username !== undefined) {
    const next = req.username === null ? null : req.username.trim();
    if (next && next.includes("@")) {
      throw new HttpError(400, "A username cannot contain @");
    }
    await db.setProfileUsername(membership.profile_id, next);
    changed.push(next === null ? "username_cleared" : "username");
  }

  if (req.password !== undefined) {
    /**
     * An admin may set a password even for someone who owns theirs — somebody has
     * to be able to help a person who is locked out and cannot work a claim code.
     * What makes that safe enough to allow is that the reset is TEMPORARY BY
     * CONSTRUCTION rather than by promise.
     *
     * A credential is shared across every club its owner belongs to, so an admin
     * who sets one holds a working key to that person's OTHER clubs. Releasing the
     * claim is what closes that: `must_set_password` goes true again, the app's
     * gate opens nothing else until the person chooses their own, and ownership
     * returns to them at the next sign in.
     *
     * THE WINDOW IS REAL AND WORTH NAMING: between the reset and that next sign
     * in, the admin knows a working password. It is narrower than the alternative
     * (an admin-set password that stays valid indefinitely) and wider than zero,
     * which is why the claim code — where nobody but the person ever learns the
     * password — remains the preferred path and the one the console offers first.
     */
    const claim = await db.getClaimState(membership.profile_id as string);
    const wasClaimed = claim?.claimed === true;
    await setAuthUserPassword(email, req.password);
    if (wasClaimed) {
      await db.releasePasswordClaim(membership.profile_id as string);
      // Recorded separately from "password": an audit reader needs to be able to
      // tell a courtesy starting password for a new member from a reset that took
      // an owned credential back off its owner.
      changed.push("password_reset_reclaim_required");
    }
    changed.push("password");
  }

  await db.recordAuditEvent("member.credentials_updated", {
    orgId: membership.org_id,
    actorUserId: user.id,
    scopeType: membership.program_id ? "program" : "organization",
    scopeId: membership.program_id ?? membership.org_id,
    targetType: "profile",
    targetId: membership.profile_id,
    // Deliberately records only the FIELDS touched — never a credential value.
    metadata: { changed },
  });

  const updated = (await db.getProfile(membership.profile_id)) ?? profile;
  return c.json({ email, username: updated.username ?? null, changed });
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

/** Fine-grained gate for an org-console capability, layered AFTER the coarse
 *  `_requireOrgArea` guard. Backward-compatible: structural tiers (owner/admin)
 *  and legacy coarse-only roles are unaffected; only a role that carries
 *  capabilities is held to the specific one (so unchecking a toggle removes
 *  exactly that authority). Capabilities are the enforced source of truth. */
async function _requireOrgCap(user: PlatformUser, orgId: string, capability: string): Promise<void> {
  await requireCapability(user, { providerId: "org-console", orgId }, capability);
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

/**
 * The org's Super Admin — its owner. Deliberately org-LEVEL only (`!m.program_id`):
 * ownership is a property of the organization, never of one program inside it.
 */
function _isOrgOwner(user: PlatformUser, orgId: string): boolean {
  return user.memberships.some((m) => m.org_id === orgId && m.role === "owner" && !m.program_id);
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
  if (row.role === "administrator") {
    // Super Admin only: only the org owner may remove an administrator — a
    // regular admin cannot remove a peer, at EITHER altitude. Previously this
    // rule guarded org-level admins only, so inside a program (e.g. the Club 1
    // partner view) one administrator could remove another via
    // _canManageMembers, which counts a program-scoped administrator.
    if (!_isOrgOwner(user, row.org_id)) {
      throw new HttpError(403, "Only the Super Admin can remove an administrator");
    }
  } else if (row.program_id) {
    if (!_canManageMembers(user, row.org_id, row.program_id)) {
      throw new HttpError(403, "Program admin access required");
    }
  } else {
    await _requireOrgArea(user, row.org_id, "team", "edit");
  }
  await db.deleteMembership(memberId);
  // A username is unique platform-wide and lives on the PROFILE, which outlives the
  // membership. Without this it stayed reserved by someone no longer here, and
  // nothing could reach it afterwards to clear it — the credentials endpoint is
  // addressed by membership id, and that id has just gone. Only released when the
  // person holds no membership anywhere; best-effort, since failing to free a name
  // must not fail the removal.
  const freedUsername = await db
    .releaseUsernameIfOrphaned(row.profile_id as string)
    .catch(() => null);
  await db.recordAuditEvent("member.removed", {
    orgId: row.org_id,
    actorUserId: user.id,
    scopeType: row.program_id ? "program" : "organization",
    scopeId: row.program_id ?? row.org_id,
    targetType: "membership",
    targetId: memberId,
    // The freed name is recorded: releasing an identifier someone could sign in
    // with should be visible in the trail, not a silent side effect.
    metadata: { role: row.role, ...(freedUsername ? { freed_username: freedUsername } : {}) },
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
  // An invited person can already hold a profile — that is how their username and
  // starting password get set before first sign-in — and an invitation is not a
  // membership, so revoking it used to strand the username with nothing able to
  // address it. Released only when that profile has no memberships at all.
  const freedUsername = await db
    .releaseUsernameIfOrphanedByEmail(inv.email as string)
    .catch(() => null);
  await db.recordAuditEvent("invitation.revoked", {
    orgId: inv.organization_id as string,
    actorUserId: user.id,
    scopeType: inv.program_id ? "program" : "organization",
    scopeId: (inv.program_id as string) ?? (inv.organization_id as string),
    targetType: "invitation",
    targetId: invId,
    metadata: { email: inv.email, ...(freedUsername ? { freed_username: freedUsername } : {}) },
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
  await _requireOrgCap(user, orgId, "org.audit.view");
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
  // Readable by ANY member of the org (incl program-scoped, e.g. a partner
  // admin) — it's the org's feature envelope, which programs already see through
  // their effective features. Editing it (PUT) still requires operator access.
  if (user.role !== "platform_admin" && !user.memberships.some((m) => m.org_id === orgId)) {
    throw new HttpError(403, "Not a member of this organization");
  }
  return c.json(await db.getOrgCapabilities(orgId));
});

const capabilityPatchSchema = z.object({
  programTypes: z.record(z.string(), z.boolean()).optional(),
  offeringTypes: z.record(z.string(), z.boolean()).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  // Partial-access capability subsets per platform area (learning/bridge).
  featureAccess: z.record(z.string(), z.object({ capabilities: z.array(z.string()) })).optional(),
  // Max programs the org may create; null = unlimited.
  programCapacity: z.number().int().min(1).nullable().optional(),
  // May org-level admins enter the org's programs? (access boundary)
  adminsEnterPrograms: z.boolean().optional(),
});

platformRouter.put("/orgs/:org_id/capabilities", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  await _requireNexusArea(user, "organizations", "edit");
  const req = parseBody(capabilityPatchSchema, await c.req.json());
  if (req.featureAccess) req.featureAccess = await _sanitizeFeatureAccess(req.featureAccess);
  const caps = await db.setOrgCapabilities(orgId, req);
  await db.recordAuditEvent("organization.capabilities_updated", {
    orgId,
    actorUserId: user.id,
    scopeType: "organization",
    scopeId: orgId,
  });
  return c.json(caps);
});

// Org-owned access boundary (Super Admin only): whether org admins may open the
// org's programs. Lives in the org's own Settings, gated to the OWNER — this is
// the org's call, not a Nexus operator's.
const orgAccessSchema = z.object({ admins_enter_programs: z.boolean() });
platformRouter.patch("/orgs/:org_id/access", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  _requireDb();
  const isOwner = user.memberships.some((m) => m.org_id === orgId && m.role === "owner" && !m.program_id);
  if (!isOwner) throw new HttpError(403, "Only the organization owner (Super Admin) can change this");
  const req = parseBody(orgAccessSchema, await c.req.json());
  const caps = await db.setOrgCapabilities(orgId, { adminsEnterPrograms: req.admins_enter_programs });
  await db.recordAuditEvent("organization.access_updated", {
    orgId,
    actorUserId: user.id,
    scopeType: "organization",
    scopeId: orgId,
    metadata: { adminsEnterPrograms: req.admins_enter_programs },
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
    favicon: (b.favicon as string) ?? null,
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

platformRouter.post("/admin/platform/favicon", async (c) => {
  const user = await getCurrentUser(c);
  await _requireNexusArea(user, "settings", "edit");
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const body = (await c.req.json()) as { data?: string; content_type?: string };
  const ext = _LOGO_EXT[body.content_type ?? ""];
  if (!body.data || !ext) throw new HttpError(422, "data (base64) and a valid image content_type are required");
  const buf = Buffer.from(body.data, "base64");
  if (buf.length === 0) throw new HttpError(422, "Empty upload");
  if (buf.length > _MAX_LOGO_BYTES) throw new HttpError(413, "Favicon exceeds the 1 MB limit");
  const key = `platform/favicon.${ext}`;
  await getStorage().put(key, buf, body.content_type as string);
  const url = await getStorage().url(key);
  const cur = ((await db.getPlatformSetting("branding")) ?? {}) as Row;
  await db.setPlatformSetting("branding", { ...cur, favicon: url });
  return c.json({ favicon_url: url });
});

// ── Central Access Catalogue — one document per provider (nexus-console,
// org-console, program-console, learning, bridge). Read: any authenticated
// caller (the role builders + resolver need it). Write: platform operators only
// (the platform owns the inventory). See ACCESS_CATALOGUE_DESIGN.md.
platformRouter.get("/catalogues", async (c) => {
  await getCurrentUser(c);
  _requireDb();
  return c.json(await catalogue.listCatalogues());
});
platformRouter.get("/catalogues/:provider_id", async (c) => {
  await getCurrentUser(c);
  _requireDb();
  const id = c.req.param("provider_id");
  if (!catalogue.isProviderId(id)) throw new HttpError(404, "Unknown catalogue provider");
  return c.json(await catalogue.getCatalogue(id));
});
// The caller's own effective capabilities for a provider scope — the authority
// the apps use to decide what a person can do. Read-only.
platformRouter.get("/me/capabilities", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const providerId = c.req.query("provider");
  if (!providerId || !catalogue.isProviderId(providerId)) throw new HttpError(400, "provider query param required");
  const caps = await capabilitiesFor(user, {
    providerId: providerId as ProviderId,
    orgId: c.req.query("org") ?? null,
    programId: c.req.query("program") ?? null,
  });
  return c.json({ provider: providerId, capabilities: [...caps] });
});
// Preview: given capability ids (?capabilities=a,b), the validated set + the
// surfaces they unlock. The role builder + enforcement use the same expansion.
platformRouter.get("/catalogues/:provider_id/resolve", async (c) => {
  await getCurrentUser(c);
  _requireDb();
  const id = c.req.param("provider_id");
  if (!catalogue.isProviderId(id)) throw new HttpError(404, "Unknown catalogue provider");
  const doc = await catalogue.getCatalogue(id);
  const ids = (c.req.query("capabilities") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const caps = resolveCapabilities(doc, ids);
  return c.json({ capabilities: [...caps], surfaces: surfacesForCapabilities(doc, caps) });
});
platformRouter.put("/catalogues/:provider_id", async (c) => {
  const user = await getCurrentUser(c);
  await _requireNexusArea(user, "settings", "edit");
  _requireDb();
  const id = c.req.param("provider_id");
  if (!catalogue.isProviderId(id)) throw new HttpError(404, "Unknown catalogue provider");
  const doc = (await c.req.json()) as CapabilityCatalogueDocument;
  if (doc?.documentType !== "capability_catalogue" || !Array.isArray(doc.capabilities) || !Array.isArray(doc.groups)) {
    throw new HttpError(422, "Not a valid catalogue document");
  }
  if (doc.provider?.id !== id) throw new HttpError(422, `provider.id must equal "${id}"`);
  return c.json(await catalogue.saveCatalogue(id, doc));
});
platformRouter.delete("/catalogues/:provider_id", async (c) => {
  const user = await getCurrentUser(c);
  await _requireNexusArea(user, "settings", "edit");
  _requireDb();
  const id = c.req.param("provider_id");
  if (!catalogue.isProviderId(id)) throw new HttpError(404, "Unknown catalogue provider");
  return c.json(await catalogue.resetCatalogue(id));
});

// ── Per-instance catalogues — each org/program carries its OWN customization of
// its console catalogue, seeded from the shipped default and falling back to it
// until edited. Read: any authed caller (the level's role builder needs it).
// Write: the level admin — org owner (Super Admin) for the org catalogue,
// program admin for the program catalogue; platform operators may edit any.
function _validCatalogueBody(body: unknown, providerId: ProviderId): CapabilityCatalogueDocument {
  const doc = body as CapabilityCatalogueDocument;
  if (doc?.documentType !== "capability_catalogue" || !Array.isArray(doc.capabilities) || !Array.isArray(doc.groups)) {
    throw new HttpError(422, "Not a valid catalogue document");
  }
  if (doc.provider?.id !== providerId) throw new HttpError(422, `provider.id must equal "${providerId}"`);
  return doc;
}
function _requireOrgOwner(user: PlatformUser, orgId: string): void {
  if (user.role === "platform_admin") return;
  const isOwner = user.memberships.some((m) => m.org_id === orgId && m.role === "owner" && !m.program_id);
  if (!isOwner) throw new HttpError(403, "Only the organization owner (Super Admin) can edit the access catalogue");
}

platformRouter.get("/orgs/:org_id/catalogue", async (c) => {
  await getCurrentUser(c);
  _requireDb();
  return c.json(await catalogue.getCatalogue("org-console", c.req.param("org_id")));
});
platformRouter.put("/orgs/:org_id/catalogue", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _requireOrgOwner(user, orgId);
  const doc = _validCatalogueBody(await c.req.json(), "org-console");
  const saved = await catalogue.saveCatalogue("org-console", doc, orgId);
  await db.recordAuditEvent("organization.catalogue_updated", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId, metadata: { provider: "org-console" },
  });
  return c.json(saved);
});
platformRouter.delete("/orgs/:org_id/catalogue", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _requireOrgOwner(user, orgId);
  return c.json(await catalogue.resetCatalogue("org-console", orgId));
});

platformRouter.get("/programs/:program_id/catalogue", async (c) => {
  await getCurrentUser(c);
  _requireDb();
  return c.json(await catalogue.getCatalogue("program-console", c.req.param("program_id")));
});
platformRouter.put("/programs/:program_id/catalogue", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const programId = c.req.param("program_id");
  const prog = await db.getProgram(programId);
  if (!prog) throw new HttpError(404, "Program not found");
  _requireProgramAdmin(user, prog.org_id as string, programId);
  const doc = _validCatalogueBody(await c.req.json(), "program-console");
  const saved = await catalogue.saveCatalogue("program-console", doc, programId);
  await db.recordAuditEvent("program.catalogue_updated", {
    orgId: prog.org_id as string, actorUserId: user.id, scopeType: "program", scopeId: programId, metadata: { provider: "program-console" },
  });
  return c.json(saved);
});
platformRouter.delete("/programs/:program_id/catalogue", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const programId = c.req.param("program_id");
  const prog = await db.getProgram(programId);
  if (!prog) throw new HttpError(404, "Program not found");
  _requireProgramAdmin(user, prog.org_id as string, programId);
  return c.json(await catalogue.resetCatalogue("program-console", programId));
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

// Program favicon — the browser-tab icon (separate from the sidebar logo).
platformRouter.post("/programs/:program_id/favicon", async (c) => {
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
  if (buf.length > _MAX_LOGO_BYTES) throw new HttpError(413, "Favicon exceeds the 1 MB limit");
  const key = orgKey(program.org_id, `programs/${programId}/favicon.${ext}`);
  await getStorage().put(key, buf, body.content_type as string);
  const url = await getStorage().url(key);
  await db.setProgramBranding(programId, { favicon: url });
  await db.recordAuditEvent("program.favicon_uploaded", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    metadata: { key, bytes: buf.length },
  });
  return c.json({ favicon_url: url });
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
const categoryNameSchema = z.object({
  name: z.string().trim().min(1).max(60),
  parent: z.string().trim().min(1).max(60).nullable().optional(),
});
const categoryRenameSchema = z.object({
  from: z.string().trim().min(1).max(60),
  to: z.string().trim().min(1).max(60),
});
const categoryParentSchema = z.object({
  name: z.string().trim().min(1).max(60),
  parent: z.string().trim().min(1).max(60).nullable(),
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
  await _requireOrgCap(user, orgId, "org.settings.categories");
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const req = parseBody(categoryNameSchema, await c.req.json());
  const list = await db.addOrgCategory(orgId, req.name, req.parent ?? null);
  await db.recordAuditEvent("organization.category.added", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId, metadata: { name: req.name },
  });
  return c.json(list);
});

// Reparent a category (nesting). parent=null lifts it to a root.
platformRouter.put("/orgs/:org_id/categories/parent", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "settings", "edit");
  await _requireOrgCap(user, orgId, "org.settings.categories");
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const req = parseBody(categoryParentSchema, await c.req.json());
  try {
    const list = await db.setOrgCategoryParent(orgId, req.name, req.parent);
    await db.recordAuditEvent("organization.category.reparented", {
      orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId,
      metadata: { name: req.name, parent: req.parent },
    });
    return c.json(list);
  } catch (e) {
    throw new HttpError(409, e instanceof Error ? e.message : "Can't reparent");
  }
});

platformRouter.delete("/orgs/:org_id/categories", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "settings", "edit");
  await _requireOrgCap(user, orgId, "org.settings.categories");
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
  await _requireOrgCap(user, orgId, "org.settings.categories");
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
const scopedRoleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  perms: z.record(z.string(), z.string()),
  display_as_group: z.boolean().optional(),
  parent_group_id: z.string().uuid().nullable().optional(),
  // Fine-grained capability ids from the Access Catalogue (folded into perms).
  capabilities: z.array(z.string()).optional(),
});
/** Merge fine-grained capability ids into a role's perms blob (additive),
 *  sanitized against the given catalogue(s) so unknown/reserved ids are dropped. */
async function _permsWithCapabilities(
  perms: Record<string, unknown>,
  capabilities: string[] | undefined,
  refs: catalogue.CatalogueRef[],
): Promise<Record<string, unknown>> {
  if (capabilities === undefined) return perms;
  return { ...perms, capabilities: await catalogue.validGrantsAcross(refs, capabilities) };
}

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
  await _requireOrgCap(user, orgId, "org.roles.manage");
  const req = parseBody(scopedRoleSchema, await c.req.json());
  const row = await graph.createOrgRole(orgId, req.name, await _permsWithCapabilities(req.perms, req.capabilities, [{ providerId: "org-console", instanceId: orgId }]), req.display_as_group, req.parent_group_id);
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
  await _requireOrgCap(user, orgId, "org.people.manage");
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
  await _requireOrgCap(user, orgId, "org.people.manage");
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

// ── Org-level gates (org-scoped staff onboarding; members only) ─────────────
const _gateSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const orgGateWriteSchema = z.object({
  title: z.string().nullish(),
  subtitle: z.string().nullish(),
  role_ids: z.array(z.string()).optional(),
  allow_signin: z.boolean().optional(),
  allow_signup: z.boolean().optional(),
  approval_required: z.boolean().optional(),
  landing: z.string().nullish(),
});

platformRouter.get("/orgs/:org_id/gates", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "team", "view");
  return c.json(await graph.listGatesForOrg(orgId));
});

platformRouter.post("/orgs/:org_id/gates", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "team", "edit");
  const req = parseBody(orgGateWriteSchema, await c.req.json());
  const slug = _gateSlug(req.title || "gate") || "gate";
  try {
    const gate = await graph.createGate(orgId, null, {
      level: "organization", slug, title: req.title ?? null, subtitle: req.subtitle ?? null,
      audience: "member", roleIds: req.role_ids,
      allowSignin: req.allow_signin, allowSignup: req.allow_signup,
      approvalRequired: req.approval_required, landing: req.landing ?? null,
    });
    await db.recordAuditEvent("org_gate.created", {
      orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId,
      targetType: "gate", targetId: gate.id as string, metadata: { slug },
    });
    return c.json(gate);
  } catch (e) {
    if (String(e).includes("gates_org_slug_idx") || String(e).toLowerCase().includes("duplicate")) {
      throw new HttpError(409, `A gate with the address "${slug}" already exists in this organization`);
    }
    throw e;
  }
});

// ── Member-gate approval queue (org + program) ──────────────────────────────
// When an org/program MEMBER gate is approval-gated, sign-up queues a request
// instead of admitting. Approving applies the same membership + role the gate
// would have granted immediately. (Participants keep their own approval flow in
// Registrations; nexus gates have their own queue above.)
async function _applyGateMemberApproval(gate: Row, reqRow: Row): Promise<void> {
  const email = reqRow.email as string;
  const prof = await db.getProfileByEmail(email);
  const authId = (prof?.auth_user_id as string | undefined) ?? (prof?.id as string | undefined);
  if (!authId) throw new HttpError(404, "No account found for this request");
  const orgId = gate.organization_id as string;
  const profileId = await db.ensureOrgProfile(authId, orgId, {
    email, role: "teacher", displayName: (reqRow.display_name as string | null) ?? null,
  });
  const members = await db.listMembers(orgId).catch(() => [] as Row[]);
  if (gate.level === "organization") {
    if (!members.some((m) => m.profile_id === profileId && !m.program_id)) {
      await db.addMembership(orgId, profileId, "instructor", null, "edit", null);
    }
    if (reqRow.role_id) await graph.setOrgRoleAssignment(orgId, email, reqRow.role_id as string, true);
  } else {
    const programId = gate.program_id as string;
    if (!members.some((m) => m.profile_id === profileId && ((m.program_id as string | null) ?? null) === programId)) {
      await db.addMembership(orgId, profileId, "instructor", null, "edit", programId);
    }
    if (reqRow.role_id) await graph.setProgramRoleAssignment(orgId, programId, email, reqRow.role_id as string);
  }
}

/** Load a pending request and its gate, asserting the gate lives in the scope
 * named on the path (so an org/program admin can't action another's queue). */
async function _loadScopedRequest(id: string, scope: { orgId?: string; programId?: string }): Promise<{ gate: Row; reqRow: Row }> {
  const reqRow = await graph.getGateMemberRequest(id);
  if (!reqRow || reqRow.status !== "pending") throw new HttpError(404, "No pending request");
  const gate = await graph.getGate(reqRow.gate_id as string);
  if (!gate) throw new HttpError(404, "Gate not found");
  if (scope.orgId && gate.organization_id !== scope.orgId) throw new HttpError(404, "No pending request");
  if (scope.programId && gate.program_id !== scope.programId) throw new HttpError(404, "No pending request");
  return { gate, reqRow };
}

platformRouter.get("/orgs/:org_id/gate-requests", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "team", "view");
  return c.json(await graph.listGateRequestsForOrg(orgId, c.req.query("status") || "pending"));
});

platformRouter.post("/orgs/:org_id/gate-requests/:id/approve", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "team", "edit");
  const { gate, reqRow } = await _loadScopedRequest(c.req.param("id"), { orgId });
  await _applyGateMemberApproval(gate, reqRow);
  await graph.decideGateMemberRequest(reqRow.id as string, "approved", user.id ?? null);
  await db.recordAuditEvent("org_gate.request_approved", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId,
    targetType: "gate_request", targetId: reqRow.id as string, metadata: { email: reqRow.email, role_id: reqRow.role_id },
  });
  return c.json({ ok: true });
});

platformRouter.post("/orgs/:org_id/gate-requests/:id/reject", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "team", "edit");
  const { reqRow } = await _loadScopedRequest(c.req.param("id"), { orgId });
  await graph.decideGateMemberRequest(reqRow.id as string, "rejected", user.id ?? null);
  await db.recordAuditEvent("org_gate.request_rejected", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId,
    targetType: "gate_request", targetId: reqRow.id as string, metadata: { email: reqRow.email },
  });
  return c.json({ ok: true });
});

platformRouter.get("/programs/:program_id/gate-requests", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const prog = await graph.getProgramForAccess(programId);
  if (!prog) throw new HttpError(404, "Program not found");
  _requireProgramAdmin(user, prog.org_id as string, programId);
  return c.json(await graph.listGateRequestsForProgram(programId, c.req.query("status") || "pending"));
});

platformRouter.post("/programs/:program_id/gate-requests/:id/approve", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const prog = await graph.getProgramForAccess(programId);
  if (!prog) throw new HttpError(404, "Program not found");
  _requireProgramAdmin(user, prog.org_id as string, programId);
  const { gate, reqRow } = await _loadScopedRequest(c.req.param("id"), { programId });
  await _applyGateMemberApproval(gate, reqRow);
  await graph.decideGateMemberRequest(reqRow.id as string, "approved", user.id ?? null);
  await db.recordAuditEvent("gate.request_approved", {
    orgId: prog.org_id as string, actorUserId: user.id, scopeType: "program", scopeId: programId,
    targetType: "gate_request", targetId: reqRow.id as string, metadata: { email: reqRow.email, role_id: reqRow.role_id },
  });
  return c.json({ ok: true });
});

platformRouter.post("/programs/:program_id/gate-requests/:id/reject", async (c) => {
  const user = await getCurrentUser(c);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const programId = c.req.param("program_id");
  const prog = await graph.getProgramForAccess(programId);
  if (!prog) throw new HttpError(404, "Program not found");
  _requireProgramAdmin(user, prog.org_id as string, programId);
  const { reqRow } = await _loadScopedRequest(c.req.param("id"), { programId });
  await graph.decideGateMemberRequest(reqRow.id as string, "rejected", user.id ?? null);
  await db.recordAuditEvent("gate.request_rejected", {
    orgId: prog.org_id as string, actorUserId: user.id, scopeType: "program", scopeId: programId,
    targetType: "gate_request", targetId: reqRow.id as string, metadata: { email: reqRow.email },
  });
  return c.json({ ok: true });
});

// ── Nexus (operator) gates ──────────────────────────────────────────────────
// Platform-altitude self-sign-up pages at /op/<slug>. Two guardrails are
// STRUCTURAL, not optional: admission is ALWAYS approval-gated, and the offered
// roles must be confined nexus roles (never full platform_admin). A public gate
// therefore cannot mint an operator — it can only queue a request a real
// platform_admin must approve.
const nexusGateWriteSchema = z.object({
  title: z.string().nullish(),
  subtitle: z.string().nullish(),
  role_ids: z.array(z.string()).optional(),
  allow_signin: z.boolean().optional(),
  allow_signup: z.boolean().optional(),
  landing: z.string().nullish(),
});

platformRouter.get("/admin/nexus/gates", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  return c.json(await graph.listNexusGates());
});

platformRouter.post("/admin/nexus/gates", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const req = parseBody(nexusGateWriteSchema, await c.req.json());
  // Only confined nexus roles may be offered — reject anything that isn't one of
  // the platform-scope roles (there is no platform_admin among them).
  const nexusRoleIds = new Set((await graph.listNexusRoles()).map((r) => r.id as string));
  const roleIds = (req.role_ids ?? []).filter((id) => nexusRoleIds.has(id));
  if ((req.role_ids ?? []).some((id) => !nexusRoleIds.has(id))) {
    throw new HttpError(400, "Operator gates may only offer confined nexus roles");
  }
  const slug = _gateSlug(req.title || "operator") || "operator";
  try {
    const gate = await graph.createGate(null, null, {
      level: "nexus", slug, title: req.title ?? null, subtitle: req.subtitle ?? null,
      audience: "member", roleIds,
      allowSignin: req.allow_signin, allowSignup: req.allow_signup,
      approvalRequired: true, landing: req.landing ?? null, // mandatory approval
    });
    await db.recordAuditEvent("nexus_gate.created", {
      actorUserId: user.id, scopeType: "platform", scopeId: null,
      targetType: "gate", targetId: gate.id as string, metadata: { slug },
    });
    return c.json(gate);
  } catch (e) {
    if (String(e).toLowerCase().includes("duplicate") || String(e).includes("slug")) {
      throw new HttpError(409, `An operator gate with the address "${slug}" already exists`);
    }
    throw e;
  }
});

platformRouter.delete("/admin/nexus/gates/:gate_id", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const gate = await graph.getGate(c.req.param("gate_id"));
  if (!gate || gate.level !== "nexus") throw new HttpError(404, "Operator gate not found");
  await graph.deleteGate(gate.id as string);
  await db.recordAuditEvent("nexus_gate.deleted", {
    actorUserId: user.id, scopeType: "platform", scopeId: null, targetType: "gate", targetId: gate.id as string,
  });
  return c.json({ ok: true });
});

// Public pre-auth fetch for the /op/<slug> operator sign-up page.
platformRouter.get("/nexus/gates/by-slug/:slug", async (c) => {
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const gate = await graph.getPublicNexusGate(c.req.param("slug"));
  if (!gate) throw new HttpError(404, "Gate not found");
  return c.json(gate);
});

// The approval queue: pending operator-gate requests, and approve/reject.
platformRouter.get("/admin/nexus/gate-requests", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const status = c.req.query("status") || "pending";
  return c.json(await graph.listNexusGateRequests(status));
});

platformRouter.post("/admin/nexus/gate-requests/:id/approve", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const reqRow = await graph.getGateMemberRequest(c.req.param("id"));
  if (!reqRow || reqRow.status !== "pending") throw new HttpError(404, "No pending request");
  // Applying the role IS the grant. Confined role only — the request can only
  // carry a role the gate offered, and gate creation already walled those to
  // nexus roles, so approval can never produce a platform_admin.
  if (reqRow.role_id) {
    await graph.setNexusRoleAssignment(reqRow.email as string, reqRow.role_id as string);
  }
  await graph.decideGateMemberRequest(reqRow.id as string, "approved", user.id ?? null);
  await db.recordAuditEvent("nexus_gate.request_approved", {
    actorUserId: user.id, scopeType: "platform", scopeId: null,
    targetType: "gate_request", targetId: reqRow.id as string,
    metadata: { email: reqRow.email, role_id: reqRow.role_id },
  });
  return c.json({ ok: true });
});

platformRouter.post("/admin/nexus/gate-requests/:id/reject", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  if (!dbEnabled()) throw new HttpError(501, "This feature requires the database backend");
  const reqRow = await graph.getGateMemberRequest(c.req.param("id"));
  if (!reqRow || reqRow.status !== "pending") throw new HttpError(404, "No pending request");
  await graph.decideGateMemberRequest(reqRow.id as string, "rejected", user.id ?? null);
  await db.recordAuditEvent("nexus_gate.request_rejected", {
    actorUserId: user.id, scopeType: "platform", scopeId: null,
    targetType: "gate_request", targetId: reqRow.id as string, metadata: { email: reqRow.email },
  });
  return c.json({ ok: true });
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
  return c.json(await graph.createNexusRole(req.name, await _permsWithCapabilities(req.perms, req.capabilities, [{ providerId: "nexus-console" }]), req.display_as_group, req.parent_group_id));
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
// no pending activation link. Each new account gets ITS OWN starting password,
// returned once so the operator can hand it off; the app makes them replace it at
// first sign-in (0046).
//
// It used to be one constant shared by every account this path created, which
// meant anyone who knew it could sign in as a freshly provisioned org admin
// before that person got there.
const STARTING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function newStartingPassword(): string {
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i += 1) out += STARTING_ALPHABET[bytes[i] % STARTING_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}
const provisionOrgSchema = z.object({
  name: z.string().min(1),
  // Optional operator-chosen URL slug; normalized + made unique server-side.
  slug: z.string().trim().max(63).optional(),
  admins: z.array(z.object({ email: z.string().email(), display_name: z.string().nullish() })).min(1),
});

/**
 * Resolve an existing login by email, or create one with its own starting
 * password. An existing account keeps the password it has — provisioning an org
 * must never overwrite someone's credential.
 */
async function _resolveOrCreateAccount(
  email: string,
): Promise<{ authId: string; created: boolean; startingPassword: string | null }> {
  const existing = await db.getProfileByEmail(email.trim().toLowerCase());
  if (existing) {
    return {
      authId: (existing.auth_user_id as string) ?? (existing.id as string),
      created: false,
      startingPassword: null,
    };
  }
  const startingPassword = newStartingPassword();
  const acct = await createAuthUser(email.trim().toLowerCase(), startingPassword);
  return { authId: acct.id as string, created: true, startingPassword };
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
    slug: req.slug?.trim() || undefined,
    owner: { userId: ownerAcct.authId, email: owner.email.trim().toLowerCase(), displayName: owner.display_name ?? undefined },
    // The operator explicitly designating this account as owner is consent to
    // let an existing account (from another org) also own this one.
    allowSecondOrg: true,
  });

  const enrolled: Array<{
    email: string;
    role: string;
    created: boolean;
    temp_password: string | null;
  }> = [
    {
      email: owner.email.trim().toLowerCase(),
      role: "owner",
      created: ownerAcct.created,
      temp_password: ownerAcct.startingPassword,
    },
  ];
  // Remaining named admins → active administrator memberships in the new org.
  for (const a of rest) {
    const email = a.email.trim().toLowerCase();
    const acct = await _resolveOrCreateAccount(email);
    const profileId = await db.ensureOrgProfile(acct.authId, result.organizationId, {
      email, role: "org_admin", displayName: a.display_name ?? null, allowSecondOrg: true,
    });
    await db.addMembership(result.organizationId, profileId, "administrator", null, "edit", null);
    enrolled.push({
      email,
      role: "administrator",
      created: acct.created,
      temp_password: acct.startingPassword,
    });
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
    // Each new account's own password, returned once. Existing accounts: null.
    admins: enrolled,
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

// Grant a partner org a catalog-based, gated view of this program — the same
// capability vocabulary we provision to people. Stored on the affiliation's
// metadata; capabilities are validated against THIS program's console catalog.
platformRouter.put("/programs/:program_id/org-affiliations/:affiliation_id/access", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const programId = c.req.param("program_id");
  const affiliationId = c.req.param("affiliation_id");
  const program = await db.getProgram(programId);
  if (!program) throw new HttpError(404, "Program not found");
  _requireProgramAdmin(user, program.org_id, programId);
  const body = (await c.req.json()) as { capabilities?: string[]; perms?: Record<string, unknown> };
  const requested = Array.isArray(body?.capabilities) ? body.capabilities : [];
  // Only capabilities that exist in this program's catalog survive.
  const capabilities = await catalogue.validGrantsAcross(
    [{ providerId: "program-console", instanceId: programId }],
    requested,
  );
  const perms = (body?.perms && typeof body.perms === "object") ? body.perms : {};
  const clearing = capabilities.length === 0 && Object.keys(perms).length === 0;
  const updated = await graph.setProgramOrgAffiliationAccess(
    affiliationId,
    clearing ? null : { perms, capabilities, updatedAt: new Date().toISOString() },
  );
  if (!updated) throw new HttpError(404, "Affiliation not found");
  await db.recordAuditEvent("program.org_affiliation_access_set", {
    orgId: program.org_id, actorUserId: user.id, scopeType: "program", scopeId: programId,
    targetType: "program_org_affiliation", targetId: affiliationId,
    metadata: { capabilities },
  });
  return c.json(updated);
});
// Partner portal context — a partner-org member entering a program's gated view
// through the /partner/:orgSlug/:programSlug slug. One-directional: authorized by
// the caller's own org holding an ACTIVE affiliation grant on the program. Returns
// the program summary + the granted capabilities and the program surfaces they
// unlock. Privileged lookups (caller isn't a member of the program's org).
platformRouter.get("/partner/context", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgSlug = c.req.query("org_slug");
  const programSlug = c.req.query("program_slug");
  if (!orgSlug || !programSlug) throw new HttpError(400, "org_slug and program_slug required");
  const org = await db.getOrganizationBySlug(orgSlug);
  if (!org) throw new HttpError(404, "Program not found");
  const program = await graph.getProgramByOrgAndSlug(org.id as string, programSlug);
  if (!program) throw new HttpError(404, "Program not found");
  const orgIds = [...new Set(user.memberships.map((m) => m.org_id as string))];
  const partner = await graph.getActivePartnerAccessForOrgs(program.id as string, orgIds);
  if (!partner) throw new HttpError(403, "No partner access to this program");
  const capsSet = new Set(partner.access.capabilities ?? []);
  const doc = await catalogue.getCatalogue("program-console", program.id as string);
  const unlocked = new Set(surfacesForCapabilities(doc, capsSet));
  const surfaces = doc.uiSurfaces
    .filter((s) => unlocked.has(s.id))
    .map((s) => ({ id: s.id, label: s.label, group: s.group ?? null }));
  return c.json({
    program: { id: program.id, name: program.name, description: program.description ?? null, branding: program.branding ?? null },
    org_name: org.name,
    org_slug: orgSlug,
    program_slug: programSlug,
    capabilities: [...capsSet],
    surfaces,
  });
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

// ── ORG-level groups model + email-keyed placement (People → Roles & Groups) ─
platformRouter.get("/orgs/:org_id/groups-model", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _assertOrgPeopleAccess(user, orgId);
  return c.json(await graph.listGroupsModel(orgId, null));
});
const orgGroupsPlacementSchema = z.object({ email: z.string().email(), group_ids: z.array(z.string().uuid()) });
platformRouter.put("/orgs/:org_id/team/groups", async (c) => {
  const user = await getCurrentUser(c);
  _requireDb();
  const orgId = c.req.param("org_id");
  _assertOrgPeopleAccess(user, orgId, true);
  const req = parseBody(orgGroupsPlacementSchema, await c.req.json());
  await graph.setPersonGroupsScoped(orgId, null, req.email, req.group_ids);
  return c.json({ ok: true });
});

// ── NEXUS-level groups (org_id null). Full operators only. ───────────────────
platformRouter.get("/admin/nexus/groups-model", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  _requireDb();
  return c.json(await graph.listGroupsModel(null, null));
});
platformRouter.get("/admin/nexus/groups", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  _requireDb();
  return c.json(await graph.listNexusGroups());
});
const nexusGroupCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  label: z.string().nullish(),
  parent_group_id: z.string().uuid().nullable().optional(),
});
platformRouter.post("/admin/nexus/groups", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  _requireDb();
  const req = parseBody(nexusGroupCreateSchema, await c.req.json());
  return c.json(await graph.createNexusGroup({ name: req.name, label: req.label ?? null, parentGroupId: req.parent_group_id ?? null }));
});
const nexusGroupUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  label: z.string().nullish(),
  parent_group_id: z.string().uuid().nullable().optional(),
});
platformRouter.patch("/admin/nexus/groups/:id", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  _requireDb();
  const req = parseBody(nexusGroupUpdateSchema, await c.req.json());
  const row = await graph.updateGroupPriv(c.req.param("id"), {
    name: req.name, label: req.label === undefined ? undefined : (req.label ?? null), parentGroupId: req.parent_group_id,
  });
  if (!row) throw new HttpError(404, "Group not found");
  return c.json(row);
});
platformRouter.delete("/admin/nexus/groups/:id", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  _requireDb();
  await graph.deleteGroupPriv(c.req.param("id"));
  return c.json({ ok: true });
});
const nexusGroupsPlacementSchema = z.object({ email: z.string().email(), group_ids: z.array(z.string().uuid()) });
platformRouter.put("/admin/nexus/team/groups", async (c) => {
  const user = await getCurrentUser(c);
  _requirePlatformAdmin(user);
  _requireDb();
  const req = parseBody(nexusGroupsPlacementSchema, await c.req.json());
  await graph.setPersonGroupsScoped(null, null, req.email, req.group_ids);
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

// Org favicon — separate from the logo (shown in the browser tab, not the sidebar).
platformRouter.post("/orgs/:org_id/favicon", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  await _requireOrgArea(user, orgId, "settings", "edit");
  const body = (await c.req.json()) as { data?: string; content_type?: string };
  const ext = _LOGO_EXT[body.content_type ?? ""];
  if (!body.data || !ext) throw new HttpError(422, "data (base64) and a valid image content_type are required");
  const buf = Buffer.from(body.data, "base64");
  if (buf.length === 0) throw new HttpError(422, "Empty upload");
  if (buf.length > _MAX_LOGO_BYTES) throw new HttpError(413, "Favicon exceeds the 1 MB limit");

  const key = orgKey(orgId, `favicon.${ext}`);
  await getStorage().put(key, buf, body.content_type as string);
  const url = await getStorage().url(key);
  await db.updateOrgTheme(orgId, null, null, url);
  await db.recordAuditEvent("organization.favicon_uploaded", {
    orgId, actorUserId: user.id, scopeType: "organization", scopeId: orgId, metadata: { key, bytes: buf.length },
  });
  return c.json({ favicon_url: url });
});

// Serve locally-stored objects (FS adapter dev mode). Public — logos are org page assets.
platformRouter.get("/storage/:key{.+}", async (c) => {
  const obj = await getStorage().get(c.req.param("key"));
  if (!obj) throw new HttpError(404, "Not found");
  const ab = obj.body.buffer.slice(obj.body.byteOffset, obj.body.byteOffset + obj.body.byteLength) as ArrayBuffer;
  return c.body(ab, 200, { "Content-Type": obj.contentType });
});
