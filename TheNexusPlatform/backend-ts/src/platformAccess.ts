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
import { getBridgeRole as getBridgeRoleDef } from "./accessCatalogue/bridgeRoles";

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
  /** Fine-grained capabilities carried by the granting PROGRAM role (its
   *  `perms.capabilities`), when access came from a program role with a
   *  "partial" (capability-bound) platform grant. The platform context filters
   *  these to its own catalogue. Null for admins / pre-built / platform-role
   *  grants. */
  programRoleCapabilities: string[] | null;
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

/** "bridge_learner" → "Learner", "content-developer" → "Content Developer" —
 *  a readable fallback label for an assigned prebuilt role. */
function _prettyRole(role: string): string {
  return role
    .replace(/^bridge_|^learning_/, "")
    .split(/[_-]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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

  // Students never hold memberships — they exist only as learner PARTICIPANTS
  // (the Registrations funnel; invisible to the console's people surfaces).
  // Their standing is looked up per-program in the loop below.
  const participations = user.email
    ? await graph.findLearnerParticipations(user.email, programId ?? null).catch(() => [] as Row[])
    : [];
  if (user.memberships.length === 0 && participations.length === 0) {
    throw new HttpError(403, "No organization membership");
  }

  // Candidate programs: pinned, else program-scoped memberships and learner
  // participations, else (for org-level admins) every program of their org.
  let candidates: string[];
  if (programId) {
    candidates = [programId];
  } else {
    candidates = user.memberships
      .filter((m) => m.program_id)
      .map((m) => m.program_id as string);
    candidates.push(...participations.map((p) => p.program_id as string).filter(Boolean));
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
    // Students can't read program rows under RLS (no membership) — resolve
    // their candidate programs through the privileged access-check read.
    const program =
      (await db.getProgram(pid)) ??
      (participations.some((p) => p.program_id === pid) ? await graph.getProgramForAccess(pid) : null);
    if (!program) continue;
    sawProgram = true;

    // PARTNER access: the requested program is a partner ("sister program"). Its
    // platform tabs enter the CONNECTED program's instance (so partners see the
    // parent's content), restricted to the capabilities the partner was
    // provisioned (feature_access). Resolve the DATA scope to the connected
    // program; the capabilities drive what the app shows.
    const partnerRow = program as Row;
    if (partnerRow.is_partner && partnerRow.connected_program_id) {
      const partnerFeatures = normalizeProgramFeatures(program.features as Record<string, unknown>);
      const membership = _orgMembership(user, program.org_id as string);
      const isPartnerMember =
        !!membership &&
        (user.memberships.some((m) => m.program_id === (partnerRow.id as string)) ||
          user.memberships.some((m) => m.org_id === program.org_id && ["owner", "administrator"].includes(m.role)));
      if (!membership || !isPartnerMember) continue;
      if (!partnerFeatures[area]) { featureDisabled = true; continue; }
      const connected = await db.getProgram(partnerRow.connected_program_id as string).catch(() => null);
      if (!connected) continue;
      const connFeatures = normalizeProgramFeatures(connected.features as Record<string, unknown>);
      if (!connFeatures[area]) { featureDisabled = true; continue; }
      const fa = (partnerRow.feature_access as Record<string, { capabilities?: string[] }> | null | undefined)?.[area]?.capabilities;
      return {
        profileId: (membership.profile_id as string) ?? user.id,
        orgId: connected.org_id as string,
        programId: connected.id as string,
        programName: connected.name as string,
        level: "edit",
        platformRole: null,
        roleName: "Partner access",
        programRoleCapabilities: fa && fa.length ? fa : null,
      };
    }

    const features = normalizeProgramFeatures(program.features as Record<string, unknown>);

    const membership = _orgMembership(user, program.org_id as string);
    if (!membership) {
      // Student path: an approved learner participant in this program grants
      // learner-level entry — no membership, no role record, nothing visible
      // in the console's people surfaces. That's the design, not a shortcut.
      const part = participations.find(
        (p) => p.program_id === pid && p.organization_id === program.org_id,
      );
      if (part) {
        if (!features[area]) {
          featureDisabled = true;
          continue;
        }
        // A gate may join its sign-ups to specific platforms with a role
        // (gates.config.platform_roles → a platform role assignment). When
        // one exists, the participant carries that ROLE — so they show up in
        // the platform's People and capability grants can reach them. Without
        // one, the historical behavior stands: learner-level entry, no role.
        const assigned = user.email
          ? await graph
              .getPlatformRoleForEmail(pid, area, user.email, true)
              .catch(() => null)
          : null;
        const cfg = platformRoleConfig(area);
        return {
          profileId: (part.user_id as string | null) ?? user.id,
          orgId: program.org_id as string,
          programId: pid,
          programName: (program.name as string) ?? "",
          level: (assigned && cfg?.level[assigned]) || "view",
          platformRole: assigned ?? null,
          roleName: assigned ? _prettyRole(assigned) : "Student",
          programRoleCapabilities: null,
        };
      }
      continue; // not this caller's org
    }

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
      programRoleCapabilities: level.programRoleCapabilities ?? null,
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
): Promise<{ level: AreaGrantLevel; platformRole?: string; programRoleCapabilities?: string[] } | null> {
  const orgId = program.org_id as string;
  const pid = program.id as string;
  const isAdminRole = (m: Row) => m.org_id === orgId && ["owner", "administrator"].includes(m.role);
  // Two independent access boundaries meet here:
  //  • Nexus envelope (org.adminsEnterPrograms): may ORG-level admins enter this
  //    org's programs at all. Operator-controlled.
  //  • Program platform lock (program.platforms_open): may this program's OWN
  //    people (its admins + members) open the platform runtimes — Learning,
  //    App Shell, Bridge. The org admin's tool to lock a program's people out of
  //    the runtimes while they still manage the program. Org admins set it, so
  //    it never restricts them.
  const isPlatformArea = area === "learning" || area === "bridge" || area === "appbuilder";
  const platformsLocked = isPlatformArea && (program.platforms_open as boolean | undefined) === false;

  // This program's reserved administrator (program-scoped) — full workspace, but
  // barred from the platform runtimes when the program's platforms are locked.
  const programScopedAdmin = user.memberships.some((m) => isAdminRole(m) && m.program_id === pid);
  if (programScopedAdmin) return platformsLocked ? null : { level: "admin" };
  // Org-LEVEL admin/owner (program_id null): blanket access when the Nexus
  // envelope allows it. They bypass the per-program platform lock (they own it).
  const orgLevelAdmin = user.memberships.some((m) => isAdminRole(m) && !m.program_id);
  if (orgLevelAdmin) {
    const caps = await db.getOrgCapabilities(orgId).catch(() => null);
    const orgAllows = !caps || (caps.adminsEnterPrograms as boolean | undefined) !== false;
    if (orgAllows) return { level: "admin" };
  }
  // Program members (custom roles) obey the platform lock too.
  if (platformsLocked) return null;

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
    // A custom capability-bound bridge role (defined per program, not a pre-built
    // key): grants member-level entry; the role's capabilities gate the tabs.
    // platformRole carries the custom id so the context can resolve its caps.
    if (assigned && area === "bridge") {
      const custom = await getBridgeRoleDef(pid, assigned);
      if (custom) return { level: "edit", platformRole: assigned };
    }
  }

  const role = await graph.getProgramRoleForEmail(pid, user.email).catch(() => null);
  const level = role ? ((role.perms as Row)?.[area] as string | undefined) : undefined;
  // Fine-grained capabilities this program role carries (partial platform grants
  // bind specific platform capabilities here — the platform context filters them
  // to its own catalogue).
  const roleCaps = Array.isArray((role?.perms as Row)?.capabilities)
    ? ((role!.perms as Row).capabilities as string[])
    : undefined;
  // An exact pre-built platform role named in the custom role.
  if (cfg && level && cfg.prebuilt.includes(level)) {
    return { level: cfg.level[level], platformRole: level };
  }
  // Platform areas granted as a single "administrator" toggle — full access.
  if (level === "administrator") return { level: "admin" };
  // Partial (capability-bound) platform grant: member-level entry; the role's
  // platform capabilities gate the app.
  if (level === "partial") return { level: "edit", programRoleCapabilities: roleCaps };
  if (level === "view" || level === "comment" || level === "edit") return { level, programRoleCapabilities: roleCaps };
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
