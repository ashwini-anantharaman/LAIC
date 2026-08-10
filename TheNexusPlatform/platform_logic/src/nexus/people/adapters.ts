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
    provider: doc.provider?.id,
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
  learning: "Content Studio", bridge: "Bridge Platform", clubapp: "Bridge Bird App",
  appbuilder: "App Studio", community: "Community", teams: "People", partners: "Partners",
};
// Areas whose grant is a 3-way (No / Partial / Full) backed by their own Access
// Catalogue. The mobile app is one of these: its capabilities are the club and
// coaching surfaces a role may see, toggled here like any platform's.
const PROGRAM_PLATFORM_AREAS = new Set(["learning", "bridge", "clubapp"]);
// A platform area's 3-way picker (No/Partial/Full) reveals that platform's
// Access-Catalogue capabilities. Match the loaded catalogue by its provider id.
const PROGRAM_PLATFORM_CATALOGUE: Record<string, string> = {
  learning: "learning-platform", bridge: "bridge-platform", clubapp: "club-app",
};
// Feature areas that map 1:1 to a program-console catalogue group (→ the coarse
// level seeds that group's capabilities). learning/bridge/appbuilder open a
// platform via single caps and are handled by their own toggle, not seeded here.
const PROGRAM_AREA_GROUP: Record<string, string> = {
  teams: "people", community: "community", partners: "partners",
};

// A platform provisioned "Partial" caps its role builder to that subset. Map the
// feature key to the platform catalogue's provider id used in the builder.
const PLATFORM_PROVIDER_BY_KEY: Record<string, string> = {
  learning: "learning-platform", bridge: "bridge-platform", clubapp: "club-app",
};

export function programRgAdapter(
  orgId: string,
  programId: string,
  enabledAreaKeys: string[],
  onTestRole?: (role: RgRole) => void,
  featureAccess?: Record<string, { capabilities: string[] }> | null,
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
        ? { key, label: PROGRAM_AREA_LABELS[key] ?? key, kind: "platform", catalogueId: PROGRAM_PLATFORM_CATALOGUE[key] }
        : {
            key, label: PROGRAM_AREA_LABELS[key] ?? key, kind: "graded", levels: ["view", "comment", "edit"],
            ...(PROGRAM_AREA_GROUP[key] ? { capabilityGroup: { catalogueId: "program-console", groupId: PROGRAM_AREA_GROUP[key] } } : {}),
          },
    ),
    structuralRoles: [
      { name: "Super Admin", description: "Program administrator (full access) — holds every capability; not editable." },
    ],
    // A program role grants THIS program's console capabilities + the platforms it
    // opens (learning/bridge inventory is platform-global). Only load a platform's
    // catalogue when that platform is ENABLED for the program — otherwise its
    // capabilities would wrongly appear in the role builder. A Partial platform's
    // catalogue is filtered to the provisioned subset so roles can't grant beyond it.
    loadCatalogues: async () => {
      const loaders: Array<() => Promise<CapabilityCatalogueDocument>> = [() => getProgramCatalogue(programId)];
      if (enabledAreaKeys.includes("learning")) loaders.push(() => getCatalogue("learning"));
      if (enabledAreaKeys.includes("bridge")) loaders.push(() => getCatalogue("bridge"));
      // The mobile app's own inventory. It rides on the bridge grant (the app
      // signs in through the same platform access), so it is offered wherever
      // bridge is — or on its own key once a program provisions it separately.
      if (enabledAreaKeys.includes("bridge") || enabledAreaKeys.includes("clubapp")) {
        loaders.push(() => getCatalogue("club-app"));
      }
      const built = await catalogueLoader(loaders)();
      if (!featureAccess) return built;
      const allowedByProvider: Record<string, Set<string>> = {};
      for (const [key, prov] of Object.entries(PLATFORM_PROVIDER_BY_KEY)) {
        const partial = featureAccess[key]?.capabilities;
        if (partial) allowedByProvider[prov] = new Set(partial);
      }
      return built
        .map((b) => {
          const allowed = b.provider ? allowedByProvider[b.provider] : undefined;
          if (!allowed) return b;
          return { ...b, groups: b.groups.map((g) => ({ ...g, capabilities: g.capabilities.filter((cp) => allowed.has(cp.id)) })).filter((g) => g.capabilities.length > 0) };
        })
        .filter((b) => b.groups.length > 0);
    },
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
      { key: "programs", label: "Programs", kind: "graded", levels: ["view", "edit"], capabilityGroup: { catalogueId: "org-console", groupId: "programs" } },
      { key: "team", label: "People", kind: "graded", levels: ["view", "edit"], capabilityGroup: { catalogueId: "org-console", groupId: "people" } },
      { key: "settings", label: "Settings", kind: "graded", levels: ["view", "edit"], capabilityGroup: { catalogueId: "org-console", groupId: "settings" } },
      { key: "audit", label: "Audit", kind: "toggle", grant: "view", capabilityGroup: { catalogueId: "org-console", groupId: "audit" } },
      { key: "gates", label: "Gates", kind: "toggle", grant: "edit", capabilityGroup: { catalogueId: "org-console", groupId: "gates" } },
    ],
    structuralRoles: [
      { name: "Super Admin", description: "Organization owner (full access) — holds every capability; not editable." },
      { name: "Admin", description: "Organization administrator — full workspace, set by the owner." },
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
      { key: "organizations", label: "Organizations", kind: "graded", levels: ["view", "edit"], capabilityGroup: { catalogueId: "nexus-console", groupId: "organizations" } },
      { key: "audit", label: "Platform audit", kind: "toggle", grant: "view", capabilityGroup: { catalogueId: "nexus-console", groupId: "audit" } },
      { key: "nexus-gates", label: "Gates", kind: "toggle", grant: "edit", capabilityGroup: { catalogueId: "nexus-console", groupId: "gates" } },
      { key: "settings", label: "Settings", kind: "toggle", grant: "edit", capabilityGroup: { catalogueId: "nexus-console", groupId: "settings" } },
      { key: "test1", label: "Test 1", kind: "toggle", grant: "view", capabilityGroup: { catalogueId: "nexus-console", groupId: "test1" } },
      { key: "test2", label: "Test 2", kind: "toggle", grant: "view", capabilityGroup: { catalogueId: "nexus-console", groupId: "test2" } },
    ],
    structuralRoles: [
      { name: "Super Admin", description: "Platform operator (full access) — holds every capability; not editable." },
    ],
    loadCatalogues: catalogueLoader([() => getCatalogue("nexus-console")]),
  };
}
