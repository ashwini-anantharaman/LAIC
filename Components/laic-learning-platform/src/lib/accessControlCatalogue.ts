/**
 * LAIC Content Studio Access Catalogue — capability_catalogue document (v1).
 * Matches docs/laic-access-control.schema.json + learning-platform-access-catalogue.v1.json
 */

import learningCatalogueJson from '../../docs/learning-platform-access-catalogue.v1.json';
import laicSchemaJson from '../../docs/laic-access-control.schema.json';
import { getToken, fetchLearningCatalogue, putLearningCatalogue, resetLearningCatalogue } from './nexus';

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

// The live catalogue is the CENTRALIZED one from the Nexus backend when we have a
// session; localStorage is only a fallback for the standalone demo (no session).
// A module cache lets the existing sync `loadCatalogue()` callers keep working;
// `initCatalogue()` seeds it from the server before the screens render.
let _cache: CapabilityCatalogueDocument | null = null;

function normalize(parsed: CapabilityCatalogueDocument): CapabilityCatalogueDocument {
  return {
    ...createDefaultCatalogue(),
    ...parsed,
    documentType: 'capability_catalogue',
    $schema: parsed.$schema || './laic-access-control.schema.json',
  };
}

function loadFromLocal(): CapabilityCatalogueDocument {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultCatalogue();
    const parsed = JSON.parse(raw) as CapabilityCatalogueDocument;
    if (parsed?.documentType !== 'capability_catalogue' || !parsed.capabilities?.length) {
      return createDefaultCatalogue();
    }
    return normalize(parsed);
  } catch {
    return createDefaultCatalogue();
  }
}

/** Seed the module cache from the backend (Nexus session) or localStorage (demo).
 *  Call once before the catalogue/roles screens render. */
export async function initCatalogue(): Promise<CapabilityCatalogueDocument> {
  if (getToken()) {
    try {
      _cache = normalize(await fetchLearningCatalogue());
      return _cache;
    } catch {
      /* fall through to local/default */
    }
  }
  _cache = loadFromLocal();
  return _cache;
}

export function loadCatalogue(): CapabilityCatalogueDocument {
  if (_cache) return _cache;
  // Not seeded yet (first sync read) — use local/default; initCatalogue refreshes it.
  _cache = getToken() ? createDefaultCatalogue() : loadFromLocal();
  return _cache;
}

/** Persist the catalogue: PUT to the backend when signed in, else localStorage
 *  (demo). Updates the cache either way. */
export async function saveCatalogue(catalogue: CapabilityCatalogueDocument): Promise<CapabilityCatalogueDocument> {
  if (getToken()) {
    _cache = normalize(await putLearningCatalogue(catalogue));
    return _cache;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(catalogue));
  _cache = catalogue;
  return catalogue;
}

/** Restore the catalogue to the shipped default (backend reset when signed in). */
export async function resetCatalogue(): Promise<CapabilityCatalogueDocument> {
  if (getToken()) {
    _cache = normalize(await resetLearningCatalogue());
    return _cache;
  }
  localStorage.removeItem(STORAGE_KEY);
  _cache = createDefaultCatalogue();
  return _cache;
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

/**
 * Capabilities a grant may narrow to particular content types. A capability
 * qualifies when the catalogue says it supports resource constraints over an
 * object resource type — create, edit, delete and browse all do.
 */
export function typeScopableCapabilities(catalogue: CapabilityCatalogueDocument): Capability[] {
  return catalogue.capabilities.filter((c) => (
    c.supportsResourceConstraints
    && (c.resourceTypes || []).some((rt) => rt.includes('object') || rt.includes('composition'))
  ));
}

/** The short action word a scoped capability grants ("edit", "delete", …). */
export function capabilityActionWord(capabilityId: string): string {
  const last = capabilityId.split('.').pop() || capabilityId;
  return last === 'read' ? 'browse' : last.replace(/_/g, ' ');
}

export function capabilitiesInGroup(catalogue: CapabilityCatalogueDocument, groupId: string): Capability[] {
  const group = catalogue.groups.find((g) => g.id === groupId);
  const byField = catalogue.capabilities.filter((c) => c.group === groupId);
  if (!group?.capabilityIds?.length) return byField;

  const seen = new Set<string>();
  const out: Capability[] = [];
  for (const id of group.capabilityIds) {
    const c = catalogue.capabilities.find((x) => x.id === id);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  }
  // Include caps that only declare group=… (e.g. after a group move).
  for (const c of byField) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

export function surfacesInGroup(catalogue: CapabilityCatalogueDocument, groupId: string): UiSurface[] {
  const group = catalogue.groups.find((g) => g.id === groupId);
  const byField = catalogue.uiSurfaces.filter((s) => s.group === groupId);
  if (!group?.uiSurfaceIds?.length) return byField;

  const seen = new Set<string>();
  const out: UiSurface[] = [];
  for (const id of group.uiSurfaceIds) {
    const s = catalogue.uiSurfaces.find((x) => x.id === id);
    if (s && !seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  for (const s of byField) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      out.push(s);
    }
  }
  return out;
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
