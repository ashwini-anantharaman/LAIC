/**
 * Central Access Catalogue — shared document shape.
 *
 * A catalogue is the platform-owned INVENTORY of what can be permission-controlled
 * for one provider (a console altitude or an app). It does not assign people —
 * roles bind against these capability ids (see ACCESS_CATALOGUE_DESIGN.md).
 *
 * Shape mirrors the learning platform's `CapabilityCatalogueDocument` so its
 * existing catalogues seed unchanged; the only addition is `reserved` on a
 * capability, which lets a structural tier (Super Admin/owner, full operator,
 * program admin) hold a capability that a custom role can never be granted.
 */
export type ProviderKind = "platform" | "application" | "framework" | "console";
export type UiSurfaceKind = "navigation" | "screen" | "component" | "action";

/** A structural tier that holds a capability implicitly — NOT grantable to custom roles. */
export type ReservedTier = "owner" | "full_operator" | "program_admin";

export interface Capability {
  id: string;
  label: string;
  description?: string;
  group: string;
  /** Object/resource types this capability can be scoped to (enforcement deferred). */
  resourceTypes?: string[];
  supportsResourceConstraints?: boolean;
  /** When set, only this tier holds it; the role builder must hide it. */
  reserved?: ReservedTier;
}

export interface ResourceType {
  id: string;
  label: string;
  description?: string;
  constraintFields?: string[];
}

export interface UiSurface {
  id: string;
  label: string;
  kind: UiSurfaceKind;
  group?: string;
  routeOrComponent?: string;
  /** Any one of these unlocks the surface. */
  requiredAnyCapabilities?: string[];
  requiredAllCapabilities?: string[];
}

export interface CatalogueGroup {
  id: string;
  label: string;
  description?: string;
  order: number;
  capabilityIds?: string[];
  uiSurfaceIds?: string[];
}

export interface ResourceConstraint {
  resourceType: string;
  includeIds?: string[];
  filters?: Record<string, string | number | boolean | Array<string | number | boolean>>;
}

export interface CapabilityGrant {
  /** Which provider's capabilities these ids belong to (cross-catalogue roles). */
  platformInstanceId?: string;
  capabilityIds: string[];
  resourceConstraints?: ResourceConstraint[];
}

export interface SampleRoleTemplate {
  id: string;
  name: string;
  description?: string;
  grants: CapabilityGrant[];
}

export interface CapabilityCatalogueDocument {
  $schema?: string;
  schemaVersion: string;
  documentType: "capability_catalogue";
  id: string;
  name: string;
  description?: string;
  provider: { kind: ProviderKind; id: string };
  catalogueVersion: string;
  capabilities: Capability[];
  resourceTypes: ResourceType[];
  uiSurfaces: UiSurface[];
  groups: CatalogueGroup[];
  sampleRoleTemplates?: SampleRoleTemplate[];
}

/** The fixed set of providers the platform hosts a catalogue for. */
export const PROVIDER_IDS = [
  "nexus-console",
  "org-console",
  "program-console",
  "learning",
  "bridge",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
