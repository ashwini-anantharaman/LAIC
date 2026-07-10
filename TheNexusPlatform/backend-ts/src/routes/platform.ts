/** Platform layer API routes for orgs, challenges, permissions, and join codes. */

import { Hono } from "hono";

import { getSettings } from "../config";
import { HttpError } from "../httpError";
import {
  createAuthUser,
  getCurrentUser,
  getOptionalUser,
  loadPlatformUser,
  signInUser,
  type PlatformUser,
} from "../auth";
import {
  addMembership,
  addStageNodes,
  buildStageTree,
  createJoinCode,
  createOrganization,
  createProfile,
  getMembership,
  getOrgChallenge,
  getOrganization,
  getProfile,
  getProfileByEmail,
  getStageNode,
  getUserOrgs,
  getJoinCode,
  listMembers,
  listStageNodes,
  listStudentRegistrationsForStages,
  registerStudent,
  setupOrganization,
  updateMemberAccess,
} from "../platformDb";
import { canViewStage, roleLabel, visibleStages, type StageNode } from "../permissions";
import {
  addMemberSchema,
  createJoinCodeSchema,
  createOrgSchema,
  loginSchema,
  orgSetupSchema,
  parseBody,
  registerViaJoinCodeSchema,
  signupSchema,
  updateMemberSchema,
} from "../schemas";

type Row = Record<string, any>;

export const platformRouter = new Hono();

function _requireSupabase(): void {
  if (!getSettings().supabaseEnabled) {
    throw new HttpError(503, "Supabase is required for platform features");
  }
}

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
    children: _serializeStageTree(n.children ?? []),
  }));
}

async function _membershipSummaries(user: PlatformUser): Promise<Row[]> {
  const summaries: Row[] = [];
  for (const m of user.memberships) {
    const org = await getOrganization(m.org_id);
    let stageName: string | null = null;
    let stageType = m.stage_type ?? null;
    if (m.stage_node_id) {
      const stage = await getStageNode(m.stage_node_id);
      if (stage) {
        stageName = stage.name ?? null;
        stageType = stage.stage_type ?? stageType;
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

// ── Auth ────────────────────────────────────────────────────────────────────
platformRouter.post("/auth/signup", async (c) => {
  _requireSupabase();
  const req = parseBody(signupSchema, await c.req.json().catch(() => ({})));

  if (req.signup_type === "org") {
    if (!req.org_name) throw new HttpError(400, "org_name is required for org signup");
    const auth = await createAuthUser(req.email, req.password);
    await createProfile(auth.id, req.email, "org_admin", req.display_name);
    await createOrganization(req.org_name, auth.id);
    const session = await signInUser(req.email, req.password);
    const user = await loadPlatformUser(auth.id, req.email);
    return c.json({
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      access_token: session.access_token,
    });
  }

  if (req.signup_type === "student") {
    const auth = await createAuthUser(req.email, req.password);
    await createProfile(auth.id, req.email, "student", req.display_name);
    const session = await signInUser(req.email, req.password);
    const user = await loadPlatformUser(auth.id, req.email);
    return c.json({
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      access_token: session.access_token,
    });
  }

  if (!req.join_code) {
    throw new HttpError(400, "join_code is required for administrator/teacher signup");
  }

  const codeRow = await getJoinCode(req.join_code);
  if (!codeRow) throw new HttpError(404, "Invalid join code");

  if (req.signup_type === "administrator" && codeRow.kind !== "administrator") {
    throw new HttpError(400, "Join code is not valid for administrator signup");
  }
  if (req.signup_type === "teacher" && codeRow.kind !== "teacher") {
    throw new HttpError(400, "Join code is not valid for teacher signup");
  }

  const auth = await createAuthUser(req.email, req.password);
  const profileRole = req.signup_type === "administrator" ? "org_admin" : "teacher";
  await createProfile(auth.id, req.email, profileRole, req.display_name);

  const membershipRole = req.signup_type === "administrator" ? "administrator" : "teacher";
  await addMembership(codeRow.org_id, auth.id, membershipRole, codeRow.stage_node_id, "view");

  const session = await signInUser(req.email, req.password);
  const user = await loadPlatformUser(auth.id, req.email);
  return c.json({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    access_token: session.access_token,
  });
});

platformRouter.post("/auth/login", async (c) => {
  _requireSupabase();
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = parseBody(loginSchema, body);
  const session = await signInUser(email, password);
  const user = await loadPlatformUser(session.id, session.email);
  return c.json({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    access_token: session.access_token,
  });
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

// ── Orgs ──────────────────────────────────────────────────────────────────
platformRouter.post("/orgs", async (c) => {
  const user = await getCurrentUser(c);
  _requireSupabase();
  const req = parseBody(createOrgSchema, await c.req.json().catch(() => ({})));
  const org = await createOrganization(req.name, user.id);
  return c.json({ id: org.id, name: org.name, slug: org.slug, owner_id: org.owner_id ?? null });
});

// Static route registered before parameterized `/orgs/:org_id/...` variants.
platformRouter.get("/orgs/mine", async (c) => {
  const user = await getCurrentUser(c);
  _requireSupabase();
  const rows = await getUserOrgs(user.id);
  const seen = new Set<string>();
  const result: Row[] = [];
  for (const r of rows) {
    const org = r.organizations ?? {};
    const oid = org.id;
    if (oid && !seen.has(oid)) {
      seen.add(oid);
      result.push({ id: oid, name: org.name, slug: org.slug, role: r.role });
    }
  }
  return c.json(result);
});

platformRouter.put("/orgs/:org_id/setup", async (c) => {
  const user = await getCurrentUser(c);
  _requireSupabase();
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId, true);
  const req = parseBody(orgSetupSchema, await c.req.json().catch(() => ({})));

  const payload = {
    has_challenge: req.has_challenge,
    challenge_name: req.challenge_name ?? null,
    stage_types: req.stage_types,
    permission_defaults: Object.fromEntries(
      Object.entries(req.permission_defaults).map(([role, cfg]) => [
        role,
        { default_access: cfg.default_access, per_level_overrides: cfg.per_level_overrides ?? {} },
      ]),
    ),
    initial_stages: req.initial_stages.map((s) => ({
      stage_type: s.stage_type,
      name: s.name,
      discord_url: s.discord_url ?? null,
      event_at: s.event_at ?? null,
      children: (s.children ?? []).map((ch) => ({
        stage_type: ch.stage_type,
        name: ch.name,
        discord_url: ch.discord_url ?? null,
        event_at: ch.event_at ?? null,
        children: [],
      })),
    })),
    discord_link: req.discord_link ?? null,
  };
  return c.json(await setupOrganization(orgId, payload));
});

platformRouter.get("/orgs/:org_id/stages", async (c) => {
  const user = await getCurrentUser(c);
  _requireSupabase();
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  const allStages = await listStageNodes(orgId);
  const visible = visibleStages(user.memberships, allStages, orgId);
  const tree = buildStageTree(visible);
  return c.json(_serializeStageTree(tree));
});

platformRouter.post("/orgs/:org_id/stages", async (c) => {
  const user = await getCurrentUser(c);
  _requireSupabase();
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId, true);
  const parentId = c.req.query("parent_id") ?? null;
  const nodes = (await c.req.json().catch(() => [])) as Row[];
  const created = await addStageNodes(orgId, nodes, parentId);
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
    })),
  );
});

platformRouter.get("/orgs/:org_id/members", async (c) => {
  const user = await getCurrentUser(c);
  _requireSupabase();
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  const rows = await listMembers(orgId);
  return c.json(
    rows.map((r) => {
      const profile = r.profiles ?? {};
      const stage = r.stage_nodes ?? {};
      return {
        id: r.id,
        profile_id: r.profile_id,
        email: profile.email ?? "",
        display_name: profile.display_name ?? profile.name ?? null,
        role: r.role,
        stage_node_id: r.stage_node_id ?? null,
        stage_name: stage.name ?? null,
        access: r.access ?? "view",
      };
    }),
  );
});

platformRouter.post("/orgs/:org_id/members", async (c) => {
  const user = await getCurrentUser(c);
  _requireSupabase();
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId, true);
  const req = parseBody(addMemberSchema, await c.req.json().catch(() => ({})));

  const profile = await getProfileByEmail(req.email);
  if (!profile) throw new HttpError(404, "User with this email not found");

  const row = await addMembership(orgId, profile.id, req.role, req.stage_node_id, req.access);
  const stage = req.stage_node_id ? await getStageNode(req.stage_node_id) : null;
  const stageName = stage ? stage.name : null;

  return c.json({
    id: row.id,
    profile_id: row.profile_id,
    email: profile.email ?? "",
    display_name: profile.display_name ?? profile.name ?? null,
    role: row.role,
    stage_node_id: row.stage_node_id ?? null,
    stage_name: stageName,
    access: row.access ?? "view",
  });
});

platformRouter.get("/orgs/:org_id/challenge", async (c) => {
  const user = await getCurrentUser(c);
  _requireSupabase();
  const orgId = c.req.param("org_id");
  _assertOrgAccess(user, orgId);
  const data = await getOrgChallenge(orgId);
  if (!data) throw new HttpError(404, "Organization not found");
  return c.json({
    org_id: data.org_id,
    org_name: data.org_name,
    enabled: data.enabled,
    name: data.name ?? null,
    stage_types: data.stage_types ?? [],
  });
});

// ── Stages & join codes ─────────────────────────────────────────────────────
platformRouter.post("/stages/:stage_id/join-codes", async (c) => {
  const user = await getCurrentUser(c);
  _requireSupabase();
  const stageId = c.req.param("stage_id");
  const stage = await getStageNode(stageId);
  if (!stage) throw new HttpError(404, "Stage not found");
  _assertOrgAccess(user, stage.org_id, true);

  const req = parseBody(createJoinCodeSchema, await c.req.json().catch(() => ({})));
  const row = await createJoinCode(stageId, req.kind);
  const org = await getOrganization(stage.org_id);
  return c.json({
    id: row.id,
    code: row.code,
    kind: row.kind,
    org_id: row.org_id,
    stage_node_id: row.stage_node_id,
    stage_name: stage.name,
    org_name: (stage.organizations ?? {}).name ?? (org ?? {}).name ?? "",
  });
});

platformRouter.get("/stages/:stage_id/students", async (c) => {
  const user = await getCurrentUser(c);
  _requireSupabase();
  const stageId = c.req.param("stage_id");
  const stage = await getStageNode(stageId);
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

  const allStages = await listStageNodes(stage.org_id);
  const visible = visibleStages(user.memberships, allStages, stage.org_id);
  const registrations = await listStudentRegistrationsForStages(stage.org_id, visible);
  const filtered = registrations.filter((r) => r.stage_node_id === stageId);

  return c.json(
    filtered.map((r) => {
      const profile = r.profiles ?? {};
      const st = r.stage_nodes ?? {};
      return {
        id: r.id,
        profile_id: r.profile_id,
        display_name: profile.display_name ?? profile.name ?? null,
        email: profile.email ?? null,
        stage_node_id: r.stage_node_id,
        stage_name: st.name ?? "",
        registered_at: r.registered_at,
      };
    }),
  );
});

platformRouter.get("/join-codes/:code", async (c) => {
  _requireSupabase();
  const code = c.req.param("code");
  const row = await getJoinCode(code);
  if (!row) throw new HttpError(404, "Invalid join code");
  const stage = row.stage_nodes ?? {};
  const org = row.organizations ?? {};
  return c.json({
    id: row.id,
    code: row.code,
    kind: row.kind,
    org_id: row.org_id,
    stage_node_id: row.stage_node_id,
    stage_name: stage.name ?? "",
    org_name: org.name ?? "",
  });
});

platformRouter.post("/join-codes/:code/register", async (c) => {
  _requireSupabase();
  const code = c.req.param("code");
  const row = await getJoinCode(code);
  if (!row) throw new HttpError(404, "Invalid join code");
  if (row.kind !== "student") {
    throw new HttpError(400, "This join code is not for student registration");
  }

  const user = await getOptionalUser(c);
  if (user === null) throw new HttpError(401, "Authentication required to register");

  const req = parseBody(registerViaJoinCodeSchema, await c.req.json().catch(() => ({})));
  const reg = await registerStudent(user.id, row, req.display_name);
  return c.json({ ok: true, registration_id: reg.id, org_id: reg.org_id });
});

// ── Dashboard ────────────────────────────────────────────────────────────────
platformRouter.get("/dashboard", async (c) => {
  const user = await getCurrentUser(c);
  _requireSupabase();
  if (user.memberships.length === 0) throw new HttpError(403, "No organization memberships");

  const orgId = c.req.query("org_id");
  const stageId = c.req.query("stage_id");
  const targetOrgId = orgId || user.memberships[0].org_id;
  _assertOrgAccess(user, targetOrgId);

  const org = await getOrganization(targetOrgId);
  if (!org) throw new HttpError(404, "Organization not found");

  const allStages = await listStageNodes(targetOrgId);
  const visible = visibleStages(user.memberships, allStages, targetOrgId);

  const registrations = await listStudentRegistrationsForStages(targetOrgId, visible);

  const stageTabs: Row[] = visible.map((s) => ({
    id: s.id,
    stage_type: s.stage_type,
    name: s.name,
    signup_count: registrations.filter((r) => r.stage_node_id === s.id).length,
    event_at: s.event_at ?? null,
    discord_url: s.discord_url ?? null,
    qualifier_status: s.qualifier_status ?? null,
  }));

  const active = stageId || (stageTabs.length ? stageTabs[0].id : null);
  const activeRegs = registrations.filter((r) => !active || r.stage_node_id === active);

  const students = activeRegs.slice(0, 50).map((r) => {
    const profile = r.profiles ?? {};
    const stage = r.stage_nodes ?? {};
    return {
      id: r.id,
      profile_id: r.profile_id,
      display_name: profile.display_name ?? profile.name ?? null,
      email: profile.email ?? null,
      stage_node_id: r.stage_node_id,
      stage_name: stage.name ?? "",
      registered_at: r.registered_at,
    };
  });

  return c.json({
    org_id: targetOrgId,
    org_name: org.name,
    role_label: roleLabel(user.memberships, targetOrgId, allStages),
    active_stage_id: active,
    stages: stageTabs,
    total_signups: registrations.length,
    students,
  });
});

// ── Members ──────────────────────────────────────────────────────────────────
platformRouter.patch("/members/:member_id", async (c) => {
  const user = await getCurrentUser(c);
  _requireSupabase();
  const memberId = c.req.param("member_id");

  const row = await getMembership(memberId);
  if (!row) throw new HttpError(404, "Member not found");
  _assertOrgAccess(user, row.org_id, true);

  const req = parseBody(updateMemberSchema, await c.req.json().catch(() => ({})));
  const updated = await updateMemberAccess(memberId, req.access);
  const profile = (await getProfile(updated.profile_id)) ?? {};
  let stageName: string | null = null;
  if (updated.stage_node_id) {
    const stage = await getStageNode(updated.stage_node_id);
    if (stage) stageName = stage.name ?? null;
  }

  return c.json({
    id: updated.id,
    profile_id: updated.profile_id,
    email: profile.email ?? "",
    display_name: profile.display_name ?? profile.name ?? null,
    role: updated.role,
    stage_node_id: updated.stage_node_id ?? null,
    stage_name: stageName,
    access: updated.access ?? "view",
  });
});
