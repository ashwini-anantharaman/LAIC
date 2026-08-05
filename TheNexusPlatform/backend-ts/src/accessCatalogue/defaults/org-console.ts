import type { CapabilityCatalogueDocument } from "../types";

/** Organization console — derived from the org nav + guarded routes. */
export const orgConsoleCatalogue: CapabilityCatalogueDocument = {
  schemaVersion: "1.0",
  documentType: "capability_catalogue",
  id: "org-console",
  name: "Organization Console",
  description: "What an organization role can be granted.",
  provider: { kind: "console", id: "org-console" },
  catalogueVersion: "1.0",
  capabilities: [
    { id: "org.programs.create", label: "Create programs", group: "programs" },
    { id: "org.programs.configure", label: "Configure programs (features, name, categories, branding)", group: "programs" },
    { id: "org.programs.delete", label: "Delete programs", group: "programs" },
    { id: "org.programs.assign_admins", label: "Assign program administrators", group: "programs" },
    { id: "org.people.manage", label: "Invite / remove members, assign roles", group: "people" },
    { id: "org.roles.manage", label: "Create / edit / delete custom roles", group: "people" },
    { id: "org.groups.manage", label: "Create / nest groups, place people", group: "people" },
    // Reserved: only the owner (Super Admin) does these.
    { id: "org.admins.remove", label: "Remove / demote administrators", group: "people", reserved: "owner" },
    { id: "org.access.set_program_policy", label: "Toggle “admins can open programs”", group: "people", reserved: "owner" },
    { id: "org.settings.branding", label: "Edit organization branding", group: "settings" },
    { id: "org.settings.categories", label: "Manage program categories", group: "settings" },
    { id: "org.audit.view", label: "View organization audit", group: "audit" },
    { id: "org.gates.manage", label: "Manage sign-in gates", group: "gates" },
  ],
  resourceTypes: [
    { id: "program", label: "Program" },
    { id: "category", label: "Category" },
  ],
  uiSurfaces: [
    { id: "dashboard", label: "Dashboard", kind: "navigation", group: "dashboard", routeOrComponent: "/dashboard", requiredAnyCapabilities: [] },
    { id: "programs", label: "Programs", kind: "navigation", group: "programs", routeOrComponent: "/programs", requiredAnyCapabilities: ["org.programs.create", "org.programs.configure", "org.programs.assign_admins"] },
    { id: "team", label: "People", kind: "navigation", group: "people", routeOrComponent: "/team", requiredAnyCapabilities: ["org.people.manage", "org.roles.manage", "org.groups.manage"] },
    { id: "settings", label: "Settings", kind: "navigation", group: "settings", routeOrComponent: "/settings", requiredAnyCapabilities: ["org.settings.branding", "org.settings.categories"] },
    { id: "audit", label: "Audit", kind: "navigation", group: "audit", routeOrComponent: "/audit", requiredAnyCapabilities: ["org.audit.view"] },
    { id: "gates", label: "Gates", kind: "navigation", group: "gates", routeOrComponent: "/gates", requiredAnyCapabilities: ["org.gates.manage"] },
  ],
  groups: [
    { id: "programs", label: "Programs", order: 1, capabilityIds: ["org.programs.create", "org.programs.configure", "org.programs.delete", "org.programs.assign_admins"], uiSurfaceIds: ["programs"] },
    { id: "people", label: "People", order: 2, capabilityIds: ["org.people.manage", "org.roles.manage", "org.groups.manage", "org.admins.remove", "org.access.set_program_policy"], uiSurfaceIds: ["team"] },
    { id: "settings", label: "Settings", order: 3, capabilityIds: ["org.settings.branding", "org.settings.categories"], uiSurfaceIds: ["settings"] },
    { id: "audit", label: "Audit", order: 4, capabilityIds: ["org.audit.view"], uiSurfaceIds: ["audit"] },
    { id: "gates", label: "Gates", order: 5, capabilityIds: ["org.gates.manage"], uiSurfaceIds: ["gates"] },
  ],
  sampleRoleTemplates: [],
};
