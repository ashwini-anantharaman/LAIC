/** Platform layer API routes for orgs, challenges, permissions, and join codes. */

import { Hono } from "hono";

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
  registerViaJoinCodeSchema,
  setEntitlementSchema,
  signupSchema,
  updateMemberSchema,
} from "../schemas";

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
    course_count: row.course_count ?? 0,
    learner_count: row.learner_count ?? 0,
    instructor_count: row.instructor_count ?? 0,
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
    await db.createProfile(auth.id, req.email, "org_admin", req.display_name ?? null);
    const org = await db.createOrganization(req.org_name, auth.id);
    await db.recordAuditEvent("organization.created", {
      orgId: org.id,
      actorUserId: auth.id,
      scopeType: "organization",
      scopeId: org.id,
      metadata: { name: org.name },
    });
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
  await db.createProfile(auth.id, req.email, profileRole, req.display_name ?? null);

  // Stored membership role uses the canonical "instructor" (Nexus addendum);
  // the public-facing "Coach"/"Teacher" word is derived from program category
  // in roleLabel(), not from this stored value.
  const membershipRole = req.signup_type === "administrator" ? "administrator" : "instructor";
  await db.addMembership(
    codeRow.org_id,
    auth.id,
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
  return c.json(_authUserResponse(user, session.access_token));
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
  const row = await db.createProgram(orgId, req.name, req.category, {
    description: req.description ?? null,
    icon: req.icon ?? null,
    instructorLabel: req.instructor_label ?? null,
    learnerLabel: req.learner_label ?? null,
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
    stage_node_id: row.stage_node_id ?? null,
    stage_name: stageName,
    access: row.access ?? "view",
  };
}

platformRouter.get("/orgs/:org_id/members", async (c) => {
  const user = await getCurrentUser(c);
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
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
  const req = parseBody(addMemberSchema, await c.req.json());
  _assertOrgAccess(user, orgId, true);

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
  _assertOrgAccess(user, row.org_id, true);

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
        msg: "Input should be 'nexus', 'learning', 'coaching' or 'analytics'",
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
