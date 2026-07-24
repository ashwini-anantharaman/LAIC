/**
 * Per-altitude adapters that feed the shared <RolesAndGroups> panel. Each wires
 * the level's API calls and declares the permission areas its role builder
 * offers. Role edits (rename / repermission / reparent / display-as-group) all
 * go through the cross-scope PATCH /roles/:id + DELETE endpoints, so org and
 * nexus roles are fully editable too — not just create-only.
 */
import {
  listProgramRoles, createProgramRole, updateProgramRole, deleteProgramRole,
  getProgramGroupsModel, createGroup, updateGroup, deleteGroup,
  listOrgScopedRoles, createOrgScopedRole, getOrgGroupsModel,
  listNexusScopedRoles, createNexusScopedRole, getNexusGroupsModel,
  createNexusGroup, updateNexusGroup, deleteNexusGroup,
  type ScopedRole, type ProgramRole,
} from "@/services/api";
import type { RgAdapter, RgArea, RgRole, CatalogueForBuilder } from "./RolesAndGroups";
import { getCatalogue, getOrgCatalogue, getProgramCatalogue, type CapabilityCatalogueDocument } from "@/nexus/access/catalogue";

const toRgRole = (r: ProgramRole | ScopedRole): RgRole => {
  const perms = (r.perms as Record<string, unknown>) ?? {};
  return {
    id: r.id,
    name: r.name,
    perms: perms as Record<string, string>,
    display_as_group: r.display_as_group ?? false,
    parent_group_id: r.parent_group_id ?? null,
    capabilities: Array.isArray(perms.capabilities) ? (perms.capabilities as string[]) : [],
  };
};

/** Shape a catalogue into the builder's grantable-capabilities-by-group view
 *  (reserved capabilities excluded). */
function toBuilder(doc: CapabilityCatalogueDocument): CatalogueForBuilder {
  const byGroup = new Map<string, { id: string; label: string }[]>();
  for (const c of doc.capabilities) {
    if (c.reserved) continue;
    if (!byGroup.has(c.group)) byGroup.set(c.group, []);
    byGroup.get(c.group)!.push({ id: c.id, label: c.label });
  }
  return {
    id: doc.id,
    name: doc.name,
    groups: [...doc.groups]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ id: g.id, label: g.label, capabilities: byGroup.get(g.id) ?? [] }))
      .filter((g) => g.capabilities.length > 0),
  };
}

/** Load + shape the given catalogues (skips any that fail to load). Each loader
 *  fetches one catalogue — an instance-scoped one (org/program) or a global one. */
function catalogueLoader(loaders: Array<() => Promise<CapabilityCatalogueDocument>>): () => Promise<CatalogueForBuilder[]> {
  return async () => {
    const docs = await Promise.all(loaders.map((load) => load().catch(() => null)));
    return docs.filter((d): d is CapabilityCatalogueDocument => !!d).map(toBuilder).filter((b) => b.groups.length > 0);
  };
}

// ── Program ─────────────────────────────────────────────────────────────────
const PROGRAM_AREA_LABELS: Record<string, string> = {
  learning: "Learning Platform", bridge: "Bridge Platform", appbuilder: "App Shell",
  community: "Community", teams: "People", partners: "Partners",
};
const PROGRAM_PLATFORM_AREAS = new Set(["learning", "bridge"]);

export function programRgAdapter(
  orgId: string,
  programId: string,
  enabledAreaKeys: string[],
  onTestRole?: (role: RgRole) => void,
): RgAdapter {
  return {
    testAsRole: onTestRole,
    loadRoles: async () => (await listProgramRoles(programId)).map(toRgRole),
    loadGroups: async () => (await getProgramGroupsModel(programId)).groups.map((g) => ({ id: g.id, name: g.name, parent_id: g.parent_id })),
    createRole: (i) => createProgramRole(programId, i).then(() => undefined),
    updateRole: (id, patch) => updateProgramRole(id, patch).then(() => undefined),
    deleteRole: (id) => deleteProgramRole(id),
    createGroup: (i) => createGroup(orgId, { program_id: programId, name: i.name, parent_group_id: i.parent_group_id }).then(() => undefined),
    updateGroup: (id, patch) => updateGroup(id, patch).then(() => undefined),
    deleteGroup: (id) => deleteGroup(id),
    areas: enabledAreaKeys.map<RgArea>((key) =>
      PROGRAM_PLATFORM_AREAS.has(key)
        ? { key, label: PROGRAM_AREA_LABELS[key] ?? key, kind: "admin" }
        : { key, label: PROGRAM_AREA_LABELS[key] ?? key, kind: "graded", levels: ["view", "comment", "edit"] },
    ),
    // A program role grants THIS program's console capabilities + the platforms it
    // opens (learning/bridge inventory is platform-global).
    loadCatalogues: catalogueLoader([
      () => getProgramCatalogue(programId),
      () => getCatalogue("learning"),
      () => getCatalogue("bridge"),
    ]),
  };
}

// ── Org ─────────────────────────────────────────────────────────────────────
export function orgRgAdapter(orgId: string): RgAdapter {
  return {
    loadRoles: async () => (await listOrgScopedRoles(orgId)).map(toRgRole),
    loadGroups: async () => (await getOrgGroupsModel(orgId)).groups.map((g) => ({ id: g.id, name: g.name, parent_id: g.parent_id })),
    createRole: (i) => createOrgScopedRole(orgId, { name: i.name, perms: i.perms, display_as_group: i.display_as_group, parent_group_id: i.parent_group_id, capabilities: i.capabilities }).then(() => undefined),
    updateRole: (id, patch) => updateProgramRole(id, patch).then(() => undefined),
    deleteRole: (id) => deleteProgramRole(id),
    createGroup: (i) => createGroup(orgId, { name: i.name, parent_group_id: i.parent_group_id }).then(() => undefined),
    updateGroup: (id, patch) => updateGroup(id, patch).then(() => undefined),
    deleteGroup: (id) => deleteGroup(id),
    areas: [
      { key: "programs", label: "Programs", kind: "graded", levels: ["view", "edit"] },
      { key: "team", label: "People", kind: "graded", levels: ["view", "edit"] },
      { key: "settings", label: "Settings", kind: "graded", levels: ["view", "edit"] },
      { key: "audit", label: "Audit", kind: "toggle", grant: "view" },
    ],
    loadCatalogues: catalogueLoader([() => getOrgCatalogue(orgId)]),
  };
}

// ── Nexus ───────────────────────────────────────────────────────────────────
export function nexusRgAdapter(): RgAdapter {
  return {
    loadRoles: async () => (await listNexusScopedRoles()).map(toRgRole),
    loadGroups: async () => (await getNexusGroupsModel()).groups.map((g) => ({ id: g.id, name: g.name, parent_id: g.parent_id })),
    createRole: (i) => createNexusScopedRole({ name: i.name, perms: i.perms, display_as_group: i.display_as_group, parent_group_id: i.parent_group_id, capabilities: i.capabilities }).then(() => undefined),
    updateRole: (id, patch) => updateProgramRole(id, patch).then(() => undefined),
    deleteRole: (id) => deleteProgramRole(id),
    createGroup: (i) => createNexusGroup({ name: i.name, parent_group_id: i.parent_group_id }).then(() => undefined),
    updateGroup: (id, patch) => updateNexusGroup(id, patch).then(() => undefined),
    deleteGroup: (id) => deleteNexusGroup(id),
    areas: [
      { key: "organizations", label: "Organizations", kind: "graded", levels: ["view", "edit"] },
      { key: "audit", label: "Platform audit", kind: "toggle", grant: "view" },
      { key: "settings", label: "Settings", kind: "toggle", grant: "edit" },
    ],
    loadCatalogues: catalogueLoader([() => getCatalogue("nexus-console")]),
  };
}
