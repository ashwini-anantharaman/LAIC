/**
 * Client for the central Access Catalogue service (Nexus backend).
 * Mirrors backend-ts/src/accessCatalogue/types.ts.
 */
import { request } from "@/services/api";

export type ProviderKind = "platform" | "application" | "framework" | "console";
export type UiSurfaceKind = "navigation" | "screen" | "component" | "action";
export type ReservedTier = "owner" | "full_operator" | "program_admin";

export interface Capability {
  id: string;
  label: string;
  description?: string;
  group: string;
  resourceTypes?: string[];
  supportsResourceConstraints?: boolean;
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
export interface CapabilityGrant {
  platformInstanceId?: string;
  capabilityIds: string[];
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

export interface CatalogueListEntry {
  providerId: string;
  name: string;
  customized: boolean;
}

export function listCatalogues(): Promise<CatalogueListEntry[]> {
  return request<CatalogueListEntry[]>("/api/platform/catalogues");
}
export function getCatalogue(providerId: string): Promise<CapabilityCatalogueDocument> {
  return request<CapabilityCatalogueDocument>(`/api/platform/catalogues/${providerId}`);
}
export function saveCatalogue(providerId: string, doc: CapabilityCatalogueDocument): Promise<CapabilityCatalogueDocument> {
  return request<CapabilityCatalogueDocument>(`/api/platform/catalogues/${providerId}`, {
    method: "PUT",
    body: JSON.stringify(doc),
  });
}
export function resetCatalogue(providerId: string): Promise<CapabilityCatalogueDocument> {
  return request<CapabilityCatalogueDocument>(`/api/platform/catalogues/${providerId}`, { method: "DELETE" });
}

// ── Per-instance catalogues — an org's / program's own customization of its
// console catalogue (falls back to the shipped default until edited). ──────────
export function getOrgCatalogue(orgId: string): Promise<CapabilityCatalogueDocument> {
  return request<CapabilityCatalogueDocument>(`/api/platform/orgs/${orgId}/catalogue`);
}
export function saveOrgCatalogue(orgId: string, doc: CapabilityCatalogueDocument): Promise<CapabilityCatalogueDocument> {
  return request<CapabilityCatalogueDocument>(`/api/platform/orgs/${orgId}/catalogue`, { method: "PUT", body: JSON.stringify(doc) });
}
export function resetOrgCatalogue(orgId: string): Promise<CapabilityCatalogueDocument> {
  return request<CapabilityCatalogueDocument>(`/api/platform/orgs/${orgId}/catalogue`, { method: "DELETE" });
}
export function getProgramCatalogue(programId: string): Promise<CapabilityCatalogueDocument> {
  return request<CapabilityCatalogueDocument>(`/api/platform/programs/${programId}/catalogue`);
}
export function saveProgramCatalogue(programId: string, doc: CapabilityCatalogueDocument): Promise<CapabilityCatalogueDocument> {
  return request<CapabilityCatalogueDocument>(`/api/platform/programs/${programId}/catalogue`, { method: "PUT", body: JSON.stringify(doc) });
}
export function resetProgramCatalogue(programId: string): Promise<CapabilityCatalogueDocument> {
  return request<CapabilityCatalogueDocument>(`/api/platform/programs/${programId}/catalogue`, { method: "DELETE" });
}
