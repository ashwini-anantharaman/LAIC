/** Database operations for the LIAC platform layer. */

import { randomInt, randomUUID } from "node:crypto";

import { HttpError } from "./httpError";
import type { StageNode } from "./permissions";
import * as local from "./platformLocalStore";
import { requireClient } from "./supabaseClient";

const _ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const STAGE_ORDER = ["international", "national", "state", "chapter"];

type Row = Record<string, any>;

let _localMode: boolean | null = null;

function _schemaMissing(exc: any): boolean {
  const msg = (exc.message ?? String(exc)).toLowerCase();
  return (
    exc.code === "PGRST205" ||
    msg.includes("pgrst205") ||
    (msg.includes("profiles") && msg.includes("schema"))
  );
}

function _dbError(exc: any): HttpError {
  const msg = exc.message ?? String(exc);
  if (msg.includes("profiles") && msg.includes("schema cache")) {
    return new HttpError(
      503,
      "Database not migrated. Run backend/supabase/schema.sql then migration_platform.sql in Supabase SQL editor.",
    );
  }
  return new HttpError(503, `Database error: ${msg}`);
}

export async function useLocal(): Promise<boolean> {
  if (_localMode !== null) return _localMode;
  let res;
  try {
    res = await requireClient().from("profiles").select("id").limit(1);
  } catch {
    // Network / client construction failure -> fall back to local storage.
    _localMode = true;
    return true;
  }
  if (res.error) {
    if (_schemaMissing(res.error)) {
      _localMode = true;
      return true;
    }
    throw _dbError(res.error);
  }
  _localMode = false;
  return false;
}

function _slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "org";
}

async function _uniqueSlug(base: string): Promise<string> {
  const client = requireClient();
  let slug = base;
  let n = 0;
  for (;;) {
    const { data } = await client.from("organizations").select("id").eq("slug", slug).limit(1);
    if (!data || data.length === 0) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

async function _makeCode(length = 8): Promise<string> {
  const client = requireClient();
  for (let i = 0; i < 10; i++) {
    let code = "";
    for (let j = 0; j < length; j++) code += _ALPHABET[randomInt(_ALPHABET.length)];
    const { data } = await client.from("join_codes").select("id").eq("code", code).limit(1);
    if (!data || data.length === 0) return code;
  }
  throw new HttpError(500, "Could not generate unique join code");
}

function _firstRow(data: Row[] | null | undefined, detail = "No row returned"): Row {
  const rows = data ?? [];
  if (rows.length === 0) throw new HttpError(500, detail);
  return rows[0];
}

/** Await an insert/upsert/update chained with .select(), returning the first row. */
async function _mutateOne(
  query: PromiseLike<{ data: Row[] | null; error: any }>,
  detail = "No row returned",
): Promise<Row> {
  const { data, error } = await query;
  if (error) throw _dbError(error);
  return _firstRow(data, detail);
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
  };
}

export async function createProfile(
  userId: string,
  email: string,
  role: string,
  displayName?: string | null,
): Promise<Row> {
  if (await useLocal()) return local.localCreateProfile(userId, email, role, displayName);
  const client = requireClient();
  const row = {
    id: userId,
    email,
    role,
    display_name: displayName || email.split("@")[0],
    name: displayName || email.split("@")[0],
  };
  const { data, error } = await client.from("profiles").upsert(row).select("*");
  if (error) throw _dbError(error);
  return _firstRow(data, "Failed to create profile");
}

export async function createOrganization(name: string, ownerId: string): Promise<Row> {
  if (await useLocal()) return local.localCreateOrganization(name, ownerId);
  const client = requireClient();
  const slug = await _uniqueSlug(_slugify(name));
  const { data, error } = await client
    .from("organizations")
    .insert({ name, slug, owner_id: ownerId })
    .select("*");
  if (error) throw _dbError(error);
  const org = _firstRow(data, "Failed to create organization");
  await client
    .from("org_memberships")
    .insert({ org_id: org.id, profile_id: ownerId, role: "owner", stage_node_id: null, access: "edit" });
  await client.from("profiles").update({ role: "org_admin" }).eq("id", ownerId);
  return org;
}

export async function getOrganization(orgId: string): Promise<Row | null> {
  if (await useLocal()) return local.localGetOrganization(orgId);
  const client = requireClient();
  const { data } = await client.from("organizations").select("*").eq("id", orgId).limit(1);
  return data && data.length ? data[0] : null;
}

export async function getJoinCode(code: string): Promise<Row | null> {
  if (await useLocal()) return local.localGetJoinCode(code);
  const client = requireClient();
  const { data } = await client
    .from("join_codes")
    .select("*, stage_nodes(name, stage_type), organizations(name)")
    .eq("code", code.trim().toUpperCase())
    .eq("active", true)
    .limit(1);
  return data && data.length ? data[0] : null;
}

async function _insertStageTree(
  orgId: string,
  challengeId: string | null,
  nodes: Row[],
  parentId: string | null = null,
  parentPath = "/",
  depth = 0,
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
    if (children.length) {
      created.push(
        ...(await _insertStageTree(orgId, challengeId, children, stageId, path, depth + 1)),
      );
    }
  }

  return created;
}

export async function setupOrganization(orgId: string, payload: Row): Promise<Row> {
  if (await useLocal()) return local.localSetupOrganization(orgId, payload);
  const client = requireClient();

  const { data: challengeData } = await client
    .from("challenges")
    .upsert(
      { org_id: orgId, enabled: payload.has_challenge ?? false, name: payload.challenge_name ?? null },
      { onConflict: "org_id" },
    )
    .select("*");
  const challenge = _firstRow(challengeData, "Failed to save challenge");
  const challengeId = payload.has_challenge ? challenge.id : null;

  if (payload.has_challenge) {
    const stageTypes: string[] = payload.stage_types ?? [];
    for (let i = 0; i < stageTypes.length; i++) {
      await client
        .from("challenge_stage_config")
        .upsert(
          { challenge_id: challengeId, stage_type: stageTypes[i], position: i, enabled: true },
          { onConflict: "challenge_id,stage_type" },
        );
    }

    const initial: Row[] = payload.initial_stages ?? [];
    if (initial.length) {
      const { data: existing } = await client
        .from("stage_nodes")
        .select("id")
        .eq("org_id", orgId)
        .limit(1);
      if (!existing || existing.length === 0) {
        await _insertStageTree(orgId, challengeId, initial);
      }
    }
  }

  const defaults: Record<string, Row> = payload.permission_defaults ?? {};
  for (const [role, cfg] of Object.entries(defaults)) {
    await client.from("org_permission_defaults").upsert(
      {
        org_id: orgId,
        role,
        default_access: cfg.default_access ?? "view",
        per_level_overrides: cfg.per_level_overrides ?? {},
      },
      { onConflict: "org_id,role" },
    );
  }

  if (payload.discord_link) {
    await client
      .from("organizations")
      .update({ settings: { discord_link: payload.discord_link } })
      .eq("id", orgId);
  }

  return { org_id: orgId, challenge_id: challengeId };
}

export async function listStageNodes(orgId: string): Promise<StageNode[]> {
  if (await useLocal()) return local.localListStageNodes(orgId);
  const client = requireClient();
  const { data } = await client
    .from("stage_nodes")
    .select("*")
    .eq("org_id", orgId)
    .order("depth")
    .order("name");
  return (data ?? []).map(_rowToStage);
}

export function buildStageTree(stages: StageNode[]): Row[] {
  const byId = new Map<string, Row>(stages.map((s) => [s.id, { ...s, children: [] as Row[] }]));
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

export async function createJoinCode(stageNodeId: string, kind: string): Promise<Row> {
  if (await useLocal()) return local.localCreateJoinCode(stageNodeId, kind);
  const client = requireClient();
  const { data: stageData } = await client
    .from("stage_nodes")
    .select("*")
    .eq("id", stageNodeId)
    .limit(1);
  const stage = _firstRow(stageData, "Stage not found");
  const code = await _makeCode();
  return _mutateOne(
    client
      .from("join_codes")
      .insert({ org_id: stage.org_id, stage_node_id: stageNodeId, code, kind })
      .select("*"),
    "Failed to create join code",
  );
}

export async function addMembership(
  orgId: string,
  profileId: string,
  role: string,
  stageNodeId: string | null,
  access: string,
): Promise<Row> {
  if (await useLocal()) return local.localAddMembership(orgId, profileId, role, stageNodeId, access);
  const client = requireClient();
  return _mutateOne(
    client
      .from("org_memberships")
      .insert({ org_id: orgId, profile_id: profileId, role, stage_node_id: stageNodeId, access })
      .select("*"),
    "Failed to add membership",
  );
}

export async function registerStudent(
  profileId: string,
  joinCodeRow: Row,
  displayName?: string | null,
): Promise<Row> {
  if (await useLocal()) return local.localRegisterStudent(profileId, joinCodeRow, displayName);
  const client = requireClient();
  const orgId = joinCodeRow.org_id;
  const stageNodeId = joinCodeRow.stage_node_id;

  if (displayName) {
    await client
      .from("profiles")
      .update({ display_name: displayName, name: displayName })
      .eq("id", profileId);
  }

  await client.from("profiles").update({ role: "student" }).eq("id", profileId);

  return _mutateOne(
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
}

export async function listStudentRegistrationsForStages(
  orgId: string,
  visible: StageNode[],
): Promise<Row[]> {
  if (await useLocal()) return local.localListStudentRegistrations(orgId, visible);
  const client = requireClient();
  const { data } = await client
    .from("student_registrations")
    // Disambiguate: student_registrations has two FKs to stage_nodes
    // (stage_node_id and current_stage_node_id). Embed via stage_node_id.
    .select(
      "*, profiles(email, display_name, name), " +
        "stage_nodes!student_registrations_stage_node_id_fkey(name, path, stage_type)",
    )
    .eq("org_id", orgId);
  const rows = (data ?? []) as Row[];
  const visibleById = new Map(visible.map((s) => [s.id, s]));

  const result: Row[] = [];
  for (const row of rows) {
    const stage = row.stage_nodes ?? {};
    const rowPath: string = stage.path ?? "/";
    const rowId = row.stage_node_id;
    if (visibleById.has(rowId)) {
      result.push(row);
      continue;
    }
    for (const s of visible) {
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
  if (await useLocal()) return local.localListMembers(orgId);
  const client = requireClient();
  const { data } = await client
    .from("org_memberships")
    .select("*, profiles(email, display_name, name), stage_nodes(name, stage_type)")
    .eq("org_id", orgId);
  return data ?? [];
}

export async function getUserOrgs(profileId: string): Promise<Row[]> {
  if (await useLocal()) return local.localGetUserOrgs(profileId);
  const client = requireClient();
  const { data } = await client
    .from("org_memberships")
    .select("*, organizations(id, name, slug)")
    .eq("profile_id", profileId);
  return data ?? [];
}

export async function getOrgChallenge(orgId: string): Promise<Row | null> {
  if (await useLocal()) return local.localGetOrgChallenge(orgId);
  const client = requireClient();
  const org = await getOrganization(orgId);
  if (!org) return null;
  const { data: challenges } = await client
    .from("challenges")
    .select("*")
    .eq("org_id", orgId)
    .limit(1);
  if (!challenges || challenges.length === 0) {
    return { org_id: orgId, org_name: org.name, enabled: false, stage_types: [] };
  }

  const challenge = challenges[0];
  const { data: cfg } = await client
    .from("challenge_stage_config")
    .select("stage_type")
    .eq("challenge_id", challenge.id)
    .eq("enabled", true)
    .order("position");
  const stageTypes = (cfg ?? []).map((r) => r.stage_type);
  return {
    org_id: orgId,
    org_name: org.name,
    enabled: challenge.enabled ?? false,
    name: challenge.name ?? null,
    stage_types: stageTypes,
  };
}

export async function updateMemberAccess(memberId: string, access: string): Promise<Row> {
  if (await useLocal()) return local.localUpdateMemberAccess(memberId, access);
  const client = requireClient();
  return _mutateOne(
    client.from("org_memberships").update({ access }).eq("id", memberId).select("*"),
    "Member not found",
  );
}

export async function getStageNode(stageId: string): Promise<Row | null> {
  if (await useLocal()) return local.localGetStage(stageId);
  const client = requireClient();
  const { data } = await client
    .from("stage_nodes")
    .select("*, organizations(name)")
    .eq("id", stageId)
    .limit(1);
  return data && data.length ? data[0] : null;
}

export async function getProfileByEmail(email: string): Promise<Row | null> {
  if (await useLocal()) return local.localGetProfileByEmail(email);
  const client = requireClient();
  const { data } = await client.from("profiles").select("*").eq("email", email).limit(1);
  return data && data.length ? data[0] : null;
}

export async function getMembership(memberId: string): Promise<Row | null> {
  if (await useLocal()) return local.localGetMembership(memberId);
  const client = requireClient();
  const { data } = await client.from("org_memberships").select("*").eq("id", memberId).limit(1);
  return data && data.length ? data[0] : null;
}

export async function getProfile(profileId: string): Promise<Row | null> {
  if (await useLocal()) return local.localGetProfile(profileId);
  const client = requireClient();
  const { data } = await client.from("profiles").select("*").eq("id", profileId).limit(1);
  return data && data.length ? data[0] : null;
}

export async function addStageNodes(
  orgId: string,
  nodes: Row[],
  parentId: string | null = null,
): Promise<Row[]> {
  if (await useLocal()) return local.localAddStageNodes(orgId, nodes, parentId);
  const client = requireClient();
  const { data: challenges } = await client
    .from("challenges")
    .select("id")
    .eq("org_id", orgId)
    .limit(1);
  const challengeId = challenges && challenges.length ? challenges[0].id : null;

  let parentPath = "/";
  let depth = 0;
  if (parentId) {
    const { data: parentData } = await client
      .from("stage_nodes")
      .select("*")
      .eq("id", parentId)
      .limit(1);
    const parent = _firstRow(parentData, "Parent stage not found");
    parentPath = parent.path;
    depth = (parent.depth ?? 0) + 1;
  }

  return _insertStageTree(orgId, challengeId, nodes, parentId, parentPath, depth);
}
