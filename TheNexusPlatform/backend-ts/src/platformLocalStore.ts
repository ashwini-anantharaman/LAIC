/** Local JSON fallback for platform tables when Supabase schema is not migrated. */

import { randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { HttpError } from "./httpError";
import type { StageNode } from "./permissions";

const _here = dirname(fileURLToPath(import.meta.url));
// src/ -> backend-ts/.local_data (mirrors the Python backend/.local_data layout).
const _DATA = join(_here, "..", ".local_data");
const _ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

type Row = Record<string, any>;

function _read(name: string): Row[] {
  const path = join(_DATA, `platform_${name}.json`);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

function _write(name: string, rows: Row[]): void {
  mkdirSync(_DATA, { recursive: true });
  writeFileSync(join(_DATA, `platform_${name}.json`), JSON.stringify(rows, null, 2));
}

function _slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "org";
}

function _uniqueSlug(base: string): string {
  const rows = _read("organizations");
  let slug = base;
  let n = 0;
  while (rows.some((r) => r.slug === slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

function _makeCode(length = 8): string {
  for (let i = 0; i < 10; i++) {
    let code = "";
    for (let j = 0; j < length; j++) code += _ALPHABET[randomInt(_ALPHABET.length)];
    if (!_read("join_codes").some((r) => r.code === code)) return code;
  }
  throw new HttpError(500, "Could not generate unique join code");
}

export function localCreateProfile(
  userId: string,
  email: string,
  role: string,
  displayName?: string | null,
): Row {
  let rows = _read("profiles");
  const row = {
    id: userId,
    email,
    role,
    display_name: displayName || email.split("@")[0],
    name: displayName || email.split("@")[0],
  };
  rows = rows.filter((r) => r.id !== userId);
  rows.push(row);
  _write("profiles", rows);
  return row;
}

export function localGetProfile(userId: string): Row | null {
  return _read("profiles").find((r) => r.id === userId) ?? null;
}

export function localCreateOrganization(name: string, ownerId: string): Row {
  const slug = _uniqueSlug(_slugify(name));
  const org = { id: randomUUID(), name, slug, owner_id: ownerId, settings: {} };
  const orgs = _read("organizations");
  orgs.push(org);
  _write("organizations", orgs);

  const memberships = _read("memberships");
  memberships.push({
    id: randomUUID(),
    org_id: org.id,
    profile_id: ownerId,
    role: "owner",
    stage_node_id: null,
    access: "edit",
  });
  _write("memberships", memberships);

  const profiles = _read("profiles");
  for (const p of profiles) {
    if (p.id === ownerId) p.role = "org_admin";
  }
  _write("profiles", profiles);
  return org;
}

export function localGetOrganization(orgId: string): Row | null {
  return _read("organizations").find((r) => r.id === orgId) ?? null;
}

export function localGetMemberships(profileId: string): Row[] {
  return _read("memberships").filter((m) => m.profile_id === profileId);
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

export function localListStageNodes(orgId: string): StageNode[] {
  const result: StageNode[] = [];
  for (const row of _read("stage_nodes")) {
    if (row.org_id === orgId) result.push(_rowToStage(row));
  }
  return result.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
}

export function localSetupOrganization(orgId: string, payload: Row): Row {
  let challenges = _read("challenges");
  challenges = challenges.filter((c) => c.org_id !== orgId);
  const challengeId = randomUUID();
  challenges.push({
    id: challengeId,
    org_id: orgId,
    enabled: payload.has_challenge ?? false,
    name: payload.challenge_name ?? null,
  });
  _write("challenges", challenges);

  if (payload.has_challenge) {
    const stageTypes: string[] = payload.stage_types ?? [];
    const cfgRows = _read("challenge_stage_config").filter((c) => c.challenge_id !== challengeId);
    stageTypes.forEach((st, i) => {
      cfgRows.push({
        id: randomUUID(),
        challenge_id: challengeId,
        stage_type: st,
        position: i,
        enabled: true,
      });
    });
    _write("challenge_stage_config", cfgRows);

    const existing = _read("stage_nodes").filter((s) => s.org_id === orgId);
    if (existing.length === 0) {
      _insertStageTreeLocal(orgId, challengeId, payload.initial_stages ?? []);
    }
  }

  const defaults: Record<string, Row> = payload.permission_defaults ?? {};
  const permRows = _read("permission_defaults").filter((p) => p.org_id !== orgId);
  for (const [role, cfg] of Object.entries(defaults)) {
    permRows.push({
      id: randomUUID(),
      org_id: orgId,
      role,
      default_access: cfg.default_access ?? "view",
      per_level_overrides: cfg.per_level_overrides ?? {},
    });
  }
  _write("permission_defaults", permRows);

  if (payload.discord_link) {
    const orgs = _read("organizations");
    for (const org of orgs) {
      if (org.id === orgId) org.settings = { discord_link: payload.discord_link };
    }
    _write("organizations", orgs);
  }

  return { org_id: orgId, challenge_id: challengeId };
}

function _insertStageTreeLocal(
  orgId: string,
  challengeId: string | null,
  nodes: Row[],
  parentId: string | null = null,
  parentPath = "/",
  depth = 0,
): Row[] {
  const stages = _read("stage_nodes");
  const created: Row[] = [];
  for (const nodeInput of nodes) {
    const stageId = randomUUID();
    const segment = `${nodeInput.stage_type}-${stageId.slice(0, 8)}`;
    const path = parentPath !== "/" ? `${parentPath}${segment}/` : `/${segment}/`;
    const row: Row = {
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
      qualifier_status: "pending",
    };
    stages.push(row);
    created.push(row);
    const children: Row[] = nodeInput.children ?? [];
    if (children.length) {
      created.push(..._insertStageTreeLocal(orgId, challengeId, children, stageId, path, depth + 1));
    }
  }
  _write("stage_nodes", stages);
  return created;
}

const _STAGE_ORDER = ["international", "national", "state", "chapter"];

export function localGetOrgChallenge(orgId: string): Row | null {
  const org = localGetOrganization(orgId);
  if (!org) return null;
  const challenges = _read("challenges").filter((c) => c.org_id === orgId);
  if (challenges.length === 0) {
    return { org_id: orgId, org_name: org.name, enabled: false, stage_types: [] };
  }
  const challenge = challenges[0];
  const cfg = _read("challenge_stage_config")
    .filter((c) => c.challenge_id === challenge.id && (c.enabled ?? true))
    .map((c) => c.stage_type as string);
  cfg.sort((a, b) => {
    const ia = _STAGE_ORDER.includes(a) ? _STAGE_ORDER.indexOf(a) : 99;
    const ib = _STAGE_ORDER.includes(b) ? _STAGE_ORDER.indexOf(b) : 99;
    return ia - ib;
  });
  return {
    org_id: orgId,
    org_name: org.name,
    enabled: challenge.enabled ?? false,
    name: challenge.name ?? null,
    stage_types: cfg,
  };
}

export function localListStudentRegistrations(orgId: string, visible: StageNode[]): Row[] {
  const visibleById = new Map(visible.map((s) => [s.id, s]));
  const profiles = new Map(_read("profiles").map((p) => [p.id, p]));
  const stages = new Map(_read("stage_nodes").map((s) => [s.id, s]));
  const result: Row[] = [];
  for (const row of _read("student_registrations")) {
    if (row.org_id !== orgId) continue;
    const stageId = row.stage_node_id;
    const stage = stages.get(stageId ?? "") ?? {};
    const stagePath: string = stage.path ?? row.stage_path ?? "/";
    let include = false;
    if (visibleById.has(stageId)) {
      include = true;
    } else {
      for (const s of visible) {
        const normalized = s.path.endsWith("/") ? s.path : s.path + "/";
        if (stagePath === s.path || stagePath.startsWith(normalized)) {
          include = true;
          break;
        }
      }
    }
    if (!include) continue;
    const profile = profiles.get(row.profile_id) ?? {};
    result.push({
      ...row,
      profiles: {
        email: profile.email ?? null,
        display_name: profile.display_name ?? null,
        name: profile.name ?? null,
      },
      stage_nodes: {
        name: stage.name ?? "",
        path: stage.path ?? "/",
        stage_type: stage.stage_type ?? null,
      },
    });
  }
  return result;
}

export function localGetJoinCode(code: string): Row | null {
  for (const row of _read("join_codes")) {
    if (row.code === code.trim().toUpperCase() && (row.active ?? true)) {
      const stages = new Map(_read("stage_nodes").map((s) => [s.id, s]));
      const orgs = new Map(_read("organizations").map((o) => [o.id, o]));
      const stage = stages.get(row.stage_node_id ?? "") ?? {};
      const org = orgs.get(row.org_id ?? "") ?? {};
      return {
        ...row,
        stage_nodes: { name: stage.name ?? "", stage_type: stage.stage_type ?? null },
        organizations: { name: org.name ?? "" },
      };
    }
  }
  return null;
}

export function localRegisterStudent(
  profileId: string,
  joinCodeRow: Row,
  displayName?: string | null,
): Row {
  if (displayName) {
    const profiles = _read("profiles");
    for (const p of profiles) {
      if (p.id === profileId) {
        p.display_name = displayName;
        p.name = displayName;
        p.role = "student";
      }
    }
    _write("profiles", profiles);
  }

  let regs = _read("student_registrations");
  regs = regs.filter(
    (r) => !(r.profile_id === profileId && r.org_id === joinCodeRow.org_id),
  );
  const row = {
    id: randomUUID(),
    org_id: joinCodeRow.org_id,
    stage_node_id: joinCodeRow.stage_node_id,
    profile_id: profileId,
    join_code_id: joinCodeRow.id ?? null,
    current_stage_node_id: joinCodeRow.stage_node_id,
    registered_at: new Date().toISOString(),
  };
  regs.push(row);
  _write("student_registrations", regs);
  return row;
}

export function localGetStage(stageId: string): Row | null {
  for (const row of _read("stage_nodes")) {
    if (row.id === stageId) {
      const orgs = new Map(_read("organizations").map((o) => [o.id, o]));
      const org = orgs.get(row.org_id) ?? {};
      return { ...row, organizations: { name: org.name ?? "" } };
    }
  }
  return null;
}

export function localGetProfileByEmail(email: string): Row | null {
  return (
    _read("profiles").find((r) => (r.email ?? "").toLowerCase() === email.toLowerCase()) ?? null
  );
}

export function localGetMembership(memberId: string): Row | null {
  return _read("memberships").find((r) => r.id === memberId) ?? null;
}

export function localCreateJoinCode(stageNodeId: string, kind: string): Row {
  const stages = _read("stage_nodes");
  const stage = stages.find((s) => s.id === stageNodeId);
  if (!stage) throw new HttpError(404, "Stage not found");
  const code = _makeCode();
  const row = {
    id: randomUUID(),
    org_id: stage.org_id,
    stage_node_id: stageNodeId,
    code,
    kind,
    active: true,
  };
  const codes = _read("join_codes");
  codes.push(row);
  _write("join_codes", codes);
  return row;
}

export function localAddMembership(
  orgId: string,
  profileId: string,
  role: string,
  stageNodeId: string | null,
  access: string,
): Row {
  const row = {
    id: randomUUID(),
    org_id: orgId,
    profile_id: profileId,
    role,
    stage_node_id: stageNodeId,
    access,
  };
  const memberships = _read("memberships");
  memberships.push(row);
  _write("memberships", memberships);
  return row;
}

export function localListMembers(orgId: string): Row[] {
  const profiles = new Map(_read("profiles").map((p) => [p.id, p]));
  const stages = new Map(_read("stage_nodes").map((s) => [s.id, s]));
  const result: Row[] = [];
  for (const m of _read("memberships")) {
    if (m.org_id !== orgId) continue;
    const profile = profiles.get(m.profile_id) ?? {};
    const stage = stages.get(m.stage_node_id ?? "");
    result.push({
      ...m,
      profiles: {
        email: profile.email ?? null,
        display_name: profile.display_name ?? null,
        name: profile.name ?? null,
      },
      stage_nodes: stage
        ? { name: stage.name ?? null, stage_type: stage.stage_type ?? null }
        : null,
    });
  }
  return result;
}

export function localGetUserOrgs(profileId: string): Row[] {
  const orgs = new Map(_read("organizations").map((o) => [o.id, o]));
  const result: Row[] = [];
  for (const m of _read("memberships")) {
    if (m.profile_id !== profileId) continue;
    const org = orgs.get(m.org_id) ?? {};
    result.push({
      ...m,
      organizations: { id: org.id ?? null, name: org.name ?? null, slug: org.slug ?? null },
    });
  }
  return result;
}

export function localUpdateMemberAccess(memberId: string, access: string): Row {
  const memberships = _read("memberships");
  for (const m of memberships) {
    if (m.id === memberId) {
      m.access = access;
      _write("memberships", memberships);
      return m;
    }
  }
  throw new HttpError(404, "Member not found");
}

export function localAddStageNodes(
  orgId: string,
  nodes: Row[],
  parentId: string | null = null,
): Row[] {
  const challenges = _read("challenges").filter((c) => c.org_id === orgId);
  const challengeId = challenges.length ? challenges[0].id : null;
  let parentPath = "/";
  let depth = 0;
  if (parentId) {
    const parent = _read("stage_nodes").find((s) => s.id === parentId);
    if (!parent) throw new HttpError(404, "Parent stage not found");
    parentPath = parent.path;
    depth = (parent.depth ?? 0) + 1;
  }
  return _insertStageTreeLocal(orgId, challengeId, nodes, parentId, parentPath, depth);
}
