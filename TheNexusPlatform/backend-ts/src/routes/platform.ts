/** Platform layer API routes for orgs, challenges, permissions, and join codes. */

import { randomBytes } from "node:crypto";

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
import type { CapabilityCatalogueDocument } from "../accessCatalogue/types";
import { resolveCapabilities, surfacesForCapabilities, grantableCapabilities } from "../accessCatalogue/resolver";
import { capabilitiesFor, requireCapability } from "../accessCatalogue/enforce";
import * as bridgeRoles from "../accessCatalogue/bridgeRoles";
import * as appRoles from "../accessCatalogue/appRoles";
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
        return c.json({ access_token: session.access_token, pending: true, landing: gate.landing ?? null });
      }
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
  return c.json({ access_token: session.access_token, landing: gate.landing ?? null });
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
  if (access.partnerClub && access.partnerProgramId) {
    try {
      const clubProgram = await db.getProgram(access.partnerProgramId);
      const clubOrgId = (clubProgram?.org_id as string | undefined) ?? null;
      const structuralTier =
        !!clubOrgId &&
        user.memberships.some(
          (m) =>
            m.org_id === clubOrgId &&
            ["owner", "administrator"].includes(m.role) &&
            (!m.program_id || m.program_id === access.partnerProgramId),
        );
      let clubRoleName: string | null = null;
      let granted: string[] = [];
      if (!structuralTier && user.email) {
        const role = await graph
          .getProgramRoleForEmail(access.partnerProgramId, user.email)
          .catch(() => null);
        if (role) {
          clubRoleName = (role.role_name as string | null) ?? null;
          const perms = (role.perms as Record<string, unknown>) ?? {};
          granted = Array.isArray(perms.capabilities) ? (perms.capabilities as string[]) : [];
        }
      }
      const resolved = await appRoles.appAccessFor(access.partnerProgramId, {
        structuralTier,
        roleName: clubRoleName,
        programRoleCapabilities: granted,
      });
      appCapabilities = resolved.capabilities;
    } catch (e) {
      console.error("bridge/context app-capability resolution failed (using empty set):", e);
    }
  }

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
    // A club's people (owner direction 2026-08-10): members get
    // bridge_club_member — the ordinary member surface, with their coach pool
    // restricted to the club. The club's INSTRUCTOR is its coach and emits
    // bridge_coach, or the hire loop dead-ends: their reviews queue, learner
    // pages and assignment flows all sit behind the platform's coach gates,
    // and every one of those surfaces is already scoped to their own hires by
    // data. A club's admin still gets bridge_club_member here on purpose —
    // bridge_club_admin sits in the platform's ADMIN set (admin & expert
    // review areas), which does not belong to a club.
    roles: isPrebuilt
      ? [access.platformRole]
      : access.partnerClub
        ? [
            user.memberships.find((m) => m.program_id === access.partnerProgramId)?.role ===
            "instructor"
              ? "bridge_coach"
              : "bridge_club_member",
          ]
        : mapped.roles,
    permissions: [`bridge:${access.level}`],
    accessLevel: mapped.accessLevel,
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
 * the club's own instructors and nobody else (owner direction 2026-08-10) —
 * a club member never browses the parent program's coach list.
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
      graph.listLearnerCoaches(access.orgId, access.programId, participant, access.profileId),
      participant.group_id
        ? graph.getCoachForGroup(participant.group_id as string)
        : Promise.resolve(null),
    ]);
    return { coach: groupCoach ?? coachList[0] ?? null, coachList };
  })();
  const [s, { coach, coachList }, inProgress, deal] = await Promise.all([
    graph.getBridgeActivitySummary(access.orgId, access.programId, access.profileId),
    coachStrand,
    graph
      .listBridgeInProgressSessions(access.programId, access.profileId)
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

  return { user, programId, orgId, programName: (program.name as string) ?? null, structuralTier };
}

platformRouter.get("/club-app/context", async (c) => {
  const { user, programId, programName, structuralTier } = await _clubAppActor(c);

  // The ONE role they hold in this club, and what it grants.
  let roleName: string | null = null;
  let granted: string[] = [];
  if (!structuralTier && user.email) {
    const role = await graph.getProgramRoleForEmail(programId, user.email).catch(() => null);
    if (role) {
      roleName = (role.role_name as string | null) ?? null;
      const perms = (role.perms as Record<string, unknown>) ?? {};
      granted = Array.isArray(perms.capabilities) ? (perms.capabilities as string[]) : [];
    }
  }

  let result: { roleName: string | null; capabilities: string[] } = { roleName, capabilities: [] };
  try {
    result = await appRoles.appAccessFor(programId, {
      structuralTier,
      roleName,
      programRoleCapabilities: granted,
    });
  } catch (e) {
    // A bad role or catalogue must never lock someone out of the app entirely.
    console.error("club-app/context capability computation failed (using empty set):", e);
  }
  return c.json({
    program_id: programId,
    program_name: programName,
    role_name: result.roleName,
    capabilities: result.capabilities,
    is_admin: structuralTier,
  });
});

/** Every member of the program with the app role they hold — the roster's
 *  labels, and the source of the club's role filter. */
platformRouter.get("/club-app/members", async (c) => {
  const { programId, orgId } = await _clubAppActor(c);
  const members = await graph.listProgramMembers(orgId, programId);
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
  // Effective learning capabilities — the app gates its screens on these:
  //  • admin        → everything the catalogue grants (full access)
  //  • custom role  → exactly the capabilities that Content Studio role binds
  //  • program role → a "partial" program-role grant binds specific learning
  //                   capabilities (filtered to the learning catalogue)
  //  • otherwise    → the launch level's sample-role capabilities (edit →
  //                   content-developer, comment → reviewer, view → learner).
  // Defensive: never let capability computation break context resolution.
  let capabilities: string[] = [];
  try {
    const learningDoc = await catalogue.getCatalogue("learning");
    const roleCaps = (customRole?.perms as Row | undefined)?.capabilities;
    const programCaps = access.programRoleCapabilities?.length
      ? await catalogue.validGrantsAcross([{ providerId: "learning" }], access.programRoleCapabilities)
      : [];
    capabilities = isAdmin
      ? _learningCapsForLevel(learningDoc, "admin")
      : Array.isArray(roleCaps) && roleCaps.length
        ? (roleCaps as string[])
        : programCaps.length
          ? programCaps
          : _learningCapsForLevel(learningDoc, access.level as "edit" | "comment" | "view");
  } catch (e) {
    console.error("learning/context capability computation failed (using empty set):", e);
  }
  return c.json({
    nexusUserId: access.profileId,
    laicOrgId: access.orgId,
    programId: access.programId,
    appId: await platformAppSlug(access.programId, "learning-platform", "learning_platform"),
    roles: mapped.roles,
    permissions: [`learning:${access.level}`],
    accessLevel: mapped.accessLevel,
    capabilities, // effective learning-catalogue capability ids (screen gating)
    displayName: await _platformDisplayName(access.profileId, user),
    program_name: access.programName,
    role_name: access.roleName,
    is_admin: isAdmin,
    learning_role: customRole, // { role_id, role_name, perms:{...,capabilities} } or null
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
  // ?meta=1 → metadata only (no blocks/pipeline_draft). The full listing can
  // run to tens of MB once authored content accumulates; list screens should
  // never pay that — fetch one object's content via GET /learning/objects/:id.
  // Program-scoped either way: each program is its own Content Studio instance.
  if (c.req.query("meta") === "1") {
    return c.json(await graph.listLearningObjectsMeta(access.orgId, access.programId));
  }
  return c.json(await graph.listLearningObjects(access.orgId, access.programId));
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
  const row = await graph.getLearningObject(access.orgId, c.req.param("object_id"));
  if (!row) throw new HttpError(404, "Learning object not found");
  return c.json(row);
});

platformRouter.put("/learning/objects", async (c) => {
  const user = await getCurrentUser(c);
  const body = (await c.req.json()) as Row;
  const access = await resolvePlatformAccess(user, "learning", (body.program_id as string) ?? c.req.query("program_id") ?? null);
  if (!(await db.checkModuleAccess(access.orgId, "learning"))) {
    throw new HttpError(403, "The learning module is disabled for this organization");
  }
  if (!body.id || !body.type) throw new HttpError(422, "id and type are required");
  await graph.upsertLearningObject(access.orgId, body, access.programId);
  return c.json({ ok: true });
});

// ── Learning Platform custom roles (the learning app's own People tab) ──────
const _learningPerms = z.record(z.string(), z.enum(["view", "edit"]));
// A learning role now binds fine-grained capability ids from the learning
// catalogue (her capability-based model). The legacy per-area view/edit `perms`
// stays for backward compatibility; capabilities are the new source of truth.
const learningRoleCreateSchema = z.object({ program_id: z.string(), name: z.string().min(1), perms: _learningPerms.default({}), capabilities: z.array(z.string()).optional() });
const learningRoleUpdateSchema = z.object({ name: z.string().min(1).optional(), perms: _learningPerms.optional(), capabilities: z.array(z.string()).optional() });
const learningAssignSchema = z.object({ program_id: z.string(), email: z.string().email(), role_id: z.string().nullable() });

/** Fold sanitized learning-catalogue capabilities into a role's perms blob
 *  (dropping unknown/reserved ids), mirroring the org/program role builders. */
async function _learningPermsWithCaps(perms: Record<string, unknown>, capabilities: string[] | undefined): Promise<Record<string, unknown>> {
  if (capabilities === undefined) return perms;
  return { ...perms, capabilities: await catalogue.validGrantsAcross([{ providerId: "learning" }], capabilities) };
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
async function _learningAdmin(c: Context, programId: string) {
  const user = await getCurrentUser(c);
  const access = await resolvePlatformAccess(user, "learning", programId);
  if (access.level !== "admin") throw new HttpError(403, "Learning admin access required");
  return access;
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
  await _learningAdmin(c, c.req.query("program_id") ?? "");
  const doc = (await c.req.json()) as CapabilityCatalogueDocument;
  if (doc?.documentType !== "capability_catalogue" || !Array.isArray(doc.capabilities) || !Array.isArray(doc.groups)) {
    throw new HttpError(422, "Not a valid catalogue document");
  }
  if (doc.provider?.id !== "learning-platform") throw new HttpError(422, 'provider.id must equal "learning-platform"');
  return c.json(await catalogue.saveCatalogue("learning", doc));
});
platformRouter.delete("/learning/catalogue", async (c) => {
  await _learningAdmin(c, c.req.query("program_id") ?? "");
  return c.json(await catalogue.resetCatalogue("learning"));
});

platformRouter.get("/learning/roles", async (c) => {
  const pid = c.req.query("program_id") ?? "";
  const access = await _learningAdmin(c, pid);
  return c.json(await graph.listLearningRoles(access.orgId, access.programId));
});

platformRouter.post("/learning/roles", async (c) => {
  const req = parseBody(learningRoleCreateSchema, await c.req.json());
  const access = await _learningAdmin(c, req.program_id);
  const perms = await _learningPermsWithCaps(req.perms, req.capabilities);
  return c.json(await graph.createLearningRole(access.orgId, access.programId, req.name, perms));
});

platformRouter.patch("/learning/roles/:id", async (c) => {
  const body = parseBody(learningRoleUpdateSchema, await c.req.json());
  const pid = c.req.query("program_id") ?? "";
  await _learningAdmin(c, pid);
  // Merge capabilities into whatever perms are being written (or the existing
  // blob) so the area perms and capabilities don't clobber each other.
  let perms = body.perms as Record<string, unknown> | undefined;
  if (body.capabilities !== undefined) {
    const existing = await graph.getLearningRole(c.req.param("id")).catch(() => null);
    const base = (perms ?? (existing?.perms as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    perms = await _learningPermsWithCaps(base, body.capabilities);
  }
  const row = await graph.updateLearningRole(c.req.param("id"), { name: body.name, perms });
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
    // A credential is SHARED across every club its owner belongs to. While it is
    // unclaimed nobody owns it, so a starting password is a courtesy; once the
    // person has set their own, setting it here would hand this club a working
    // key to another club's member. Refuse, and point at the code instead.
    const claim = await db.getClaimState(membership.profile_id as string);
    if (claim?.claimed) {
      throw new HttpError(
        409,
        "This person has set their own password, so it cannot be changed here. " +
          "Issue a claim code instead — they redeem it in the app and choose a new one.",
      );
    }
    await setAuthUserPassword(email, req.password);
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
