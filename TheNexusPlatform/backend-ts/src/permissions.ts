/** Hierarchical stage-scoped permission helpers for the LIAC platform layer. */

export type Access = "view" | "edit";
export type StageType = "international" | "national" | "state" | "chapter";

export interface Membership {
  id: string;
  org_id: string;
  profile_id: string;
  role: string;
  stage_node_id: string | null;
  access: Access;
  stage_path?: string | null;
  stage_type?: StageType | null;
}

export interface StageNode {
  id: string;
  org_id: string;
  parent_id: string | null;
  stage_type: StageType;
  name: string;
  depth: number;
  path: string;
  discord_url?: string | null;
  event_at?: string | null;
  qualifier_status?: string | null;
}

/** True if descendantPath is under ancestorPath in the stage tree. */
export function isSubtreePath(ancestorPath: string, descendantPath: string): boolean {
  if (!ancestorPath || ancestorPath === "/") return true;
  const normalized = ancestorPath.endsWith("/") ? ancestorPath : ancestorPath + "/";
  return descendantPath === ancestorPath || descendantPath.startsWith(normalized);
}

/** Whether a membership scope includes the given stage node. */
export function membershipCoversStage(membership: Membership, stage: StageNode): boolean {
  if (membership.role === "owner" && membership.stage_node_id == null) return true;
  if (membership.stage_node_id == null) return membership.role === "owner";
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

  return orgStages.filter((stage) =>
    orgMemberships.some((m) => membershipCoversStage(m, stage)),
  );
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
  stageType: StageType,
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

export function roleLabel(
  memberships: Membership[],
  orgId: string,
  stages: StageNode[],
): string {
  const orgMemberships = memberships.filter((m) => m.org_id === orgId);
  if (orgMemberships.length === 0) return "Member";

  const primary = orgMemberships.find((m) => m.role === "owner") ?? orgMemberships[0];
  const roleWord =
    ({ owner: "Owner", administrator: "Administrator", teacher: "Teacher" } as Record<string, string>)[
      primary.role
    ] ?? "Member";

  if (primary.stage_node_id) {
    const stage = stages.find((s) => s.id === primary.stage_node_id);
    if (stage) {
      const typeWord = stage.stage_type.charAt(0).toUpperCase() + stage.stage_type.slice(1);
      return `${typeWord} ${roleWord}`;
    }
  }
  return roleWord;
}
