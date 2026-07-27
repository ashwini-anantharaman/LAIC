/**
 * Bridge Learning access_policy — live roles derived from the Learning capability catalogue.
 * Catalogue Save upserts sample-role templates into this policy; custom roles are preserved.
 */

import type {
  CapabilityCatalogueDocument,
  CapabilityGrant,
  SampleRoleTemplate,
} from './accessControlCatalogue';
import { loadCatalogue, saveCatalogue } from './accessControlCatalogue';
import {
  getToken, listLearningRoles, createLearningRole, updateLearningRole, deleteLearningRole,
  type LearningRole,
} from './nexus';

export const LEARNING_INSTANCE_ID = 'bridge-learning';
export const BRIDGE_PROGRAM_ID = 'bridge-program';

export type PolicyRoleOrigin = 'catalogue-sample' | 'custom';

export interface PolicyScopeRef {
  type: 'program' | 'organization' | 'team';
  id: string;
}

export interface PolicyRole {
  id: string;
  name: string;
  description?: string;
  scopeRef: PolicyScopeRef;
  systemCapabilityIds?: string[];
  grants: CapabilityGrant[];
  origin: PolicyRoleOrigin;
  /** Optional create-time object-type restriction (UI convenience). */
  restrictedResourceTypes?: string[];
}

export interface PolicyPlatformInstance {
  id: string;
  name: string;
  kind: 'platform' | 'application' | 'framework';
  scopeRef: PolicyScopeRef;
  catalogue: { catalogueId: string; version: string };
  enabledCapabilityIds: string[];
  status: 'active' | 'inactive';
}

export interface AccessPolicyDocument {
  $schema?: string;
  schemaVersion: string;
  documentType: 'access_policy';
  id: string;
  name: string;
  description?: string;
  rootOrganizationId?: string;
  scopeRef: PolicyScopeRef;
  platformInstances: PolicyPlatformInstance[];
  roles: PolicyRole[];
  updatedAt?: string;
}

const STORAGE_KEY = 'laic.accessPolicy.bridge-learning.v1';

function emptyPolicy(catalogue?: CapabilityCatalogueDocument): AccessPolicyDocument {
  const cat = catalogue || loadCatalogue();
  return {
    $schema: './laic-access-control.schema.json',
    schemaVersion: '1.0',
    documentType: 'access_policy',
    id: 'bridge-learning-access-policy',
    name: 'Bridge Learning Access Policy',
    description:
      'Live roles for the Bridge Content Studio instance. Sample roles sync from the Learning capability catalogue on Save.',
    rootOrganizationId: 'life-in-ai-center',
    scopeRef: { type: 'program', id: BRIDGE_PROGRAM_ID },
    platformInstances: [
      {
        id: LEARNING_INSTANCE_ID,
        name: 'Bridge Content Studio',
        kind: 'platform',
        scopeRef: { type: 'program', id: BRIDGE_PROGRAM_ID },
        catalogue: {
          catalogueId: cat.id,
          version: cat.catalogueVersion,
        },
        enabledCapabilityIds: cat.capabilities.map((c) => c.id),
        status: 'active',
      },
    ],
    roles: [],
    updatedAt: new Date().toISOString(),
  };
}

function remapGrant(grant: CapabilityGrant, validCaps: Set<string>): CapabilityGrant {
  return {
    platformInstanceId:
      grant.platformInstanceId === 'placeholder-learning-instance'
        ? LEARNING_INSTANCE_ID
        : grant.platformInstanceId || LEARNING_INSTANCE_ID,
    capabilityIds: (grant.capabilityIds || []).filter((id) => validCaps.has(id)),
    resourceConstraints: grant.resourceConstraints,
  };
}

function templateToPolicyRole(t: SampleRoleTemplate, validCaps: Set<string>): PolicyRole {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    scopeRef: { type: 'program', id: BRIDGE_PROGRAM_ID },
    origin: 'catalogue-sample',
    grants: (t.grants || []).map((g) => remapGrant(g, validCaps)),
  };
}

// When signed into Nexus, the CUSTOM roles are our backend learning roles; the
// sample roles are display-only templates from the catalogue. localStorage is
// only the standalone-demo fallback. A module cache keeps the existing sync
// `loadPolicy()` callers working; `initPolicy()` seeds it from the server.
let _policyCache: AccessPolicyDocument | null = null;

/** A backend learning role → a custom PolicyRole (capabilities live in perms). */
function backendRoleToPolicy(r: LearningRole, validCaps: Set<string>): PolicyRole {
  const raw = (r.perms as { capabilities?: string[] } | undefined)?.capabilities;
  const capabilityIds = (Array.isArray(raw) ? raw : []).filter((id) => validCaps.has(id));
  return {
    id: r.id,
    name: r.name,
    scopeRef: { type: 'program', id: BRIDGE_PROGRAM_ID },
    origin: 'custom',
    grants: [{ platformInstanceId: LEARNING_INSTANCE_ID, capabilityIds }],
  };
}

function buildPolicy(catalogue: CapabilityCatalogueDocument, custom: PolicyRole[]): AccessPolicyDocument {
  const validCaps = new Set(catalogue.capabilities.map((c) => c.id));
  const sampleRoles = (catalogue.sampleRoleTemplates || []).map((t) => templateToPolicyRole(t, validCaps));
  const base = emptyPolicy(catalogue);
  return { ...base, roles: [...sampleRoles, ...custom], updatedAt: new Date().toISOString() };
}

/** Read the local (demo-mode) policy document, or null when absent/invalid. */
function readLocalPolicy(): AccessPolicyDocument | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccessPolicyDocument;
    return parsed?.documentType === 'access_policy' && Array.isArray(parsed.roles) ? parsed : null;
  } catch {
    return null;
  }
}

/** Seed the policy cache: custom roles from the backend (Nexus session) or
 *  localStorage (demo); sample roles always from the catalogue. */
export async function initPolicy(): Promise<AccessPolicyDocument> {
  const catalogue = loadCatalogue();
  const validCaps = new Set(catalogue.capabilities.map((c) => c.id));
  if (getToken()) {
    const backend = await listLearningRoles().catch(() => [] as LearningRole[]);
    _policyCache = buildPolicy(catalogue, backend.map((r) => backendRoleToPolicy(r, validCaps)));
  } else {
    const local = readLocalPolicy();
    const custom = (local?.roles || []).filter((r) => r.origin === 'custom')
      .map((r) => ({ ...r, grants: (r.grants || []).map((g) => remapGrant(g, validCaps)) }));
    _policyCache = buildPolicy(catalogue, custom);
    savePolicy(_policyCache);
  }
  return _policyCache;
}

export function loadPolicy(): AccessPolicyDocument {
  if (_policyCache) return _policyCache;
  // Not seeded yet — build synchronously from the catalogue (+ local custom roles
  // in demo). initPolicy() refreshes with backend roles when signed in.
  const catalogue = loadCatalogue();
  const validCaps = new Set(catalogue.capabilities.map((c) => c.id));
  const local = getToken() ? null : readLocalPolicy();
  const custom = (local?.roles || []).filter((r) => r.origin === 'custom')
    .map((r) => ({ ...r, grants: (r.grants || []).map((g) => remapGrant(g, validCaps)) }));
  _policyCache = buildPolicy(catalogue, custom);
  return _policyCache;
}

export function savePolicy(policy: AccessPolicyDocument): void {
  const next: AccessPolicyDocument = {
    ...policy,
    documentType: 'access_policy',
    updatedAt: new Date().toISOString(),
  };
  _policyCache = next;
  // Persist to localStorage only in demo mode (no Nexus session); with a session
  // the backend is the source of truth for custom roles.
  if (!getToken()) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/**
 * Upsert catalogue sampleRoleTemplates into the live access_policy.
 * - Refreshes bridge-learning enabledCapabilityIds from the catalogue
 * - Replaces catalogue-sample roles with current templates (prunes deleted templates)
 * - Keeps custom roles; strips capability ids that no longer exist
 */
export function syncPolicyFromCatalogue(
  catalogue: CapabilityCatalogueDocument,
  opts?: { persist?: boolean },
): AccessPolicyDocument {
  const persist = opts?.persist !== false;
  const existing = _policyCache ?? loadPolicy();
  const validCaps = new Set(catalogue.capabilities.map((c) => c.id));

  // Custom roles are the live source of truth (backend rows / cache); refresh
  // sample roles from the (possibly edited) catalogue and remap valid caps.
  const customRoles = (existing.roles || [])
    .filter((r) => r.origin === 'custom')
    .map((r) => ({ ...r, grants: (r.grants || []).map((g) => remapGrant(g, validCaps)) }));

  const next = buildPolicy(catalogue, customRoles);
  if (persist) savePolicy(next); else _policyCache = next;
  return next;
}

/** Persist the catalogue (backend PUT when signed in) and refresh sample roles. */
export async function saveCatalogueAndSyncRoles(catalogue: CapabilityCatalogueDocument): Promise<AccessPolicyDocument> {
  const saved = await saveCatalogue(catalogue);
  return syncPolicyFromCatalogue(saved, { persist: true });
}

export function roleCapabilityIds(role: PolicyRole): string[] {
  const ids = new Set<string>();
  for (const g of role.grants || []) {
    for (const id of g.capabilityIds || []) ids.add(id);
  }
  return [...ids];
}

export async function upsertCustomPolicyRole(
  input: {
    id?: string;
    name: string;
    description?: string;
    capabilityIds: string[];
    restrictedResourceTypes?: string[];
  },
): Promise<AccessPolicyDocument> {
  const catalogue = loadCatalogue();
  const validCaps = new Set(catalogue.capabilities.map((c) => c.id));
  const name = input.name.trim() || 'Untitled role';
  const caps = input.capabilityIds.filter((c) => validCaps.has(c));
  const existing = loadPolicy();
  // Editing a catalogue-sample role via the custom editor forks a new custom role.
  const editingSample = input.id ? existing.roles.find((r) => r.id === input.id)?.origin === 'catalogue-sample' : false;
  const targetId = input.id && !editingSample ? input.id : undefined;

  if (getToken()) {
    // Backend is the source of truth for custom roles.
    if (targetId) await updateLearningRole(targetId, { name, capabilities: caps });
    else await createLearningRole(name, {}, caps);
    return initPolicy(); // refetch → cache
  }

  // Demo mode: mutate the local policy in place.
  const id = targetId || `custom-${Date.now().toString(36)}`;
  const role: PolicyRole = {
    id, name, description: input.description,
    scopeRef: { type: 'program', id: BRIDGE_PROGRAM_ID },
    origin: 'custom',
    restrictedResourceTypes: input.restrictedResourceTypes || [],
    grants: [{ platformInstanceId: LEARNING_INSTANCE_ID, capabilityIds: caps }],
  };
  const policy = existing;
  const idx = policy.roles.findIndex((r) => r.id === id);
  if (idx >= 0 && policy.roles[idx].origin === 'custom') policy.roles[idx] = role;
  else policy.roles.push(role);
  savePolicy(policy);
  return policy;
}

export async function deleteCustomPolicyRole(id: string): Promise<AccessPolicyDocument> {
  if (getToken()) {
    await deleteLearningRole(id).catch(() => {});
    return initPolicy();
  }
  const policy = loadPolicy();
  policy.roles = policy.roles.filter((r) => !(r.id === id && r.origin === 'custom'));
  savePolicy(policy);
  return policy;
}

export function catalogueSampleRoles(policy?: AccessPolicyDocument): PolicyRole[] {
  return (policy || loadPolicy()).roles.filter((r) => r.origin === 'catalogue-sample');
}

export function customPolicyRoles(policy?: AccessPolicyDocument): PolicyRole[] {
  return (policy || loadPolicy()).roles.filter((r) => r.origin === 'custom');
}
