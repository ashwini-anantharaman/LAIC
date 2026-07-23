/**
 * LAIC Learning Platform Access Catalogue — capability_catalogue document (v1).
 * Matches docs/laic-access-control.schema.json + learning-platform-access-catalogue.v1.json
 */

import learningCatalogueJson from '../../docs/learning-platform-access-catalogue.v1.json';
import laicSchemaJson from '../../docs/laic-access-control.schema.json';

export type ProviderKind = 'platform' | 'application' | 'framework';
export type UiSurfaceKind = 'navigation' | 'screen' | 'component' | 'action';

export interface Capability {
  id: string;
  label: string;
  description?: string;
  group: string;
  resourceTypes?: string[];
  supportsResourceConstraints?: boolean;
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
  platformInstanceId: string;
  capabilityIds: string[];
  resourceConstraints?: {
    resourceType: string;
    includeIds?: string[];
    filters?: Record<string, string | number | boolean | Array<string | number | boolean>>;
  }[];
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
  documentType: 'capability_catalogue';
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

export const DEFAULT_CATALOGUE = learningCatalogueJson as CapabilityCatalogueDocument;
export const LAIC_ACCESS_CONTROL_SCHEMA = laicSchemaJson;

const STORAGE_KEY = 'laic.capabilityCatalogue.learning.v1';

export function createDefaultCatalogue(): CapabilityCatalogueDocument {
  return structuredClone(DEFAULT_CATALOGUE);
}

export function loadCatalogue(): CapabilityCatalogueDocument {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultCatalogue();
    const parsed = JSON.parse(raw) as CapabilityCatalogueDocument;
    if (parsed?.documentType !== 'capability_catalogue' || !parsed.capabilities?.length) {
      return createDefaultCatalogue();
    }
    return {
      ...createDefaultCatalogue(),
      ...parsed,
      documentType: 'capability_catalogue',
      $schema: parsed.$schema || './laic-access-control.schema.json',
    };
  } catch {
    return createDefaultCatalogue();
  }
}

export function saveCatalogue(catalogue: CapabilityCatalogueDocument): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(catalogue));
}

export function catalogueToExportJson(catalogue: CapabilityCatalogueDocument): CapabilityCatalogueDocument {
  return {
    $schema: catalogue.$schema || './laic-access-control.schema.json',
    schemaVersion: catalogue.schemaVersion,
    documentType: 'capability_catalogue',
    id: catalogue.id,
    name: catalogue.name,
    description: catalogue.description,
    provider: catalogue.provider,
    catalogueVersion: catalogue.catalogueVersion,
    capabilities: catalogue.capabilities,
    resourceTypes: catalogue.resourceTypes,
    uiSurfaces: catalogue.uiSurfaces,
    groups: catalogue.groups.slice().sort((a, b) => a.order - b.order),
    sampleRoleTemplates: catalogue.sampleRoleTemplates || [],
  };
}

export function groupsSorted(catalogue: CapabilityCatalogueDocument): CatalogueGroup[] {
  return catalogue.groups.slice().sort((a, b) => a.order - b.order);
}

export function capabilitiesInGroup(catalogue: CapabilityCatalogueDocument, groupId: string): Capability[] {
  const group = catalogue.groups.find((g) => g.id === groupId);
  if (!group?.capabilityIds?.length) {
    return catalogue.capabilities.filter((c) => c.group === groupId);
  }
  return group.capabilityIds
    .map((id) => catalogue.capabilities.find((c) => c.id === id))
    .filter((c): c is Capability => !!c);
}

export function surfacesInGroup(catalogue: CapabilityCatalogueDocument, groupId: string): UiSurface[] {
  const group = catalogue.groups.find((g) => g.id === groupId);
  if (!group?.uiSurfaceIds?.length) {
    return catalogue.uiSurfaces.filter((s) => s.group === groupId);
  }
  return group.uiSurfaceIds
    .map((id) => catalogue.uiSurfaces.find((s) => s.id === id))
    .filter((s): s is UiSurface => !!s);
}

export function slugifyId(label: string, prefix = ''): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 64);
  const id = base || `item.${Date.now()}`;
  return prefix && !id.startsWith(prefix) ? `${prefix}${id}` : id;
}

export const UI_SURFACE_KINDS: UiSurfaceKind[] = ['navigation', 'screen', 'component', 'action'];
