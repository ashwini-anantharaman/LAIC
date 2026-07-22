/**
 * Platform access authority — Phase 3 of the org-space integration plan.
 *
 * Answers ONE question for the external platforms (Bridge, Learning): given the
 * authenticated caller, may they enter platform X, and as what? The decision is
 * derived entirely from data the org's admins already manage:
 *
 *   program membership  →  who is in the program (role owner/administrator = full)
 *   custom role perms   →  which AREAS a member's role grants (Team & Roles)
 *   program features    →  whether the org admin enabled the area at all
 *
 * The returned identity is the ORG-SCOPED person id (profiles.id, Phase 2) —
 * never the cross-cutting auth credential id. The platform operator is refused
 * outright: platforms live inside the org space (people territory).
 *
 * The area→platform-role mapping lives here as code/config on purpose — it is a
 * small, reviewable translation table, not org-editable data.
 */
import type { PlatformUser } from "./auth";
import { HttpError } from "./httpError";
import * as db from "./platformDb";
import * as graph from "./db/orgGraphRepo";
import { dbEnabled } from "./db/client";
import { normalizeProgramFeatures, type ProgramFeatureKey } from "./schemas";

type Row = Record<string, any>;

/** A grant level within an area: custom-role levels, or "admin" (program/org admin). */
export type AreaGrantLevel = "view" | "comment" | "edit" | "admin";

export interface ResolvedPlatformAccess {
  /** Org-scoped person id (profiles.id) — the canonical nexusUserId. */
  profileId: string;
  orgId: string;
  programId: string;
  programName: string;
  level: AreaGrantLevel;
  /** Exact pre-built platform role when the grant named one (picker). */
  platformRole: string | null;
  /** The custom role's name when the grant came from one (null for admins). */
  roleName: string | null;
}

// ── Pre-built Bridge roles (§21 contract vocabulary) ────────────────────────
// A Nexus role may grant the bridge area one of these EXACT platform roles
// (the role builder's picker) instead of a graded level. Each maps onto a
// grant level for the permission strings Bridge derives from accessLevel.
export const BRIDGE_PREBUILT_ROLES = [
  "bridge_program_admin",
  "bridge_org_admin",
  "bridge_club_admin",
  "bridge_coach",
  "bridge_reviewer",
  "bridge_fellow",
  "bridge_learner",
  "bridge_guest",
] as const;
export type BridgePrebuiltRole = (typeof BRIDGE_PREBUILT_ROLES)[number];

const BRIDGE_ROLE_LEVEL: Record<BridgePrebuiltRole, AreaGrantLevel> = {
  bridge_program_admin: "admin",
  bridge_org_admin: "admin",
  bridge_club_admin: "admin",
  bridge_coach: "edit",
  bridge_fellow: "edit",
  bridge_reviewer: "comment",
  bridge_learner: "view",
  bridge_guest: "view",
};

// ── Area → platform-role mapping (the one translation table) ────────────────

export const BRIDGE_ROLE_MAP: Record<AreaGrantLevel, { roles: string[]; accessLevel: string }> = {
  admin: { roles: ["bridge_program_admin"], accessLevel: "admin" },
  edit: { roles: ["bridge_coach"], accessLevel: "coach" },
  comment: { roles: ["bridge_reviewer"], accessLevel: "reviewer" },
  view: { roles: ["bridge_learner"], accessLevel: "learner" },
};

// Learning uses the app's own role vocabulary (ashwiniNew src/lib/types.ts) so
// the emitted roles are ones the Learning Platform already understands.
export const LEARNING_ROLE_MAP: Record<AreaGrantLevel, { roles: string[]; accessLevel: string }> = {
  admin: { roles: ["administrator"], accessLevel: "administrator" },
  edit: { roles: ["content-developer"], accessLevel: "content-developer" },
  comment: { roles: ["course-reviewer"], accessLevel: "course-reviewer" },
  view: { roles: ["student"], accessLevel: "student" },
};

const LEARNING_PREBUILT_ROLES = [
  "administrator",
  "content-developer",
  "course-reviewer",
  "object-reviewer",
  "coach",
  "student",
] as const;

const LEARNING_ROLE_LEVEL: Record<string, AreaGrantLevel> = {
  administrator: "admin",
  "content-developer": "edit",
  coach: "edit",
  "object-reviewer": "comment",
  "course-reviewer": "comment",
  student: "view",
};

// ── One config per platform: the whole per-platform role surface in one place,
// so the People endpoints, access resolution, and context emit stay in sync and
// a new platform is just another entry (no copy-pasted bridge logic). ─────────
export interface PlatformRoleConfig {
  /** Every valid pre-built role key for this platform. */
  prebuilt: readonly string[];
  /** Which pre-built keys are admin-tier (read-only; from Nexus, not assignable). */
  adminRoles: readonly string[];
  /** Assignable from the platform's own People & Roles UI (the non-admin set). */
  assignable: readonly string[];
  /** role key → grant level. */
  level: Record<string, AreaGrantLevel>;
}

export const PLATFORM_ROLES: Record<string, PlatformRoleConfig> = {
  bridge: {
    prebuilt: BRIDGE_PREBUILT_ROLES,
    adminRoles: ["bridge_program_admin", "bridge_org_admin", "bridge_club_admin"],
    assignable: ["bridge_coach", "bridge_reviewer", "bridge_learner"],
    level: BRIDGE_ROLE_LEVEL,
  },
  learning: {
    prebuilt: LEARNING_PREBUILT_ROLES,
    adminRoles: ["administrator"],
    assignable: ["content-developer", "object-reviewer", "course-reviewer", "coach", "student"],
    level: LEARNING_ROLE_LEVEL,
  },
};

export function platformRoleConfig(platform: string): PlatformRoleConfig | null {
  return PLATFORM_ROLES[platform] ?? null;
}

// ── The resolver ─────────────────────────────────────────────────────────────

/**
 * Resolve the caller's grant for `area`, or throw 403/404.
 *
 * `programId` pins the check to one program (what a launched platform passes).
 * Without it, the caller's programs are scanned in a stable order and the first
 * granting program wins — convenient for single-program members; multi-program
 * callers should always pin.
 */
export async function resolvePlatformAccess(
  user: PlatformUser,
  area: ProgramFeatureKey,
  programId?: string | null,
): Promise<ResolvedPlatformAccess> {
  // The platform operator governs boundaries; platforms are org-people space.
  if (user.role === "platform_admin") {
    throw new HttpError(403, "Nexus operators cannot enter an organization's platforms");
  }
  if (user.memberships.length === 0) {
    throw new HttpError(403, "No organization membership");
  }

  // Candidate programs: pinned, else program-scoped memberships, else (for
  // org-level admins) every program of their org.
  let candidates: string[];
  if (programId) {
    candidates = [programId];
  } else {
    candidates = user.memberships
      .filter((m) => m.program_id)
      .map((m) => m.program_id as string);
    if (candidates.length === 0) {
      const orgIds = [...new Set(user.memberships.map((m) => m.org_id))];
      for (const orgId of orgIds) {
        const programs = await db.listPrograms(orgId).catch(() => [] as Row[]);
        candidates.push(...programs.map((p: Row) => p.id as string));
      }
    }
  }
  if (candidates.length === 0) throw new HttpError(403, "No program grants access to this platform");

  let sawProgram = false;
  let featureDisabled = false;
  for (const pid of [...new Set(candidates)]) {
    const program = await db.getProgram(pid);
    if (!program) continue;
    sawProgram = true;

    const membership = _orgMembership(user, program.org_id as string);
    if (!membership) continue; // not this caller's org

    const features = normalizeProgramFeatures(program.features as Record<string, unknown>);
    if (!features[area]) {
      featureDisabled = true;
      continue;
    }

    const level = await _grantLevel(user, program, area);
    if (!level) continue;

    return {
      profileId: (membership.profile_id as string) ?? user.id,
      orgId: program.org_id as string,
      programId: pid,
      programName: (program.name as string) ?? "",
      level: level.level,
      platformRole: level.platformRole ?? null,
      roleName: level.level === "admin" && !level.platformRole ? null : await _roleName(user, pid),
    };
  }

  if (programId && !sawProgram) throw new HttpError(404, "Program not found");
  if (featureDisabled) {
    throw new HttpError(403, "This feature is not enabled for the program");
  }
  throw new HttpError(403, "Your role does not grant access to this platform");
}

function _orgMembership(user: PlatformUser, orgId: string) {
  return user.memberships.find((m) => m.org_id === orgId) ?? null;
}

/** The caller's grant in one program: admin membership, else custom role. A
 * custom role may name an exact pre-built platform role (platformRole). */
async function _grantLevel(
  user: PlatformUser,
  program: Row,
  area: ProgramFeatureKey,
): Promise<{ level: AreaGrantLevel; platformRole?: string } | null> {
  const orgId = program.org_id as string;
  const pid = program.id as string;
  // Org owner/administrator (org-level, program_id null) or this program's
  // reserved administrator → full access (§3.5 delegation).
  const isAdmin = user.memberships.some(
    (m) =>
      m.org_id === orgId &&
      ["owner", "administrator"].includes(m.role) &&
      (!m.program_id || m.program_id === pid),
  );
  if (isAdmin) return { level: "admin" };

  // Plain member: the custom role's area grant (Team & Roles). Role
  // assignments live in the DB layer only (501-free: absent in demo mode).
  if (!dbEnabled() || !user.email) return null;

  // A platform area (bridge/learning) may carry a pre-built platform role,
  // assigned either from the platform's own People & Roles UI (most specific)
  // or named directly in a custom program role's perms.
  const cfg = platformRoleConfig(area);

  // Most specific first: a person-level platform-role assignment.
  if (cfg) {
    const assigned = await graph.getPlatformRoleForEmail(pid, area, user.email).catch(() => null);
    if (assigned && cfg.prebuilt.includes(assigned)) {
      return { level: cfg.level[assigned], platformRole: assigned };
    }
  }

  const role = await graph.getProgramRoleForEmail(pid, user.email).catch(() => null);
  const level = role ? ((role.perms as Row)?.[area] as string | undefined) : undefined;
  // An exact pre-built platform role named in the custom role.
  if (cfg && level && cfg.prebuilt.includes(level)) {
    return { level: cfg.level[level], platformRole: level };
  }
  // Platform areas granted as a single "administrator" toggle — full access.
  if (level === "administrator") return { level: "admin" };
  if (level === "view" || level === "comment" || level === "edit") return { level };
  // A custom Learning role (the learning app's own People tab) grants base
  // access to the platform; its per-area perms then gate the app internally.
  if (area === "learning" && user.email) {
    const lr = await graph.getLearningRoleForEmail(pid, user.email).catch(() => null);
    if (lr) {
      const anyEdit = Object.values(((lr.perms as Row) ?? {})).includes("edit");
      return { level: anyEdit ? "edit" : "view" };
    }
  }
  return null;
}

async function _roleName(user: PlatformUser, programId: string): Promise<string | null> {
  if (!dbEnabled() || !user.email) return null;
  const role = await graph.getProgramRoleForEmail(programId, user.email).catch(() => null);
  return (role?.role_name as string) ?? null;
}

/**
 * The program's registered app slug for a platform (e.g. "bridge-platform-xxxx"),
 * or the given fallback when none is provisioned yet. Never creates on read.
 */
export async function platformAppSlug(
  programId: string,
  slugPrefix: string,
  fallback: string,
): Promise<string> {
  const apps = await db.listRegisteredApps(programId).catch(() => [] as Row[]);
  const app = apps.find((a: Row) => typeof a.app_slug === "string" && a.app_slug.startsWith(slugPrefix));
  return (app?.app_slug as string) ?? fallback;
}
