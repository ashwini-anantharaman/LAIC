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
    { id: "nexus.gates.manage", label: "Manage sign-in gates", group: "gates" },
    // Demo capabilities for two throwaway operator tabs — show the full
    // "add a feature" flow (catalogue → role builder → nav gating).
    { id: "nexus.test1.view", label: "View Test 1", group: "test1" },
    { id: "nexus.test2.view", label: "View Test 2", group: "test2" },
  ],
  resourceTypes: [{ id: "organization", label: "Organization" }],
  uiSurfaces: [
    { id: "orgs", label: "Organizations", kind: "navigation", group: "organizations", routeOrComponent: "/orgs", requiredAnyCapabilities: ["nexus.orgs.provision", "nexus.orgs.envelope", "nexus.orgs.assign_admins"] },
    { id: "team", label: "People", kind: "navigation", group: "operators", routeOrComponent: "/team", requiredAnyCapabilities: ["nexus.operators.manage"] },
    { id: "settings", label: "Settings", kind: "navigation", group: "settings", routeOrComponent: "/settings", requiredAnyCapabilities: ["nexus.settings.branding"] },
    { id: "audit", label: "Platform audit", kind: "navigation", group: "audit", routeOrComponent: "/audit", requiredAnyCapabilities: ["nexus.audit.view"] },
    { id: "nexus-gates", label: "Gates", kind: "navigation", group: "gates", routeOrComponent: "/nexus-gates", requiredAnyCapabilities: ["nexus.gates.manage"] },
    { id: "test1", label: "Test 1", kind: "navigation", group: "test1", routeOrComponent: "/test1", requiredAnyCapabilities: ["nexus.test1.view"] },
    { id: "test2", label: "Test 2", kind: "navigation", group: "test2", routeOrComponent: "/test2", requiredAnyCapabilities: ["nexus.test2.view"] },
  ],
  groups: [
    { id: "organizations", label: "Organizations", order: 1, capabilityIds: ["nexus.orgs.provision", "nexus.orgs.envelope", "nexus.orgs.assign_admins"], uiSurfaceIds: ["orgs"] },
    { id: "operators", label: "Operators", order: 2, capabilityIds: ["nexus.operators.manage"], uiSurfaceIds: ["team"] },
    { id: "settings", label: "Settings", order: 3, capabilityIds: ["nexus.settings.branding"], uiSurfaceIds: ["settings"] },
    { id: "audit", label: "Audit", order: 4, capabilityIds: ["nexus.audit.view"], uiSurfaceIds: ["audit"] },
    { id: "gates", label: "Gates", order: 5, capabilityIds: ["nexus.gates.manage"], uiSurfaceIds: ["nexus-gates"] },
    { id: "test1", label: "Test 1", order: 6, capabilityIds: ["nexus.test1.view"], uiSurfaceIds: ["test1"] },
    { id: "test2", label: "Test 2", order: 7, capabilityIds: ["nexus.test2.view"], uiSurfaceIds: ["test2"] },
  ],
  sampleRoleTemplates: [],
};
