/** Database operations for the LIAC platform layer. */

import { randomInt, randomUUID } from "node:crypto";

import { HttpError } from "./httpError";
import * as local from "./platformLocalStore";
import { StageNode } from "./permissions";
import { getSettings } from "./config";
import type { ProgramFeatures } from "./schemas";
import { requireClient } from "./supabaseClient";
import { dbEnabled } from "./db/client";
import * as pg from "./db/identityRepo";
import * as tpg from "./db/tenantRepo";

type Row = Record<string, any>;

/**
 * Postgres (Drizzle + RLS) is the canonical data path — v0.4. When DATABASE_URL
 * is set it takes priority over the legacy local-store / supabase-js paths.
 * Slice 4 routes the identity + org-lifecycle functions here; remaining tenant
 * CRUD is converted in Slice 5.
 */
function usePg(): boolean {
  return dbEnabled();
}

const _ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const STAGE_ORDER = ["international", "national", "state", "chapter"];
const _ROLE_ALIASES: Record<string, string> = { teacher: "instructor" };

export function normalizeRole(role: string | null | undefined): string | null | undefined {
  return role != null && role in _ROLE_ALIASES ? _ROLE_ALIASES[role] : role;
}

interface SupabaseError {
  message?: string;
  code?: string;
}

function _schemaMissing(err: SupabaseError): boolean {
  const msg = (err.message || String(err)).toLowerCase();
  return msg.includes("pgrst205") || (msg.includes("profiles") && msg.includes("schema"));
}

function _dbError(err: SupabaseError): HttpError {
  const msg = err.message || String(err);
  if (msg.includes("profiles") && msg.includes("schema cache")) {
    return new HttpError(
      503,
      "Database not migrated. Run backend/supabase/schema.sql then migration_platform.sql in Supabase SQL editor.",
    );
  }
  return new HttpError(503, `Database error: ${msg}`);
}

// Cached *promise* (not boolean) so concurrent first requests share one probe
// instead of racing two (Python caches a module-global after a serialized call).
let _localModeProbe: Promise<boolean> | null = null;

async function _probeLocalMode(): Promise<boolean> {
  if (!getSettings().supabaseEnabled) return true;
  let client;
  try {
    client = requireClient();
  } catch {
    return true;
  }
  try {
    const { error } = await client.from("profiles").select("id").limit(1);
    if (!error) return false;
    // PostgREST-level errors carry a code (Python's APIError); schema-missing
    // means "fall back to local", anything else is a real DB error.
    if (error.code) {
      if (_schemaMissing(error)) return true;
      throw _dbError(error);
    }
    // No code -> connection-level failure (Python's `except Exception`).
    return true;
  } catch (exc) {
    if (exc instanceof HttpError) throw exc;
    return true;
  }
}

/** Whether the platform layer runs on the local JSON store instead of Supabase. */
export function useLocal(): Promise<boolean> {
  if (_localModeProbe === null) {
    _localModeProbe = _probeLocalMode().catch((exc) => {
      // A real DB error must not be cached as the permanent answer.
      _localModeProbe = null;
      throw exc;
    });
  }
  return _localModeProbe;
}

/** Test hook: reset the cached probe (e.g. after flipping env). */
export function resetLocalModeCache(): void {
  _localModeProbe = null;
}

function _slugify(name: string): string {
  return local.slugify(name);
}

async function _uniqueSlug(base: string): Promise<string> {
  const client = requireClient();
  let slug = base;
  let n = 0;
  for (;;) {
    const { data, error } = await client
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .limit(1);
    if (error) throw _dbError(error);
    if (!data || data.length === 0) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

async function _makeCode(length = 8): Promise<string> {
  const client = requireClient();
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = "";
    for (let i = 0; i < length; i++) code += _ALPHABET[randomInt(_ALPHABET.length)];
    const { data, error } = await client.from("join_codes").select("id").eq("code", code).limit(1);
    if (error) throw _dbError(error);
    if (!data || data.length === 0) return code;
  }
  throw new HttpError(500, "Could not generate unique join code");
}

function _firstRow(data: Row[] | null | undefined, detail = "No row returned"): Row {
  const rows = data ?? [];
  if (rows.length === 0) throw new HttpError(500, detail);
  return rows[0];
}

/** Execute insert/upsert/update mutations that return .select() rows. */
async function _mutateOne(builder: PromiseLike<{ data: any; error: any }>, detail = "No row returned"): Promise<Row> {
  const { data, error } = await builder;
  if (error) throw _dbError(error);
  return _firstRow(data, detail);
}

/** Execute a select; errors map to the FastAPI-style 503 like Python's APIError path. */
async function _select(builder: PromiseLike<{ data: any; error: any }>): Promise<Row[]> {
  const { data, error } = await builder;
  if (error) throw _dbError(error);
  return data ?? [];
}

function _rowToStage(row: Row): StageNode {
  return {
    id: row.id,
    org_id: row.org_id,
    parent_id: row.parent_id ?? null,
    stage_type: row.stage_type,
    name: row.name,
    depth: row.depth ?? 0,
    path: row.path ?? "/",
    discord_url: row.discord_url ?? null,
    event_at: row.event_at ?? null,
    qualifier_status: row.qualifier_status ?? null,
    program_id: row.program_id ?? null,
  };
}

export async function createProfile(
  userId: string,
  email: string,
  role: string,
  displayName: string | null = null,
): Promise<Row> {
  if (usePg()) return pg.createProfile(userId, email, role, displayName);
  if (await useLocal()) return local.localCreateProfile(userId, email, role, displayName);
  const client = requireClient();
  const row = {
    id: userId,
    email,
    role,
    display_name: displayName || email.split("@")[0],
    name: displayName || email.split("@")[0],
  };
  return _mutateOne(client.from("profiles").upsert(row).select("*"), "Failed to create profile");
}

/**
 * Find-or-create the org-scoped profile for a person (by auth id) in an org, and
 * return its profile id. In local mode there's a single global profile per auth
 * user (profile id == auth id), so this reduces to createProfile.
 */
export async function ensureOrgProfile(
  authUserId: string,
  orgId: string,
  opts: { email?: string | null; role?: string; displayName?: string | null } = {},
): Promise<string> {
  if (usePg()) return pg.ensureOrgProfile(authUserId, orgId, opts);
  const p = await createProfile(authUserId, opts.email ?? "", opts.role ?? "student", opts.displayName ?? null);
  return p.id as string;
}

export async function createOrganization(name: string, ownerId: string): Promise<Row> {
  if (usePg()) return pg.createOrganization(name, ownerId);
  if (await useLocal()) return local.localCreateOrganization(name, ownerId);
  const client = requireClient();
  const slug = await _uniqueSlug(_slugify(name));
  const org = _firstRow(
    await _select(client.from("organizations").insert({ name, slug, owner_id: ownerId }).select("*")),
    "Failed to create organization",
  );
  await _select(
    client.from("org_memberships").insert({
      org_id: org.id,
      profile_id: ownerId,
      role: "owner",
      stage_node_id: null,
      access: "edit",
    }),
  );
  await _select(client.from("profiles").update({ role: "org_admin" }).eq("id", ownerId));
  return org;
}

export async function listAllOrganizations(): Promise<Row[]> {
  if (usePg()) return tpg.listAllOrganizations();
  if (await useLocal()) return local.localListAllOrganizations();
  const client = requireClient();
  return _select(client.from("organizations").select("*"));
}

// Names-only org directory (id/name/slug) for any authenticated caller.
export async function listOrgDirectory(): Promise<Row[]> {
  const map = (o: Row) => ({ id: o.id, name: o.name ?? null, slug: o.slug ?? null });
  if (usePg()) return tpg.listOrgDirectory();
  if (await useLocal()) return (await local.localListAllOrganizations()).map(map);
  const client = requireClient();
  return (await _select(client.from("organizations").select("id,name,slug"))).map(map);
}

export async function getOrganization(orgId: string): Promise<Row | null> {
  if (usePg()) return pg.getOrganization(orgId);
  if (await useLocal()) return local.localGetOrganization(orgId);
  const client = requireClient();
  const rows = await _select(client.from("organizations").select("*").eq("id", orgId).limit(1));
  return rows.length > 0 ? rows[0] : null;
}

export async function getOrganizationBySlug(slug: string): Promise<Row | null> {
  if (usePg()) return pg.getOrganizationBySlug(slug);
  if (await useLocal()) {
    return local.localListAllOrganizations().find((o) => o.slug === slug) ?? null;
  }
  const client = requireClient();
  const rows = await _select(client.from("organizations").select("*").eq("slug", slug).limit(1));
  return rows.length > 0 ? rows[0] : null;
}

export async function updateOrgTheme(
  orgId: string,
  accentColor: string | null | undefined,
  logoUrl: string | null | undefined,
): Promise<Row> {
  if (usePg()) return tpg.updateOrgTheme(orgId, accentColor, logoUrl);
  if (await useLocal()) return local.localUpdateOrgTheme(orgId, accentColor, logoUrl);
  const client = requireClient();
  const org = await getOrganization(orgId);
  if (!org) throw new HttpError(404, "Organization not found");
  const settings = { ...(org.settings ?? {}) };
  const theme = { ...(settings.theme ?? {}) };
  if (accentColor != null) theme.accent_color = accentColor;
  if (logoUrl != null) theme.logo_url = logoUrl;
  settings.theme = theme;
  return _mutateOne(
    client.from("organizations").update({ settings }).eq("id", orgId).select("*"),
    "Failed to update organization theme",
  );
}

// ── Capability envelope (§3.5 governance) — a Nexus operator's boundary
// controls over what an org may create: program categories, offering types,
// platform features. Stored in organizations.settings.capabilities.
function _mergeCapabilities(base: Row, patch: Row): Row {
  const merge = (a: Row, b: Row): Row => ({ ...a, ...b });
  return {
    programTypes: merge((tpg.DEFAULT_CAPABILITIES.programTypes as Row), merge((base.programTypes as Row) ?? {}, (patch.programTypes as Row) ?? {})),
    offeringTypes: merge((tpg.DEFAULT_CAPABILITIES.offeringTypes as Row), merge((base.offeringTypes as Row) ?? {}, (patch.offeringTypes as Row) ?? {})),
    features: merge((tpg.DEFAULT_CAPABILITIES.features as Row), merge((base.features as Row) ?? {}, (patch.features as Row) ?? {})),
  };
}

export async function getOrgCapabilities(orgId: string): Promise<Row> {
  if (usePg()) return tpg.getOrgCapabilities(orgId);
  const org = (await useLocal()) ? local.localGetOrganization(orgId) : await getOrganization(orgId);
  if (!org) throw new HttpError(404, "Organization not found");
  const settings = (org.settings as Row) ?? {};
  return _mergeCapabilities({}, (settings.capabilities as Row) ?? {});
}

export async function setOrgCapabilities(orgId: string, patch: Row): Promise<Row> {
  if (usePg()) return tpg.setOrgCapabilities(orgId, patch);
  const org = (await useLocal()) ? local.localGetOrganization(orgId) : await getOrganization(orgId);
  if (!org) throw new HttpError(404, "Organization not found");
  const settings: Row = { ...((org.settings as Row) ?? {}) };
  const merged = _mergeCapabilities({}, { ...((settings.capabilities as Row) ?? {}) });
  const next = _mergeCapabilities(merged, patch);
  settings.capabilities = next;
  if (await useLocal()) {
    local.localSetOrgSettings(orgId, settings);
  } else {
    const client = requireClient();
    await _mutateOne(
      client.from("organizations").update({ settings }).eq("id", orgId).select("*"),
      "Failed to update organization capabilities",
    );
  }
  return next;
}

export async function getJoinCode(code: string): Promise<Row | null> {
  if (usePg()) return pg.getJoinCode(code);
  if (await useLocal()) return local.localGetJoinCode(code);
  const client = requireClient();
  const rows = await _select(
    client
      .from("join_codes")
      .select("*, stage_nodes(name, stage_type), organizations(name), programs(name, category)")
      .eq("code", code.trim().toUpperCase())
      .eq("active", true)
      .limit(1),
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function createProgram(
  orgId: string,
  name: string,
  category: string,
  opts: local.CreateProgramOptions = {},
): Promise<Row> {
  if (usePg()) return tpg.createProgram(orgId, name, category, opts);
  if (await useLocal()) return local.localCreateProgram(orgId, name, category, opts);
  const client = requireClient();
  return _mutateOne(
    client
      .from("programs")
      .insert({
        org_id: orgId,
        name,
        category,
        description: opts.description ?? null,
        icon: opts.icon ?? null,
        instructor_label: opts.instructorLabel ?? null,
        learner_label: opts.learnerLabel ?? null,
      })
      .select("*"),
    "Failed to create program",
  );
}

// Platform settings + program branding (DB-backed; routes guard dbEnabled).
export async function getPlatformSetting(key: string): Promise<Row | null> {
  return tpg.getPlatformSetting(key);
}
export async function setPlatformSetting(key: string, value: Row): Promise<Row> {
  return tpg.setPlatformSetting(key, value);
}
export async function setProgramBranding(
  programId: string,
  branding: { accent?: string | null; logo?: string | null } | null,
): Promise<Row | null> {
  return tpg.setProgramBranding(programId, branding);
}

// Org-defined program categories (DB-backed; routes guard dbEnabled).
export async function listOrgCategories(orgId: string): Promise<string[]> {
  return tpg.listOrgCategories(orgId);
}
export async function addOrgCategory(orgId: string, name: string): Promise<string[]> {
  return tpg.addOrgCategory(orgId, name);
}
export async function removeOrgCategory(orgId: string, name: string): Promise<string[]> {
  return tpg.removeOrgCategory(orgId, name);
}
export async function renameOrgCategory(orgId: string, from: string, to: string): Promise<string[]> {
  return tpg.renameOrgCategory(orgId, from, to);
}

/** Per-program platform enablement — DB-backed only (route guards dbEnabled). */
export async function updateProgramFeatures(
  programId: string,
  features: ProgramFeatures,
): Promise<Row | null> {
  if (usePg()) return tpg.updateProgramFeatures(programId, features);
  if (await useLocal()) return local.localUpdateProgramFeatures(programId, features);
  const client = requireClient();
  const existing = await getProgram(programId);
  if (!existing) return null;
  const meta = { ...((existing.metadata_json as Row) ?? {}), features };
  return _mutateOne(
    client.from("programs").update({ metadata_json: meta }).eq("id", programId).select("*"),
    "Failed to update program features",
  );
}

async function _programCounts(orgId: string, programId: string): Promise<Row> {
  const client = requireClient();
  const stageRows = await _select(
    client.from("stage_nodes").select("id").eq("org_id", orgId).eq("program_id", programId),
  );
  const stageIds = stageRows.map((r) => r.id);

  const membershipRows = await _select(
    client.from("org_memberships").select("role").eq("program_id", programId),
  );
  const instructorCount = membershipRows.filter((r) => normalizeRole(r.role) === "instructor").length;

  let learnerCount = 0;
  let courseCount = 0;
  if (stageIds.length > 0) {
    const regRows = await _select(
      client.from("student_registrations").select("id").in("stage_node_id", stageIds),
    );
    learnerCount = regRows.length;
    const courseRows = await _select(client.from("courses").select("id").in("stage_node_id", stageIds));
    courseCount = courseRows.length;
  }

  return { course_count: courseCount, learner_count: learnerCount, instructor_count: instructorCount };
}

export async function listPrograms(orgId: string): Promise<Row[]> {
  if (usePg()) return tpg.listPrograms(orgId);
  if (await useLocal()) return local.localListPrograms(orgId);
  const client = requireClient();
  const rows = await _select(client.from("programs").select("*").eq("org_id", orgId));
  const result: Row[] = [];
  for (const r of rows) result.push({ ...r, ...(await _programCounts(orgId, r.id)) });
  return result;
}

export async function getProgram(programId: string): Promise<Row | null> {
  if (usePg()) return tpg.getProgram(programId);
  if (await useLocal()) return local.localGetProgram(programId);
  const client = requireClient();
  const rows = await _select(client.from("programs").select("*").eq("id", programId).limit(1));
  if (rows.length === 0) return null;
  const row = rows[0];
  return { ...row, ...(await _programCounts(row.org_id, row.id)) };
}

/**
 * Delete a program and its program-scoped rows. On Supabase we clear the
 * dependent tables first (in case FK cascade isn't configured), then the
 * program itself.
 */
export async function deleteProgram(programId: string): Promise<void> {
  if (usePg()) return tpg.deleteProgram(programId);
  if (await useLocal()) {
    local.localDeleteProgram(programId);
    return;
  }
  const client = requireClient();
  const offerings = await _select(client.from("offerings").select("id").eq("program_id", programId));
  const offeringIds = offerings.map((o) => o.id);
  if (offeringIds.length > 0) {
    await client.from("registrations").delete().in("offering_id", offeringIds);
    await client.from("participants").delete().in("offering_id", offeringIds);
  }
  for (const table of ["offerings", "registered_apps", "stage_nodes", "join_codes", "registrations", "participants", "org_memberships"]) {
    await client.from(table).delete().eq("program_id", programId);
  }
  await client.from("programs").delete().eq("id", programId);
}

/** Delete one offering and its dependent rows (apps, registrations, participants). */
export async function deleteOffering(offeringId: string): Promise<void> {
  if (usePg()) return tpg.deleteOffering(offeringId);
  if (await useLocal()) {
    local.localDeleteOffering(offeringId);
    return;
  }
  const client = requireClient();
  await client.from("registrations").delete().eq("offering_id", offeringId);
  await client.from("participants").delete().eq("offering_id", offeringId);
  await client.from("registered_apps").delete().eq("offering_id", offeringId);
  await client.from("offerings").delete().eq("id", offeringId);
}

export async function createProgramJoinCode(
  programId: string,
  kind: string,
  opts: local.JoinCodeOptions = {},
): Promise<Row> {
  if (usePg()) return tpg.createProgramJoinCode(programId, kind, opts);
  if (await useLocal()) return local.localCreateProgramJoinCode(programId, kind, opts);
  const client = requireClient();
  const program = _firstRow(
    await _select(client.from("programs").select("*").eq("id", programId).limit(1)),
    "Program not found",
  );
  const code = await _makeCode();
  return _mutateOne(
    client
      .from("join_codes")
      .insert({
        org_id: program.org_id,
        stage_node_id: null,
        program_id: programId,
        code,
        kind,
        delivery_method: opts.deliveryMethod ?? "join_code",
        email: opts.email ?? null,
        max_uses: opts.maxUses ?? null,
        uses_remaining: opts.maxUses ?? null,
        expires_at: opts.expiresAt ?? null,
        created_by_user_id: opts.createdByUserId ?? null,
      })
      .select("*"),
    "Failed to create join code",
  );
}

async function _insertStageTree(
  orgId: string,
  challengeId: string | null,
  nodes: Row[],
  parentId: string | null = null,
  parentPath = "/",
  depth = 0,
  programId: string | null = null,
): Promise<Row[]> {
  const client = requireClient();
  const created: Row[] = [];

  for (const nodeInput of nodes) {
    const stageId = randomUUID();
    const segment = `${nodeInput.stage_type}-${stageId.slice(0, 8)}`;
    const path = parentPath !== "/" ? `${parentPath}${segment}/` : `/${segment}/`;

    const row = {
      id: stageId,
      org_id: orgId,
      challenge_id: challengeId,
      parent_id: parentId,
      program_id: programId ?? nodeInput.program_id ?? null,
      stage_type: nodeInput.stage_type,
      name: nodeInput.name,
      depth,
      path,
      discord_url: nodeInput.discord_url ?? null,
      event_at: nodeInput.event_at ?? null,
    };
    const stageRow = await _mutateOne(
      client.from("stage_nodes").insert(row).select("*"),
      "Failed to create stage",
    );
    created.push(stageRow);

    const children: Row[] = nodeInput.children ?? [];
    if (children.length > 0) {
      created.push(
        ...(await _insertStageTree(orgId, challengeId, children, stageId, path, depth + 1, programId)),
      );
    }
  }

  return created;
}

export async function setupOrganization(orgId: string, payload: Row): Promise<Row> {
  if (usePg()) return tpg.setupOrganization(orgId, payload);
  if (await useLocal()) return local.localSetupOrganization(orgId, payload);
  const client = requireClient();

  const challenge = _firstRow(
    await _select(
      client
        .from("challenges")
        .upsert(
          {
            org_id: orgId,
            enabled: payload.has_challenge ?? false,
            name: payload.challenge_name ?? null,
          },
          { onConflict: "org_id" },
        )
        .select("*"),
    ),
    "Failed to save challenge",
  );
  const challengeId: string | null = payload.has_challenge ? challenge.id : null;

  if (payload.has_challenge) {
    const stageTypes: string[] = payload.stage_types ?? [];
    for (let i = 0; i < stageTypes.length; i++) {
      await _select(
        client.from("challenge_stage_config").upsert(
          {
            challenge_id: challengeId,
            stage_type: stageTypes[i],
            position: i,
            enabled: true,
          },
          { onConflict: "challenge_id,stage_type" },
        ),
      );
    }

    const initial: Row[] = payload.initial_stages ?? [];
    if (initial.length > 0) {
      const existing = await _select(
        client.from("stage_nodes").select("id").eq("org_id", orgId).limit(1),
      );
      if (existing.length === 0) {
        await _insertStageTree(orgId, challengeId, initial);
      }
    }
  }

  const defaults: Row = payload.permission_defaults ?? {};
  for (const [role, cfg] of Object.entries(defaults) as Array<[string, Row]>) {
    await _select(
      client.from("org_permission_defaults").upsert(
        {
          org_id: orgId,
          role,
          default_access: cfg.default_access ?? "view",
          per_level_overrides: cfg.per_level_overrides ?? {},
        },
        { onConflict: "org_id,role" },
      ),
    );
  }

  if (payload.discord_link) {
    const org = (await getOrganization(orgId)) ?? {};
    const settings = { ...(org.settings ?? {}) };
    settings.discord_link = payload.discord_link;
    await _select(client.from("organizations").update({ settings }).eq("id", orgId));
    await createIntegration(
      orgId,
      "discord",
      { server_url: payload.discord_link },
      payload.discord_permission_level || "per_level",
    );
  }

  for (const prog of (payload.programs ?? []) as Row[]) {
    const programRow = await createProgram(orgId, prog.name, prog.category, {
      description: prog.description,
      icon: prog.icon,
      instructorLabel: prog.instructor_label,
      learnerLabel: prog.learner_label,
    });
    // Program-scoped Groups: edu programs get a single-level admin root
    // (level picked per program); game programs get flat "classes", no hierarchy.
    if (prog.category === "edu") {
      const stageType = prog.stage_type || "national";
      await _insertStageTree(
        orgId,
        challengeId,
        [{ stage_type: stageType, name: prog.name }],
        null,
        "/",
        0,
        programRow.id,
      );
    } else {
      const classNames: string[] = prog.class_names ?? [];
      if (classNames.length > 0) {
        await _insertStageTree(
          orgId,
          null,
          classNames.map((cn) => ({ stage_type: "chapter", name: cn })),
          null,
          "/",
          0,
          programRow.id,
        );
      }
    }
  }

  return { org_id: orgId, challenge_id: challengeId };
}

export async function listStageNodes(orgId: string): Promise<StageNode[]> {
  if (usePg()) return tpg.listStageNodes(orgId) as unknown as Promise<StageNode[]>;
  if (await useLocal()) return local.localListStageNodes(orgId);
  const client = requireClient();
  const rows = await _select(
    client.from("stage_nodes").select("*").eq("org_id", orgId).order("depth").order("name"),
  );
  return rows.map(_rowToStage);
}

export function buildStageTree(stages: StageNode[]): Row[] {
  const byId = new Map<string, Row>(stages.map((s) => [s.id, { ...s, children: [] }]));
  const roots: Row[] = [];
  for (const s of stages) {
    const node = byId.get(s.id)!;
    if (s.parent_id && byId.has(s.parent_id)) {
      byId.get(s.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function createJoinCode(
  stageNodeId: string,
  kind: string,
  opts: local.JoinCodeOptions = {},
): Promise<Row> {
  if (usePg()) return tpg.createJoinCode(stageNodeId, kind, opts);
  if (await useLocal()) return local.localCreateJoinCode(stageNodeId, kind, opts);
  const client = requireClient();
  const stage = _firstRow(
    await _select(client.from("stage_nodes").select("*").eq("id", stageNodeId).limit(1)),
    "Stage not found",
  );
  const code = await _makeCode();
  return _mutateOne(
    client
      .from("join_codes")
      .insert({
        org_id: stage.org_id,
        stage_node_id: stageNodeId,
        code,
        kind,
        delivery_method: opts.deliveryMethod ?? "join_code",
        email: opts.email ?? null,
        max_uses: opts.maxUses ?? null,
        uses_remaining: opts.maxUses ?? null,
        expires_at: opts.expiresAt ?? null,
        created_by_user_id: opts.createdByUserId ?? null,
      })
      .select("*"),
    "Failed to create join code",
  );
}

/** Decrement uses_remaining for a code with a usage limit, if set. */
export async function consumeJoinCode(code: string): Promise<void> {
  if (usePg()) return pg.consumeJoinCode(code);
  if (await useLocal()) {
    local.localConsumeJoinCode(code);
    return;
  }
  const client = requireClient();
  const rows = await _select(
    client.from("join_codes").select("*").eq("code", code.trim().toUpperCase()).limit(1),
  );
  if (rows.length === 0 || rows[0].uses_remaining == null) return;
  const remaining = Math.max(0, rows[0].uses_remaining - 1);
  const update: Row = { uses_remaining: remaining };
  if (remaining === 0) update.active = false;
  await _select(client.from("join_codes").update(update).eq("id", rows[0].id));
}

export async function addMembership(
  orgId: string,
  profileId: string,
  role: string,
  stageNodeId: string | null,
  access: string,
  programId: string | null = null,
): Promise<Row> {
  if (usePg()) return pg.addMembership(orgId, profileId, role, stageNodeId, access, programId);
  if (await useLocal()) {
    return local.localAddMembership(orgId, profileId, role, stageNodeId, access, programId);
  }
  const client = requireClient();
  return _mutateOne(
    client
      .from("org_memberships")
      .insert({
        org_id: orgId,
        profile_id: profileId,
        role: normalizeRole(role),
        stage_node_id: stageNodeId,
        access,
        program_id: programId,
      })
      .select("*"),
    "Failed to add membership",
  );
}

/**
 * Best-effort: join-code student signups also get a Participant row when the
 * program has a resolvable offering, so offering-based admin views (registration
 * queue, participant counts) see them too. Non-fatal by design — most orgs won't
 * have offerings configured yet, and join-code registration must still succeed.
 */
async function _bridgeJoinCodeToParticipant(profileId: string, joinCodeRow: Row): Promise<void> {
  try {
    const programId = joinCodeRow.program_id;
    if (!programId) return;
    const offerings = await listOfferings(programId);
    if (offerings.length === 0) return;
    const offering =
      offerings.find((o) => o.offering_type === "course" || o.offering_type === "class") ??
      offerings[0];
    await createParticipant(joinCodeRow.org_id, offering.id, {
      programId,
      stageNodeId: joinCodeRow.stage_node_id ?? null,
      userId: profileId,
      participantType: "learner",
    });
  } catch {
    // non-fatal
  }
}

export async function registerStudent(
  profileId: string,
  joinCodeRow: Row,
  displayName: string | null = null,
): Promise<Row> {
  if (usePg()) return tpg.registerStudent(profileId, joinCodeRow, displayName);
  if (await useLocal()) {
    const result = local.localRegisterStudent(profileId, joinCodeRow, displayName);
    await _bridgeJoinCodeToParticipant(profileId, joinCodeRow);
    return result;
  }

  const client = requireClient();
  const orgId = joinCodeRow.org_id;
  const stageNodeId = joinCodeRow.stage_node_id;

  if (displayName) {
    await _select(
      client.from("profiles").update({ display_name: displayName, name: displayName }).eq("id", profileId),
    );
  }

  await _select(client.from("profiles").update({ role: "student" }).eq("id", profileId));

  const result = await _mutateOne(
    client
      .from("student_registrations")
      .upsert(
        {
          org_id: orgId,
          stage_node_id: stageNodeId,
          profile_id: profileId,
          join_code_id: joinCodeRow.id,
          current_stage_node_id: stageNodeId,
        },
        { onConflict: "profile_id,org_id" },
      )
      .select("*"),
    "Failed to register student",
  );
  if (joinCodeRow.code) await consumeJoinCode(joinCodeRow.code);
  await _bridgeJoinCodeToParticipant(profileId, joinCodeRow);
  return result;
}

export async function listStudentRegistrationsForStages(
  orgId: string,
  visibleStages: StageNode[],
): Promise<Row[]> {
  if (usePg()) return tpg.listStudentRegistrationsForStages(orgId, visibleStages);
  if (await useLocal()) return local.localListStudentRegistrations(orgId, visibleStages);
  const client = requireClient();
  const rows = await _select(
    client
      .from("student_registrations")
      .select("*, profiles(email, display_name, name), stage_nodes(name, path, stage_type)")
      .eq("org_id", orgId),
  );
  const visibleById = new Map(visibleStages.map((s) => [s.id, s]));

  const result: Row[] = [];
  for (const row of rows) {
    const stage = row.stage_nodes ?? {};
    const rowPath: string = stage.path ?? "/";
    const rowId = row.stage_node_id;
    if (rowId != null && visibleById.has(rowId)) {
      result.push(row);
      continue;
    }
    for (const s of visibleStages) {
      const normalized = s.path.endsWith("/") ? s.path : s.path + "/";
      if (rowPath === s.path || rowPath.startsWith(normalized)) {
        result.push(row);
        break;
      }
    }
  }
  return result;
}

export async function listMembers(orgId: string): Promise<Row[]> {
  if (usePg()) return tpg.listMembers(orgId);
  if (await useLocal()) return local.localListMembers(orgId);
  const client = requireClient();
  return _select(
    client
      .from("org_memberships")
      .select("*, profiles(email, display_name, name), stage_nodes(name, stage_type)")
      .eq("org_id", orgId),
  );
}

export async function getUserOrgs(profileId: string): Promise<Row[]> {
  if (usePg()) return tpg.getUserOrgs(profileId);
  if (await useLocal()) return local.localGetUserOrgs(profileId);
  const client = requireClient();
  return _select(
    client
      .from("org_memberships")
      .select("*, organizations(id, name, slug)")
      .eq("profile_id", profileId),
  );
}

export async function getOrgChallenge(orgId: string): Promise<Row | null> {
  if (usePg()) return tpg.getOrgChallenge(orgId);
  if (await useLocal()) return local.localGetOrgChallenge(orgId);
  const client = requireClient();
  const org = await getOrganization(orgId);
  if (!org) return null;
  const challenges = await _select(client.from("challenges").select("*").eq("org_id", orgId).limit(1));
  if (challenges.length === 0) {
    return { org_id: orgId, org_name: org.name, enabled: false, stage_types: [] };
  }

  const challenge = challenges[0];
  const cfgRows = await _select(
    client
      .from("challenge_stage_config")
      .select("stage_type")
      .eq("challenge_id", challenge.id)
      .eq("enabled", true)
      .order("position"),
  );
  return {
    org_id: orgId,
    org_name: org.name,
    enabled: challenge.enabled ?? false,
    name: challenge.name ?? null,
    stage_types: cfgRows.map((r) => r.stage_type),
  };
}

export async function updateMemberAccess(memberId: string, access: string): Promise<Row> {
  if (usePg()) return tpg.updateMemberAccess(memberId, access);
  if (await useLocal()) return local.localUpdateMemberAccess(memberId, access);
  const client = requireClient();
  return _mutateOne(
    client.from("org_memberships").update({ access }).eq("id", memberId).select("*"),
    "Member not found",
  );
}

/** Remove a membership. PG mode only in practice (Slice-11-era feature). */
export async function deleteMembership(memberId: string): Promise<boolean> {
  if (usePg()) return tpg.deleteMembership(memberId);
  if (await useLocal()) throw new HttpError(501, "This feature requires the database backend");
  const client = requireClient();
  await _mutateOne(
    client.from("org_memberships").delete().eq("id", memberId).select("*"),
    "Member not found",
  );
  return true;
}

export async function getStageNode(stageId: string): Promise<Row | null> {
  if (usePg()) return tpg.getStageNode(stageId);
  if (await useLocal()) return local.localGetStage(stageId);
  const client = requireClient();
  const rows = await _select(
    client.from("stage_nodes").select("*, organizations(name)").eq("id", stageId).limit(1),
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function getProfileByEmail(email: string): Promise<Row | null> {
  if (usePg()) return pg.getProfileByEmail(email);
  if (await useLocal()) return local.localGetProfileByEmail(email);
  const client = requireClient();
  const rows = await _select(client.from("profiles").select("*").eq("email", email).limit(1));
  return rows.length > 0 ? rows[0] : null;
}

export async function getMembership(memberId: string): Promise<Row | null> {
  if (usePg()) return tpg.getMembership(memberId);
  if (await useLocal()) return local.localGetMembership(memberId);
  const client = requireClient();
  const rows = await _select(client.from("org_memberships").select("*").eq("id", memberId).limit(1));
  return rows.length > 0 ? rows[0] : null;
}

export async function getProfile(profileId: string): Promise<Row | null> {
  if (usePg()) return pg.getProfile(profileId);
  if (await useLocal()) return local.localGetProfile(profileId);
  const client = requireClient();
  const rows = await _select(client.from("profiles").select("*").eq("id", profileId).limit(1));
  return rows.length > 0 ? rows[0] : null;
}

export async function addStageNodes(
  orgId: string,
  nodes: Row[],
  parentId: string | null = null,
  programId: string | null = null,
): Promise<Row[]> {
  if (usePg()) return tpg.addStageNodes(orgId, nodes, parentId, programId);
  if (await useLocal()) return local.localAddStageNodes(orgId, nodes, parentId, programId);
  const client = requireClient();
  const challenges = await _select(client.from("challenges").select("id").eq("org_id", orgId).limit(1));
  const challengeId = challenges.length > 0 ? challenges[0].id : null;

  let parentPath = "/";
  let depth = 0;
  if (parentId) {
    const parent = _firstRow(
      await _select(client.from("stage_nodes").select("*").eq("id", parentId).limit(1)),
      "Parent stage not found",
    );
    parentPath = parent.path;
    depth = (parent.depth ?? 0) + 1;
    programId = programId ?? parent.program_id ?? null;
  }

  return _insertStageTree(orgId, challengeId, nodes, parentId, parentPath, depth, programId);
}

// ── Integration entity (generic — not hardcoded to Discord) ─────────────────
export async function createIntegration(
  orgId: string,
  integrationType: string,
  config: Row,
  permissionLevel: string,
  programId: string | null = null,
): Promise<Row> {
  if (usePg()) return tpg.createIntegration(orgId, integrationType, config, permissionLevel, programId);
  if (await useLocal()) {
    return local.localCreateIntegration(orgId, integrationType, config, permissionLevel, programId);
  }
  const client = requireClient();
  return _mutateOne(
    client
      .from("integrations")
      .insert({
        organization_id: orgId,
        program_id: programId,
        integration_type: integrationType,
        config,
        permission_level: permissionLevel,
      })
      .select("*"),
    "Failed to create integration",
  );
}

export async function listIntegrations(orgId: string): Promise<Row[]> {
  if (usePg()) return tpg.listIntegrations(orgId);
  if (await useLocal()) return local.localListIntegrations(orgId);
  const client = requireClient();
  return _select(client.from("integrations").select("*").eq("organization_id", orgId));
}

// ── Offerings, Registered Apps, and the Signup Hook (Nexus v0.3) ────────────
const _DEFAULT_SIGNUP_FIELDS: Row[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "age", label: "Age", type: "number", required: false },
  { key: "email", label: "Email", type: "email", required: true },
];

export function hashApiKey(raw: string): string {
  return local.hashApiKey(raw);
}

async function _offeringCounts(offeringId: string): Promise<Row> {
  const client = requireClient();
  const regs = await _select(
    client.from("registrations").select("status").eq("offering_id", offeringId),
  );
  const participants = await _select(
    client.from("participants").select("id").eq("offering_id", offeringId),
  );
  return {
    registration_count: regs.length,
    pending_count: regs.filter((r) => r.status === "pending_review").length,
    participant_count: participants.length,
  };
}

async function _uniqueScopedSlug(
  table: string,
  scopeCol: string,
  scopeId: string,
  slugCol: string,
  base: string,
): Promise<string> {
  const client = requireClient();
  let slug = base;
  let n = 0;
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select("id")
      .eq(scopeCol, scopeId)
      .eq(slugCol, slug)
      .limit(1);
    if (error) throw _dbError(error);
    if (!data || data.length === 0) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export async function createOffering(
  orgId: string,
  programId: string,
  name: string,
  offeringType: string,
  opts: local.OfferingOptions = {},
): Promise<Row> {
  if (usePg()) return tpg.createOffering(orgId, programId, name, offeringType, opts);
  if (await useLocal()) return local.localCreateOffering(orgId, programId, name, offeringType, opts);
  const finalSlug = await _uniqueScopedSlug(
    "offerings",
    "program_id",
    programId,
    "slug",
    opts.slug || _slugify(name),
  );
  const client = requireClient();
  const row = await _mutateOne(
    client
      .from("offerings")
      .insert({
        organization_id: orgId,
        program_id: programId,
        stage_node_id: opts.stageNodeId ?? null,
        name,
        slug: finalSlug,
        offering_type: offeringType,
        description: opts.description ?? null,
        start_date: opts.startDate ?? null,
        end_date: opts.endDate ?? null,
        registration_open: opts.registrationOpen ?? false,
        approval_mode: opts.approvalMode ?? "manual_approve",
        signup_fields: opts.signupFields != null ? opts.signupFields : _DEFAULT_SIGNUP_FIELDS,
        platform_module: opts.platformModule ?? "nexus_only",
        registered_app_id: opts.registeredAppId ?? null,
        external_runtime_url: opts.externalRuntimeUrl ?? null,
        participant_label_singular: opts.participantLabelSingular ?? null,
        participant_label_plural: opts.participantLabelPlural ?? null,
        metadata: opts.metadata ?? {},
      })
      .select("*"),
    "Failed to create offering",
  );
  return { ...row, ...(await _offeringCounts(row.id)) };
}

export async function listOfferings(programId: string): Promise<Row[]> {
  if (usePg()) return tpg.listOfferings(programId);
  if (await useLocal()) return local.localListOfferings(programId);
  const client = requireClient();
  const rows = await _select(client.from("offerings").select("*").eq("program_id", programId));
  const result: Row[] = [];
  for (const r of rows) result.push({ ...r, ...(await _offeringCounts(r.id)) });
  return result;
}

export async function getOffering(offeringId: string): Promise<Row | null> {
  if (usePg()) return tpg.getOffering(offeringId);
  if (await useLocal()) return local.localGetOffering(offeringId);
  const client = requireClient();
  const rows = await _select(client.from("offerings").select("*").eq("id", offeringId).limit(1));
  if (rows.length === 0) return null;
  return { ...rows[0], ...(await _offeringCounts(offeringId)) };
}

export async function updateOffering(offeringId: string, patch: Row): Promise<Row> {
  if (usePg()) return tpg.updateOffering(offeringId, patch);
  if (await useLocal()) return local.localUpdateOffering(offeringId, patch);
  const client = requireClient();
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null));
  const row = await _mutateOne(
    client.from("offerings").update(clean).eq("id", offeringId).select("*"),
    "Offering not found",
  );
  return { ...row, ...(await _offeringCounts(offeringId)) };
}

export function setOfferingStatus(offeringId: string, status: string): Promise<Row> {
  return updateOffering(offeringId, { status });
}

export async function createRegisteredApp(
  orgId: string,
  programId: string | null,
  appName: string,
  opts: local.RegisteredAppOptions = {},
): Promise<[Row, string]> {
  if (usePg()) return tpg.createRegisteredApp(orgId, programId, appName, opts);
  if (await useLocal()) return local.localCreateRegisteredApp(orgId, programId, appName, opts);
  const finalSlug = await _uniqueScopedSlug(
    "registered_apps",
    "organization_id",
    orgId,
    "app_slug",
    opts.appSlug || _slugify(appName),
  );
  const [rawKey, keyHash, keyPrefix] = local.generateApiKey();
  const client = requireClient();
  const row = await _mutateOne(
    client
      .from("registered_apps")
      .insert({
        organization_id: orgId,
        program_id: programId,
        offering_id: opts.offeringId ?? null,
        app_name: appName,
        app_slug: finalSlug,
        api_key_hash: keyHash,
        key_prefix: keyPrefix,
        allowed_identifiers: opts.allowedIdentifiers ?? "email",
        launch_url: opts.launchUrl ?? null,
        launch_context: opts.launchContext ?? {},
      })
      .select("*"),
    "Failed to register app",
  );
  return [row, rawKey];
}

export async function listRegisteredApps(programId: string): Promise<Row[]> {
  if (usePg()) return tpg.listRegisteredApps(programId);
  if (await useLocal()) return local.localListRegisteredApps(programId);
  const client = requireClient();
  return _select(client.from("registered_apps").select("*").eq("program_id", programId));
}

export async function getRegisteredApp(appId: string): Promise<Row | null> {
  if (usePg()) return tpg.getRegisteredApp(appId);
  if (await useLocal()) return local.localGetRegisteredApp(appId);
  const client = requireClient();
  const rows = await _select(client.from("registered_apps").select("*").eq("id", appId).limit(1));
  return rows.length > 0 ? rows[0] : null;
}

export async function getRegisteredAppByHash(apiKeyHash: string): Promise<Row | null> {
  if (usePg()) return tpg.getRegisteredAppByHash(apiKeyHash);
  if (await useLocal()) return local.localGetRegisteredAppByHash(apiKeyHash);
  const client = requireClient();
  const rows = await _select(
    client.from("registered_apps").select("*").eq("api_key_hash", apiKeyHash).limit(1),
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function updateRegisteredApp(appId: string, patch: Row): Promise<Row> {
  if (usePg()) return tpg.updateRegisteredApp(appId, patch);
  if (await useLocal()) return local.localUpdateRegisteredApp(appId, patch);
  const client = requireClient();
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null));
  return _mutateOne(
    client.from("registered_apps").update(clean).eq("id", appId).select("*"),
    "Registered app not found",
  );
}

export async function rotateAppApiKey(appId: string): Promise<[Row, string]> {
  if (usePg()) return tpg.rotateAppApiKey(appId);
  if (await useLocal()) return local.localRotateAppApiKey(appId);
  const [rawKey, keyHash, keyPrefix] = local.generateApiKey();
  const client = requireClient();
  const row = await _mutateOne(
    client
      .from("registered_apps")
      .update({ api_key_hash: keyHash, key_prefix: keyPrefix })
      .eq("id", appId)
      .select("*"),
    "Registered app not found",
  );
  return [row, rawKey];
}

export async function revokeApp(appId: string): Promise<Row> {
  if (usePg()) return tpg.revokeApp(appId);
  if (await useLocal()) return local.localRevokeApp(appId);
  const client = requireClient();
  return _mutateOne(
    client
      .from("registered_apps")
      .update({ status: "revoked", api_key_hash: null })
      .eq("id", appId)
      .select("*"),
    "Registered app not found",
  );
}

export async function createRegistration(
  orgId: string,
  offeringId: string,
  opts: local.RegistrationOptions = {},
): Promise<Row> {
  if (usePg()) return tpg.createRegistration(orgId, offeringId, opts);
  if (await useLocal()) return local.localCreateRegistration(orgId, offeringId, opts);
  const client = requireClient();
  return _mutateOne(
    client
      .from("registrations")
      .insert({
        organization_id: orgId,
        program_id: opts.programId ?? null,
        offering_id: offeringId,
        stage_node_id: opts.stageNodeId ?? null,
        registered_app_id: opts.registeredAppId ?? null,
        registration_source: opts.registrationSource ?? "app_hook",
        email: opts.email ?? null,
        phone: opts.phone ?? null,
        name: opts.name ?? null,
        age: opts.age ?? null,
        user_id: opts.userId ?? null,
        status: opts.status ?? "pending_review",
        field_data: opts.fieldData ?? {},
        created_by_user_id: opts.createdByUserId ?? null,
      })
      .select("*"),
    "Failed to create registration",
  );
}

export async function getRegistration(registrationId: string): Promise<Row | null> {
  if (usePg()) return tpg.getRegistration(registrationId);
  if (await useLocal()) return local.localGetRegistration(registrationId);
  const client = requireClient();
  const rows = await _select(
    client.from("registrations").select("*").eq("id", registrationId).limit(1),
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function listRegistrations(
  offeringId: string,
  status: string | null = null,
): Promise<Row[]> {
  if (usePg()) return tpg.listRegistrations(offeringId, status);
  if (await useLocal()) return local.localListRegistrations(offeringId, status);
  const client = requireClient();
  let query = client.from("registrations").select("*").eq("offering_id", offeringId);
  if (status) query = query.eq("status", status);
  return _select(query.order("created_at", { ascending: false }));
}

export async function setRegistrationStatus(
  registrationId: string,
  status: string,
  reviewedByUserId: string | null,
): Promise<Row> {
  if (usePg()) return tpg.setRegistrationStatus(registrationId, status, reviewedByUserId);
  if (await useLocal()) {
    return local.localSetRegistrationStatus(registrationId, status, reviewedByUserId);
  }
  const client = requireClient();
  return _mutateOne(
    client
      .from("registrations")
      .update({
        status,
        reviewed_by_user_id: reviewedByUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", registrationId)
      .select("*"),
    "Registration not found",
  );
}

export async function createParticipant(
  orgId: string,
  offeringId: string,
  opts: local.ParticipantOptions = {},
): Promise<Row> {
  if (usePg()) return tpg.createParticipant(orgId, offeringId, opts);
  if (await useLocal()) return local.localCreateParticipant(orgId, offeringId, opts);
  const client = requireClient();
  const participantType = opts.participantType ?? "learner";
  if (opts.userId) {
    const existing = await _select(
      client
        .from("participants")
        .select("*")
        .eq("offering_id", offeringId)
        .eq("user_id", opts.userId)
        .eq("participant_type", participantType)
        .limit(1),
    );
    if (existing.length > 0) return existing[0];
  }
  return _mutateOne(
    client
      .from("participants")
      .insert({
        organization_id: orgId,
        program_id: opts.programId ?? null,
        offering_id: offeringId,
        stage_node_id: opts.stageNodeId ?? null,
        user_id: opts.userId ?? null,
        participant_type: participantType,
        status: opts.status ?? "active",
        added_by_user_id: opts.addedByUserId ?? null,
        registration_id: opts.registrationId ?? null,
        metadata: opts.metadata ?? {},
      })
      .select("*"),
    "Failed to create participant",
  );
}

export async function listParticipants(
  offeringId: string,
  status: string | null = null,
): Promise<Row[]> {
  if (usePg()) return tpg.listParticipants(offeringId, status);
  if (await useLocal()) return local.localListParticipants(offeringId, status);
  const client = requireClient();
  let query = client.from("participants").select("*").eq("offering_id", offeringId);
  if (status) query = query.eq("status", status);
  return _select(query);
}

/** Mark a registration approved and create (or reuse) its participant record. */
export async function approveRegistration(
  registrationId: string,
  reviewerId: string | null,
): Promise<Row> {
  let registration = await getRegistration(registrationId);
  if (!registration) throw new HttpError(404, "Registration not found");
  registration = await setRegistrationStatus(registrationId, "approved", reviewerId);
  const participant = await createParticipant(
    registration.organization_id,
    registration.offering_id,
    {
      programId: registration.program_id ?? null,
      stageNodeId: registration.stage_node_id ?? null,
      userId: registration.user_id ?? null,
      participantType: "learner",
      addedByUserId: reviewerId,
      registrationId: registration.id,
    },
  );
  return { registration, participant };
}

export async function rejectRegistration(
  registrationId: string,
  reviewerId: string | null,
): Promise<Row> {
  const registration = await getRegistration(registrationId);
  if (!registration) throw new HttpError(404, "Registration not found");
  return setRegistrationStatus(registrationId, "rejected", reviewerId);
}

// ── Audit events: who did what, when (append-only) ──────────────────────────
/** Best-effort, never raises — an audit failure must not fail the action. */
export async function recordAuditEvent(
  action: string,
  opts: local.AuditEventOptions = {},
): Promise<void> {
  try {
    if (usePg()) return await pg.recordAuditEvent(action, opts);
    if (await useLocal()) {
      local.localRecordAuditEvent(action, opts);
      return;
    }
    const client = requireClient();
    await client.from("audit_events").insert({
      organization_id: opts.orgId ?? null,
      actor_user_id: opts.actorUserId ?? null,
      action,
      scope_type: opts.scopeType ?? null,
      scope_id: opts.scopeId ?? null,
      target_type: opts.targetType ?? null,
      target_id: opts.targetId ?? null,
      metadata: opts.metadata ?? {},
    });
  } catch {
    // best-effort by design
  }
}

export async function listAuditEvents(orgId: string, limit = 50): Promise<Row[]> {
  if (usePg()) return tpg.listAuditEvents(orgId, limit);
  if (await useLocal()) return local.localListAuditEvents(orgId, limit);
  const client = requireClient();
  return _select(
    client
      .from("audit_events")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit),
  );
}

/** Platform operator: every audit event across every org (PG mode only). */
export async function listAllAuditEvents(limit = 100): Promise<Row[]> {
  if (usePg()) return tpg.listAllAuditEvents(limit);
  if (await useLocal()) return local.localListAllAuditEvents(limit);
  const client = requireClient();
  return _select(client.from("audit_events").select("*").order("created_at", { ascending: false }).limit(limit));
}

// ── Entitlements: module access grants for orgs/programs/offerings ──────────
export async function listEntitlements(orgId: string): Promise<Row[]> {
  if (usePg()) return tpg.listEntitlements(orgId);
  if (await useLocal()) return local.localListEntitlements(orgId);
  const client = requireClient();
  return _select(client.from("entitlements").select("*").eq("organization_id", orgId));
}

export async function setEntitlement(
  orgId: string,
  module: string,
  status: string,
  opts: local.EntitlementOptions = {},
): Promise<Row> {
  if (usePg()) return tpg.setEntitlement(orgId, module, status, opts);
  if (await useLocal()) return local.localSetEntitlement(orgId, module, status, opts);
  const client = requireClient();
  const row: Row = {
    organization_id: orgId,
    subject_type: opts.subjectType ?? "organization",
    subject_id: opts.subjectId || orgId,
    module,
    status,
  };
  if (opts.limits != null) row.limits = opts.limits;
  return _mutateOne(
    client.from("entitlements").upsert(row, { onConflict: "subject_type,subject_id,module" }).select("*"),
    "Failed to set entitlement",
  );
}

/**
 * Seed org-level grants for every module if the org has none yet. Keeps
 * pre-entitlement orgs working: modules default to enabled, admins opt out.
 */
export async function ensureDefaultEntitlements(orgId: string): Promise<Row[]> {
  const existing = await listEntitlements(orgId);
  if (existing.length > 0) return existing;
  for (const module of ["nexus", "learning", "coaching", "analytics"]) {
    await setEntitlement(orgId, module, "active");
  }
  return listEntitlements(orgId);
}

/**
 * Org-level module gate. An org with no entitlement rows at all is treated
 * as unconfigured → permissive (legacy orgs keep working); once any rows
 * exist, the module needs an active/trial org-level grant.
 */
export async function checkModuleAccess(orgId: string, module: string | null): Promise<boolean> {
  if (module == null || module === "" || module === "nexus" || module === "nexus_only" || module === "mixed") {
    return true;
  }
  // Bridge is a coaching mode, not a module (Decision 7).
  if (module === "bridge") module = "coaching";
  const rows = await listEntitlements(orgId);
  if (rows.length === 0) return true;
  for (const r of rows) {
    if (
      r.subject_type === "organization" &&
      r.module === module &&
      (r.status === "active" || r.status === "trial")
    ) {
      return true;
    }
  }
  return false;
}

export async function createLaunchToken(
  registeredAppId: string,
  userId: string,
  ttlSeconds = 60,
): Promise<[Row, string]> {
  if (usePg()) return tpg.createLaunchToken(registeredAppId, userId, ttlSeconds);
  if (await useLocal()) return local.localCreateLaunchToken(registeredAppId, userId, ttlSeconds);
  const [rawKey, keyHash] = local.generateApiKey();
  const client = requireClient();
  const row = await _mutateOne(
    client
      .from("app_launch_tokens")
      .insert({
        token_hash: keyHash,
        registered_app_id: registeredAppId,
        user_id: userId,
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      })
      .select("*"),
    "Failed to create launch token",
  );
  return [row, rawKey];
}

export async function consumeLaunchToken(rawToken: string): Promise<Row | null> {
  if (usePg()) return tpg.consumeLaunchToken(rawToken);
  if (await useLocal()) return local.localConsumeLaunchToken(rawToken);
  const client = requireClient();
  const tokenHash = local.hashApiKey(rawToken);
  const rows = await _select(
    client.from("app_launch_tokens").select("*").eq("token_hash", tokenHash).limit(1),
  );
  if (rows.length === 0 || rows[0].used_at) return null;
  const row = rows[0];
  const expiresAt = row.expires_at;
  if (expiresAt && new Date(expiresAt) < new Date()) return null;
  return _mutateOne(
    client
      .from("app_launch_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id)
      .select("*"),
    "Failed to consume launch token",
  );
}
