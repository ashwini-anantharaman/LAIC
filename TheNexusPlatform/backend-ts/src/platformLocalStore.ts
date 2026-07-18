/** Local JSON fallback for platform tables when Supabase schema is not migrated. */

import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { HttpError } from "./httpError";
import { StageNode } from "./permissions";
import { normalizeProgramFeatures, type ProgramFeatures } from "./schemas";

const _here = dirname(fileURLToPath(import.meta.url));
const _ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const _ROLE_ALIASES: Record<string, string> = { teacher: "instructor" };

type Row = Record<string, any>;

/**
 * Data directory. Defaults to the Python backend's `.local_data` so demo data
 * carries over during the migration; override with LOCAL_DATA_DIR (used by
 * tests and the parity harness).
 */
function _dataDir(): string {
  return process.env.LOCAL_DATA_DIR || join(_here, "..", "..", "backend", ".local_data");
}

function _normalizeRole(role: string | null | undefined): string | null | undefined {
  return role != null && role in _ROLE_ALIASES ? _ROLE_ALIASES[role] : role;
}

function _readFile(path: string): Row[] {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

function _writeFile(path: string, rows: Row[]): void {
  mkdirSync(_dataDir(), { recursive: true });
  writeFileSync(path, JSON.stringify(rows, null, 2));
}

function _readRaw(name: string): Row[] {
  return _readFile(join(_dataDir(), `platform_${name}.json`));
}

function _writeRaw(name: string, rows: Row[]): void {
  _writeFile(join(_dataDir(), `platform_${name}.json`), rows);
}

/** Read a learning-platform local table (unprefixed .local_data/<name>.json). */
function _readLearning(name: string): Row[] {
  _ensureMigrated();
  return _readFile(join(_dataDir(), `${name}.json`));
}

// One-time pass per data dir: rewrite legacy role "teacher" rows to "instructor"
// (Python runs this at module import).
let _migratedFor: string | null = null;

function _ensureMigrated(): void {
  const dir = _dataDir();
  if (_migratedFor === dir) return;
  _migratedFor = dir;
  const memberships = _readRaw("memberships");
  let changed = false;
  for (const m of memberships) {
    if (m.role in _ROLE_ALIASES) {
      m.role = _normalizeRole(m.role);
      changed = true;
    }
  }
  if (changed) _writeRaw("memberships", memberships);
}

function _read(name: string): Row[] {
  _ensureMigrated();
  return _readRaw(name);
}

function _write(name: string, rows: Row[]): void {
  _ensureMigrated();
  _writeRaw(name, rows);
}

export function slugify(name: string): string {
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
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = "";
    for (let i = 0; i < length; i++) code += _ALPHABET[randomInt(_ALPHABET.length)];
    if (!_read("join_codes").some((r) => r.code === code)) return code;
  }
  throw new HttpError(500, "Could not generate unique join code");
}

function _sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

function _hashPw(password: string): string {
  return _sha256Hex(password);
}

// ── Demo-mode auth (no Supabase). Token == user id. ─────────────────────────

export function localAuthCreateUser(email: string, password: string): Row {
  const users = _read("auth_users");
  if (users.some((u) => (u.email ?? "").toLowerCase() === email.toLowerCase())) {
    throw new HttpError(409, "Email already registered");
  }
  const user = { id: randomUUID(), email, password_hash: _hashPw(password) };
  users.push(user);
  _write("auth_users", users);
  return { id: user.id, email };
}

export function localAuthSignIn(email: string, password: string): Row {
  for (const u of _read("auth_users")) {
    if ((u.email ?? "").toLowerCase() === email.toLowerCase() && u.password_hash === _hashPw(password)) {
      return { id: u.id, email: u.email, access_token: u.id };
    }
  }
  throw new HttpError(401, "Invalid credentials");
}

export function localAuthGetUser(token: string): Row | null {
  for (const u of _read("auth_users")) {
    if (u.id === token) return { id: u.id, email: u.email };
  }
  return null;
}

// ── Profiles / organizations / programs ─────────────────────────────────────

export function localCreateProfile(
  userId: string,
  email: string,
  role: string,
  displayName: string | null = null,
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
  for (const row of _read("profiles")) {
    if (row.id === userId) return row;
  }
  return null;
}

export function localCreateOrganization(name: string, ownerId: string): Row {
  const slug = _uniqueSlug(slugify(name));
  const org: Row = { id: randomUUID(), name, slug, owner_id: ownerId, settings: {} };
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
  for (const row of _read("organizations")) {
    if (row.id === orgId) return row;
  }
  return null;
}

/** All organizations — platform-admin view only (no per-org scoping). */
export function localListAllOrganizations(): Row[] {
  return _read("organizations");
}

export function localUpdateOrgTheme(
  orgId: string,
  accentColor: string | null | undefined,
  logoUrl: string | null | undefined,
): Row {
  const orgs = _read("organizations");
  for (const org of orgs) {
    if (org.id === orgId) {
      const settings = { ...(org.settings ?? {}) };
      const theme = { ...(settings.theme ?? {}) };
      if (accentColor != null) theme.accent_color = accentColor;
      if (logoUrl != null) theme.logo_url = logoUrl;
      settings.theme = theme;
      org.settings = settings;
      _write("organizations", orgs);
      return org;
    }
  }
  throw new HttpError(404, "Organization not found");
}

/** Generic settings replace (used for capability envelope, etc.). */
export function localSetOrgSettings(orgId: string, settings: Row): Row {
  const orgs = _read("organizations");
  for (const org of orgs) {
    if (org.id === orgId) {
      org.settings = settings;
      _write("organizations", orgs);
      return org;
    }
  }
  throw new HttpError(404, "Organization not found");
}

export interface CreateProgramOptions {
  description?: string | null;
  icon?: string | null;
  instructorLabel?: string | null;
  learnerLabel?: string | null;
  features?: Record<string, boolean> | null;
}

export function localCreateProgram(
  orgId: string,
  name: string,
  category: string,
  opts: CreateProgramOptions = {},
): Row {
  const row = {
    id: randomUUID(),
    org_id: orgId,
    name,
    category,
    description: opts.description ?? null,
    icon: opts.icon ?? null,
    instructor_label: opts.instructorLabel ?? null,
    learner_label: opts.learnerLabel ?? null,
    features: normalizeProgramFeatures(opts.features),
  };
  const programs = _read("programs");
  programs.push(row);
  _write("programs", programs);
  return row;
}

/** Replace a program's accessible-feature set (org-admin config). */
export function localUpdateProgramFeatures(
  programId: string,
  features: ProgramFeatures,
): Row | null {
  const programs = _read("programs");
  const row = programs.find((p) => p.id === programId);
  if (!row) return null;
  row.features = features;
  _write("programs", programs);
  return { ...row, ..._programCounts(programId) };
}

/** Best-effort course/learner/instructor counts for a program's workspace card. */
function _programCounts(programId: string): Row {
  const programStageIds = new Set(
    _read("stage_nodes")
      .filter((s) => s.program_id === programId)
      .map((s) => s.id),
  );
  const instructorCount = _read("memberships").filter(
    (m) => m.program_id === programId && _normalizeRole(m.role) === "instructor",
  ).length;
  const learnerCount = _read("student_registrations").filter((r) =>
    programStageIds.has(r.stage_node_id),
  ).length;
  const courseCount = _readLearning("courses").filter((c) =>
    programStageIds.has(c.stage_node_id),
  ).length;
  return {
    course_count: courseCount,
    learner_count: learnerCount,
    instructor_count: instructorCount,
  };
}

export function localListPrograms(orgId: string): Row[] {
  return _read("programs")
    .filter((p) => p.org_id === orgId)
    .map((p) => ({ ...p, features: normalizeProgramFeatures(p.features), ..._programCounts(p.id) }));
}

export function localGetProgram(programId: string): Row | null {
  for (const row of _read("programs")) {
    if (row.id === programId)
      return { ...row, features: normalizeProgramFeatures(row.features), ..._programCounts(programId) };
  }
  return null;
}

/**
 * Delete a program and everything scoped to it, so no orphaned offerings,
 * apps, groups, memberships, invites, or registrations linger.
 */
export function localDeleteProgram(programId: string): void {
  const offeringIds = new Set(
    _read("offerings").filter((o) => o.program_id === programId).map((o) => o.id),
  );
  const byProgram = (name: string) =>
    _write(name, _read(name).filter((r) => r.program_id !== programId));
  byProgram("offerings");
  byProgram("registered_apps");
  byProgram("stage_nodes");
  byProgram("join_codes");
  byProgram("registrations");
  byProgram("participants");
  // Memberships scoped to this program are removed; org-level ones (no program_id) stay.
  _write("memberships", _read("memberships").filter((m) => m.program_id !== programId));
  // Sweep any records keyed only by the removed offerings.
  for (const name of ["registrations", "participants", "launch_tokens"]) {
    _write(name, _read(name).filter((r) => !r.offering_id || !offeringIds.has(r.offering_id)));
  }
  _write("programs", _read("programs").filter((p) => p.id !== programId));
}

/** Delete one offering and everything scoped to it (apps, registrations, participants). */
export function localDeleteOffering(offeringId: string): void {
  const appIds = new Set(
    _read("registered_apps").filter((a) => a.offering_id === offeringId).map((a) => a.id),
  );
  _write("registered_apps", _read("registered_apps").filter((a) => a.offering_id !== offeringId));
  _write("registrations", _read("registrations").filter((r) => r.offering_id !== offeringId));
  _write("participants", _read("participants").filter((p) => p.offering_id !== offeringId));
  _write("launch_tokens", _read("launch_tokens").filter((t) => !t.app_id || !appIds.has(t.app_id)));
  _write("offerings", _read("offerings").filter((o) => o.id !== offeringId));
}

export function localGetMemberships(profileId: string): Row[] {
  return _read("memberships").filter((m) => m.profile_id === profileId);
}

export function localListStageNodes(orgId: string): StageNode[] {
  const result: StageNode[] = [];
  for (const row of _read("stage_nodes")) {
    if (row.org_id === orgId) {
      result.push({
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
      });
    }
  }
  return result.sort((a, b) => a.depth - b.depth || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
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
      cfgRows.push({ id: randomUUID(), challenge_id: challengeId, stage_type: st, position: i, enabled: true });
    });
    _write("challenge_stage_config", cfgRows);

    const existing = _read("stage_nodes").filter((s) => s.org_id === orgId);
    if (existing.length === 0) {
      _insertStageTreeLocal(orgId, challengeId, payload.initial_stages ?? []);
    }
  }

  const defaults: Row = payload.permission_defaults ?? {};
  const permRows = _read("permission_defaults").filter((p) => p.org_id !== orgId);
  for (const [role, cfg] of Object.entries(defaults) as Array<[string, Row]>) {
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
      if (org.id === orgId) {
        const settings = { ...(org.settings ?? {}) };
        settings.discord_link = payload.discord_link;
        org.settings = settings;
      }
    }
    _write("organizations", orgs);
    localCreateIntegration(
      orgId,
      "discord",
      { server_url: payload.discord_link },
      payload.discord_permission_level || "per_level",
    );
  }

  for (const prog of (payload.programs ?? []) as Row[]) {
    const programRow = localCreateProgram(orgId, prog.name, prog.category, {
      description: prog.description,
      icon: prog.icon,
      instructorLabel: prog.instructor_label,
      learnerLabel: prog.learner_label,
    });
    // Program-scoped Groups: edu programs get a single-level admin root
    // (level picked per program); game programs get flat "classes", no hierarchy.
    if (prog.category === "edu") {
      const stageType = prog.stage_type || "national";
      _insertStageTreeLocal(
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
        _insertStageTreeLocal(
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

function _insertStageTreeLocal(
  orgId: string,
  challengeId: string | null,
  nodes: Row[],
  parentId: string | null = null,
  parentPath = "/",
  depth = 0,
  programId: string | null = null,
): Row[] {
  const stages = _read("stage_nodes");
  const created: Row[] = [];
  const insert = (
    nodeList: Row[],
    parent: string | null,
    path: string,
    d: number,
  ): void => {
    for (const nodeInput of nodeList) {
      const stageId = randomUUID();
      const segment = `${nodeInput.stage_type}-${stageId.slice(0, 8)}`;
      const nodePath = path !== "/" ? `${path}${segment}/` : `/${segment}/`;
      const row: Row = {
        id: stageId,
        org_id: orgId,
        challenge_id: challengeId,
        parent_id: parent,
        program_id: programId ?? nodeInput.program_id ?? null,
        stage_type: nodeInput.stage_type,
        name: nodeInput.name,
        depth: d,
        path: nodePath,
        discord_url: nodeInput.discord_url ?? null,
        event_at: nodeInput.event_at ?? null,
        qualifier_status: "pending",
      };
      stages.push(row);
      created.push(row);
      const children: Row[] = nodeInput.children ?? [];
      if (children.length > 0) insert(children, stageId, nodePath, d + 1);
    }
  };
  insert(nodes, parentId, parentPath, depth);
  _write("stage_nodes", stages);
  return created;
}

const STAGE_ORDER = ["international", "national", "state", "chapter"];

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
    const ia = STAGE_ORDER.includes(a) ? STAGE_ORDER.indexOf(a) : 99;
    const ib = STAGE_ORDER.includes(b) ? STAGE_ORDER.indexOf(b) : 99;
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

export function localListStudentRegistrations(orgId: string, visibleStages: StageNode[]): Row[] {
  const visibleById = new Map(visibleStages.map((s) => [s.id, s]));
  const profiles = new Map(_read("profiles").map((p) => [p.id, p]));
  const stages = new Map(_read("stage_nodes").map((s) => [s.id, s]));
  const result: Row[] = [];
  for (const row of _read("student_registrations")) {
    if (row.org_id !== orgId) continue;
    const stageId = row.stage_node_id;
    const stage = stages.get(stageId ?? "") ?? {};
    const stagePath: string = stage.path ?? row.stage_path ?? "/";
    let include = false;
    if (stageId != null && visibleById.has(stageId)) {
      include = true;
    } else {
      for (const s of visibleStages) {
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
    if (row.code !== code.trim().toUpperCase() || !(row.active ?? true)) continue;
    const usesRemaining = row.uses_remaining;
    if (usesRemaining != null && usesRemaining <= 0) continue;
    const expiresAt = row.expires_at;
    if (expiresAt) {
      const parsed = new Date(String(expiresAt).replace("Z", "+00:00"));
      if (!Number.isNaN(parsed.getTime()) && parsed < new Date()) continue;
    }
    const stages = new Map(_read("stage_nodes").map((s) => [s.id, s]));
    const orgs = new Map(_read("organizations").map((o) => [o.id, o]));
    const programs = new Map(_read("programs").map((p) => [p.id, p]));
    const stage = stages.get(row.stage_node_id ?? "") ?? {};
    const org = orgs.get(row.org_id ?? "") ?? {};
    const program = programs.get(row.program_id ?? "");
    return {
      ...row,
      stage_nodes: { name: stage.name ?? "", stage_type: stage.stage_type ?? null },
      organizations: { name: org.name ?? "" },
      programs: program ? { name: program.name ?? "", category: program.category ?? null } : null,
    };
  }
  return null;
}

export function localRegisterStudent(
  profileId: string,
  joinCodeRow: Row,
  displayName: string | null = null,
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
  regs = regs.filter((r) => !(r.profile_id === profileId && r.org_id === joinCodeRow.org_id));
  const row = {
    id: randomUUID(),
    org_id: joinCodeRow.org_id,
    stage_node_id: joinCodeRow.stage_node_id,
    profile_id: profileId,
    join_code_id: joinCodeRow.id ?? null,
    current_stage_node_id: joinCodeRow.stage_node_id,
    registered_at: _nowIso(),
  };
  regs.push(row);
  _write("student_registrations", regs);
  if (joinCodeRow.code) localConsumeJoinCode(joinCodeRow.code);
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
  for (const row of _read("profiles")) {
    if ((row.email ?? "").toLowerCase() === email.toLowerCase()) return row;
  }
  return null;
}

export function localGetMembership(memberId: string): Row | null {
  for (const row of _read("memberships")) {
    if (row.id === memberId) return row;
  }
  return null;
}

export interface JoinCodeOptions {
  deliveryMethod?: string;
  email?: string | null;
  maxUses?: number | null;
  expiresAt?: string | null;
  createdByUserId?: string | null;
}

export function localCreateJoinCode(stageNodeId: string, kind: string, opts: JoinCodeOptions = {}): Row {
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
    delivery_method: opts.deliveryMethod ?? "join_code",
    email: opts.email ?? null,
    max_uses: opts.maxUses ?? null,
    uses_remaining: opts.maxUses ?? null,
    expires_at: opts.expiresAt ?? null,
    created_by_user_id: opts.createdByUserId ?? null,
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
  programId: string | null = null,
): Row {
  const row = {
    id: randomUUID(),
    org_id: orgId,
    profile_id: profileId,
    role: _normalizeRole(role),
    stage_node_id: stageNodeId,
    access,
    program_id: programId,
  };
  const memberships = _read("memberships");
  memberships.push(row);
  _write("memberships", memberships);
  return row;
}

export function localCreateProgramJoinCode(programId: string, kind: string, opts: JoinCodeOptions = {}): Row {
  const program = _read("programs").find((p) => p.id === programId);
  if (!program) throw new HttpError(404, "Program not found");
  const code = _makeCode();
  const row = {
    id: randomUUID(),
    org_id: program.org_id,
    stage_node_id: null,
    program_id: programId,
    code,
    kind,
    active: true,
    delivery_method: opts.deliveryMethod ?? "join_code",
    email: opts.email ?? null,
    max_uses: opts.maxUses ?? null,
    uses_remaining: opts.maxUses ?? null,
    expires_at: opts.expiresAt ?? null,
    created_by_user_id: opts.createdByUserId ?? null,
  };
  const codes = _read("join_codes");
  codes.push(row);
  _write("join_codes", codes);
  return row;
}

/** Decrement uses_remaining for a code with a usage limit, if set. */
export function localConsumeJoinCode(code: string): void {
  const codes = _read("join_codes");
  for (const row of codes) {
    if (row.code === code.trim().toUpperCase()) {
      if (row.uses_remaining != null) {
        row.uses_remaining = Math.max(0, row.uses_remaining - 1);
        if (row.uses_remaining === 0) row.active = false;
      }
      _write("join_codes", codes);
      return;
    }
  }
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
  programId: string | null = null,
): Row[] {
  const challenges = _read("challenges").filter((c) => c.org_id === orgId);
  const challengeId = challenges.length > 0 ? challenges[0].id : null;
  let parentPath = "/";
  let depth = 0;
  if (parentId) {
    const parent = _read("stage_nodes").find((s) => s.id === parentId);
    if (!parent) throw new HttpError(404, "Parent stage not found");
    parentPath = parent.path;
    depth = (parent.depth ?? 0) + 1;
    programId = programId ?? parent.program_id ?? null;
  }
  return _insertStageTreeLocal(orgId, challengeId, nodes, parentId, parentPath, depth, programId);
}

// ── Integration entity (generic — not hardcoded to Discord) ─────────────────
export function localCreateIntegration(
  orgId: string,
  integrationType: string,
  config: Row,
  permissionLevel: string,
  programId: string | null = null,
): Row {
  const row = {
    id: randomUUID(),
    organization_id: orgId,
    program_id: programId,
    integration_type: integrationType,
    config,
    permission_level: permissionLevel,
    status: "active",
  };
  const rows = _read("integrations");
  rows.push(row);
  _write("integrations", rows);
  return row;
}

export function localListIntegrations(orgId: string): Row[] {
  return _read("integrations").filter((r) => r.organization_id === orgId);
}

// ── Offerings, Registered Apps, and the Signup Hook (Nexus v0.3) ────────────
const _DEFAULT_SIGNUP_FIELDS: Row[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "age", label: "Age", type: "number", required: false },
  { key: "email", label: "Email", type: "email", required: true },
];

export function hashApiKey(raw: string): string {
  return _sha256Hex(raw);
}

/** Returns [raw, hash, prefix]. Matches Python: "nxk_" + token_urlsafe(32). */
export function generateApiKey(): [string, string, string] {
  const raw = "nxk_" + randomBytes(32).toString("base64url");
  return [raw, hashApiKey(raw), raw.slice(0, 12)];
}

function _nowIso(): string {
  return new Date().toISOString();
}

function _uniqueOfferingSlug(programId: string, base: string): string {
  const rows = _read("offerings");
  let slug = base;
  let n = 0;
  while (rows.some((r) => r.program_id === programId && r.slug === slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

function _uniqueAppSlug(orgId: string, base: string): string {
  const rows = _read("registered_apps");
  let slug = base;
  let n = 0;
  while (rows.some((r) => r.organization_id === orgId && r.app_slug === slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

export function offeringCounts(offeringId: string): Row {
  const regs = _read("registrations").filter((r) => r.offering_id === offeringId);
  const pending = regs.filter((r) => r.status === "pending_review").length;
  const participants = _read("participants").filter((p) => p.offering_id === offeringId).length;
  return { registration_count: regs.length, pending_count: pending, participant_count: participants };
}

export interface OfferingOptions {
  slug?: string | null;
  stageNodeId?: string | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  registrationOpen?: boolean;
  approvalMode?: string;
  signupFields?: Row[] | null;
  platformModule?: string;
  registeredAppId?: string | null;
  externalRuntimeUrl?: string | null;
  participantLabelSingular?: string | null;
  participantLabelPlural?: string | null;
  metadata?: Row | null;
}

export function localCreateOffering(
  orgId: string,
  programId: string,
  name: string,
  offeringType: string,
  opts: OfferingOptions = {},
): Row {
  const finalSlug = _uniqueOfferingSlug(programId, opts.slug || slugify(name));
  const now = _nowIso();
  const row: Row = {
    id: randomUUID(),
    organization_id: orgId,
    program_id: programId,
    stage_node_id: opts.stageNodeId ?? null,
    name,
    slug: finalSlug,
    offering_type: offeringType,
    status: "draft",
    description: opts.description ?? null,
    start_date: opts.startDate ?? null,
    end_date: opts.endDate ?? null,
    registration_open: opts.registrationOpen ?? false,
    approval_mode: opts.approvalMode ?? "manual_approve",
    signup_fields: opts.signupFields != null ? opts.signupFields : [..._DEFAULT_SIGNUP_FIELDS],
    platform_module: opts.platformModule ?? "nexus_only",
    registered_app_id: opts.registeredAppId ?? null,
    external_runtime_url: opts.externalRuntimeUrl ?? null,
    participant_label_singular: opts.participantLabelSingular ?? null,
    participant_label_plural: opts.participantLabelPlural ?? null,
    metadata: opts.metadata ?? {},
    created_at: now,
    updated_at: now,
  };
  const rows = _read("offerings");
  rows.push(row);
  _write("offerings", rows);
  return { ...row, ...offeringCounts(row.id) };
}

export function localListOfferings(programId: string): Row[] {
  return _read("offerings")
    .filter((r) => r.program_id === programId)
    .map((r) => ({ ...r, ...offeringCounts(r.id) }));
}

export function localGetOffering(offeringId: string): Row | null {
  for (const row of _read("offerings")) {
    if (row.id === offeringId) return { ...row, ...offeringCounts(offeringId) };
  }
  return null;
}

export function localUpdateOffering(offeringId: string, patch: Row): Row {
  const rows = _read("offerings");
  for (const row of rows) {
    if (row.id === offeringId) {
      for (const [k, v] of Object.entries(patch)) {
        if (v != null) row[k] = v;
      }
      row.updated_at = _nowIso();
      _write("offerings", rows);
      return { ...row, ...offeringCounts(offeringId) };
    }
  }
  throw new HttpError(404, "Offering not found");
}

export function localSetOfferingStatus(offeringId: string, status: string): Row {
  return localUpdateOffering(offeringId, { status });
}

export interface RegisteredAppOptions {
  appSlug?: string | null;
  offeringId?: string | null;
  allowedIdentifiers?: string;
  launchUrl?: string | null;
  launchContext?: Row | null;
}

export function localCreateRegisteredApp(
  orgId: string,
  programId: string | null,
  appName: string,
  opts: RegisteredAppOptions = {},
): [Row, string] {
  const finalSlug = _uniqueAppSlug(orgId, opts.appSlug || slugify(appName));
  const [rawKey, keyHash, keyPrefix] = generateApiKey();
  const now = _nowIso();
  const row: Row = {
    id: randomUUID(),
    organization_id: orgId,
    program_id: programId,
    offering_id: opts.offeringId ?? null,
    app_name: appName,
    app_slug: finalSlug,
    api_key_hash: keyHash,
    key_prefix: keyPrefix,
    allowed_identifiers: opts.allowedIdentifiers ?? "email",
    status: "active",
    launch_url: opts.launchUrl ?? null,
    launch_context: opts.launchContext ?? {},
    created_at: now,
    updated_at: now,
  };
  const rows = _read("registered_apps");
  rows.push(row);
  _write("registered_apps", rows);
  return [row, rawKey];
}

export function localListRegisteredApps(programId: string): Row[] {
  return _read("registered_apps").filter((r) => r.program_id === programId);
}

export function localGetRegisteredApp(appId: string): Row | null {
  for (const row of _read("registered_apps")) {
    if (row.id === appId) return row;
  }
  return null;
}

export function localGetRegisteredAppByHash(apiKeyHash: string): Row | null {
  for (const row of _read("registered_apps")) {
    if (row.api_key_hash === apiKeyHash) return row;
  }
  return null;
}

export function localUpdateRegisteredApp(appId: string, patch: Row): Row {
  const rows = _read("registered_apps");
  for (const row of rows) {
    if (row.id === appId) {
      for (const [k, v] of Object.entries(patch)) {
        if (v != null) row[k] = v;
      }
      row.updated_at = _nowIso();
      _write("registered_apps", rows);
      return row;
    }
  }
  throw new HttpError(404, "Registered app not found");
}

export function localRotateAppApiKey(appId: string): [Row, string] {
  const rows = _read("registered_apps");
  for (const row of rows) {
    if (row.id === appId) {
      const [rawKey, keyHash, keyPrefix] = generateApiKey();
      row.api_key_hash = keyHash;
      row.key_prefix = keyPrefix;
      row.updated_at = _nowIso();
      _write("registered_apps", rows);
      return [row, rawKey];
    }
  }
  throw new HttpError(404, "Registered app not found");
}

export function localRevokeApp(appId: string): Row {
  const rows = _read("registered_apps");
  for (const row of rows) {
    if (row.id === appId) {
      row.status = "revoked";
      row.api_key_hash = null;
      row.updated_at = _nowIso();
      _write("registered_apps", rows);
      return row;
    }
  }
  throw new HttpError(404, "Registered app not found");
}

export interface RegistrationOptions {
  programId?: string | null;
  stageNodeId?: string | null;
  registeredAppId?: string | null;
  registrationSource?: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  age?: number | null;
  userId?: string | null;
  status?: string;
  fieldData?: Row | null;
  createdByUserId?: string | null;
}

export function localCreateRegistration(orgId: string, offeringId: string, opts: RegistrationOptions = {}): Row {
  const row: Row = {
    id: randomUUID(),
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
    reviewed_by_user_id: null,
    reviewed_at: null,
    created_by_user_id: opts.createdByUserId ?? null,
    created_at: _nowIso(),
  };
  const rows = _read("registrations");
  rows.push(row);
  _write("registrations", rows);
  return row;
}

export function localGetRegistration(registrationId: string): Row | null {
  for (const row of _read("registrations")) {
    if (row.id === registrationId) return row;
  }
  return null;
}

export function localListRegistrations(offeringId: string, status: string | null = null): Row[] {
  let rows = _read("registrations").filter((r) => r.offering_id === offeringId);
  if (status) rows = rows.filter((r) => r.status === status);
  return rows;
}

export function localSetRegistrationStatus(
  registrationId: string,
  status: string,
  reviewedByUserId: string | null,
): Row {
  const rows = _read("registrations");
  for (const row of rows) {
    if (row.id === registrationId) {
      row.status = status;
      row.reviewed_by_user_id = reviewedByUserId;
      row.reviewed_at = _nowIso();
      _write("registrations", rows);
      return row;
    }
  }
  throw new HttpError(404, "Registration not found");
}

export interface ParticipantOptions {
  programId?: string | null;
  stageNodeId?: string | null;
  userId?: string | null;
  participantType?: string;
  status?: string;
  addedByUserId?: string | null;
  registrationId?: string | null;
  metadata?: Row | null;
}

export function localCreateParticipant(orgId: string, offeringId: string, opts: ParticipantOptions = {}): Row {
  const rows = _read("participants");
  const participantType = opts.participantType ?? "learner";
  if (opts.userId) {
    for (const row of rows) {
      if (
        row.offering_id === offeringId &&
        row.user_id === opts.userId &&
        row.participant_type === participantType
      ) {
        return row;
      }
    }
  }
  const row: Row = {
    id: randomUUID(),
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
    created_at: _nowIso(),
  };
  rows.push(row);
  _write("participants", rows);
  return row;
}

export function localListParticipants(offeringId: string, status: string | null = null): Row[] {
  let rows = _read("participants").filter((r) => r.offering_id === offeringId);
  if (status) rows = rows.filter((r) => r.status === status);
  return rows;
}

// ── Audit events: who did what, when (append-only) ──────────────────────────
export interface AuditEventOptions {
  orgId?: string | null;
  actorUserId?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Row | null;
}

export function localRecordAuditEvent(action: string, opts: AuditEventOptions = {}): Row {
  const row = {
    id: randomUUID(),
    organization_id: opts.orgId ?? null,
    actor_user_id: opts.actorUserId ?? null,
    action,
    scope_type: opts.scopeType ?? null,
    scope_id: opts.scopeId ?? null,
    target_type: opts.targetType ?? null,
    target_id: opts.targetId ?? null,
    metadata: opts.metadata ?? {},
    created_at: _nowIso(),
  };
  const rows = _read("audit_events");
  rows.push(row);
  _write("audit_events", rows);
  return row;
}

export function localListAuditEvents(orgId: string, limit = 50): Row[] {
  const rows = _read("audit_events").filter((r) => r.organization_id === orgId);
  rows.sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1));
  return rows.slice(0, limit);
}

export function localListAllAuditEvents(limit = 100): Row[] {
  const rows = _read("audit_events");
  rows.sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1));
  return rows.slice(0, limit);
}

// ── Entitlements: module access grants for orgs/programs/offerings ──────────
export function localListEntitlements(orgId: string): Row[] {
  return _read("entitlements").filter((r) => r.organization_id === orgId);
}

export interface EntitlementOptions {
  subjectType?: string;
  subjectId?: string | null;
  limits?: Row | null;
}

export function localSetEntitlement(
  orgId: string,
  module: string,
  status: string,
  opts: EntitlementOptions = {},
): Row {
  const subjectType = opts.subjectType ?? "organization";
  const subject = opts.subjectId || orgId;
  const rows = _read("entitlements");
  for (const row of rows) {
    if (row.subject_type === subjectType && row.subject_id === subject && row.module === module) {
      row.status = status;
      if (opts.limits != null) row.limits = opts.limits;
      _write("entitlements", rows);
      return row;
    }
  }
  const row = {
    id: randomUUID(),
    organization_id: orgId,
    subject_type: subjectType,
    subject_id: subject,
    module,
    status,
    limits: opts.limits ?? {},
    starts_at: null,
    ends_at: null,
    created_at: _nowIso(),
  };
  rows.push(row);
  _write("entitlements", rows);
  return row;
}

// ── Launch tokens: short-lived, single-use, swapped by an app for a real session ─
export function localCreateLaunchToken(
  registeredAppId: string,
  userId: string,
  ttlSeconds = 60,
): [Row, string] {
  const raw = randomBytes(24).toString("base64url");
  const expiresDt = new Date(Date.now() + ttlSeconds * 1000);
  const row = {
    id: randomUUID(),
    token_hash: hashApiKey(raw),
    registered_app_id: registeredAppId,
    user_id: userId,
    expires_at: expiresDt.toISOString(),
    used_at: null as string | null,
    created_at: _nowIso(),
  };
  const rows = _read("app_launch_tokens");
  rows.push(row);
  _write("app_launch_tokens", rows);
  return [row, raw];
}

export function localConsumeLaunchToken(rawToken: string): Row | null {
  const tokenHash = hashApiKey(rawToken);
  const rows = _read("app_launch_tokens");
  for (const row of rows) {
    if (row.token_hash !== tokenHash) continue;
    if (row.used_at) return null;
    if (!row.expires_at) return null;
    const expiresAt = new Date(String(row.expires_at).replace("Z", "+00:00"));
    if (Number.isNaN(expiresAt.getTime())) return null;
    if (expiresAt < new Date()) return null;
    row.used_at = _nowIso();
    _write("app_launch_tokens", rows);
    return row;
  }
  return null;
}
