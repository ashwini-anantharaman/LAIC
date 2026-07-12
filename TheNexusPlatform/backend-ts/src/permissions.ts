/** Hierarchical stage-scoped permission helpers for the LIAC platform layer. */

export type Access = "view" | "edit";
export type StageTypeName = "international" | "national" | "state" | "chapter";

export interface Membership {
  id: string;
  org_id: string;
  profile_id: string;
  role: string;
  stage_node_id: string | null;
  access: Access;
  stage_path?: string | null;
  stage_type?: StageTypeName | null;
  program_id?: string | null;
}

export interface StageNode {
  id: string;
  org_id: string;
  parent_id: string | null;
  stage_type: StageTypeName;
  name: string;
  depth: number;
  path: string;
  discord_url?: string | null;
  event_at?: string | null;
  qualifier_status?: string | null;
  program_id?: string | null;
}

/** Minimal program shape needed for role-label derivation. */
export interface ProgramInfo {
  id: string;
  category: string;
  instructor_label?: string | null;
  learner_label?: string | null;
}

/** True if descendantPath is under ancestorPath in the stage tree. */
export function isSubtreePath(ancestorPath: string, descendantPath: string): boolean {
  if (!ancestorPath || ancestorPath === "/") return true;
  const normalized = ancestorPath.endsWith("/") ? ancestorPath : ancestorPath + "/";
  return descendantPath === ancestorPath || descendantPath.startsWith(normalized);
}

/** Whether a membership scope includes the given stage node. */
export function membershipCoversStage(membership: Membership, stage: StageNode): boolean {
  if (membership.role === "owner" && membership.stage_node_id === null) return true;
  if (membership.stage_node_id === null) return membership.role === "owner";
  if (membership.stage_path == null) return membership.stage_node_id === stage.id;
  return isSubtreePath(membership.stage_path, stage.path);
}

/** Return stage nodes visible to the user within an org. */
export function visibleStages(
  memberships: Membership[],
  stages: StageNode[],
  orgId: string,
): StageNode[] {
  const orgStages = stages.filter((s) => s.org_id === orgId);
  if (orgStages.length === 0) return [];

  const orgMemberships = memberships.filter((m) => m.org_id === orgId);
  if (orgMemberships.length === 0) return [];

  return orgStages.filter((stage) => orgMemberships.some((m) => membershipCoversStage(m, stage)));
}

export function visibleStageIds(
  memberships: Membership[],
  stages: StageNode[],
  orgId: string,
): Set<string> {
  return new Set(visibleStages(memberships, stages, orgId).map((s) => s.id));
}

export function canViewStage(memberships: Membership[], stage: StageNode): boolean {
  const orgMemberships = memberships.filter((m) => m.org_id === stage.org_id);
  return orgMemberships.some((m) => membershipCoversStage(m, stage));
}

export function canEditStage(memberships: Membership[], stage: StageNode): boolean {
  const orgMemberships = memberships.filter((m) => m.org_id === stage.org_id);
  for (const m of orgMemberships) {
    if (!membershipCoversStage(m, stage)) continue;
    if (m.role === "owner") return true;
    if (m.access === "edit") return true;
  }
  return false;
}

/** Resolve per_level org defaults for a given stage type. */
export function resolveEffectiveAccess(
  defaultAccess: string,
  perLevelOverrides: Record<string, string>,
  stageType: StageTypeName,
  membershipAccess: Access,
): Access {
  if (defaultAccess === "per_level") {
    const override = perLevelOverrides[stageType];
    if (override === "view" || override === "edit") return override;
    return membershipAccess;
  }
  if (defaultAccess === "view" || defaultAccess === "edit") return defaultAccess;
  return membershipAccess;
}

/**
 * Category-derived display word for a canonical instructor/learner role.
 *
 * Game programs read as Coach/Player, edu programs (or no program) read as
 * Teacher/Student. This is only the *default*; callers should prefer an
 * explicit per-program instructor_label/learner_label override when present.
 */
export function categoryRoleWord(role: string, category: string | null | undefined): string {
  if (role === "instructor") return category === "game" ? "Coach" : "Teacher";
  if (role === "learner") return category === "game" ? "Player" : "Student";
  const words: Record<string, string> = { owner: "Owner", administrator: "Administrator" };
  return words[role] ?? "Member";
}

/**
 * Minimal offering/app/registration-admin check reusing existing membership
 * data — not the full generic RoleAssignment/permission-string system from the
 * Nexus doc's Section 17, just enough to gate the new offering/app endpoints.
 */
export function isOfferingAdmin(
  memberships: Membership[],
  orgId: string,
  programId: string | null = null,
): boolean {
  for (const m of memberships) {
    if (m.org_id !== orgId) continue;
    if ((m.role === "owner" || m.role === "administrator") && m.stage_node_id === null) {
      return true;
    }
    if (
      programId &&
      m.program_id === programId &&
      (m.role === "administrator" || m.role === "instructor")
    ) {
      return true;
    }
  }
  return false;
}

export function roleLabel(
  memberships: Membership[],
  orgId: string,
  stages: StageNode[],
  programs: ProgramInfo[] | null = null,
): string {
  const orgMemberships = memberships.filter((m) => m.org_id === orgId);
  if (orgMemberships.length === 0) return "Member";

  const primary = orgMemberships.find((m) => m.role === "owner") ?? orgMemberships[0];

  let program: ProgramInfo | undefined;
  if (primary.program_id && programs) {
    program = programs.find((p) => p.id === primary.program_id);
  }

  let roleWord: string;
  if (primary.role === "instructor" && program?.instructor_label) {
    roleWord = program.instructor_label;
  } else if (primary.role === "learner" && program?.learner_label) {
    roleWord = program.learner_label;
  } else {
    roleWord = categoryRoleWord(primary.role, program ? program.category : null);
  }

  if (primary.stage_node_id) {
    const stage = stages.find((s) => s.id === primary.stage_node_id);
    if (stage) {
      const typeWord = stage.stage_type.charAt(0).toUpperCase() + stage.stage_type.slice(1);
      return `${typeWord} ${roleWord}`;
    }
  }
  return roleWord;
}
