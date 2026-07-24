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
      'Live roles for the Bridge Learning Platform instance. Sample roles sync from the Learning capability catalogue on Save.',
    rootOrganizationId: 'life-in-ai-center',
    scopeRef: { type: 'program', id: BRIDGE_PROGRAM_ID },
    platformInstances: [
      {
        id: LEARNING_INSTANCE_ID,
        name: 'Bridge Learning Platform',
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

export function loadPolicy(): AccessPolicyDocument {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return syncPolicyFromCatalogue(loadCatalogue(), { persist: true });
    }
    const parsed = JSON.parse(raw) as AccessPolicyDocument;
    if (parsed?.documentType !== 'access_policy' || !Array.isArray(parsed.roles)) {
      return syncPolicyFromCatalogue(loadCatalogue(), { persist: true });
    }
    return parsed;
  } catch {
    return syncPolicyFromCatalogue(loadCatalogue(), { persist: true });
  }
}

export function savePolicy(policy: AccessPolicyDocument): void {
  const next: AccessPolicyDocument = {
    ...policy,
    documentType: 'access_policy',
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
  let existing: AccessPolicyDocument;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    existing = raw ? (JSON.parse(raw) as AccessPolicyDocument) : emptyPolicy(catalogue);
    if (existing?.documentType !== 'access_policy') existing = emptyPolicy(catalogue);
  } catch {
    existing = emptyPolicy(catalogue);
  }

  const validCaps = new Set(catalogue.capabilities.map((c) => c.id));
  const sampleRoles = (catalogue.sampleRoleTemplates || []).map((t) =>
    templateToPolicyRole(t, validCaps),
  );

  const customRoles = (existing.roles || [])
    .filter((r) => r.origin === 'custom')
    .map((r) => ({
      ...r,
      grants: (r.grants || []).map((g) => remapGrant(g, validCaps)),
    }));

  const learningInstance: PolicyPlatformInstance = {
    id: LEARNING_INSTANCE_ID,
    name: 'Bridge Learning Platform',
    kind: 'platform',
    scopeRef: { type: 'program', id: BRIDGE_PROGRAM_ID },
    catalogue: {
      catalogueId: catalogue.id,
      version: catalogue.catalogueVersion,
    },
    enabledCapabilityIds: catalogue.capabilities.map((c) => c.id),
    status: 'active',
  };

  const otherInstances = (existing.platformInstances || []).filter(
    (i) => i.id !== LEARNING_INSTANCE_ID,
  );

  const next: AccessPolicyDocument = {
    ...existing,
    documentType: 'access_policy',
    id: existing.id || 'bridge-learning-access-policy',
    name: existing.name || 'Bridge Learning Access Policy',
    scopeRef: existing.scopeRef || { type: 'program', id: BRIDGE_PROGRAM_ID },
    platformInstances: [learningInstance, ...otherInstances],
    roles: [...sampleRoles, ...customRoles],
    updatedAt: new Date().toISOString(),
  };

  if (persist) savePolicy(next);
  return next;
}

/** Persist catalogue JSON and sync live policy roles in one step. */
export function saveCatalogueAndSyncRoles(catalogue: CapabilityCatalogueDocument): AccessPolicyDocument {
  saveCatalogue(catalogue);
  return syncPolicyFromCatalogue(catalogue, { persist: true });
}

export function roleCapabilityIds(role: PolicyRole): string[] {
  const ids = new Set<string>();
  for (const g of role.grants || []) {
    for (const id of g.capabilityIds || []) ids.add(id);
  }
  return [...ids];
}

export function upsertCustomPolicyRole(
  input: {
    id?: string;
    name: string;
    description?: string;
    capabilityIds: string[];
    restrictedResourceTypes?: string[];
  },
): AccessPolicyDocument {
  const policy = loadPolicy();
  const catalogue = loadCatalogue();
  const validCaps = new Set(catalogue.capabilities.map((c) => c.id));
  const id = input.id?.trim() || `custom-${Date.now().toString(36)}`;
  const role: PolicyRole = {
    id,
    name: input.name.trim() || 'Untitled role',
    description: input.description,
    scopeRef: { type: 'program', id: BRIDGE_PROGRAM_ID },
    origin: 'custom',
    restrictedResourceTypes: input.restrictedResourceTypes || [],
    grants: [
      {
        platformInstanceId: LEARNING_INSTANCE_ID,
        capabilityIds: input.capabilityIds.filter((c) => validCaps.has(c)),
      },
    ],
  };

  const idx = policy.roles.findIndex((r) => r.id === id);
  if (idx >= 0) {
    // Do not overwrite catalogue-sample roles via custom editor — clone to custom id instead
    if (policy.roles[idx].origin === 'catalogue-sample') {
      role.id = `custom-${Date.now().toString(36)}`;
      policy.roles.push(role);
    } else {
      policy.roles[idx] = role;
    }
  } else {
    policy.roles.push(role);
  }
  savePolicy(policy);
  return policy;
}

export function deleteCustomPolicyRole(id: string): AccessPolicyDocument {
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
