import type { CapabilityCatalogueDocument } from "../types";

/** Nexus operator console — derived from the operator nav + guarded routes. */
export const nexusConsoleCatalogue: CapabilityCatalogueDocument = {
  schemaVersion: "1.0",
  documentType: "capability_catalogue",
  id: "nexus-console",
  name: "Nexus Console",
  description: "What a Nexus operator role can be granted.",
  provider: { kind: "console", id: "nexus-console" },
  catalogueVersion: "1.0",
  capabilities: [
    { id: "nexus.orgs.provision", label: "Provision organizations", group: "organizations" },
    { id: "nexus.orgs.envelope", label: "Edit an org's envelope (types, features, capacity)", group: "organizations" },
    { id: "nexus.orgs.assign_admins", label: "Assign an org's administrators", group: "organizations" },
    // Reserved: only a full operator (Super Admin) manages other operators.
    { id: "nexus.operators.manage", label: "Manage operators & operator roles", group: "operators", reserved: "full_operator" },
    { id: "nexus.settings.branding", label: "Edit platform branding", group: "settings" },
    { id: "nexus.audit.view", label: "View platform audit", group: "audit" },
  ],
  resourceTypes: [{ id: "organization", label: "Organization" }],
  uiSurfaces: [
    { id: "orgs", label: "Organizations", kind: "navigation", group: "organizations", routeOrComponent: "/orgs", requiredAnyCapabilities: ["nexus.orgs.provision", "nexus.orgs.envelope", "nexus.orgs.assign_admins"] },
    { id: "team", label: "People", kind: "navigation", group: "operators", routeOrComponent: "/team", requiredAnyCapabilities: ["nexus.operators.manage"] },
    { id: "settings", label: "Settings", kind: "navigation", group: "settings", routeOrComponent: "/settings", requiredAnyCapabilities: ["nexus.settings.branding"] },
    { id: "audit", label: "Platform audit", kind: "navigation", group: "audit", routeOrComponent: "/audit", requiredAnyCapabilities: ["nexus.audit.view"] },
  ],
  groups: [
    { id: "organizations", label: "Organizations", order: 1, capabilityIds: ["nexus.orgs.provision", "nexus.orgs.envelope", "nexus.orgs.assign_admins"], uiSurfaceIds: ["orgs"] },
    { id: "operators", label: "Operators", order: 2, capabilityIds: ["nexus.operators.manage"], uiSurfaceIds: ["team"] },
    { id: "settings", label: "Settings", order: 3, capabilityIds: ["nexus.settings.branding"], uiSurfaceIds: ["settings"] },
    { id: "audit", label: "Audit", order: 4, capabilityIds: ["nexus.audit.view"], uiSurfaceIds: ["audit"] },
  ],
  sampleRoleTemplates: [],
};
